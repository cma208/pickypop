/**
 * Where a supply's cost per unit came from, as `inventory_item_costs` reports
 * it. 'unknown' means there is neither a purchase nor a standard cost, so the
 * number a quote shows for it is a zero we did not choose, not a real price.
 */
export type SupplyCostSource = 'purchase' | 'standard' | 'unknown';

const KNOWN_SOURCES: readonly SupplyCostSource[] = ['purchase', 'standard'];

/**
 * The view types its columns as nullable text, so anything we do not
 * recognise is treated as unknown: the safe reading is "do not trust it".
 */
export function toCostSource(raw: string | null): SupplyCostSource {
  return KNOWN_SOURCES.find((source) => source === raw) ?? 'unknown';
}

/**
 * True when a quote line is counting a stock item at zero because nobody has
 * ever recorded what it costs. A zero the user typed by hand does not count:
 * once they write a price the warning has done its job. An item the picker
 * does not know (archived, or not a supply any more) cannot be priced either.
 */
export function lacksRecordedCost(
  supply: { inventoryItemId: string | null; unitCost: number },
  options: readonly { id: string; costSource: SupplyCostSource }[],
): boolean {
  if (supply.inventoryItemId === null || supply.unitCost !== 0) return false;

  const option = options.find((candidate) => candidate.id === supply.inventoryItemId);
  return option === undefined || option.costSource === 'unknown';
}
