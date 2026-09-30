/** Peruvian tax regimes. Only some of them charge IGV on top of the sale value. */
export type TaxRegime = 'none' | 'nrus' | 'rer' | 'rmt' | 'general';

/**
 * Rates and assumptions used to turn a print job into money.
 * A profile is versioned in the database ("valid_from"), and every quote keeps
 * a frozen copy of the profile it was calculated with.
 */
export interface CostProfile {
  /** Extra material beyond what the slicer reports: priming and spool leftovers. */
  materialWasteRate: number;
  /** Share of jobs that fail. Production costs are divided by (1 - failureRate). */
  failureRate: number;
  /** What an hour of human work is worth. */
  laborRatePerHour: number;
  /** Electricity price per kWh, taxes included. */
  energyRatePerKwh: number;
  /** Target margin over the PRICE, not a markup over the cost. */
  targetMargin: number;
  /** Floor for any single order. */
  minOrderPrice: number;
  /** Final prices are rounded up to a multiple of this step. */
  roundingStep: number;
  igvRate: number;
  taxRegime: TaxRegime;
}

/** A machine, with the numbers needed to charge its use to a job. */
export interface PrinterProfile {
  name: string;
  avgPowerWatts: number;
  assetCost: number;
  usefulLifeHours: number;
  maintenanceCostPerYear: number;
  printHoursPerYear: number;
}

/** One filament used by a job, already matched to a stock SKU price. */
export interface FilamentUsage {
  label?: string;
  grams: number;
  costPerKg: number;
}

export interface SupplyUsage {
  label?: string;
  cost: number;
}

/** Everything needed to cost one plate. */
export interface JobInput {
  /** Use the slicer's total estimate ("prediction"), not just the printing time. */
  printTimeSeconds: number;
  filaments: FilamentUsage[];
  prepMinutes: number;
  postMinutes: number;
  supplies?: SupplyUsage[];
}

export interface MaterialLine {
  label?: string;
  grams: number;
  cost: number;
}

export interface CostBreakdown {
  printHours: number;
  machineRatePerHour: number;
  materialByFilament: MaterialLine[];
  material: number;
  energy: number;
  machine: number;
  productionBeforeFailure: number;
  failureAllowance: number;
  production: number;
  labor: number;
  supplies: number;
  total: number;
  /** Money that actually leaves the pocket: material, energy and supplies. */
  cashOutOfPocket: number;
  /** Charged but not paid out today: machine wear and own labour. */
  assigned: number;
}

export interface PriceOptions {
  /** Multiplier by customer type, e.g. 1.1 for companies. */
  clientFactor?: number;
  volumeDiscountRate?: number;
  urgencySurchargeRate?: number;
  /** Marketplace fee. The price is grossed up so the fee does not eat the margin. */
  channelCommissionRate?: number;
}

export interface PriceBreakdown {
  cost: number;
  basePrice: number;
  adjustedPrice: number;
  afterMinimum: number;
  saleValue: number;
  igv: number;
  totalBeforeRounding: number;
  total: number;
  marginAmount: number;
  effectiveMarginRate: number;
}
