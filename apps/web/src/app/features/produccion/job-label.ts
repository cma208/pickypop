/**
 * «Qué se imprime» follows the plate while the person has not written it.
 *
 * The field is required for a job without an order, and choosing a plate
 * left it empty: «Tapas y ganchos» was right there in the picker and still
 * had to be typed. What the person writes is theirs and is never replaced;
 * what came from a plate goes with the plate.
 */
export interface JobLabel {
  /** What the field says. */
  label: string;
  /** The label a plate put there, while nobody has changed it. */
  fromPlate: string | null;
}

export function labelForPlate(current: JobLabel, plateLabel: string | null): JobLabel {
  const untouched = current.label.trim() === '' || current.label === current.fromPlate;
  if (!untouched) return { label: current.label, fromPlate: null };
  if (plateLabel === null || plateLabel.trim() === '') return { label: '', fromPlate: null };
  return { label: plateLabel, fromPlate: plateLabel };
}
