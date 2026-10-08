/**
 * «¿Cuántas?» in Armar, as typed and as assembled.
 *
 * The field used to go through `parseInt` and fall back to 1 in silence: 0,
 * 1.5 and 1e3 all became «Armar 1» while the field still showed what was
 * typed, and 2.9 became 2 (T3-15). Now what is typed stays as it is, and the
 * button only offers a number that is exactly that.
 */

/** More than a workshop of two assembles in one go; the database decides if there is enough. */
export const MAX_UNITS = 10000;
const WHOLE = /^\d+$/;
/** Float noise when dividing what is on the shelf by what one unit takes. */
const EPSILON = 1e-9;

/** The units typed, if they are a whole number from 1 to MAX_UNITS; null otherwise. */
export function parseUnits(text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE.test(trimmed)) return null;
  const units = Number(trimmed);
  return units >= 1 && units <= MAX_UNITS ? units : null;
}

/** What to say next to the field when it holds something that cannot be assembled. */
export function unitsProblem(text: string): string | null {
  return parseUnits(text) === null ? `Escribe un número entero de 1 a ${MAX_UNITS}.` : null;
}

/**
 * How many units the components on the table reach. The card's count comes
 * from an earlier read; the line under the field uses the table, which was
 * read when the product was chosen, so the two numbers next to each other
 * never disagree (T3-16).
 */
export function buildableFrom(components: readonly { quantityPerUnit: number; onHand: number }[]): number {
  const reach = Math.min(
    ...components.map((component) =>
      component.quantityPerUnit > 0 ? Math.floor(component.onHand / component.quantityPerUnit + EPSILON) : Infinity,
    ),
  );
  // No components, or none that takes anything, is nothing to assemble.
  return Number.isFinite(reach) ? Math.max(0, reach) : 0;
}
