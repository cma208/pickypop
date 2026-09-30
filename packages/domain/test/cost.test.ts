import { describe, expect, it } from 'vitest';
import { calculateCost, machineRatePerHour } from '../src/cost.ts';
import type { CostProfile, PrinterProfile } from '../src/types.ts';

const A1_MINI: PrinterProfile = {
  name: 'Bambu Lab A1 mini',
  avgPowerWatts: 57,
  assetCost: 2000,
  usefulLifeHours: 5000,
  maintenanceCostPerYear: 200,
  printHoursPerYear: 1000,
};

const PROFILE: CostProfile = {
  materialWasteRate: 0.05,
  failureRate: 0.1,
  laborRatePerHour: 12,
  energyRatePerKwh: 0.7556,
  targetMargin: 0.4,
  minOrderPrice: 5,
  roundingStep: 0.5,
  igvRate: 0.18,
  taxRegime: 'none',
};

describe('machineRatePerHour', () => {
  it('adds depreciation and maintenance per hour', () => {
    // 2000 / 5000 = 0.40 of depreciation, 200 / 1000 = 0.20 of maintenance.
    expect(machineRatePerHour(A1_MINI)).toBe(0.6);
  });

  it('ignores a rate it cannot compute instead of dividing by zero', () => {
    expect(machineRatePerHour({ ...A1_MINI, usefulLifeHours: 0, printHoursPerYear: 0 })).toBe(0);
  });
});

describe('calculateCost', () => {
  it('reproduces the worked example from docs/02-dominio.md', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 4 * 3600,
        filaments: [{ label: 'PLA', grams: 80, costPerKg: 75 }],
        prepMinutes: 10,
        postMinutes: 10,
        supplies: [{ label: 'Empaque', cost: 1 }],
      },
      PROFILE,
      A1_MINI,
    );

    expect(cost.material).toBe(6.3);
    expect(cost.energy).toBe(0.17);
    expect(cost.machine).toBe(2.4);
    expect(cost.productionBeforeFailure).toBe(8.87);
    expect(cost.production).toBe(9.86);
    expect(cost.labor).toBe(4);
    expect(cost.total).toBe(14.86);
  });

  it('costs the real Love potion plate (11.34 g in three colours, 43 min)', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 2586,
        filaments: [
          { label: 'PLA #F55A74', grams: 5.69, costPerKg: 75 },
          { label: 'PLA #000000', grams: 4.63, costPerKg: 75 },
          { label: 'PLA #DE4343', grams: 1.02, costPerKg: 75 },
        ],
        prepMinutes: 10,
        postMinutes: 5,
        supplies: [{ label: 'Empaque', cost: 1 }],
      },
      { ...PROFILE, materialWasteRate: 0.03 },
      A1_MINI,
    );

    expect(cost.materialByFilament.map((line) => line.cost)).toEqual([0.44, 0.36, 0.08]);
    expect(cost.material).toBe(0.88);
    expect(cost.energy).toBe(0.03);
    expect(cost.machine).toBe(0.43);
    expect(cost.production).toBe(1.49);
    expect(cost.labor).toBe(3);
    expect(cost.total).toBe(5.49);
  });

  it('separates money spent today from cost that is only charged', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 2586,
        filaments: [{ grams: 11.34, costPerKg: 75 }],
        prepMinutes: 10,
        postMinutes: 5,
        supplies: [{ cost: 1 }],
      },
      { ...PROFILE, materialWasteRate: 0.03 },
      A1_MINI,
    );

    expect(cost.cashOutOfPocket).toBe(1.91); // material + energy + supplies
    expect(cost.assigned).toBe(3.43); // machine + labour
  });

  it('shows the breakdown adding up to the total', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 3600,
        filaments: [{ grams: 20, costPerKg: 75 }],
        prepMinutes: 5,
        postMinutes: 5,
        supplies: [{ cost: 0.5 }],
      },
      PROFILE,
      A1_MINI,
    );

    expect(cost.production + cost.labor + cost.supplies).toBeCloseTo(cost.total, 10);
    expect(cost.productionBeforeFailure + cost.failureAllowance).toBeCloseTo(cost.production, 10);
  });

  it('splits the total into cash, assigned cost and the failure provision', () => {
    const cost = calculateCost(
      {
        printTimeSeconds: 2586,
        filaments: [{ grams: 11.34, costPerKg: 75 }],
        prepMinutes: 10,
        postMinutes: 5,
        supplies: [{ cost: 1 }],
      },
      { ...PROFILE, materialWasteRate: 0.03 },
      A1_MINI,
    );

    expect(cost.cashOutOfPocket + cost.assigned + cost.failureAllowance).toBeCloseTo(cost.total, 10);
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
