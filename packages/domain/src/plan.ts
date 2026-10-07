import type {
  PlanCandidateLine,
  PlanJobTiming,
  PlanComponentPlan,
  PlanCustomPlate,
  PlanCustomWork,
  PlanDemand,
  PlanDemandLine,
  PlanDemandPlan,
  PlanFilamentPosition,
  PlanFilamentStock,
  PlanFilamentUse,
  PlanInput,
  PlanItem,
  PlanItemPosition,
  PlanJob,
  PlanLinePlan,
  PlanOutput,
  PlanPlate,
  PlanProposal,
  PlanRecipe,
  PlanResult,
  PlanRun,
  PlanShortage,
} from './plan-types.ts';
import {
  MS_PER_MINUTE,
  formatInstant,
  parseInstant,
  workshopClock,
  type WorkshopClock,
} from './plan-time.ts';
import { MS_PER_SECOND, PrintQueue, Warnings, compareText, type Placement } from './plan-queue.ts';

/**
 * Quantities come from numeric columns and get multiplied by fractions:
 * 0.1 + 0.2 must not leave a phantom shortage of 0.00000000000000004.
 */
const EPSILON = 1e-9;
const QUANTITY_PRECISION = 1e6;
const GRAM_PRECISION = 100;
const CANDIDATE_ID = 'candidate';
const CANDIDATE_HOLD_UNTIL = '9999-12-31T23:59:59.999Z';
const GRAMS = 'g';
const DEFAULT_UNIT = 'unidad';

// ------------------------------------------------------------------ public

/**
 * The single account (ADR-021) over one snapshot of the workshop.
 *
 * Demands are served in priority order, line by line, and what one takes the
 * next one no longer has: that is what makes "who is each unit for" have one
 * answer for the shelf, the queue and the seller at the same time.
 */
export function plan(input: PlanInput): PlanResult {
  const now = parseInstant(input.now);
  const claimants = claimantsOf(input.demands, now, null);
  const full = new Allocator(input, claimants).run();
  const hasHolds = claimants.some((claimant) => !claimant.confirmed);
  const ordersOnly = hasHolds
    ? new Allocator(
        input,
        claimants.filter((claimant) => claimant.confirmed),
      ).run()
    : full;

  return {
    now: formatInstant(now),
    demands: claimants.map((claimant) => demandPlan(claimant, full)),
    items: input.items.map((item) => itemPosition(item, full, ordersOnly)),
    filaments: input.filaments.map((row) => filamentPosition(row, full)),
    runs: [...full.runs].sort((a, b) => a.start - b.start).map(toPlanRun),
    jobs: full.jobs,
    proposals: proposals(full.runs, ordersOnly.runs),
    warnings: full.warnings.list(),
  };
}

/**
 * "¿Para cuándo?" for a sale nobody has saved yet. The line goes after
 * everybody, as a hold that never ends, so asking takes nothing from anyone
 * and proposes nothing to production.
 */
export function promiseFor(input: PlanInput, line: PlanCandidateLine): PlanLinePlan {
  const candidate: PlanDemand = {
    kind: 'quote',
    id: CANDIDATE_ID,
    number: '',
    customerName: null,
    priorityAt: input.now,
    holdUntil: CANDIDATE_HOLD_UNTIL,
    dueDate: null,
    lines: [{ id: CANDIDATE_ID, ...line }],
  };
  const claimants = claimantsOf(input.demands, parseInstant(input.now), candidate);
  const allocation = new Allocator(input, claimants).run();
  const last = claimants[claimants.length - 1]!;
  return allocation.lines.get(last)![0]!.plan;
}

// ------------------------------------------------------------------ internals

/** A demand that claims stock now, with its place in line. */
interface Claimant {
  demand: PlanDemand;
  rank: number;
  /** A confirmed order. Anything else that claims is a hold. */
  confirmed: boolean;
}

/** A run the plan proposes. */
interface Run extends Placement {
  plateId: string | null;
  label: string;
  durationMs: number;
  claimant: Claimant;
  /** The made-to-order line it prints for. */
  lineId: string | null;
  /** «Por lanzar» rows: one per catalogue plate, one per made-to-order line. */
  groupKey: string;
  groupLabel: string;
  outputs: PlanOutput[];
  filaments: PlanFilamentUse[];
  /** Every demand that gets pieces out of it, the one that asked for it included. */
  takers: Set<Claimant>;
  shortOfFilament: boolean;
}

/** Units of one thing that become available at one moment. */
interface Lot {
  units: number;
  at: number;
  /** The proposed run that makes them. Null for a job already on a printer. */
  run: Run | null;
}

/** What a printer can be asked to print, whether a catalogue plate or a made-to-order one. */
interface RunSpec {
  plateId: string | null;
  label: string;
  printSeconds: number;
  outputs: PlanOutput[];
  filaments: PlanFilamentUse[];
  lineId: string | null;
  groupKey: string;
  groupLabel: string;
}

type LineCounts = Pick<PlanLinePlan, 'onShelf' | 'toAssemble' | 'toMake'>;

interface LinePlanned {
  plan: PlanLinePlan;
  readyAt: number;
  readyAtIfFailure: number;
}

interface Allocation {
  lines: Map<Claimant, LinePlanned[]>;
  runs: Run[];
  jobs: PlanJobTiming[];
  shelf: Shelf;
  filament: FilamentLedger;
  /** For items[].missing: what had to print or be bought, per article. */
  beyondStock: Map<string, number>;
  warnings: Warnings;
  clock: WorkshopClock;
  now: number;
}

function clean(value: number): number {
  return Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
}

function cleanGrams(value: number): number {
  return Math.round(value * GRAM_PRECISION) / GRAM_PRECISION;
}

function addTo(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Things arriving over time, handed out earliest first. */
class Lots {
  private readonly byKey = new Map<string, Lot[]>();

  add(key: string, lot: Lot): void {
    const lots = this.byKey.get(key) ?? [];
    let position = lots.length;
    while (position > 0 && lots[position - 1]!.at > lot.at) position--;
    lots.splice(position, 0, lot);
    this.byKey.set(key, lots);
  }

  /** Takes up to `wanted`. `at` is when the last unit taken arrives, null if none was. */
  take(key: string, wanted: number, taker: Claimant): { units: number; at: number | null } {
    let units = 0;
    let at: number | null = null;
    for (const lot of this.byKey.get(key) ?? []) {
      const stillWanted = wanted - units;
      if (stillWanted <= EPSILON) break;
      if (lot.units <= EPSILON) continue;
      const taken = Math.min(lot.units, stillWanted);
      lot.units -= taken;
      units += taken;
      at = Math.max(at ?? lot.at, lot.at);
      lot.run?.takers.add(taker);
    }
    return { units: clean(units), at };
  }
}

/** The shelf, and who took what from it. */
class Shelf {
  private readonly left = new Map<string, number>();
  readonly forOrders = new Map<string, number>();
  readonly held = new Map<string, number>();

  constructor(items: PlanItem[]) {
    for (const item of items) addTo(this.left, item.id, Math.max(0, item.onHand));
  }

  take(itemId: string, wanted: number, taker: Claimant): number {
    const taken = clean(Math.max(0, Math.min(this.left.get(itemId) ?? 0, wanted)));
    if (taken <= 0) return 0;
    this.left.set(itemId, clean((this.left.get(itemId) ?? 0) - taken));
    addTo(taker.confirmed ? this.forOrders : this.held, itemId, taken);
    return taken;
  }
}

/**
 * Grams per filament. Jobs on a printer still count against the spools until
 * they are closed, so they are taken first; the proposed runs follow in
 * priority order.
 */
class FilamentLedger {
  private readonly left = new Map<string, number>();
  readonly queued = new Map<string, number>();
  readonly planned = new Map<string, number>();

  constructor(stock: PlanFilamentStock[], jobs: PlanJob[]) {
    for (const row of stock) addTo(this.left, row.skuId, Math.max(0, row.onHandGrams));
    for (const job of jobs) {
      for (const use of job.filaments) {
        if (use.skuId === null) continue;
        addTo(this.queued, use.skuId, use.grams);
        this.consume(use.skuId, use.grams);
      }
    }
  }

  /** Grams of each filament the run could not get. A use without SKU cannot be checked. */
  takeForRun(uses: PlanFilamentUse[]): { use: PlanFilamentUse; short: number }[] {
    const shortfalls: { use: PlanFilamentUse; short: number }[] = [];
    for (const use of uses) {
      if (use.skuId === null) continue;
      addTo(this.planned, use.skuId, use.grams);
      const short = cleanGrams(use.grams - this.consume(use.skuId, use.grams));
      if (short > 0) shortfalls.push({ use, short });
    }
    return shortfalls;
  }

  private consume(skuId: string, grams: number): number {
    const available = this.left.get(skuId) ?? 0;
    const taken = Math.max(0, Math.min(available, grams));
    this.left.set(skuId, available - taken);
    return taken;
  }
}

/** The shortages of one line, one row per thing to buy. */
class Shortages {
  readonly list: PlanShortage[] = [];

  add(shortage: PlanShortage): void {
    const same = this.list.find(
      (row) =>
        row.kind === shortage.kind &&
        row.id === shortage.id &&
        (row.id !== null || row.label === shortage.label),
    );
    if (same) same.missing = clean(same.missing + shortage.missing);
    else this.list.push({ ...shortage });
  }
}

/** Active demands in priority order. An expired hold claims nothing, without anybody releasing it. */
function claimantsOf(demands: PlanDemand[], now: number, last: PlanDemand | null): Claimant[] {
  const active = demands
    .filter((demand) => demand.holdUntil === null || parseInstant(demand.holdUntil) > now)
    .sort(
      (a, b) =>
        parseInstant(a.priorityAt) - parseInstant(b.priorityAt) ||
        compareText(a.number, b.number) ||
        compareText(a.id, b.id),
    );
  if (last) active.push(last);
  return active.map((demand, rank) => ({
    demand,
    rank,
    confirmed: demand.kind === 'order' && demand.holdUntil === null,
  }));
}

/** The plate that makes most of a part per run; the lowest id breaks a tie. */
function platesByPart(plates: PlanPlate[]): Map<string, { plate: PlanPlate; units: number }> {
  const best = new Map<string, { plate: PlanPlate; units: number }>();
  for (const plate of plates) {
    const unitsByItem = new Map<string, number>();
    for (const output of plate.outputs) addTo(unitsByItem, output.itemId, output.units);
    for (const [itemId, units] of unitsByItem) {
      if (units <= 0) continue;
      const current = best.get(itemId);
      const better =
        !current ||
        units > current.units ||
        (units === current.units && compareText(plate.id, current.plate.id) < 0);
      if (better) best.set(itemId, { plate, units });
    }
  }
  return best;
}

/**
 * One pass of the account over a list of claimants. It is run twice per
 * plan: with everybody, and with confirmed orders only, to tell which runs
 * exist only because a hold took the shelf first.
 */
class Allocator {
  private readonly now: number;
  private readonly clock: WorkshopClock;
  private readonly warnings = new Warnings();
  private readonly queue: PrintQueue;
  private readonly items: Map<string, PlanItem>;
  private readonly recipes: Map<string, PlanRecipe>;
  private readonly plateFor: Map<string, { plate: PlanPlate; units: number }>;
  private readonly shelf: Shelf;
  private readonly filament: FilamentLedger;
  private readonly fromJobs = new Lots();
  private readonly forCustomLines = new Lots();
  /** How many plates each made-to-order line has, to share its jobs among them. */
  private readonly customPlateCount: Map<string, number>;
  private readonly leftovers = new Lots();
  private readonly runs: Run[] = [];
  private readonly beyondStock = new Map<string, number>();

  constructor(
    private readonly input: PlanInput,
    private readonly claimants: Claimant[],
  ) {
    const { settings } = input;
    this.now = parseInstant(input.now);
    this.customPlateCount = new Map(
      input.demands
        .flatMap((demand) => demand.lines)
        .filter((line) => line.custom !== null)
        .map((line) => [line.id, Math.max(1, line.custom!.plates.length)] as const),
    );
    this.clock = workshopClock(settings.timeZone, settings.window);
    this.items = new Map(input.items.map((item) => [item.id, item]));
    this.recipes = new Map(input.recipes.map((recipe) => [recipe.variantId, recipe]));
    this.plateFor = platesByPart(input.plates);
    this.shelf = new Shelf(input.items);
    this.filament = new FilamentLedger(input.filaments, input.jobs);
    this.queue = new PrintQueue(
      input.printers,
      input.jobs,
      this.clock,
      settings.window,
      this.now,
      settings.changeoverMinutes * MS_PER_MINUTE,
      this.warnings,
      (job) => this.jobName(job),
    );
    this.collectJobOutputs();
  }

  run(): Allocation {
    const lines = new Map<Claimant, LinePlanned[]>();
    for (const claimant of this.claimants) {
      lines.set(
        claimant,
        claimant.demand.lines.map((line) => this.planLine(claimant, line)),
      );
    }
    return {
      lines,
      runs: this.runs,
      jobs: this.input.jobs
        .filter((job) => this.queue.jobStarts.has(job.id))
        .map((job) => ({
          id: job.id,
          printerId: job.printerId,
          start: formatInstant(this.queue.jobStarts.get(job.id)!),
          end: formatInstant(this.queue.jobEnds.get(job.id)!),
        }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
      shelf: this.shelf,
      filament: this.filament,
      beyondStock: this.beyondStock,
      warnings: this.warnings,
      clock: this.clock,
      now: this.now,
    };
  }

  private collectJobOutputs(): void {
    for (const job of this.input.jobs) {
      const at = this.queue.jobEnds.get(job.id) ?? this.now;
      if (job.orderLineId !== null) {
        // Made-to-order pieces never reach the shelf: they belong to their
        // line. A job does not say which of the line's plates it prints, so
        // a line of two plates counts each job as half a unit: queueing only
        // the front never makes the back look done.
        const plates = this.customPlateCount.get(job.orderLineId) ?? 1;
        this.forCustomLines.add(job.orderLineId, { units: job.lineUnits / plates, at, run: null });
        continue;
      }
      for (const output of job.outputs) {
        this.fromJobs.add(output.itemId, { units: output.units, at, run: null });
      }
    }
  }

  private jobName(job: PlanJob): string {
    const names = [...new Set(job.outputs.map((o) => this.items.get(o.itemId)?.name ?? o.itemId))];
    if (names.length > 0) return names.join(' + ');
    const line = this.input.demands
      .flatMap((demand) => demand.lines)
      .find((candidate) => candidate.id === job.orderLineId);
    if (line) return line.description;
    return this.input.printers.find((printer) => printer.id === job.printerId)?.name ?? job.id;
  }

  private planLine(claimant: Claimant, line: PlanDemandLine): LinePlanned {
    const quantity = Math.max(0, line.quantity);
    if (line.custom) return this.planCustom(claimant, line, quantity, line.custom);
    if (line.variantId === null) {
      // A service: nothing to take and nothing to wait for.
      return this.readyNow(line, { onShelf: quantity, toAssemble: 0, toMake: 0 });
    }
    const recipe = this.recipes.get(line.variantId);
    if (!recipe) {
      this.warnings.add(`"${line.description}" no tiene receta: el plan no sabe cómo hacerla.`);
      return this.readyNow(line, { onShelf: 0, toAssemble: 0, toMake: quantity });
    }
    if (recipe.components.length === 0) {
      // An empty recipe is no recipe: with nothing to count, every unit would
      // look ready to assemble. What was counted on the shelf still goes out.
      this.warnings.add(
        `La receta de "${recipe.name}" no tiene piezas ni insumos: el plan no sabe cómo hacer lo que falta.`,
      );
      const onShelf =
        recipe.assembled && recipe.finishedItemId !== null
          ? this.shelf.take(recipe.finishedItemId, quantity, claimant)
          : 0;
      return this.readyNow(line, { onShelf, toAssemble: 0, toMake: clean(quantity - onShelf) });
    }
    return recipe.assembled
      ? this.planAssembled(claimant, line, quantity, recipe)
      : this.planKit(claimant, line, quantity, recipe);
  }

  /** Delivered from its finished article: the shelf first, then what is left to assemble. */
  private planAssembled(
    claimant: Claimant,
    line: PlanDemandLine,
    quantity: number,
    recipe: PlanRecipe,
  ): LinePlanned {
    const onShelf =
      recipe.finishedItemId === null
        ? 0
        : this.shelf.take(recipe.finishedItemId, quantity, claimant);
    const remaining = clean(quantity - onShelf);
    const parts = this.sourceComponents(claimant, recipe, remaining);
    const toAssemble = Math.min(remaining, completeSets(parts.plans, recipe));
    const handMinutes = remaining > 0 ? recipe.setupMinutes + recipe.minutesPerUnit * remaining : 0;
    return this.finish(
      line,
      { onShelf, toAssemble, toMake: clean(remaining - toAssemble) },
      parts.plans,
      parts.shortages,
      parts.latest,
      handMinutes,
      parts.ownRuns,
    );
  }

  /** Not assembled: delivered straight from its components, so a whole kit on the shelf is ready. */
  private planKit(
    claimant: Claimant,
    line: PlanDemandLine,
    quantity: number,
    recipe: PlanRecipe,
  ): LinePlanned {
    const parts = this.sourceComponents(claimant, recipe, quantity);
    const onShelf = Math.min(quantity, completeSets(parts.plans, recipe));
    const toMake = clean(quantity - onShelf);
    return this.finish(
      line,
      { onShelf, toAssemble: 0, toMake },
      parts.plans,
      parts.shortages,
      parts.latest,
      recipe.minutesPerUnit * toMake,
      parts.ownRuns,
    );
  }

  private sourceComponents(claimant: Claimant, recipe: PlanRecipe, units: number) {
    const shortages = new Shortages();
    const ownRuns: Run[] = [];
    const plans: PlanComponentPlan[] = [];
    let latest = this.now;
    if (units > 0) {
      for (const component of recipe.components) {
        const needed = clean(component.perUnit * units);
        const sourced = this.source(component.itemId, needed, claimant, shortages, ownRuns);
        plans.push(sourced.plan);
        latest = Math.max(latest, sourced.latest);
      }
    }
    return { plans, shortages, ownRuns, latest };
  }

  /**
   * Where `needed` of one component comes from, in the decided order: the
   * shelf, jobs already on a printer, by-products of runs proposed for
   * someone earlier, new runs, and whatever is left has to be bought.
   */
  private source(
    itemId: string,
    needed: number,
    claimant: Claimant,
    shortages: Shortages,
    ownRuns: Run[],
  ): { plan: PlanComponentPlan; latest: number } {
    let latest = this.now;
    const arrived = (lot: { units: number; at: number | null }): number => {
      if (lot.at !== null) latest = Math.max(latest, lot.at);
      return lot.units;
    };
    const fromStock = this.shelf.take(itemId, needed, claimant);
    const fromQueue = arrived(this.fromJobs.take(itemId, clean(needed - fromStock), claimant));
    let left = clean(needed - fromStock - fromQueue);
    let toPrint = arrived(this.leftovers.take(itemId, left, claimant));
    left = clean(left - toPrint);

    const maker = this.printable(itemId);
    if (left > 0 && maker) {
      const runs = Math.ceil(left / maker.units - EPSILON);
      ownRuns.push(...this.print(catalogueRunSpec(maker.plate), runs, claimant, shortages));
      const printed = arrived(this.leftovers.take(itemId, left, claimant));
      toPrint = clean(toPrint + printed);
      left = clean(left - printed);
    }

    if (left > 0) shortages.add(this.itemShortage(itemId, left));
    addTo(this.beyondStock, itemId, toPrint + left);
    const readyAt = left > 0 ? null : formatInstant(latest);
    return {
      plan: { itemId, needed, fromStock, fromQueue, toPrint, missing: left, readyAt },
      latest,
    };
  }

  /** Only a part that some plate prints can be printed; the rest is bought. */
  private printable(itemId: string): { plate: PlanPlate; units: number } | null {
    const kind = this.items.get(itemId)?.kind ?? 'part';
    if (kind !== 'part') return null;
    return this.plateFor.get(itemId) ?? null;
  }

  private itemShortage(itemId: string, missing: number): PlanShortage {
    const item = this.items.get(itemId);
    return {
      kind: 'item',
      id: itemId,
      label: item?.name ?? itemId,
      missing,
      unit: item?.unit ?? DEFAULT_UNIT,
    };
  }

  /**
   * Made-to-order: what is already printed is ready, the line's own jobs
   * come next, and then runs of every one of its plates. Its pieces never
   * touch the shelf; only its supplies do.
   */
  private planCustom(
    claimant: Claimant,
    line: PlanDemandLine,
    quantity: number,
    custom: PlanCustomWork,
  ): LinePlanned {
    const onShelf = Math.min(quantity, Math.max(0, custom.printedUnits));
    const toMake = clean(quantity - onShelf);
    const shortages = new Shortages();
    const ownRuns: Run[] = [];
    let latest = this.now;

    const queued = this.forCustomLines.take(line.id, toMake, claimant);
    if (queued.at !== null) latest = Math.max(latest, queued.at);
    const left = clean(toMake - queued.units);
    if (left > 0) {
      custom.plates.forEach((plate) => {
        if (plate.unitsPerRun <= 0) return;
        const spec = customRunSpec(line, plate);
        const runs = this.print(
          spec,
          Math.ceil(left / plate.unitsPerRun - EPSILON),
          claimant,
          shortages,
        );
        ownRuns.push(...runs);
        for (const run of runs) latest = Math.max(latest, run.end);
      });
    }

    const components = toMake > 0 ? this.sourceSupplies(custom, toMake, claimant, shortages) : [];
    const handMinutes = toMake > 0 ? custom.setupMinutes + custom.minutesPerUnit * toMake : 0;
    return this.finish(
      line,
      { onShelf, toAssemble: 0, toMake },
      components,
      shortages,
      latest,
      handMinutes,
      ownRuns,
    );
  }

  /** Supplies of a made-to-order line come off the shelf or are bought. One typed by hand is not checked. */
  private sourceSupplies(
    custom: PlanCustomWork,
    toMake: number,
    claimant: Claimant,
    shortages: Shortages,
  ): PlanComponentPlan[] {
    const plans: PlanComponentPlan[] = [];
    for (const supply of custom.supplies) {
      if (supply.itemId === null) continue;
      const needed = clean(supply.scope === 'unit' ? supply.quantity * toMake : supply.quantity);
      const fromStock = this.shelf.take(supply.itemId, needed, claimant);
      const missing = clean(needed - fromStock);
      if (missing > 0) shortages.add(this.itemShortage(supply.itemId, missing));
      addTo(this.beyondStock, supply.itemId, missing);
      plans.push({
        itemId: supply.itemId,
        needed,
        fromStock,
        fromQueue: 0,
        toPrint: 0,
        missing,
        readyAt: missing > 0 ? null : formatInstant(this.now),
      });
    }
    return plans;
  }

  /** Places `count` runs in priority order and puts everything they make in the leftovers. */
  private print(spec: RunSpec, count: number, claimant: Claimant, shortages: Shortages): Run[] {
    const runs: Run[] = [];
    const durationMs = spec.printSeconds * MS_PER_SECOND;
    for (let i = 0; i < count; i++) {
      const placement = this.queue.place(durationMs, spec.label);
      const run: Run = {
        ...placement,
        ...spec,
        durationMs,
        claimant,
        takers: new Set([claimant]),
        shortOfFilament: false,
      };
      for (const { use, short } of this.filament.takeForRun(spec.filaments)) {
        run.shortOfFilament = true;
        shortages.add({
          kind: 'filament',
          id: use.skuId,
          label: this.filamentLabel(use),
          missing: short,
          unit: GRAMS,
        });
      }
      for (const output of spec.outputs) {
        this.leftovers.add(output.itemId, { units: output.units, at: run.end, run });
      }
      this.runs.push(run);
      runs.push(run);
    }
    return runs;
  }

  private filamentLabel(use: PlanFilamentUse): string {
    return this.input.filaments.find((row) => row.skuId === use.skuId)?.label ?? use.label;
  }

  /**
   * Hand work starts once everything of the line is there; something to buy
   * counts as arriving now. The failure date adds spare runs of the line's
   * longest plate right after its last run, moving nobody.
   */
  private finish(
    line: PlanDemandLine,
    counts: LineCounts,
    components: PlanComponentPlan[],
    shortages: Shortages,
    partsReadyAt: number,
    handMinutes: number,
    ownRuns: Run[],
  ): LinePlanned {
    const handMs = handMinutes * MS_PER_MINUTE;
    const readyAt = this.clock.handWorkEnd(partsReadyAt, handMs);
    const sparesEnd = this.endOfSpares(ownRuns);
    const readyAtIfFailure =
      sparesEnd === null
        ? readyAt
        : this.clock.handWorkEnd(Math.max(partsReadyAt, sparesEnd), handMs);
    return {
      plan: {
        lineId: line.id,
        description: line.description,
        quantity: line.quantity,
        ...counts,
        components,
        shortages: shortages.list,
        readyAt: formatInstant(readyAt),
        readyAtIfFailure: formatInstant(readyAtIfFailure),
        needsPurchase: shortages.list.length > 0,
      },
      readyAt,
      readyAtIfFailure,
    };
  }

  private readyNow(line: PlanDemandLine, counts: LineCounts): LinePlanned {
    return this.finish(line, counts, [], new Shortages(), this.now, 0, []);
  }

  private endOfSpares(ownRuns: Run[]): number | null {
    const spares = PrintQueue.sparesFor(ownRuns.length, this.input.settings.failureRate);
    if (spares === 0) return null;
    const longest = ownRuns.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    const last = ownRuns.reduce((a, b) => (b.end >= a.end ? b : a));
    return this.queue.endOfSpares(last, spares, longest.durationMs);
  }
}

function catalogueRunSpec(plate: PlanPlate): RunSpec {
  return {
    plateId: plate.id,
    label: plate.label,
    printSeconds: plate.printSeconds,
    outputs: plate.outputs,
    filaments: plate.filaments,
    lineId: null,
    groupKey: `plate:${plate.id}`,
    groupLabel: plate.label,
  };
}

function customRunSpec(line: PlanDemandLine, plate: PlanCustomPlate): RunSpec {
  return {
    plateId: null,
    label: plate.label,
    printSeconds: plate.printSeconds,
    outputs: [],
    filaments: plate.filaments,
    lineId: line.id,
    groupKey: `line:${line.id}`,
    groupLabel: line.description,
  };
}

/** How many whole units the shelf part of each component covers. No components, no limit. */
function completeSets(plans: PlanComponentPlan[], recipe: PlanRecipe): number {
  let sets = Infinity;
  recipe.components.forEach((component, index) => {
    const plan = plans[index];
    if (!plan || component.perUnit <= 0) return;
    sets = Math.min(sets, Math.floor(plan.fromStock / component.perUnit + EPSILON));
  });
  return sets;
}

// ------------------------------------------------------------------ result

function demandPlan(claimant: Claimant, allocation: Allocation): PlanDemandPlan {
  const { demand } = claimant;
  const lines = allocation.lines.get(claimant) ?? [];
  const readyAt = Math.max(allocation.now, ...lines.map((line) => line.readyAt));
  const readyAtIfFailure = Math.max(allocation.now, ...lines.map((line) => line.readyAtIfFailure));
  return {
    kind: demand.kind,
    id: demand.id,
    number: demand.number,
    customerName: demand.customerName,
    priorityAt: demand.priorityAt,
    holdUntil: demand.holdUntil,
    dueDate: demand.dueDate,
    lines: lines.map((line) => line.plan),
    readyAt: formatInstant(readyAt),
    readyAtIfFailure: formatInstant(readyAtIfFailure),
    needsPurchase: lines.some((line) => line.plan.needsPurchase),
    late: demand.dueDate !== null && readyAt > allocation.clock.endOfDay(demand.dueDate),
  };
}

function itemPosition(item: PlanItem, allocation: Allocation, ordersOnly: Allocation): PlanItemPosition {
  const forOrders = clean(allocation.shelf.forOrders.get(item.id) ?? 0);
  const held = clean(allocation.shelf.held.get(item.id) ?? 0);
  return {
    itemId: item.id,
    onHand: item.onHand,
    forOrders,
    held,
    free: clean(item.onHand - forOrders - held),
    missing: clean(allocation.beyondStock.get(item.id) ?? 0),
    missingForOrders: clean(ordersOnly.beyondStock.get(item.id) ?? 0),
  };
}

function filamentPosition(row: PlanFilamentStock, allocation: Allocation): PlanFilamentPosition {
  const queuedGrams = allocation.filament.queued.get(row.skuId) ?? 0;
  const plannedGrams = allocation.filament.planned.get(row.skuId) ?? 0;
  const balance = row.onHandGrams - queuedGrams - plannedGrams;
  return {
    skuId: row.skuId,
    onHandGrams: row.onHandGrams,
    queuedGrams: cleanGrams(queuedGrams),
    plannedGrams: cleanGrams(plannedGrams),
    freeGrams: cleanGrams(Math.max(0, balance)),
    missingGrams: cleanGrams(Math.max(0, -balance)),
  };
}

function toPlanRun(run: Run): PlanRun {
  return {
    plateId: run.plateId,
    label: run.label,
    printerId: run.printerId,
    start: formatInstant(run.start),
    end: formatInstant(run.end),
    demandKind: run.claimant.demand.kind,
    demandId: run.claimant.demand.id,
    lineId: run.lineId,
    outputs: run.outputs,
    filaments: run.filaments,
  };
}

/**
 * «Por lanzar»: production proposes runs for confirmed orders, never for a
 * hold. A run a hold asked for still counts when a confirmed order takes its
 * by-products, or that order would wait for a run nobody launches.
 */
function proposals(runs: Run[], ordersOnlyRuns: Run[]): PlanProposal[] {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    if (![...run.takers].some((taker) => taker.confirmed)) continue;
    const group = groups.get(run.groupKey);
    if (group) group.push(run);
    else groups.set(run.groupKey, [run]);
  }
  const withoutHolds = new Map<string, number>();
  for (const run of ordersOnlyRuns) addTo(withoutHolds, run.groupKey, 1);

  return [...groups.entries()]
    .map(([key, group]) => proposal(group, withoutHolds.get(key) ?? 0))
    .sort((a, b) => a.rank - b.rank || a.start - b.start)
    .map(({ proposal }) => proposal);
}

function proposal(
  group: Run[],
  runsWithoutHolds: number,
): { proposal: PlanProposal; rank: number; start: number } {
  const first = group[0]!;
  const covered = [...new Set(group.flatMap((run) => [...run.takers]))]
    .filter((taker) => taker.confirmed)
    .sort((a, b) => a.rank - b.rank);
  const start = Math.min(...group.map((run) => run.start));
  return {
    proposal: {
      plateId: first.plateId,
      lineId: first.lineId,
      label: first.groupLabel,
      runs: group.length,
      printSeconds: group.reduce((total, run) => total + run.durationMs / MS_PER_SECOND, 0),
      filaments: totalFilaments(group),
      enoughFilament: !group.some((run) => run.shortOfFilament),
      covers: covered.map(({ demand }) => ({
        id: demand.id,
        number: demand.number,
        customerName: demand.customerName,
      })),
      becauseOfHolds: Math.min(group.length, Math.max(0, group.length - runsWithoutHolds)),
      firstStart: formatInstant(start),
    },
    rank: covered[0]?.rank ?? Infinity,
    start,
  };
}

function totalFilaments(group: Run[]): PlanFilamentUse[] {
  const totals = new Map<string, PlanFilamentUse>();
  for (const run of group) {
    for (const use of run.filaments) {
      const key = use.skuId ?? `label:${use.label}`;
      const total = totals.get(key) ?? { skuId: use.skuId, label: use.label, grams: 0 };
      total.grams = cleanGrams(total.grams + use.grams);
      totals.set(key, total);
    }
  }
  return [...totals.values()];
}
