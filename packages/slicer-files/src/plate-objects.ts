/**
 * Reads Metadata/plate_N.json out of a Bambu Studio .gcode.3mf: which objects
 * sit on plate N, counted by name.
 *
 * Bambu Studio names every copy of an object the same, so seven caps arrive as
 * seven entries called "Cap". Counting them is what turns the file into a
 * proposal of what the plate puts on the shelf: Cap ×7, Body1 ×7.
 *
 * The file says nothing about grams per object, only names, areas and boxes.
 */

export interface PlateObjectCount {
  /** The object name as the slicer shows it, e.g. "Cap" or "V4.stl_2". */
  name: string;
  count: number;
}

/**
 * The purge tower is listed as one more object of the plate, but it is waste,
 * not a part. Bambu Studio calls it `wipe_tower`; other slicers built on the
 * same code say "prime tower".
 */
const PURGE_TOWER = /^(wipe|prime)[ _-]?tower$/i;

export function isPurgeTower(name: string): boolean {
  return PURGE_TOWER.test(name.trim());
}

/**
 * Counts names, keeping the order in which each first appears: that is the
 * order the person laid them out on the plate, and it reads better than an
 * alphabetical list. Blank names and the purge tower are left out.
 */
export function countObjects(names: readonly string[]): PlateObjectCount[] {
  const counts = new Map<string, number>();

  for (const raw of names) {
    const name = raw.trim();
    if (name === '' || isPurgeTower(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts].map(([name, count]) => ({ name, count }));
}

/**
 * Objects of one plate, from the text of its plate_N.json.
 *
 * Returns null when the text is not that file — broken JSON, or no
 * `bbox_objects` list — so the caller can fall back to the object names in
 * slice_info.config instead of reporting an empty plate.
 */
export function parsePlateObjects(json: string): PlateObjectCount[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) return null;
  const objects = (data as { bbox_objects?: unknown }).bbox_objects;
  if (!Array.isArray(objects)) return null;

  const names = objects.flatMap((object: unknown) => {
    const name = typeof object === 'object' && object !== null ? (object as { name?: unknown }).name : undefined;
    return typeof name === 'string' ? [name] : [];
  });

  return countObjects(names);
}
