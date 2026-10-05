import { machineRatePerHour } from '../../core/pricing';

export interface RateInputs {
  assetCost: number;
  usefulLifeHours: number;
  maintenanceBudgetPerYear: number;
  expectedHoursPerYear: number;
}

export interface RatePreview {
  ratePerHour: number;
  /** What is missing for the rate to be complete. Empty when nothing is. */
  gaps: string[];
}

/**
 * What the form shows while the owner types. The rule itself is the domain's
 * `machineRatePerHour`, the one the quoter uses; the saved figure comes from
 * the `printer_machine_rates` view and is what the detail card displays.
 *
 * The gaps matter more than the number: a zero in any of these inputs does not
 * fail anywhere, it just makes every quote cheaper than it should be.
 */
export function previewMachineRate(inputs: RateInputs): RatePreview {
  const ratePerHour = machineRatePerHour({
    name: 'preview',
    avgPowerWatts: 0,
    assetCost: inputs.assetCost,
    usefulLifeHours: inputs.usefulLifeHours,
    maintenanceCostPerYear: inputs.maintenanceBudgetPerYear,
    printHoursPerYear: inputs.expectedHoursPerYear,
  });

  const gaps: string[] = [];
  if (inputs.usefulLifeHours <= 0) {
    gaps.push('Sin vida útil en horas no hay depreciación: la hora de máquina saldrá sin el costo de la impresora.');
  } else if (inputs.assetCost <= 0) {
    gaps.push('Con costo 0 la depreciación es 0: la hora de máquina saldrá sin el costo de la impresora.');
  }
  if (inputs.expectedHoursPerYear <= 0) {
    gaps.push('Sin horas esperadas al año el mantenimiento no se reparte: saldrá sin ese costo.');
  } else if (inputs.maintenanceBudgetPerYear <= 0) {
    gaps.push('Con presupuesto de mantenimiento 0 la hora de máquina saldrá sin ese costo.');
  }

  return { ratePerHour, gaps };
}
