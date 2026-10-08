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

/**
 * Bounds no shelf reaches, the same `count_shelf` checks: an extra zero is
 * caught next to the field instead of ending in the database's refusal.
 */
export const MAX_COUNT = 100000;
export const MAX_UNIT_COST = 100000;

/** Why a row cannot be sent yet, in words for the person; null when it can. */
export function rowProblem(row: CountRow): string | null {
  if (row.counted === null) return null;
  if (!Number.isInteger(row.counted) || row.counted < 0 || row.counted > MAX_COUNT) {
    return `Escribe un número entero, de 0 a ${MAX_COUNT}.`;
  }
  if (!needsCost(row)) return null;
  const cost = row.typedCost;
  if (cost === null) return 'No sabemos cuánto costó: escribe un costo aproximado por unidad.';
  if (cost < 0 || cost > MAX_UNIT_COST) return `Escribe un costo por unidad de S/ 0 a S/ ${MAX_UNIT_COST}.`;
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

/**
 * What the count field starts with: what the app believes, so only what does
 * not match is changed. Half a cap is not something anyone can count, and
 * proposing it showed «Escribe un número entero» on a row nobody had touched,
 * blocking the whole count (T3-04): such a row starts empty, to be counted.
 */
export function initialCount(onHand: number): number | null {
  return Number.isInteger(onHand) ? onHand : null;
}

/** Why a row starts empty, when it does. */
export function countHint(row: CountRow): string | null {
  return Number.isInteger(row.onHand) ? null : 'Cuéntala: la app cree un número con decimales, y en el estante solo hay enteras.';
}

/**
 * The rows read again after the database turned a count down, with what the
 * person had counted kept. A row they changed keeps its count and its cost; a
 * row they left alone takes what the app believes now, or it would turn into
 * a correction back to the old figure.
 */
export function keepCounts(fresh: readonly CountRow[], previous: readonly CountRow[]): CountRow[] {
  const typed = new Map(previous.filter(isChanged).map((row) => [rowKey(row), row]));
  return fresh.map((row) => {
    const before = typed.get(rowKey(row));
    return before ? { ...row, counted: before.counted, typedCost: before.typedCost } : row;
  });
}

/** One row per product variant or per article, as the screen tracks them. */
export function rowKey(row: Pick<CountRow, 'kind' | 'variantId' | 'inventoryItemId'>): string {
  return `${row.kind}:${row.variantId ?? row.inventoryItemId}`;
}

/** The button says exactly what is about to happen. */
export function saveLabel(rows: readonly CountRow[]): string {
  const changed = rows.filter(isChanged).length;
  if (changed === 0) return 'Todo coincide';
  return changed === 1 ? 'Guardar 1 corrección' : `Guardar ${changed} correcciones`;
}
