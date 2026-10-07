import type {
  PlanCandidateLine,
  PlanDemand,
  PlanDemandPlan,
  PlanInput,
  PlanLinePlan,
  PlanRecipe,
  PlanResult,
} from '@pickypop/domain';

/**
 * "¿Para cuándo?" for a sale nobody saved yet, line by line, and who holds
 * what it lacks.
 *
 * `PlanService.promise` answers for one line. A quote has several, and they
 * go into the line together: two lines of the same bottle cannot both get
 * the four on the shelf. So the whole sale goes in as one demand at the end
 * of the line, a hold that never ends, exactly as `promiseFor` places its one
 * line. For a single line both give the same answer (sale-promise.spec.ts).
 */

/** The unsaved sale inside the plan. No real demand has this id: they are uuids. */
export const SALE_ID = 'venta-sin-guardar';
/** A hold that never ends, as `promiseFor` uses: it takes nothing from anybody before it. */
const NEVER_ENDS = '9999-12-31T23:59:59.999Z';
/** After the last one in line, by a margin the plan cannot confuse with a tie. */
const AFTER_THE_LAST_MS = 1000;

/** So much of one article: "4 unidades de Botella impresa", "264 g de Dulces surtidos". */
export interface Amount {
  itemId: string;
  label: string;
  amount: number;
  unit: string;
}

/**
 * Somebody else's hold that goes before this line: a quote sent with a hold
 * or an order on hold. It may never be confirmed, and then all of it is free
 * again when it ends.
 */
export interface HoldAhead {
  kind: 'order' | 'quote';
  number: string;
  customerName: string | null;
  holdUntil: string;
  /** What it keeps on the shelf of what this line lacks. */
  amounts: Amount[];
  /** Grams its plates use of a filament this line runs short of. */
  filaments: Amount[];
  /** Its plates take the printer before this line's. */
  printing: boolean;
}

export interface LinePromise {
  plan: PlanLinePlan;
  /** Printed for this line only: it never comes off the shelf. */
  madeToOrder: boolean;
  /** Holds of others on what this line had to print, buy or wait for, first in line first. */
  holds: HoldAhead[];
  /** What confirmed orders already took of it. */
  forOrders: Amount[];
  /**
   * When it would be ready if those holds ended without being confirmed.
   * Null when there are none, or they change nothing.
   */
  readyWithoutHolds: string | null;
}

export interface SalePromise {
  /** The moment the plan was computed for: "hoy" and "mañana" are said from it. */
  now: string;
  /** One per line asked, in the same order; null where there was nothing to ask. */
  lines: (LinePromise | null)[];
  /** When the whole sale would be ready. Null when no line could be asked. */
  readyAt: string | null;
  needsPurchase: boolean;
}

/** The plan computed over a changed copy of the snapshot (`PlanService.whatIf`). */
export type WhatIf = (change: (input: PlanInput) => PlanInput) => PlanResult;

/** The snapshot with the sale at the end of the line. */
export function withSale(input: PlanInput, lines: readonly PlanCandidateLine[]): PlanInput {
  const last = Math.max(Date.parse(input.now), ...input.demands.map((demand) => Date.parse(demand.priorityAt)));
  const sale: PlanDemand = {
    kind: 'quote',
    id: SALE_ID,
    number: '',
    customerName: null,
    priorityAt: new Date(last + AFTER_THE_LAST_MS).toISOString(),
    holdUntil: NEVER_ENDS,
    dueDate: null,
    lines: lines.map((line, index) => ({ id: `${SALE_ID}-${index}`, ...line })),
  };
  return { ...input, demands: [...input.demands, sale] };
}

/** "¿Para cuándo?" for every line of an unsaved sale, placed after everybody else. */
export function salePromise(
  input: PlanInput,
  wanted: readonly (PlanCandidateLine | null)[],
  whatIf: WhatIf,
): SalePromise {
  const asked = wanted.filter((line): line is PlanCandidateLine => line !== null);
  if (asked.length === 0) return { now: input.now, lines: wanted.map(() => null), readyAt: null, needsPurchase: false };

  const changed = withSale(input, asked);
  const result = whatIf((snapshot) => withSale(snapshot, asked));
  const sale = result.demands.find((demand) => demand.id === SALE_ID);
  if (!sale) return { now: result.now, lines: wanted.map(() => null), readyAt: null, needsPurchase: false };

  let next = 0;
  const lines = wanted.map((line) => {
    if (line === null) return null;
    const plan = sale.lines[next++];
    return plan ? linePromise(changed, result, sale.id, plan) : null;
  });
  if (lines.some((line) => line !== null && line.holds.length > 0)) {
    addReadyWithoutHolds(lines, whatIf((snapshot) => withSale(withoutHolds(snapshot), asked)));
  }
  return { now: result.now, lines, readyAt: sale.readyAt, needsPurchase: sale.needsPurchase };
}

/** The snapshot as if every hold ended now unconfirmed: only confirmed orders keep their claim. */
function withoutHolds(input: PlanInput): PlanInput {
  return { ...input, demands: input.demands.filter((demand) => demand.holdUntil === null) };
}

/** The other date, for the lines a hold delays: "si no confirma, listo el viernes". */
function addReadyWithoutHolds(lines: (LinePromise | null)[], free: PlanResult): void {
  const freeLines = free.demands.find((demand) => demand.id === SALE_ID)?.lines ?? [];
  let next = 0;
  for (const line of lines) {
    if (line === null) continue;
    const readyAt = freeLines[next++]?.readyAt;
    if (line.holds.length > 0 && readyAt !== undefined && Date.parse(readyAt) < Date.parse(line.plan.readyAt)) {
      line.readyWithoutHolds = readyAt;
    }
  }
}

/** The situation of a demand already in the plan, such as a quote sent with its hold running. */
export function demandPromise(input: PlanInput, result: PlanResult, demand: PlanDemandPlan): SalePromise {
  return {
    now: result.now,
    lines: demand.lines.map((line) => linePromise(input, result, demand.id, line)),
    readyAt: demand.readyAt,
    needsPurchase: demand.needsPurchase,
  };
}


/**
 * One line with who holds what it lacks. Only what the line could not take
 * from the shelf, the filament it runs short of and the printer when it has
 * to print are looked at: whatever it lacks went to those before it, and the
 * bags that are left over are nobody's business here.
 */
export function linePromise(input: PlanInput, result: PlanResult, demandId: string, plan: PlanLinePlan): LinePromise {
  const recipes = new Map(input.recipes.map((recipe) => [recipe.variantId, recipe]));
  const lines = new Map(input.demands.flatMap((demand) => demand.lines.map((line) => [line.id, line])));
  const variantOf = (lineId: string) => lines.get(lineId)?.variantId;
  const madeToOrder = (lines.get(plan.lineId)?.custom ?? null) !== null;
  const short = lacking(plan, recipeOf(recipes, variantOf(plan.lineId)));
  const shortFilaments = new Set(
    plan.shortages.flatMap((shortage) => (shortage.kind === 'filament' && shortage.id !== null ? [shortage.id] : [])),
  );
  const prints = madeToOrder ? plan.toMake > 0 : plan.components.some((component) => component.toPrint > 0);

  const names = new Map(input.items.map((item) => [item.id, item]));
  const toAmounts = (taken: Map<string, number>): Amount[] =>
    [...taken].map(([itemId, amount]) => ({
      itemId,
      label: names.get(itemId)?.name ?? 'Artículo',
      amount,
      unit: names.get(itemId)?.unit ?? 'unidad',
    }));

  const holds: HoldAhead[] = [];
  const forOrders = new Map<string, number>();
  for (const other of result.demands) {
    if (other.id === demandId) continue;
    const taken = new Map<string, number>();
    for (const line of other.lines) {
      for (const [itemId, units] of shelfTakes(line, recipeOf(recipes, variantOf(line.lineId)))) {
        if (short.has(itemId)) add(taken, itemId, units);
      }
    }
    if (other.holdUntil === null) {
      for (const [itemId, units] of taken) add(forOrders, itemId, units);
      continue;
    }
    const runs = result.runs.filter((run) => run.demandKind === other.kind && run.demandId === other.id);
    const grams = new Map<string, number>();
    for (const use of runs.flatMap((run) => run.filaments)) {
      if (use.skuId !== null && shortFilaments.has(use.skuId)) add(grams, use.skuId, use.grams);
    }
    const printing = prints && runs.length > 0;
    if (taken.size === 0 && grams.size === 0 && !printing) continue;
    holds.push({
      kind: other.kind,
      number: other.number,
      customerName: other.customerName,
      holdUntil: other.holdUntil,
      amounts: toAmounts(taken),
      filaments: filamentAmounts(input, grams),
      printing,
    });
  }
  return { plan, madeToOrder, holds, forOrders: toAmounts(forOrders), readyWithoutHolds: null };
}

function filamentAmounts(input: PlanInput, grams: Map<string, number>): Amount[] {
  const labels = new Map(input.filaments.map((row) => [row.skuId, row.label]));
  return [...grams].map(([skuId, amount]) => ({
    itemId: skuId,
    label: labels.get(skuId) ?? 'Filamento',
    // Grams are counted to the hundredth everywhere else in the plan.
    amount: Math.round(amount * 100) / 100,
    unit: 'g',
  }));
}

function recipeOf(recipes: Map<string, PlanRecipe>, variantId: string | null | undefined): PlanRecipe | null {
  return variantId ? (recipes.get(variantId) ?? null) : null;
}

/** The articles a line did not get all of from the shelf. */
function lacking(plan: PlanLinePlan, recipe: PlanRecipe | null): Set<string> {
  const short = new Set<string>();
  if (recipe?.assembled && recipe.finishedItemId !== null && plan.onShelf < plan.quantity) {
    short.add(recipe.finishedItemId);
  }
  for (const component of plan.components) {
    if (component.fromStock < component.needed) short.add(component.itemId);
  }
  return short;
}

/**
 * What a line took off the shelf: its components, and the finished product
 * when it is assembled. A kit on the shelf is already in its components, and a
 * made-to-order line's printed units never were on the shelf.
 */
function shelfTakes(line: PlanLinePlan, recipe: PlanRecipe | null): [string, number][] {
  const takes: [string, number][] = line.components
    .filter((component) => component.fromStock > 0)
    .map((component) => [component.itemId, component.fromStock]);
  if (recipe?.assembled && recipe.finishedItemId !== null && line.onShelf > 0) {
    takes.push([recipe.finishedItemId, line.onShelf]);
  }
  return takes;
}

function add(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}
