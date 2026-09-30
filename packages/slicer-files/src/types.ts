/** One filament slot used by a plate, as reported by the slicer. */
export interface SlicedFilament {
  /** 1-based slot. */
  id: number;
  /** Bambu filament profile id, e.g. GFA00 (PLA Basic) or GFA01 (PLA Matte). */
  trayInfoIdx: string | null;
  type: string | null;
  colorHex: string | null;
  usedMeters: number | null;
  /** Already includes purge and wipe tower. */
  usedGrams: number | null;
}

export interface SlicedPlate {
  index: number;
  /** Total estimate in seconds, including heating and preparation. */
  predictionSeconds: number | null;
  /** Total grams for the plate, purge included. */
  weightGrams: number | null;
  printerModelId: string | null;
  nozzleDiameters: string | null;
  supportUsed: boolean;
  outsideBed: boolean;
  objectNames: string[];
  filaments: SlicedFilament[];
}

export interface SliceInfo {
  slicerVersion: string | null;
  /** A project file carries no plates: it was saved before slicing. */
  isSliced: boolean;
  plates: SlicedPlate[];
}
