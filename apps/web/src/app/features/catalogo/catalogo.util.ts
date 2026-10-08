import { FormArray, FormControl, FormGroup, Validators, type ValidatorFn } from '@angular/forms';
import type { Pair, ProductStatus, VariantUsage } from './catalogo.models';

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Botella de poción" becomes "botella-de-pocion". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

/**
 * "1 placa", "3 placas", "3.5 productos": a number with its noun in agreement.
 * «placa(s)» reads like a form, not like a person talking.
 */
export function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "Tapa ×7 y Cuerpo ×7", como se dice. */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * What the picker of a recipe row says when it has nothing left to offer.
 * With every part already in the recipe, «Todavía no hay nada para elegir»
 * read as if the workshop had no parts at all (E2-10).
 */
export function emptyPickerText(mode: 'part' | 'supply', existing: number): string {
  if (mode === 'part') {
    return existing > 0
      ? 'Todas tus piezas ya están en la receta. Para otra, créala en Inventario › Piezas impresas o al cargar un archivo laminado.'
      : 'Todavía no hay piezas impresas. Se crean al cargar un archivo laminado, o en Inventario › Piezas impresas.';
  }
  return existing > 0
    ? 'Todos tus insumos y empaques ya están en la receta. Para otro, créalo en Inventario › Insumos o Empaque.'
    : 'Todavía no hay insumos ni empaques. Créalos en Inventario › Insumos o Empaque.';
}

/** Empty or blank text is stored as null, not as an empty string. */
export function blankToNull(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------- name/value pairs

export type PairGroup = FormGroup<{
  name: FormControl<string>;
  value: FormControl<string>;
}>;

export function pairGroup(pair: Pair = { name: '', value: '' }): PairGroup {
  return new FormGroup({
    name: new FormControl(pair.name, { nonNullable: true, validators: [Validators.required] }),
    value: new FormControl(pair.value, { nonNullable: true }),
  });
}

const duplicateNames: ValidatorFn = (control) => {
  const names = (control as FormArray<PairGroup>).controls
    .map((group) => group.controls.name.value.trim().toLowerCase())
    .filter((name) => name !== '');
  return new Set(names).size === names.length ? null : { duplicateNames: true };
};

export function pairArray(pairs: Pair[]): FormArray<PairGroup> {
  return new FormArray(pairs.map((pair) => pairGroup(pair)), { validators: [duplicateNames] });
}

export function readPairs(array: FormArray<PairGroup>): Pair[] {
  return array.controls
    .map((group) => ({
      name: group.controls.name.value.trim(),
      value: group.controls.value.value.trim(),
    }))
    .filter((pair) => pair.name !== '');
}

// ------------------------------------------------------------------- errors

/** An error whose message is already written for the person using the app. */
export class CatalogoError extends Error {}

/** Message to show for anything thrown by the data layer. */
export function messageOf(error: unknown, fallback = 'Algo salió mal. Inténtalo otra vez.'): string {
  if (error instanceof CatalogoError) return error.message;
  console.error(error);
  return fallback;
}

// ------------------------------------------------------------------- names

/**
 * A name the way a person compares it: «Poción» and « pocion » are the same
 * product, and «tapa» and «Tapa » the same part. The catalogue search, the
 * import review and the duplicate checks all read names through this, so
 * they never disagree on what counts as the same (T2-15, T2-21).
 */
export function comparableName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first of `others` that a person would read as `name`, or null. */
export function sameName<T extends { name: string }>(name: string, others: readonly T[]): T | null {
  const wanted = comparableName(name);
  return wanted === '' ? null : (others.find((other) => comparableName(other.name) === wanted) ?? null);
}

/** A product the name would repeat, said the way the catalogue shows it. */
export function repeatedProductMessage(
  name: string,
  products: readonly { id: string; name: string; status: ProductStatus }[],
  exceptId?: string,
): string | null {
  const twin = sameName(
    name,
    products.filter((product) => product.id !== exceptId),
  );
  if (!twin) return null;
  return twin.status === 'archived'
    ? `Ya hay un producto «${twin.name}», archivado. Restáuralo desde el catálogo o usa otro nombre.`
    : `Ya hay un producto «${twin.name}». Usa otro nombre, o agrégale una variante a ese.`;
}

/** A sibling variant the name would repeat. Two «Llavero» in one product cannot be told apart. */
export function repeatedVariantMessage(name: string, siblings: readonly { id: string; name: string }[], exceptId?: string): string | null {
  const twin = sameName(
    name,
    siblings.filter((variant) => variant.id !== exceptId),
  );
  return twin ? `Ya hay una variante «${twin.name}» en este producto. Usa otro nombre.` : null;
}

/**
 * Where a variant is used, in words, or null when nowhere. The same counts
 * make the database refuse to delete it, so the screen says why before the
 * person tries (T2-01).
 */
export function variantUsageText(usage: Pick<VariantUsage, 'quotes' | 'orders' | 'shelf'>): string | null {
  const places = [
    usage.quotes > 0 ? `en ${countOf(usage.quotes, 'cotización', 'cotizaciones')}` : null,
    usage.orders > 0 ? `en ${countOf(usage.orders, 'pedido', 'pedidos')}` : null,
    usage.shelf > 0 ? 'en el inventario como producto armado' : null,
  ].filter((place): place is string => place !== null);
  return places.length === 0 ? null : `Está ${joinWithAnd(places)}.`;
}

/**
 * What switching a variant off does to what is still pending, or null when
 * nothing is. A switched-off variant leaves Armar and the shelf count, so its
 * orders not delivered yet could not be assembled and its units on the shelf
 * could not be counted, while the screen said it changed nothing for what
 * was sold. It also leaves the quoting screen, so a new version of an open
 * quote lost its price list.
 */
export function deactivationWarning(usage: Pick<VariantUsage, 'openQuotes' | 'openOrders' | 'onHand'>): string | null {
  const said = [shelfWarning(usage.openOrders, usage.onHand), quotesWarning(usage.openQuotes)].filter(
    (text): text is string => text !== null,
  );
  return said.length === 0 ? null : said.join(' ');
}

/**
 * Open quotes keep the price they were sent with, so they can still be
 * accepted. A new version is quoted again, and the quoting screen offers only
 * active variants: it priced the line from its cost, as custom work.
 */
function quotesWarning(openQuotes: number): string | null {
  if (openQuotes <= 0) return null;
  const one = openQuotes === 1;
  return (
    `Tiene ${countOf(openQuotes, 'cotización abierta', 'cotizaciones abiertas')}: ` +
    `${one ? 'se puede aceptar con el precio que ya tiene' : 'se pueden aceptar con el precio que ya tienen'}, ` +
    `pero desactivada no se ofrece al cotizar, y una versión nueva de ${one ? 'ella' : 'ellas'} ` +
    'la cotizaría por costo, sin su precio de lista.'
  );
}

function shelfWarning(openOrders: number, onHand: number): string | null {
  if (openOrders <= 0 && onHand <= 0) return null;

  const pending = [
    openOrders > 0 ? `tiene ${countOf(openOrders, 'pedido', 'pedidos')} sin entregar` : null,
    onHand > 0 ? `${onHand === 1 ? 'queda' : 'quedan'} ${countOf(onHand, 'unidad armada', 'unidades armadas')} en el estante` : null,
  ].filter((part): part is string => part !== null);
  const blocked = [
    openOrders > 0 ? (openOrders === 1 ? 'ese pedido no se podrá armar' : 'esos pedidos no se podrán armar') : null,
    onHand > 0 ? (onHand === 1 ? 'esa unidad no se podrá contar' : 'esas unidades no se podrán contar') : null,
  ].filter((part): part is string => part !== null);
  const advice = openOrders > 0 ? ` Mejor desactívala cuando ${openOrders === 1 ? 'se entregue' : 'se entreguen'}.` : '';

  return (
    `${capitalize(joinWithAnd(pending))}. Desactivada, deja de aparecer en Armar y en el conteo del estante: ` +
    `${joinWithAnd(blocked)} hasta que la vuelvas a activar.${advice}`
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
