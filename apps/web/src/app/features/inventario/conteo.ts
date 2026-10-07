/**
 * The browser side of counting the shelf. What actually moves, and at what
 * cost, is decided by `count_shelf` in the database against what is there at
 * the moment of saving: this only turns the form into the call and says what
 * is still missing before it can be sent.
 */

export type CountKind = 'part' | 'product';

/** One article as the count screen holds it. */
export interface CountRow {
  kind: CountKind;
  /** Null for a product nobody has assembled yet: it has no article of its own. */
  inventoryItemId: string | null;
  /** Set for products, which are counted by variant. */
  variantId: string | null;
  name: string;
  detail: string | null;
  imagePath: string | null;
  /** What the app believes is on the shelf. */
  onHand: number;
  /** What one unit is worth according to the database; null when it does not know. */
  knownCost: number | null;
  /** What the person counted. Null while the field is empty. */
  counted: number | null;
  /** A cost typed by the person, only asked for when the database knows none. */
  typedCost: number | null;
}

/**
 * One element of `p_counts`, exactly as `count_shelf` reads it. A type and not
 * an interface, so it fits the generated `Json` without a cast.
 */
export type CountEntry =
  | { inventory_item_id: string; counted: number; unit_cost?: number }
  | { variant_id: string; counted: number; unit_cost?: number };

/** Counted and different from what the app believes. */
export function isChanged(row: CountRow): boolean {
  return row.counted !== null && row.counted !== row.onHand;
}

/** How many more (positive) or fewer (negative) than the app believed. */
export function difference(row: CountRow): number {
  return row.counted === null ? 0 : row.counted - row.onHand;
}

/**
 * Units that come in need a cost, or a later delivery would be worth zero.
 * The database already knows most of them; the person is asked only for the rest.
 */
export function needsCost(row: CountRow): boolean {
  return difference(row) > 0 && row.knownCost === null;
}

/** Why a row cannot be sent yet, in words for the person; null when it can. */
export function rowProblem(row: CountRow): string | null {
  if (row.counted === null) return null;
  if (!Number.isInteger(row.counted) || row.counted < 0) return 'Escribe un número entero, cero o más.';
  if (needsCost(row) && (row.typedCost === null || row.typedCost < 0)) {
    return 'No sabemos cuánto costó: escribe un costo aproximado por unidad.';
  }
  return null;
}

/** Only what changed travels: the rest already says the truth. */
export function countPayload(rows: readonly CountRow[]): CountEntry[] {
  return rows.filter(isChanged).map((row) => {
    const cost = needsCost(row) && row.typedCost !== null ? { unit_cost: row.typedCost } : {};
    const counted = row.counted ?? 0;
    if (row.kind === 'product' && row.variantId) return { variant_id: row.variantId, counted, ...cost };
    return { inventory_item_id: row.inventoryItemId ?? '', counted, ...cost };
  });
}

/** The button says exactly what is about to happen. */
export function saveLabel(rows: readonly CountRow[]): string {
  const changed = rows.filter(isChanged).length;
  if (changed === 0) return 'Todo coincide';
  return changed === 1 ? 'Guardar 1 corrección' : `Guardar ${changed} correcciones`;
}
