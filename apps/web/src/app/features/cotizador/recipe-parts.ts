/**
 * Which of a recipe's items cost money of their own (H19).
 *
 * Printed parts sit in `recipe_items` next to sweets and bags, because
 * «Armar» consumes them and the plan has to know they are needed. But a part
 * printed by one of the recipe's own plates is already paid for: its
 * material, energy and machine time are the plates' cost. Counting it again
 * as a supply would charge the same part twice, and worse, at «sin costo
 * registrado», since nobody buys a part.
 *
 * A part the recipe uses but does not print (another recipe's plate makes
 * it) is a real input of this one and costs what printing it cost: the
 * weighted average of what was produced, `part_stock.cost_per_unit`. Never
 * `inventory_item_costs`, which derives from purchases and returns nothing
 * for a part (AGENTS.md).
 */

/** What a recipe's plates print, by item, from `recipe_plate_outputs`. */
export function printedByPlates(plates: readonly { outputs: readonly { inventoryItemId: string }[] }[]): Set<string> {
  return new Set(plates.flatMap((plate) => plate.outputs.map((output) => output.inventoryItemId)));
}

/** The items that are not already paid for by the recipe's own plates. */
export function itemsBeyondPlates<T extends { inventoryItemId: string }>(
  items: readonly T[],
  printed: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !printed.has(item.inventoryItemId));
}
