import type { PlanFilamentPosition, PlanItemPosition } from '@pickypop/domain';
import { dateTimeLong, DEFAULT_TIMEZONE } from '../../core/dates';
import { grams } from '../../core/format';
import type { PlanView } from '../../core/plan';
import { quantity, type ItemKind } from './inventario.format';

/**
 * «Hay · Separado · Libre · Falta» for the inventory screens, read from the
 * plan (ADR-021) and never from the old `reserved`/`available` columns, which
 * stopped meaning anything when holds became something computed.
 *
 * Nothing here decides who gets what: it only reads the plan's answer and
 * says it with the shop's words.
 */

const COUNT = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const UNIT = 'unidad';
const GRAMS = 'g';
/** Beyond this many claimants a row names the kinds of claim, not each document. */
const NAMED_CLAIMS = 2;

/** One demand's share of one article on the shelf. */
export interface ItemClaim {
  demandId: string;
  /** "PED-0003", "COT-0012". */
  number: string;
  customerName: string | null;
  /** A sent quote or an order on hold: it keeps the article only until `holdUntil`. */
  hold: boolean;
  holdUntil: string | null;
  units: number;
}

/** The plan's position of one article, plus who each separated unit is for. */
export interface ArticlePosition extends PlanItemPosition {
  claims: ItemClaim[];
}

/** What the four columns of a row say, already in words. */
export interface PositionCells {
  onHand: string;
  /** "4 para pedidos, 2 en separos"; null when nothing is separated. */
  separated: string | null;
  free: string;
  /** The one badge of the row: "Falta imprimir 35", "Falta comprar 2.38 kg". */
  missing: string | null;
  /** The same in one line, for a phone: "8 para pedidos · 0 libres". */
  compact: string;
  /** Who each separated unit is for, one per line, for the pointer. */
  who: string;
}

/**
 * Every article of the plan with its claims. An article the plan does not
 * know (an inactive one) is simply not in the map: its row shows what is on
 * the shelf and nothing about who it is for.
 */
export function itemPositions(view: PlanView): Map<string, ArticlePosition> {
  const claims = claimsByItem(view);
  return new Map(
    view.result.items.map((position) => [position.itemId, { ...position, claims: claims.get(position.itemId) ?? [] }]),
  );
}

export function filamentPositions(view: PlanView): Map<string, PlanFilamentPosition> {
  return new Map(view.result.filaments.map((position) => [position.skuId, position]));
}

/**
 * Who took each unit from the shelf, rebuilt from the plan's own lines: a
 * component's `fromStock`, and for an assembled product the finished units
 * a line takes (`onShelf`). The sums are the plan's `forOrders` and `held`
 * by construction, because those are the only two places the plan takes
 * from the shelf.
 */
export function claimsByItem(view: PlanView): Map<string, ItemClaim[]> {
  const variantOfLine = new Map(
    view.input.demands.flatMap((demand) => demand.lines.map((line) => [line.id, line.variantId] as const)),
  );
  const recipes = new Map(view.input.recipes.map((recipe) => [recipe.variantId, recipe]));
  const byItem = new Map<string, Map<string, ItemClaim>>();

  const add = (itemId: string, demand: PlanView['result']['demands'][number], units: number): void => {
    if (units <= 0) return;
    const claims = byItem.get(itemId) ?? new Map<string, ItemClaim>();
    const claim = claims.get(demand.id);
    if (claim) claim.units += units;
    else
      claims.set(demand.id, {
        demandId: demand.id,
        number: demand.number,
        customerName: demand.customerName,
        hold: demand.kind === 'quote' || demand.holdUntil !== null,
        holdUntil: demand.holdUntil,
        units,
      });
    byItem.set(itemId, claims);
  };

  for (const demand of view.result.demands) {
    for (const line of demand.lines) {
      for (const component of line.components) add(component.itemId, demand, component.fromStock);
      const variantId = variantOfLine.get(line.lineId);
      const recipe = variantId ? recipes.get(variantId) : undefined;
      if (recipe?.assembled && recipe.finishedItemId !== null) add(recipe.finishedItemId, demand, line.onShelf);
    }
  }
  return new Map([...byItem].map(([itemId, claims]) => [itemId, [...claims.values()]]));
}

/** "520 g", "2.38 kg", "8 unidades", "3 par": grams read as a person weighs them. */
export function amount(value: number, unit: string): string {
  return unit === GRAMS ? grams(value) : quantity(value, unit);
}

/**
 * Next to "8 unidades" in the same row, repeating the word is noise: "8 para
 * pedidos", "Falta imprimir 35". A weight keeps its unit: "520 g para pedidos".
 */
export function shortAmount(value: number, unit: string): string {
  return unit === UNIT ? COUNT.format(value) : amount(value, unit);
}

type Separated = Pick<PlanItemPosition, 'forOrders' | 'held'>;

function separatedParts(position: Separated, unit: string): string[] {
  return [
    position.forOrders > 0 ? `${shortAmount(position.forOrders, unit)} para pedidos` : null,
    position.held > 0 ? `${shortAmount(position.held, unit)} en separos` : null,
  ].filter((part): part is string => part !== null);
}

/** "4 para pedidos, 2 en separos", leaving out what is zero. */
export function separatedText(position: Separated, unit: string): string | null {
  const parts = separatedParts(position, unit);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** "0 libres", "1 libre", "520 g libres". */
export function freeText(free: number, unit: string): string {
  return `${shortAmount(free, unit)} ${free === 1 ? 'libre' : 'libres'}`;
}

/** A part that is missing has to print; anything else has to be bought. */
export function missingText(kind: ItemKind, missing: number, unit: string): string | null {
  if (missing <= 0) return null;
  const verb = kind === 'part' ? 'imprimir' : 'comprar';
  return `Falta ${verb} ${shortAmount(missing, unit)}`;
}

/** "PED-0003 · Ana Quispe: 5 unidades", and for a hold until when it lasts. */
export function claimsTitle(claims: readonly ItemClaim[], unit: string, timeZone = DEFAULT_TIMEZONE): string {
  return claims
    .map((claim) => {
      const who = claim.customerName ? `${claim.number} · ${claim.customerName}` : claim.number;
      const until = claim.hold && claim.holdUntil ? `, separo hasta el ${dateTimeLong(claim.holdUntil, timeZone)}` : '';
      return `${who}${until}: ${amount(claim.units, unit)}`;
    })
    .join('\n');
}

/**
 * Who the units are for, short enough for a card: "3 para PED-0003", "2 para
 * PED-0003, 1 en el separo de COT-0012". With more claimants it says the
 * kinds instead, and the pointer shows the rest.
 */
export function claimsSummary(claims: readonly ItemClaim[], unit: string): string | null {
  if (claims.length === 0) return null;
  if (claims.length > NAMED_CLAIMS) {
    const forOrders = claims.filter((claim) => !claim.hold).reduce((sum, claim) => sum + claim.units, 0);
    const held = claims.filter((claim) => claim.hold).reduce((sum, claim) => sum + claim.units, 0);
    return separatedText({ forOrders, held }, unit);
  }
  return claims
    .map((claim) =>
      claim.hold
        ? `${shortAmount(claim.units, unit)} en el separo de ${claim.number}`
        : `${shortAmount(claim.units, unit)} para ${claim.number}`,
    )
    .join(', ');
}

/**
 * What «Armar» says of a product: "3 armadas · 3 para PED-0003", and what
 * is left nobody's: "5 armadas · 3 para PED-0003 · 2 libres".
 */
export function assembledText(onHand: number, claims: readonly ItemClaim[]): string {
  const built = `${COUNT.format(onHand)} ${onHand === 1 ? 'armada' : 'armadas'}`;
  const summary = claimsSummary(claims, UNIT);
  if (!summary) return `${built} en el estante`;
  const taken = claims.reduce((sum, claim) => sum + claim.units, 0);
  const free = onHand - taken;
  return free > 0 ? `${built} · ${summary} · ${freeText(free, UNIT)}` : `${built} · ${summary}`;
}

/** The four cells of an article's row. Null when the plan does not know the article. */
export function itemCells(
  kind: ItemKind,
  unit: string,
  position: ArticlePosition | undefined,
  timeZone = DEFAULT_TIMEZONE,
): PositionCells | null {
  if (!position) return null;
  return {
    onHand: amount(position.onHand, unit),
    separated: separatedText(position, unit),
    free: shortAmount(position.free, unit),
    missing: missingText(kind, position.missing, unit),
    compact: [...separatedParts(position, unit), freeText(position.free, unit)].join(' · '),
    who: claimsTitle(position.claims, unit, timeZone),
  };
}

/**
 * A filament's grams are separated by the jobs already on a printer («en
 * cola») and by the runs the plan proposes («por lanzar»). What it lacks is
 * always bought.
 */
export function filamentCells(position: PlanFilamentPosition | undefined): PositionCells | null {
  if (!position) return null;
  const parts = [
    position.queuedGrams > 0 ? `${grams(position.queuedGrams)} en cola` : null,
    position.plannedGrams > 0 ? `${grams(position.plannedGrams)} por lanzar` : null,
  ].filter((part): part is string => part !== null);
  const separated = parts.length > 0 ? parts.join(', ') : null;
  const free = freeText(position.freeGrams, GRAMS);
  return {
    onHand: grams(position.onHandGrams),
    separated,
    free: grams(position.freeGrams),
    missing: position.missingGrams > 0 ? `Falta comprar ${grams(position.missingGrams)}` : null,
    compact: [...parts, free].join(' · '),
    who: '',
  };
}
