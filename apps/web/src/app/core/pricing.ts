import {
  allocateCents,
  breakdownForPrice,
  calculateBatchCost,
  calculatePrice,
  chargesIgv,
  machineRatePerHour,
  planPurchase,
  priceForQuantity,
  roundMoney,
  roundUpToStep,
  sumMoney,
} from '@pickypop/domain';
import { parseSliceInfo, totalFilamentGrams } from '@pickypop/slicer-files';

/**
 * The money rules and the slicer reader live in shared packages so the web
 * app, the MCP server and the database tooling all agree. Re-exported here so
 * features import them from one place.
 */
export {
  allocateCents,
  breakdownForPrice,
  calculateBatchCost,
  calculatePrice,
  chargesIgv,
  machineRatePerHour,
  planPurchase,
  priceForQuantity,
  roundMoney,
  roundUpToStep,
  sumMoney,
  parseSliceInfo,
  totalFilamentGrams,
};
export type {
  AllocationMethod,
  BatchCostBreakdown,
  BatchInput,
  CostBreakdown,
  CostProfile,
  JobInput,
  PlanLine,
  PlanLineInput,
  PriceBreakdown,
  PriceTier,
  PrinterProfile,
  PurchasePlan,
} from '@pickypop/domain';
export type { SliceInfo, SlicedPlate, SlicedFilament } from '@pickypop/slicer-files';
