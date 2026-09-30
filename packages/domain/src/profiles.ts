import type { CostProfile, PrinterProfile } from './types.ts';

/**
 * Starting profile for the Pickypop workshop.
 *
 * TODO: values marked as PLACEHOLDER are invented so the examples run. They must
 * be replaced with the real ones before quoting anything. See the pending data
 * table in docs/README.md.
 */
export const DRAFT_COST_PROFILE_PE: CostProfile = {
  materialWasteRate: 0.03,
  failureRate: 0.1,
  laborRatePerHour: 12, // PLACEHOLDER
  energyRatePerKwh: 0.7556, // Luz del Sur BT5B, over 140 kWh per month, IGV included
  targetMargin: 0.4, // PLACEHOLDER
  minOrderPrice: 5, // PLACEHOLDER
  roundingStep: 0.5,
  igvRate: 0.18,
  taxRegime: 'none',
};

/** Bambu Lab A1 mini. Power figures come from the Bambu wiki. */
export const DRAFT_PRINTER_A1_MINI: PrinterProfile = {
  name: 'Bambu Lab A1 mini',
  avgPowerWatts: 57,
  assetCost: 2000, // PLACEHOLDER
  usefulLifeHours: 5000, // PLACEHOLDER
  maintenanceCostPerYear: 200, // PLACEHOLDER
  printHoursPerYear: 1000, // PLACEHOLDER
};
