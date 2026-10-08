const QUANTITY = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

/** The word the app writes itself, and so the only one it makes plural. */
const UNIT = 'unidad';

/** «1 unidad», «2 unidades»: «Total por 1 unidades» was the calculator's own mistake. */
export function unitsText(units: number): string {
  return `${QUANTITY.format(units)} ${units === 1 ? UNIT : 'unidades'}`;
}

/**
 * A supply's quantity with the unit it is counted in: «50 g», «1 unidad»,
 * «2 unidades». A unit somebody typed («par», «ml») is left as written. A
 * supply typed by hand has no stock item behind it, so no unit: the number
 * alone is all the quote knows.
 */
export function supplyQuantityText(quantity: number, unit: string | null | undefined): string {
  if (!unit) return QUANTITY.format(quantity);
  if (unit === UNIT) return unitsText(quantity);
  return `${QUANTITY.format(quantity)} ${unit}`;
}
