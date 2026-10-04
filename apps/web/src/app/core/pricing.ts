import {
  calculateBatchCost,
  calculatePrice,
  chargesIgv,
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
  calculateBatchCost,
  calculatePrice,
  chargesIgv,
  priceForQuantity,
  roundMoney,
  roundUpToStep,
  sumMoney,
  parseSliceInfo,
  totalFilamentGrams,
};
export type {
  BatchCostBreakdown,
  BatchInput,
  CostBreakdown,
  CostProfile,
  JobInput,
  PriceBreakdown,
  PriceTier,
  PrinterProfile,
} from '@pickypop/domain';
export type { SliceInfo, SlicedPlate, SlicedFilament } from '@pickypop/slicer-files';
