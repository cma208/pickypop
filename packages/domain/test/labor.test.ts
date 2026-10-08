import { describe, expect, it } from 'vitest';
import { calculateBatchCost, laborCost } from '../src/cost.ts';
import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '../src/profiles.ts';

const RATE = 15;

describe('laborCost', () => {
  it('pays the setup once and the minutes per unit for every unit', () => {
    // The skull: 10 minutes of setup, 5 a unit, at S/ 15 an hour.
    expect(laborCost({ setupMinutes: 10, minutesPerUnit: 5, units: 1 }, RATE)).toEqual({
      setup: 2.5,
      perUnits: 1.25,
      total: 3.75,
    });
    expect(laborCost({ setupMinutes: 10, minutesPerUnit: 5, units: 4 }, RATE)).toEqual({
      setup: 2.5,
      perUnits: 5,
      total: 7.5,
    });
  });

  it('rounds each half to cents on its own, so the breakdown adds up', () => {
    // 7 min = 1.75; 1.5 min × 3 = 4.5 min = 1.125, which is 1.13.
    const labor = laborCost({ setupMinutes: 7, minutesPerUnit: 1.5, units: 3 }, RATE);

    expect(labor.setup).toBe(1.75);
    expect(labor.perUnits).toBe(1.13);
    expect(labor.total).toBe(2.88);
  });

  it('is nothing when the recipe has no minutes or the hour costs nothing', () => {
    expect(laborCost({ setupMinutes: 0, minutesPerUnit: 0, units: 9 }, RATE).total).toBe(0);
    expect(laborCost({ setupMinutes: 10, minutesPerUnit: 5, units: 9 }, 0).total).toBe(0);
  });

  it('is the labour the batch estimate charges for the same units', () => {
    const work = { setupMinutes: 30, minutesPerUnit: 4, units: 10 };
    const batch = calculateBatchCost(
      {
        ...work,
        plates: [{ unitsPerRun: 1, printTimeSeconds: 3600, filaments: [{ grams: 10, costPerKg: 50 }] }],
      },
      DRAFT_COST_PROFILE_PE,
      DRAFT_PRINTER_A1_MINI,
    );
    const labor = laborCost(work, DRAFT_COST_PROFILE_PE.laborRatePerHour);

    expect(batch.laborSetup).toBe(labor.setup);
    expect(batch.laborPerUnits).toBe(labor.perUnits);
    expect(batch.labor).toBe(labor.total);
  });
});
