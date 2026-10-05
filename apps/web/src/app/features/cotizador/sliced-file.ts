import { parseSliceInfo, type SliceInfo } from '../../core/pricing';
import { readTextEntry, ZipError } from './zip';

/**
 * Turns a dropped .gcode.3mf into the plate data the calculator needs.
 *
 * Nothing leaves the browser: the file is read with FileReader, the one XML
 * entry we care about is inflated in memory and the 1.4 MB of G-code is never
 * touched. See docs/01-investigacion.md section 1.2.
 */

const SLICE_INFO_PATH = 'Metadata/slice_info.config';

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
