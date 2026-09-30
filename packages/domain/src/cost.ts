import { roundMoney, sumMoney } from './money.ts';
import type {
  BatchCostBreakdown,
  BatchInput,
  BatchPlateBreakdown,
  CostBreakdown,
  CostProfile,
  JobInput,
  MaterialLine,
  PrinterProfile,
} from './types.ts';

const SECONDS_PER_HOUR = 3600;
const MINUTES_PER_HOUR = 60;
const GRAMS_PER_KG = 1000;
const WATTS_PER_KW = 1000;

/**
 * Hourly cost of owning and maintaining the machine:
 * depreciation over its useful life plus the maintenance budget spread over
 * the hours it is expected to run.
 */
export function machineRatePerHour(printer: PrinterProfile): number {
  const depreciation =
    printer.usefulLifeHours > 0 ? printer.assetCost / printer.usefulLifeHours : 0;
  const maintenance =
    printer.printHoursPerYear > 0
      ? printer.maintenanceCostPerYear / printer.printHoursPerYear
      : 0;
  return roundMoney(depreciation + maintenance);
}

function assertValidProfile(profile: CostProfile): void {
  if (profile.failureRate < 0 || profile.failureRate >= 1) {
    throw new RangeError('failureRate must be between 0 and 1 (exclusive)');
  }
  if (profile.materialWasteRate < 0) {
    throw new RangeError('materialWasteRate cannot be negative');
  }
}

function costOfFilament(grams: number, costPerKg: number, wasteRate: number): number {
  return roundMoney((grams * (1 + wasteRate) * costPerKg) / GRAMS_PER_KG);
}

/**
 * Costs one plate, following docs/02-dominio.md section 2.5.
 * Note the slicer already counts purge and wipe tower in its grams, so the
 * waste rate only covers priming and spool leftovers.
 */
export function calculateCost(
  job: JobInput,
  profile: CostProfile,
  printer: PrinterProfile,
): CostBreakdown {
  assertValidProfile(profile);

  const printHours = job.printTimeSeconds / SECONDS_PER_HOUR;

  const materialByFilament: MaterialLine[] = job.filaments.map((filament) => ({
    ...(filament.label === undefined ? {} : { label: filament.label }),
    grams: filament.grams,
    cost: costOfFilament(filament.grams, filament.costPerKg, profile.materialWasteRate),
  }));
  const material = sumMoney(materialByFilament.map((line) => line.cost));

  const energy = roundMoney(
    printHours * (printer.avgPowerWatts / WATTS_PER_KW) * profile.energyRatePerKwh,
  );

  const ratePerHour = machineRatePerHour(printer);
  const machine = roundMoney(printHours * ratePerHour);

  const productionBeforeFailure = sumMoney([material, energy, machine]);
  const production = roundMoney(productionBeforeFailure / (1 - profile.failureRate));
  const failureAllowance = roundMoney(production - productionBeforeFailure);

  const labor = roundMoney(
    ((job.prepMinutes + job.postMinutes) / MINUTES_PER_HOUR) * profile.laborRatePerHour,
  );
  const supplies = sumMoney((job.supplies ?? []).map((supply) => supply.cost));

  return {
    printHours,
    machineRatePerHour: ratePerHour,
    materialByFilament,
    material,
    energy,
    machine,
    productionBeforeFailure,
    failureAllowance,
    production,
    labor,
    supplies,
    total: sumMoney([production, labor, supplies]),
    cashOutOfPocket: sumMoney([material, energy, supplies]),
    assigned: sumMoney([machine, labor]),
  };
}

/**
 * Costs a batch of finished products, following docs/02-dominio.md section 2.5.
 *
 * A product is rarely one plate: the bottle comes out of one and its caps out
 * of another, nine at a time. Each plate is printed as many times as needed,
 * rounded up, so any spare pieces the last run leaves over are still paid for.
 *
 * Labour is split in two, which is what makes batches cheaper per unit: the
 * setup happens once, while assembly and packing happen per unit.
 */
export function calculateBatchCost(
  batch: BatchInput,
  profile: CostProfile,
  printer: PrinterProfile,
): BatchCostBreakdown {
  assertValidProfile(profile);
  if (!Number.isInteger(batch.units) || batch.units <= 0) {
    throw new RangeError('units must be a positive whole number');
  }
  if (batch.plates.length === 0) {
    throw new RangeError('a batch needs at least one plate');
  }

  const plates: BatchPlateBreakdown[] = batch.plates.map((plate) => {
    if (plate.unitsPerRun <= 0) {
      throw new RangeError(`unitsPerRun must be greater than 0 (plate ${plate.label ?? '?'})`);
    }
    const runs = Math.ceil(batch.units / plate.unitsPerRun);
    const unitsProduced = runs * plate.unitsPerRun;

    return {
      ...(plate.label === undefined ? {} : { label: plate.label }),
      runs,
      unitsProduced,
      spareUnits: unitsProduced - batch.units,
      printHours: (plate.printTimeSeconds * runs) / SECONDS_PER_HOUR,
      material: sumMoney(
        plate.filaments.map((filament) =>
          costOfFilament(filament.grams * runs, filament.costPerKg, profile.materialWasteRate),
        ),
      ),
    };
  });

  const printHours = plates.reduce((hours, plate) => hours + plate.printHours, 0);
  const material = sumMoney(plates.map((plate) => plate.material));

  const energy = roundMoney(
    printHours * (printer.avgPowerWatts / WATTS_PER_KW) * profile.energyRatePerKwh,
  );
  const ratePerHour = machineRatePerHour(printer);
  const machine = roundMoney(printHours * ratePerHour);

  const productionBeforeFailure = sumMoney([material, energy, machine]);
  const production = roundMoney(productionBeforeFailure / (1 - profile.failureRate));

  const laborSetup = roundMoney((batch.setupMinutes / MINUTES_PER_HOUR) * profile.laborRatePerHour);
  const laborPerUnits = roundMoney(
    ((batch.minutesPerUnit * batch.units) / MINUTES_PER_HOUR) * profile.laborRatePerHour,
  );

  const supplies = sumMoney([
    ...(batch.suppliesPerBatch ?? []).map((supply) => supply.cost),
    ...(batch.suppliesPerUnit ?? []).map((supply) => roundMoney(supply.cost * batch.units)),
  ]);

  const labor = sumMoney([laborSetup, laborPerUnits]);
  const total = sumMoney([production, labor, supplies]);

  return {
    units: batch.units,
    plates,
    printHours,
    machineRatePerHour: ratePerHour,
    material,
    energy,
    machine,
    productionBeforeFailure,
    failureAllowance: roundMoney(production - productionBeforeFailure),
    production,
    laborSetup,
    laborPerUnits,
    labor,
    supplies,
    total,
    cashOutOfPocket: sumMoney([material, energy, supplies]),
    assigned: sumMoney([machine, labor]),
    costPerUnit: roundMoney(total / batch.units),
  };
}
