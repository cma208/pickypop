import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSliceInfo, totalFilamentGrams } from '../src/slice-info.ts';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

describe('parseSliceInfo', () => {
  it('reads a three-colour plate', () => {
    const info = parseSliceInfo(fixture('love-potion.sliced.config'));

    expect(info.isSliced).toBe(true);
    expect(info.slicerVersion).toBe('02.08.02.61');
    expect(info.plates).toHaveLength(1);

    const plate = info.plates[0]!;
    expect(plate.index).toBe(2);
    expect(plate.predictionSeconds).toBe(2586);
    expect(plate.weightGrams).toBe(11.35);
    expect(plate.printerModelId).toBe('N1'); // A1 mini
    expect(plate.nozzleDiameters).toBe('0.4');
    expect(plate.supportUsed).toBe(false);
    expect(plate.outsideBed).toBe(false);
    expect(plate.objectNames).toHaveLength(2);
    expect(plate.filaments).toHaveLength(3);
    expect(plate.filaments[0]).toEqual({
      id: 1,
      trayInfoIdx: 'GFA00',
      type: 'PLA',
      colorHex: '#F55A74',
      usedMeters: 1.88,
      usedGrams: 5.69,
    });
  });

  it('reads a two-colour plate', () => {
    const plate = parseSliceInfo(fixture('wicked-potion.sliced.config')).plates[0]!;

    expect(plate.index).toBe(1);
    expect(plate.predictionSeconds).toBe(2096);
    expect(plate.weightGrams).toBe(10.43);
    expect(plate.filaments.map((filament) => filament.colorHex)).toEqual(['#61C680', '#000000']);
    expect(plate.filaments[0]?.trayInfoIdx).toBe('GFA01'); // PLA Matte
  });

  it('flags a project that was never sliced, instead of reporting zero grams', () => {
    const info = parseSliceInfo(fixture('unsliced-project.config'));

    expect(info.isSliced).toBe(false);
    expect(info.plates).toHaveLength(0);
    expect(info.slicerVersion).toBe('02.08.02.61');
  });

  it('survives an empty or broken file', () => {
    expect(parseSliceInfo('')).toEqual({ slicerVersion: null, isSliced: false, plates: [] });
    expect(parseSliceInfo('<config><plate></plate></config>').plates[0]?.filaments).toEqual([]);
  });
});

describe('totalFilamentGrams', () => {
  it('adds up the filaments and stays within rounding of the declared weight', () => {
    const plate = parseSliceInfo(fixture('love-potion.sliced.config')).plates[0]!;

    expect(totalFilamentGrams(plate)).toBe(11.34);
    expect(Math.abs(totalFilamentGrams(plate) - plate.weightGrams!)).toBeLessThanOrEqual(0.05);
  });
});
