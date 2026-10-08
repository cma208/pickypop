import {
  allocateCents,
  breakdownForPrice,
  calculateBatchCost,
  calculatePrice,
  chargesIgv,
  machineRatePerHour,
  planPurchase,
  priceForQuantity,
  PURCHASE_LIMITS,
  roundMoney,
  roundUpToStep,
  sumMoney,
  totalFor,
  unitPriceFromLineTotal,
  unitShare,
} from '@pickypop/domain';
import { countObjects, parsePlateObjects, parseSliceInfo, totalFilamentGrams } from '@pickypop/slicer-files';

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
  PURCHASE_LIMITS,
  roundMoney,
  roundUpToStep,
  sumMoney,
  totalFor,
  unitPriceFromLineTotal,
  unitShare,
  parseSliceInfo,
  totalFilamentGrams,
  parsePlateObjects,
  countObjects,
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
export type { SliceInfo, SlicedPlate, SlicedFilament, PlateObjectCount } from '@pickypop/slicer-files';
