import type { CostProfile, PrinterProfile } from './types.ts';

/**
 * Starting profile for the Pickypop workshop.
 *
 * Values are marked REAL when they come from a bill, an invoice or a
 * measurement, and PLACEHOLDER when they are still a guess. The pending ones
 * are listed in docs/README.md.
 */
export const DRAFT_COST_PROFILE_PE: CostProfile = {
  // REAL: verified against two sliced files, where purge is already counted.
  materialWasteRate: 0.03,
  // PLACEHOLDER: until there is enough history to measure it.
  failureRate: 0.1,
  // PLACEHOLDER: S/ 3,000 a month over about 208 hours. See docs/02-dominio.md.
  laborRatePerHour: 15,
  // REAL: Luz del Sur BT5B, over 140 kWh a month, IGV included.
  energyRatePerKwh: 0.7556,
  // REAL: the margin the workshop decided to aim for.
  targetMargin: 0.5,
  // PLACEHOLDER
  minOrderPrice: 5,
  roundingStep: 0.5,
  igvRate: 0.18,
  taxRegime: 'none',
};

/** Bambu Lab A1 mini with AMS lite. */
export const DRAFT_PRINTER_A1_MINI: PrinterProfile = {
  name: 'Bambu Lab A1 mini',
  // REAL: Bambu wiki, average while printing PLA.
  avgPowerWatts: 57,
  // REAL: what the printer cost.
  assetCost: 1500,
  // PLACEHOLDER: a conservative life for a machine that has run 175 h so far.
  usefulLifeHours: 5000,
  // PLACEHOLDER: around 8 % of the machine price per year in nozzles, plate,
  // grease and cutter blades.
  maintenanceCostPerYear: 120,
  // PLACEHOLDER: pending how long the printer has been in use.
  printHoursPerYear: 500,
};
