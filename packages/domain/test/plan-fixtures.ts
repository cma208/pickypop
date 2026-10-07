import type {
  PlanCustomWork,
  PlanDemand,
  PlanDemandLine,
  PlanInput,
  PlanItem,
  PlanJob,
  PlanPlate,
  PlanRecipe,
} from '../src/plan-types.ts';

/**
 * Lima wall clock to an instant. Lima is UTC−5 all year, which is fine for
 * writing the expectations by hand; the code under test asks the zone.
 */
export function lima(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error(`bad local time ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h + 5, mi)).toISOString();
}

/** Tuesday 6 October 2026, 18:00 in Lima. */
export const TUESDAY_1800 = lima('2026-10-06 18:00');

export const SKU_PINK = 'sku-rosado';
export const SKU_BLACK = 'sku-negro';

export const POTION = 'item-pocion';
export const BOTTLE = 'item-botella';
export const CAP = 'item-tapa';
export const BODY = 'item-cuerpo';
export const CANDY = 'item-dulces';

export const POTION_VARIANT = 'v-pocion';

/** The bottle plate: one bottle per run, 43 minutes. */
export const BOTTLE_PLATE: PlanPlate = {
  id: 'plate-botella',
  label: 'Botella',
  printSeconds: 43 * 60,
  outputs: [{ itemId: BOTTLE, units: 1 }],
  filaments: [{ skuId: SKU_PINK, label: 'PLA rosado', grams: 5.69 }],
};

/** The cap plate: nine caps per run, 20 minutes. */
export const CAP_PLATE: PlanPlate = {
  id: 'plate-tapas',
  label: 'Tapas',
  printSeconds: 20 * 60,
  outputs: [{ itemId: CAP, units: 9 }],
  filaments: [{ skuId: SKU_BLACK, label: 'PLA negro', grams: 9 }],
};

/** One bottle and one cap, assembled in 10 minutes of setup plus 5 per potion (the seed's numbers). */
export const POTION_RECIPE: PlanRecipe = {
  variantId: POTION_VARIANT,
  name: 'Botella de poción · Con dulces surtidos',
  assembled: true,
  finishedItemId: POTION,
  components: [
    { itemId: BOTTLE, perUnit: 1 },
    { itemId: CAP, perUnit: 1 },
  ],
  setupMinutes: 10,
  minutesPerUnit: 5,
};

export function item(
  id: string,
  onHand: number,
  kind: PlanItem['kind'] = 'part',
  name = id,
  unit = 'unidad',
): PlanItem {
  return { id, name, kind, unit, onHand };
}

/** The potion shelf: finished potions, bottles and caps. */
export function potionShelf(potions: number, bottles: number, caps: number): PlanItem[] {
  return [
    item(POTION, potions, 'finished_good', 'Botella de poción'),
    item(BOTTLE, bottles, 'part', 'Botella impresa'),
    item(CAP, caps, 'part', 'Tapa'),
  ];
}

export function catalogueLine(id: string, variantId: string, quantity: number): PlanDemandLine {
  return { id, description: `${quantity} × ${variantId}`, quantity, variantId, custom: null };
}

export function customLine(
  id: string,
  quantity: number,
  custom: Partial<PlanCustomWork>,
): PlanDemandLine {
  return {
    id,
    description: `Encargo ${id}`,
    quantity,
    variantId: null,
    custom: {
      plates: [],
      supplies: [],
      setupMinutes: 0,
      minutesPerUnit: 0,
      printedUnits: 0,
      ...custom,
    },
  };
}

export function order(
  id: string,
  number: string,
  priorityAt: string,
  lines: PlanDemandLine[],
  extra: Partial<PlanDemand> = {},
): PlanDemand {
  return {
    kind: 'order',
    id,
    number,
    customerName: `Cliente ${number}`,
    priorityAt,
    holdUntil: null,
    dueDate: null,
    lines,
    ...extra,
  };
}

export function heldQuote(
  id: string,
  number: string,
  priorityAt: string,
  holdUntil: string,
  lines: PlanDemandLine[],
): PlanDemand {
  return order(id, number, priorityAt, lines, { kind: 'quote', holdUntil });
}

export function job(id: string, extra: Partial<PlanJob>): PlanJob {
  return {
    id,
    printerId: 'a1',
    status: 'planned',
    startedAt: null,
    queuedAt: TUESDAY_1800,
    estimatedSeconds: 43 * 60,
    outputs: [],
    orderLineId: null,
    lineUnits: 0,
    filaments: [],
    ...extra,
  };
}

/** One printer, empty queue, the owner's window, 15 minutes between plates, no failures. */
export function workshop(extra: Partial<PlanInput> = {}): PlanInput {
  return {
    now: TUESDAY_1800,
    settings: {
      timeZone: 'America/Lima',
      window: { firstStart: 6 * 60, lastStart: 23 * 60, endBy: 24 * 60 },
      changeoverMinutes: 15,
      failureRate: 0,
    },
    printers: [{ id: 'a1', name: 'A1 mini' }],
    jobs: [],
    items: [],
    filaments: [
      { skuId: SKU_PINK, label: 'PLA rosado', onHandGrams: 1000 },
      { skuId: SKU_BLACK, label: 'PLA negro', onHandGrams: 1000 },
    ],
    recipes: [POTION_RECIPE],
    plates: [BOTTLE_PLATE, CAP_PLATE],
    demands: [],
    ...extra,
  };
}

/** Start and end of each run as Lima wall clock, "18:00–18:43", to compare with the design by eye. */
export function runTimes(runs: { start: string; end: string }[]): string[] {
  return runs.map((run) => `${wallClock(run.start)}–${wallClock(run.end)}`);
}

/** "mar 18:00": the day matters as soon as a plate moves to the next morning. */
export function wallClock(iso: string): string {
  const local = new Date(Date.parse(iso) - 5 * 3_600_000);
  const day = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][local.getUTCDay()];
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${day} ${hh}:${mm}`;
}
