import { describe, expect, it } from 'vitest';
import { calculateBatchCost, calculateCost } from '../src/cost.ts';
import { calculatePrice } from '../src/price.ts';
import type { BatchInput, CostProfile, PrinterProfile } from '../src/types.ts';

const A1_MINI: PrinterProfile = {
  name: 'Bambu Lab A1 mini',
  avgPowerWatts: 57,
  assetCost: 1500,
  usefulLifeHours: 5000,
  maintenanceCostPerYear: 240,
  printHoursPerYear: 2000,
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

/**
 * A potion bottle is two plates: the bottle itself, one per run of 43 minutes,
 * and the caps that close it, nine per run of 20 minutes.
 */
function potionBottles(units: number): BatchInput {
  return {
    units,
    plates: [
      {
        label: 'Botella',
        printTimeSeconds: 2586,
        filaments: [
          { label: 'PLA #F55A74', grams: 5.69, costPerKg: 50 },
          { label: 'PLA #000000', grams: 4.63, costPerKg: 50 },
          { label: 'PLA #DE4343', grams: 1.02, costPerKg: 50 },
        ],
        unitsPerRun: 1,
      },
      {
        label: 'Tapas',
        printTimeSeconds: 1200,
        filaments: [{ label: 'PLA #000000', grams: 15, costPerKg: 50 }],
        unitsPerRun: 9,
      },
    ],
    setupMinutes: 30,
    minutesPerUnit: 4,
    suppliesPerUnit: [
      { label: 'Dulce', cost: 0.99 },
      { label: 'Empaque', cost: 0.5 },
    ],
  };
}

describe('calculateBatchCost', () => {
  it('prints each plate as many times as the batch needs', () => {
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);

    const [bottle, caps] = batch.plates;
    expect(bottle?.runs).toBe(10);
    expect(bottle?.spareUnits).toBe(0);
    // Nine caps per run, so ten bottles need two runs and eight caps are left.
    expect(caps?.runs).toBe(2);
    expect(caps?.unitsProduced).toBe(18);
    expect(caps?.spareUnits).toBe(8);
  });

  it('costs a batch of ten bottles', () => {
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);

    expect(batch.printHours).toBeCloseTo(7.85, 2);
    expect(batch.material).toBe(7.39);
    expect(batch.energy).toBe(0.34);
    expect(batch.machine).toBe(3.3);
    expect(batch.production).toBe(12.26);
    expect(batch.laborSetup).toBe(7.5); // 30 min, once
    expect(batch.laborPerUnits).toBe(10); // 4 min per unit
    expect(batch.supplies).toBe(14.9);
    expect(batch.total).toBe(44.66);
    expect(batch.costPerUnit).toBe(4.47);
  });

  it('makes each unit cheaper than printing it on its own', () => {
    const alone = calculateBatchCost(potionBottles(1), PROFILE, A1_MINI);
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);

    expect(batch.costPerUnit).toBeLessThan(alone.costPerUnit);
    // The setup is paid once either way.
    expect(batch.laborSetup).toBe(alone.laborSetup);
  });

  it('prices a batch unit below the single-unit price', () => {
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);

    expect(calculatePrice(batch.costPerUnit, PROFILE).total).toBe(9);
  });

  it('agrees with the single-plate calculation when there is one plate and one unit', () => {
    const job = {
      printTimeSeconds: 2586,
      filaments: [{ grams: 11.34, costPerKg: 50 }],
      prepMinutes: 10,
      postMinutes: 0,
      supplies: [{ cost: 1.49 }],
    };
    const single = calculateCost(job, PROFILE, A1_MINI);
    const batch = calculateBatchCost(
      {
        units: 1,
        plates: [{ printTimeSeconds: 2586, filaments: job.filaments, unitsPerRun: 1 }],
        setupMinutes: 10,
        minutesPerUnit: 0,
        suppliesPerUnit: [{ cost: 1.49 }],
      },
      PROFILE,
      A1_MINI,
    );

    expect(batch.total).toBe(single.total);
  });

  it('rejects impossible batches', () => {
    expect(() => calculateBatchCost(potionBottles(0), PROFILE, A1_MINI)).toThrow(RangeError);
    expect(() =>
      calculateBatchCost({ ...potionBottles(5), plates: [] }, PROFILE, A1_MINI),
    ).toThrow(RangeError);
  });
});
