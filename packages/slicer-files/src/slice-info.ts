import type { SliceInfo, SlicedFilament, SlicedPlate } from './types.ts';

/**
 * Reads Metadata/slice_info.config out of a Bambu Studio .gcode.3mf.
 *
 * The file is small, flat XML, so it is parsed with regular expressions instead
 * of a DOM: that keeps the package dependency free and identical in the browser
 * and in Node.
 */

const HEADER_ITEM = /<header_item\s+([^>]*?)\/>/g;
const PLATE_BLOCK = /<plate>([\s\S]*?)<\/plate>/g;
const METADATA_ITEM = /<metadata\s+([^>]*?)\/>/g;
const OBJECT_ITEM = /<object\s+([^>]*?)\/>/g;
const FILAMENT_ITEM = /<filament\s+([^>]*?)\/>/g;
const ATTRIBUTE = /([\w-]+)\s*=\s*"([^"]*)"/g;

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) attributes[name] = value;
  }
  return attributes;
}

function collect(xml: string, pattern: RegExp): Record<string, string>[] {
  return [...xml.matchAll(pattern)].map((match) => readAttributes(match[1] ?? ''));
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMetadata(plateXml: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const item of collect(plateXml, METADATA_ITEM)) {
    const key = item['key'];
    const value = item['value'];
    if (key !== undefined && value !== undefined) metadata[key] = value;
  }
  return metadata;
}

function readFilaments(plateXml: string): SlicedFilament[] {
  return collect(plateXml, FILAMENT_ITEM).map((filament) => ({
    id: toNumber(filament['id']) ?? 0,
    trayInfoIdx: filament['tray_info_idx'] ?? null,
    type: filament['type'] ?? null,
    colorHex: filament['color'] ?? null,
    usedMeters: toNumber(filament['used_m']),
    usedGrams: toNumber(filament['used_g']),
  }));
}

function readPlate(plateXml: string): SlicedPlate {
  const metadata = readMetadata(plateXml);
  return {
    index: toNumber(metadata['index']) ?? 0,
    predictionSeconds: toNumber(metadata['prediction']),
    weightGrams: toNumber(metadata['weight']),
    printerModelId: metadata['printer_model_id'] ?? null,
    nozzleDiameters: metadata['nozzle_diameters'] ?? null,
    supportUsed: metadata['support_used'] === 'true',
    outsideBed: metadata['outside'] === 'true',
    objectNames: collect(plateXml, OBJECT_ITEM)
      .map((object) => object['name'])
      .filter((name): name is string => name !== undefined),
    filaments: readFilaments(plateXml),
  };
}

export function parseSliceInfo(xml: string): SliceInfo {
  const header = collect(xml, HEADER_ITEM);
  const version = header.find((item) => item['key'] === 'X-BBL-Client-Version')?.['value'] ?? null;
  const plates = [...xml.matchAll(PLATE_BLOCK)].map((match) => readPlate(match[1] ?? ''));

  return { slicerVersion: version, isSliced: plates.length > 0, plates };
}

/** Grams reported per filament. May differ from the plate weight by rounding. */
export function totalFilamentGrams(plate: SlicedPlate): number {
  const total = plate.filaments.reduce((sum, filament) => sum + (filament.usedGrams ?? 0), 0);
  return Math.round(total * 100) / 100;
}
