import { roundMoney, sumMoney } from './money.ts';
import type { CostBreakdown, CostProfile, JobInput, MaterialLine, PrinterProfile } from './types.ts';

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
