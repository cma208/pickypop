/**
 * The smallest ZIP reader that can open a .gcode.3mf in the browser.
 *
 * A sliced file is a ZIP and the entries we care about are a few kilobytes
 * each — the XML with grams and minutes, and per plate a small JSON and a
 * picture — so there is no reason to pull in a library or to upload the file
 * anywhere. We walk the central directory by hand and inflate only the entries
 * we want with DecompressionStream, which every current browser ships; the
 * megabytes of G-code are never touched.
 *
 * Deliberately partial: no ZIP64, no encryption, no multi-disk archives. None
 * of those appear in a Bambu Studio export, and anything unexpected throws
 * instead of returning something half-read.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_LOCATOR = 0x07064b50;

/** The ZIP comment is a 16-bit length, so the record cannot start deeper. */
const MAX_COMMENT_LENGTH = 0xffff;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;

const STORED = 0;
const DEFLATED = 8;

/** A missing value in a 32-bit field means "look in the ZIP64 extra field". */
const ZIP64_SENTINEL = 0xffffffff;

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - MAX_COMMENT_LENGTH - END_OF_CENTRAL_DIRECTORY_SIZE);

  for (let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
  }

  throw new ZipError('no end of central directory record');
}

function assertNotZip64(view: DataView, endOffset: number): void {
  const locatorOffset = endOffset - 20;
  if (locatorOffset < 0) return;
  if (view.getUint32(locatorOffset, true) === ZIP64_LOCATOR) {
    throw new ZipError('ZIP64 archives are not supported');
  }
}

/** Entry names are UTF-8 whenever bit 11 of the flags is set, CP437 otherwise. */
function decodeName(bytes: Uint8Array, utf8: boolean): string {
  return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes);
}

/** Lists what the archive holds, without reading any of the compressed data. */
export function readDirectory(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const endOffset = findEndOfCentralDirectory(view);
  assertNotZip64(view, endOffset);

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);

  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_FILE_HEADER) {
      throw new ZipError('the central directory is damaged');
    }

    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (localHeaderOffset === ZIP64_SENTINEL) {
      throw new ZipError('ZIP64 archives are not supported');
    }

    entries.push({
      name: decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength), (flags & 0x800) !== 0),
      compressionMethod: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('this browser cannot decompress the file');
  }

  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Reads one entry out as raw bytes: the plate pictures are PNG, and decoding
 * them as text would destroy them.
 */
export async function readEntryBytes(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const start = entry.localHeaderOffset;

  if (start + 30 > view.byteLength || view.getUint32(start, true) !== LOCAL_FILE_HEADER) {
    throw new ZipError(`the entry "${entry.name}" is damaged`);
  }

  // The local header repeats the name and extra fields with their own lengths,
  // which may differ from the ones in the central directory.
  const nameLength = view.getUint16(start + 26, true);
  const extraLength = view.getUint16(start + 28, true);
  const dataStart = start + 30 + nameLength + extraLength;
  if (dataStart + entry.compressedSize > view.byteLength) {
    throw new ZipError(`the entry "${entry.name}" is cut short`);
  }
  const compressed = new Uint8Array(buffer, dataStart, entry.compressedSize);

  if (entry.compressionMethod === STORED) return compressed;
  if (entry.compressionMethod === DEFLATED) return inflateRaw(compressed);
  throw new ZipError(`unsupported compression method ${entry.compressionMethod}`);
}

/** Reads one entry out and returns it as text. */
export async function readEntryAsText(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  return new TextDecoder('utf-8').decode(await readEntryBytes(buffer, entry));
}

/** Finds an entry by its path inside the archive, ignoring case. */
export function findEntry(entries: readonly ZipEntry[], path: string): ZipEntry | undefined {
  const wanted = path.toLowerCase();
  return entries.find((item) => item.name.toLowerCase() === wanted);
}

/**
 * Finds an entry by its path inside the archive and returns its text.
 * Returns null when the archive simply does not carry it.
 */
export async function readTextEntry(buffer: ArrayBuffer, path: string): Promise<string | null> {
  const entry = findEntry(readDirectory(buffer), path);
  return entry === undefined ? null : readEntryAsText(buffer, entry);
}
