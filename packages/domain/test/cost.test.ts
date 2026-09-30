import { describe, expect, it } from 'vitest';
import { calculateCost, machineRatePerHour } from '../src/cost.ts';
import type { CostProfile, JobInput, PrinterProfile } from '../src/types.ts';

/** The real machine: S/ 1,500, with a maintenance budget still to be measured. */
const A1_MINI: PrinterProfile = {
  name: 'Bambu Lab A1 mini',
  avgPowerWatts: 57,
  assetCost: 1500,
  usefulLifeHours: 5000,
  maintenanceCostPerYear: 240,
  printHoursPerYear: 2000,
};

/** The made-up machine used by the first example in docs/02-dominio.md. */
const A1_MINI_ILLUSTRATIVE: PrinterProfile = {
  ...A1_MINI,
  assetCost: 2000,
  maintenanceCostPerYear: 200,
  printHoursPerYear: 1000,
  usefulLifeHours: 5000,
};

const PROFILE: CostProfile = {
  materialWasteRate: 0.03,
  failureRate: 0.1,
  laborRatePerHour: 15,
  energyRatePerKwh: 0.7556,
  targetMargin: 0.5,
  minOrderPrice: 5,
  roundingStep: 0.5,
  igvRate: 0.18,
  taxRegime: 'none',
};

/** Love potion: the real three-colour plate, 11.34 g in 43 minutes. */
const LOVE_POTION: JobInput = {
  printTimeSeconds: 2586,
  filaments: [
    { label: 'PLA #F55A74', grams: 5.69, costPerKg: 50 },
    { label: 'PLA #000000', grams: 4.63, costPerKg: 50 },
    { label: 'PLA #DE4343', grams: 1.02, costPerKg: 50 },
  ],
  prepMinutes: 5,
  postMinutes: 5,
  supplies: [
    { label: 'Dulce', cost: 0.99 }, // 66 g of assorted sweets at S/ 15 a kilo
    { label: 'Empaque', cost: 0.5 },
  ],
};

describe('machineRatePerHour', () => {
  it('adds depreciation and maintenance per hour', () => {
    // 1500 / 5000 = 0.30 of depreciation, 240 / 2000 = 0.12 of maintenance.
    expect(machineRatePerHour(A1_MINI)).toBe(0.42);
  });

  it('ignores a rate it cannot compute instead of dividing by zero', () => {
    expect(machineRatePerHour({ ...A1_MINI, usefulLifeHours: 0, printHoursPerYear: 0 })).toBe(0);
  });
});

describe('calculateCost', () => {
  it('reproduces the illustrative example from docs/02-dominio.md', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 4 * 3600,
        filaments: [{ label: 'PLA', grams: 80, costPerKg: 75 }],
        prepMinutes: 10,
        postMinutes: 10,
        supplies: [{ label: 'Empaque', cost: 1 }],
      },
      { ...PROFILE, materialWasteRate: 0.05, laborRatePerHour: 12, targetMargin: 0.4 },
      A1_MINI_ILLUSTRATIVE,
    );

    expect(cost.material).toBe(6.3);
    expect(cost.energy).toBe(0.17);
    expect(cost.machine).toBe(2.4);
    expect(cost.productionBeforeFailure).toBe(8.87);
    expect(cost.production).toBe(9.86);
    expect(cost.labor).toBe(4);
    expect(cost.total).toBe(14.86);
  });

  it('costs the real Love potion plate with the current parameters', () => {
    const cost = calculateCost(LOVE_POTION, PROFILE, A1_MINI);

    expect(cost.materialByFilament.map((line) => line.cost)).toEqual([0.29, 0.24, 0.05]);
    expect(cost.material).toBe(0.58);
    expect(cost.energy).toBe(0.03);
    expect(cost.machine).toBe(0.3);
    expect(cost.production).toBe(1.01); // 0.91 / 0.90, the failure allowance
    expect(cost.labor).toBe(2.5);
    expect(cost.supplies).toBe(1.49);
    expect(cost.total).toBe(5);
  });

  it('separates money spent today from cost that is only charged', () => {
    const cost = calculateCost(LOVE_POTION, PROFILE, A1_MINI);

    expect(cost.cashOutOfPocket).toBe(2.1); // filament, electricity, sweet and bag
    expect(cost.assigned).toBe(2.8); // machine wear and own labour
    expect(cost.cashOutOfPocket + cost.assigned + cost.failureAllowance).toBeCloseTo(cost.total, 10);
  });

  it('shows the breakdown adding up to the total', () => {
    const cost = calculateCost(LOVE_POTION, PROFILE, A1_MINI);

    expect(cost.production + cost.labor + cost.supplies).toBeCloseTo(cost.total, 10);
    expect(cost.productionBeforeFailure + cost.failureAllowance).toBeCloseTo(cost.production, 10);
  });

  it('rejects a failure rate that would divide by zero', () => {
    expect(() =>
      calculateCost(
        { printTimeSeconds: 3600, filaments: [], prepMinutes: 0, postMinutes: 0 },
        { ...PROFILE, failureRate: 1 },
        A1_MINI,
      ),
    ).toThrow(RangeError);
  });
});
