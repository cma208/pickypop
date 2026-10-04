import { describe, expect, it } from 'vitest';
import { calculateBatchCost, calculateCost } from '../src/cost.ts';
import { roundMoney, sumMoney } from '../src/money.ts';
import { calculatePrice } from '../src/price.ts';
import { DRAFT_COST_PROFILE_PE, DRAFT_PRINTER_A1_MINI } from '../src/profiles.ts';
import type { BatchInput, BatchPlate, CostProfile, PrinterProfile } from '../src/types.ts';

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

/**
 * The seeded recipe (supabase/seed.sql): 10 min of setup once, 5 min per unit,
 * and 1.49 of sweets and bag per unit. These are the figures documented for a
 * batch of ten, so a change here is a regression, not an improvement.
 */
describe('seeded potion bottle recipe', () => {
  it('keeps the documented figures for a batch of ten', () => {
    const batch = calculateBatchCost(
      {
        ...potionBottles(10),
        setupMinutes: 10,
        minutesPerUnit: 5,
        suppliesPerUnit: [{ label: 'Dulces y bolsa', cost: 1.49 }],
      },
      DRAFT_COST_PROFILE_PE,
      DRAFT_PRINTER_A1_MINI,
    );

    expect(batch.material).toBe(7.39);
    expect(batch.production).toBe(12.26);
    expect(batch.supplies).toBe(14.9);
    expect(batch.total).toBe(42.16);
    expect(batch.costPerUnit).toBe(4.22);
  });
});

describe('calculateBatchCost material breakdown', () => {
  it('reports the grams and cost of every filament for all the runs of a plate', () => {
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);
    const [bottle, caps] = batch.plates;

    const bottleLines = bottle?.materialByFilament ?? [];
    expect(bottleLines.map((line) => line.label)).toEqual([
      'PLA #F55A74',
      'PLA #000000',
      'PLA #DE4343',
    ]);
    expect(bottleLines.map((line) => line.cost)).toEqual([2.93, 2.38, 0.53]);
    // Grams are not money, so they are a plain product: compare, do not round.
    expect(bottleLines[0]?.grams).toBeCloseTo(56.9, 6);
    expect(bottleLines[2]?.grams).toBeCloseTo(10.2, 6);

    // Two runs of the caps plate, not ten: runs depend on the plate.
    expect(caps?.materialByFilament).toEqual([{ label: 'PLA #000000', grams: 30, cost: 1.55 }]);
  });

  it('adds the filaments up to the plate and the plates up to the batch, to the cent', () => {
    const batch = calculateBatchCost(potionBottles(10), PROFILE, A1_MINI);

    for (const plate of batch.plates) {
      expect(sumMoney(plate.materialByFilament.map((line) => line.cost))).toBe(plate.material);
    }
    expect(sumMoney(batch.plates.map((plate) => plate.material))).toBe(batch.material);
  });

  /**
   * Awkward cents: grams with decimals and prices that never land on a whole
   * cent. Every filament carries its own rounding, so rounding the plate once
   * instead would land a cent away from what the lines show; the last
   * assertion pins that this input really exposes the difference.
   */
  it('stays exact with fractional grams, several filaments and uneven runs', () => {
    const plates: BatchPlate[] = [
      {
        label: 'Body',
        printTimeSeconds: 1800,
        unitsPerRun: 2,
        filaments: [
          { grams: 3.337, costPerKg: 47.3 },
          { grams: 7.771, costPerKg: 61.9 },
          { grams: 2.249, costPerKg: 83.17 },
          { grams: 0.413, costPerKg: 52.55 },
        ],
      },
      {
        label: 'Caps',
        printTimeSeconds: 900,
        unitsPerRun: 7,
        filaments: [
          { grams: 1.117, costPerKg: 49.99 },
          { grams: 0.903, costPerKg: 49.99 },
        ],
      },
    ];
    const batch = calculateBatchCost(
      { units: 13, plates, setupMinutes: 0, minutesPerUnit: 0 },
      PROFILE,
      A1_MINI,
    );

    for (const plate of batch.plates) {
      const lineSum = sumMoney(plate.materialByFilament.map((line) => line.cost));
      expect(lineSum).toBe(plate.material);
    }
    expect(sumMoney(batch.plates.map((plate) => plate.material))).toBe(batch.material);

    // The trap this guards against: costing the whole plate in one go gives
    // a different cent than adding the rounded lines.
    const [body] = batch.plates;
    const rawPlate = (body?.materialByFilament ?? []).reduce(
      (sum, line, index) =>
        sum +
        (line.grams * (1 + PROFILE.materialWasteRate) * (plates[0]?.filaments[index]?.costPerKg ?? 0)) /
          1000,
      0,
    );
    expect(roundMoney(rawPlate)).not.toBe(body?.material);
  });

  it('holds for many arbitrary batches', () => {
    // Small deterministic generator, so a failure can be reproduced.
    let seed = 20260101;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let round = 0; round < 300; round += 1) {
      const plates: BatchPlate[] = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
        printTimeSeconds: Math.floor(next() * 7200),
        unitsPerRun: 1 + Math.floor(next() * 9),
        filaments: Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({
          grams: Math.round(next() * 40000) / 1000,
          costPerKg: Math.round(next() * 9000) / 100,
        })),
      }));
      const batch = calculateBatchCost(
        { units: 1 + Math.floor(next() * 50), plates, setupMinutes: 0, minutesPerUnit: 0 },
        PROFILE,
        A1_MINI,
      );

      for (const plate of batch.plates) {
        expect(sumMoney(plate.materialByFilament.map((line) => line.cost))).toBe(plate.material);
      }
      expect(sumMoney(batch.plates.map((plate) => plate.material))).toBe(batch.material);
    }
  });
});
