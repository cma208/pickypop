import { describe, expect, it } from 'vitest';
import { countObjects, isPurgeTower, parsePlateObjects } from '../src/plate-objects.ts';

/** The shape Bambu Studio 02.08 writes, trimmed to what the reader looks at. */
function plateJson(names: string[]): string {
  return JSON.stringify({
    bbox_all: [0, 0, 180, 180],
    bbox_objects: names.map((name, offset) => ({
      area: 17.7,
      bbox: [0, 0, 10, 10],
      id: 980 + offset,
      layer_height: 0.2,
      name,
    })),
    bed_type: 'textured_plate',
    filament_colors: [],
    version: 2,
  });
}

describe('parsePlateObjects', () => {
  it('counts a mixed plate by name, in the order the objects first appear', () => {
    const json = plateJson([...Array(7).fill('Cap'), ...Array(7).fill('Body1')]);

    expect(parsePlateObjects(json)).toEqual([
      { name: 'Cap', count: 7 },
      { name: 'Body1', count: 7 },
    ]);
  });

  it('leaves the purge tower out: it is waste, not a part', () => {
    const json = plateJson(['Body1', 'Sub-merged body', 'Sub-merged body', 'wipe_tower']);

    expect(parsePlateObjects(json)).toEqual([
      { name: 'Body1', count: 1 },
      { name: 'Sub-merged body', count: 2 },
    ]);
  });

  it('keeps names that only differ in their suffix apart', () => {
    expect(parsePlateObjects(plateJson(['V4.stl_1', 'V4.stl_2']))).toEqual([
      { name: 'V4.stl_1', count: 1 },
      { name: 'V4.stl_2', count: 1 },
    ]);
  });

  it('reports a plate with only the tower as empty, not as unreadable', () => {
    expect(parsePlateObjects(plateJson(['wipe_tower']))).toEqual([]);
  });

  it('returns null for anything that is not a plate file, so the caller can fall back', () => {
    expect(parsePlateObjects('')).toBeNull();
    expect(parsePlateObjects('{not json')).toBeNull();
    expect(parsePlateObjects('null')).toBeNull();
    expect(parsePlateObjects('{"bbox_all": [0, 0, 1, 1]}')).toBeNull();
  });

  it('skips entries without a usable name', () => {
    const json = JSON.stringify({ bbox_objects: [{ name: 'Cap' }, { area: 3 }, { name: 42 }, null, { name: '  ' }] });

    expect(parsePlateObjects(json)).toEqual([{ name: 'Cap', count: 1 }]);
  });
});

describe('countObjects', () => {
  it('counts the names slice_info.config lists, which already leave the tower out', () => {
    expect(countObjects(['SkullV4', 'SkullV4'])).toEqual([{ name: 'SkullV4', count: 2 }]);
  });

  it('trims names so a stray space does not split one object in two', () => {
    expect(countObjects(['Cap', 'Cap '])).toEqual([{ name: 'Cap', count: 2 }]);
  });
});

describe('isPurgeTower', () => {
  it('knows the names slicers give the tower', () => {
    expect(isPurgeTower('wipe_tower')).toBe(true);
    expect(isPurgeTower('Prime tower')).toBe(true);
    expect(isPurgeTower('tower')).toBe(false);
    expect(isPurgeTower('Wipe tower holder')).toBe(false);
  });
});
