import {
  countObjects,
  parsePlateObjects,
  parseSliceInfo,
  type PlateObjectCount,
  type SliceInfo,
  type SlicedPlate,
} from './pricing';
import { findEntry, readDirectory, readEntryAsText, readEntryBytes, readTextEntry, ZipError, type ZipEntry } from './zip';

/**
 * Turns a dropped .gcode.3mf into the plate data the calculator needs.
 *
 * Nothing leaves the browser: the file is read with FileReader, the few
 * entries we care about are inflated in memory and the megabytes of G-code are
 * never touched. See docs/01-investigacion.md section 1.2.
 */

const SLICE_INFO_PATH = 'Metadata/slice_info.config';
const plateJsonPath = (index: number) => `Metadata/plate_${index}.json`;
const platePicturePath = (index: number) => `Metadata/plate_${index}.png`;

/** Below this alpha a pixel is the soft edge of the render, not the part. */
const MIN_ALPHA = 8;
/** Air around the parts, as a share of the longest side of what is drawn. */
const MARGIN_RATIO = 0.06;
/** A single small part would otherwise be blown up into a blur. */
const MIN_SIDE_PX = 128;

/** Why a file could not be used, in words the workshop can act on. */
export type SlicedFileProblem = 'not-a-zip' | 'no-slice-info' | 'not-sliced' | 'unreadable';

export interface SlicedFileResult {
  fileName: string;
  info: SliceInfo;
}

export class SlicedFileError extends Error {
  readonly problem: SlicedFileProblem;
  readonly fileName: string;

  constructor(problem: SlicedFileProblem, fileName: string, message: string) {
    super(message);
    this.name = 'SlicedFileError';
    this.problem = problem;
    this.fileName = fileName;
  }
}

/** Messages are part of the interface, so they are in Spanish. */
export function describeSlicedFileProblem(problem: SlicedFileProblem, fileName: string): string {
  switch (problem) {
    case 'not-a-zip':
      return `«${fileName}» no parece un archivo de Bambu Studio. Arrastra el .gcode.3mf que exportaste.`;
    case 'no-slice-info':
      return `«${fileName}» no trae los datos del laminado. Expórtalo desde Bambu Studio con «Export plate sliced file».`;
    case 'not-sliced':
      return `«${fileName}» es un proyecto sin laminar: no trae placas, gramos ni tiempo. Lamina en Bambu Studio y exporta con «Export plate sliced file» para obtener el .gcode.3mf.`;
    case 'unreadable':
      return `No pudimos leer «${fileName}». Verifica que el archivo esté completo.`;
  }
}

/**
 * Reads the slicing metadata out of a file the user dropped.
 * Throws a SlicedFileError whose problem says what to tell them.
 */
export async function readSlicedFile(file: File): Promise<SlicedFileResult> {
  let xml: string | null;

  try {
    const buffer = await file.arrayBuffer();
    xml = await readTextEntry(buffer, SLICE_INFO_PATH);
  } catch (cause) {
    const problem: SlicedFileProblem = cause instanceof ZipError ? 'not-a-zip' : 'unreadable';
    throw new SlicedFileError(problem, file.name, describeSlicedFileProblem(problem, file.name));
  }

  if (xml === null) {
    throw new SlicedFileError(
      'no-slice-info',
      file.name,
      describeSlicedFileProblem('no-slice-info', file.name),
    );
  }

  const info = parseSliceInfo(xml);

  // A project saved before slicing carries only the slicer header: no plates.
  if (!info.isSliced) {
    throw new SlicedFileError(
      'not-sliced',
      file.name,
      describeSlicedFileProblem('not-sliced', file.name),
    );
  }

  return { fileName: file.name, info };
}

// ------------------------------------------------------------ plate details

/** What a plate carries besides grams and minutes: its objects and its picture. */
export interface PlateDetails {
  /** The plate number inside the file, the N of plate_N. */
  index: number;
  /** The objects on the plate counted by name, purge tower left out. */
  objects: PlateObjectCount[];
  /** The plate picture cropped to the parts, or null when there is none to show. */
  thumbnail: Blob | null;
}

/**
 * Reads, for each plate, what is on it and how it looks.
 *
 * Neither is essential: a plate without its picture or its object list can
 * still be costed. So a missing or broken entry gives an empty answer for that
 * plate instead of failing the whole import.
 */
export async function readPlateDetails(file: File, plates: readonly SlicedPlate[]): Promise<PlateDetails[]> {
  const buffer = await file.arrayBuffer();
  const entries = readDirectory(buffer);

  return Promise.all(
    plates.map(async (plate) => ({
      index: plate.index,
      objects: await readObjects(buffer, entries, plate),
      thumbnail: await readThumbnail(buffer, entries, plate.index),
    })),
  );
}

/**
 * plate_N.json lists every copy of every object. slice_info.config names them
 * too, and is the fallback when the JSON is missing or unreadable.
 */
async function readObjects(buffer: ArrayBuffer, entries: ZipEntry[], plate: SlicedPlate): Promise<PlateObjectCount[]> {
  const entry = findEntry(entries, plateJsonPath(plate.index));
  if (entry) {
    try {
      const objects = parsePlateObjects(await readEntryAsText(buffer, entry));
      if (objects !== null) return objects;
    } catch {
      // Fall through to the names slice_info.config already gave us.
    }
  }
  return countObjects(plate.objectNames);
}

async function readThumbnail(buffer: ArrayBuffer, entries: ZipEntry[], index: number): Promise<Blob | null> {
  const entry = findEntry(entries, platePicturePath(index));
  if (!entry) return null;
  try {
    return await cropToParts(await readEntryBytes(buffer, entry));
  } catch {
    return null;
  }
}

/**
 * plate_N.png is a 512 px render of the whole bed with a see-through
 * background, and the parts often sit in one corner of it. Cropped to what is
 * drawn, seven caps fill the thumbnail instead of being a speck in it.
 *
 * The result is square because every thumbnail in the app is, and a square
 * frame shows the whole plate instead of letting the frame cut it.
 */
async function cropToParts(png: Uint8Array): Promise<Blob | null> {
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  try {
    const { width, height } = bitmap;
    const reader = document.createElement('canvas');
    reader.width = width;
    reader.height = height;
    const readContext = reader.getContext('2d', { willReadFrequently: true });
    if (!readContext) return null;
    readContext.drawImage(bitmap, 0, 0);

    const box = opaqueBounds(readContext.getImageData(0, 0, width, height).data, width, height);
    if (box === null) return null;
    const frame = squareFrame(box, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = frame.size;
    canvas.height = frame.size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, frame.x, frame.y, frame.size, frame.size, 0, 0, frame.size, frame.size);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    bitmap.close();
  }
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The smallest box holding every pixel that is not see-through, from RGBA
 * data as a canvas returns it. Null when the picture is empty.
 */
export function opaqueBounds(rgba: ArrayLike<number>, width: number, height: number, minAlpha = MIN_ALPHA): PixelBox | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) < minAlpha) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * A square around the box, with some air, kept inside the picture whenever it
 * fits. It may reach past an edge only when the picture is narrower than the
 * square; the canvas leaves that strip transparent.
 */
export function squareFrame(
  box: PixelBox,
  width: number,
  height: number,
  marginRatio = MARGIN_RATIO,
  minSide = MIN_SIDE_PX,
): { x: number; y: number; size: number } {
  const longest = Math.max(box.width, box.height);
  const wanted = Math.max(Math.round(longest * (1 + 2 * marginRatio)), minSide);
  const size = Math.min(wanted, Math.max(width, height));

  return {
    x: startWithin(box.x + box.width / 2, size, width),
    y: startWithin(box.y + box.height / 2, size, height),
    size,
  };
}

/** Where a span of `size` centred on `centre` starts, without leaving `extent`. */
function startWithin(centre: number, size: number, extent: number): number {
  if (size >= extent) return Math.round((extent - size) / 2);
  return Math.round(Math.min(Math.max(centre - size / 2, 0), extent - size));
}
