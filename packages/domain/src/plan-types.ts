/**
 * The single account (ADR-021): who each unit on the shelf is for, what has
 * to be printed, assembled or bought, and when every order would be ready.
 *
 * It is one pure function over a snapshot of the workshop, so the seller
 * asking "¿para cuándo?", the queue proposing plates and the shelf saying what
 * is free all read the same numbers by construction. Nothing here is stored:
 * the database keeps only the decisions (who goes first, until when a hold
 * lasts) and this recomputes the rest on every read.
 *
 * Instants are ISO 8601 strings with an offset ("2026-10-06T21:00:00.000Z").
 * Days are "YYYY-MM-DD" in the workshop's time zone.
 */

/** Minutes after local midnight in the workshop's time zone: 6:00 is 360. */
export type MinuteOfDay = number;

/** When a plate may run. Today 6:00 to 23:00, and it has to end by midnight. */
export interface PrintWindow {
  /** Earliest start of a plate. */
  firstStart: MinuteOfDay;
  /** Latest start of a plate. */
  lastStart: MinuteOfDay;
  /** A plate has to be finished by then. Midnight is 1440. */
  endBy: MinuteOfDay;
}

export interface PlanSettings {
  /** IANA zone the window is written in, "America/Lima". */
  timeZone: string;
  window: PrintWindow;
  /**
   * Minutes from the estimated end of one plate to the start of the next on
   * the same printer. Measured from real jobs (a high percentile, not the
   * mean) or the workshop's default while there is nothing to measure.
   */
  changeoverMinutes: number;
  /** Share of runs that fail, from the cost profile: 0.1 is one in ten. */
  failureRate: number;
}

export interface PlanPrinter {
  id: string;
  name: string;
}

/** What one run of a plate puts on the shelf. */
export interface PlanOutput {
  itemId: string;
  units: number;
}

/** Grams of one filament that one run uses. Purge included, as the slicer reports it. */
export interface PlanFilamentUse {
  /** Null when the recipe never said which spool: it cannot be checked against stock. */
  skuId: string | null;
  /** How a person recognises it: "PLA rosado". */
  label: string;
  grams: number;
}

/** A job already on a printer, or waiting in its queue. */
export interface PlanJob {
  id: string;
  printerId: string;
  status: 'printing' | 'planned';
  /** Null while it waits. */
  startedAt: string | null;
  /** When it was put in the queue: planned jobs of one printer run in this order. */
  queuedAt: string;
  estimatedSeconds: number;
  /** What a complete run leaves on the shelf. Empty for made-to-order work. */
  outputs: PlanOutput[];
  /**
   * Set when the job prints a made-to-order line. Its pieces never reach the
   * shelf: they belong to that line, and `lineUnits` says how many finished
   * units of the line one run makes.
   */
  orderLineId: string | null;
  lineUnits: number;
  /** Filament it will use. Stock still counts it until the job is closed. */
  filaments: PlanFilamentUse[];
}

export type PlanItemKind = 'part' | 'supply' | 'packaging' | 'spare_part' | 'finished_good';

export interface PlanItem {
  id: string;
  name: string;
  kind: PlanItemKind;
  unit: string;
  onHand: number;
}

export interface PlanFilamentStock {
  skuId: string;
  label: string;
  onHandGrams: number;
}

/** A plate of a catalogue recipe. Any recipe's plate can print a part another recipe needs. */
export interface PlanPlate {
  id: string;
  label: string;
  printSeconds: number;
  outputs: PlanOutput[];
  filaments: PlanFilamentUse[];
}

export interface PlanComponent {
  itemId: string;
  /** How much of it one finished unit takes. */
  perUnit: number;
}

/** How a catalogue variant is made. */
export interface PlanRecipe {
  variantId: string;
  /** "Botella de poción · Con dulces surtidos". */
  name: string;
  /**
   * Whether it goes through «Armar». An assembled product is delivered from
   * its finished-good article; one that is not is delivered straight from
   * its components (ADR-020).
   */
  assembled: boolean;
  /** Null when nobody has assembled one yet. */
  finishedItemId: string | null;
  components: PlanComponent[];
  setupMinutes: number;
  minutesPerUnit: number;
}

/** A plate of made-to-order work, as the quote froze it. */
export interface PlanCustomPlate {
  label: string;
  printSeconds: number;
  /** Finished units of the line one run makes. */
  unitsPerRun: number;
  filaments: PlanFilamentUse[];
}

export interface PlanCustomSupply {
  /** Null for something typed by hand that is not in the inventory. */
  itemId: string | null;
  label: string;
  /** `unit` multiplies by the units still to make; `batch` is needed once. */
  scope: 'unit' | 'batch';
  quantity: number;
}

/** Made-to-order work: nothing of it is on the shelf, everything is printed for this line. */
export interface PlanCustomWork {
  plates: PlanCustomPlate[];
  supplies: PlanCustomSupply[];
  setupMinutes: number;
  minutesPerUnit: number;
  /**
   * Units already printed for the line (closed jobs), not yet delivered,
   * counted as the queue counts its jobs. It can be fractional: a line of
   * two plates with only one of them printed has half a unit begun.
   */
  printedUnits: number;
}

export interface PlanDemandLine {
  /** The order line, or the quote line of a held quote. */
  id: string;
  description: string;
  /** Units still to hand over. */
  quantity: number;
  /** Set for catalogue lines. */
  variantId: string | null;
  /** Set for made-to-order lines. A line with neither (a service) takes nothing. */
  custom: PlanCustomWork | null;
}

/**
 * Something that claims stock and a place in the queue: a confirmed order, an
 * order on hold, or a quote sent with a hold.
 */
export interface PlanDemand {
  kind: 'order' | 'quote';
  id: string;
  /** "PED-0005", "COT-2026-0012". */
  number: string;
  customerName: string | null;
  /** Who goes first: the earlier one. Ties are broken by number. */
  priorityAt: string;
  /**
   * Until when it keeps its place. Null for a confirmed order, which keeps it
   * until delivered. A quote or an order on hold whose hold has passed claims
   * nothing: the plan leaves it out without anybody writing a release.
   */
  holdUntil: string | null;
  /** The day promised to the customer. It only raises an alarm; it never reorders. */
  dueDate: string | null;
  lines: PlanDemandLine[];
}

export interface PlanInput {
  /** The moment the plan is computed for. */
  now: string;
  settings: PlanSettings;
  /** Only printers that can print now. */
  printers: PlanPrinter[];
  jobs: PlanJob[];
  items: PlanItem[];
  filaments: PlanFilamentStock[];
  recipes: PlanRecipe[];
  plates: PlanPlate[];
  demands: PlanDemand[];
}

// ------------------------------------------------------------------ output

/** Something that has to be bought: nothing in the workshop can make it. */
export interface PlanShortage {
  kind: 'item' | 'filament';
  /** The item or the filament SKU. Null for a made-to-order supply typed by hand. */
  id: string | null;
  label: string;
  missing: number;
  /** "unidad", "g". */
  unit: string;
}

/** Where each unit of one component of a line comes from. */
export interface PlanComponentPlan {
  itemId: string;
  needed: number;
  /** Already on the shelf. */
  fromStock: number;
  /** Coming from a job already printing or queued. */
  fromQueue: number;
  /** Coming from runs the plan proposes (parts only). */
  toPrint: number;
  /** Nothing can make it: has to be bought (supplies, packaging, a part no plate prints). */
  missing: number;
  /** When the last unit of it is there. Null when something is missing. */
  readyAt: string | null;
}

export interface PlanLinePlan {
  lineId: string;
  description: string;
  quantity: number;
  /** Ready to hand over now: assembled units, or a whole kit on the shelf. */
  onShelf: number;
  /** Everything for it is on the shelf; it only needs «Armar». Zero for what is not assembled. */
  toAssemble: number;
  /** Waits for something to print or to buy. */
  toMake: number;
  components: PlanComponentPlan[];
  shortages: PlanShortage[];
  /**
   * When the whole line would be ready, assembly included. If something has
   * to be bought it is computed as if it arrived now, and `needsPurchase` says so.
   */
  readyAt: string;
  /** The same if one plate fails and has to be printed again. Equal to `readyAt` without new runs. */
  readyAtIfFailure: string;
  needsPurchase: boolean;
  /**
   * Why the plan cannot tell when it would be ready: no recipe, an empty
   * recipe, made-to-order work without plates. Null when it can. While set,
   * `readyAt` only covers what is known and must not be promised.
   */
  unknown: string | null;
}

export interface PlanDemandPlan {
  kind: 'order' | 'quote';
  id: string;
  number: string;
  customerName: string | null;
  priorityAt: string;
  holdUntil: string | null;
  dueDate: string | null;
  lines: PlanLinePlan[];
  /** The latest of its lines. */
  readyAt: string;
  readyAtIfFailure: string;
  needsPurchase: boolean;
  /** Some line cannot be dated (see `PlanLinePlan.unknown`). */
  unknown: boolean;
  /** `readyAt` falls after the end of `dueDate`. */
  late: boolean;
}

/** A run the plan proposes, placed on a printer in the window. */
export interface PlanRun {
  plateId: string | null;
  label: string;
  printerId: string;
  start: string;
  end: string;
  /** The demand that made it necessary. Its by-products may go to others. */
  demandKind: 'order' | 'quote';
  demandId: string;
  /** Set for a made-to-order run, which belongs to that line. */
  lineId: string | null;
  outputs: PlanOutput[];
  filaments: PlanFilamentUse[];
}

/** «Por lanzar»: the new runs of one plate, for confirmed orders only. */
export interface PlanProposal {
  plateId: string | null;
  /**
   * Set for made-to-order work, which is grouped by line: without it «Poner
   * en cola» could not tell which line the runs print for.
   */
  lineId: string | null;
  /** The plate's label; for made-to-order work, the line's description. */
  label: string;
  runs: number;
  /** Seconds of all the runs together, like `filaments`. */
  printSeconds: number;
  /** Grams of each filament for all the runs. */
  filaments: PlanFilamentUse[];
  /** False when some filament is short: launching it now would run out. */
  enoughFilament: boolean;
  /** Orders it covers, in priority order. */
  covers: { id: string; number: string; customerName: string | null }[];
  /**
   * Runs that are only needed because a held quote took shelf stock first.
   * The workshop decides whether to wait for the hold to end.
   */
  becauseOfHolds: number;
  /** Planned start of the first run. */
  firstStart: string;
}

/** «Hay · Separado · Libre · Falta» for one article. */
export interface PlanItemPosition {
  itemId: string;
  onHand: number;
  /** Taken by confirmed orders. */
  forOrders: number;
  /** Taken by holds: quotes sent with a hold and orders on hold. */
  held: number;
  /** On hand and nobody's. */
  free: number;
  /** Needed beyond what is on hand and in the queue. For a part, what has to print; for the rest, what has to be bought. */
  missing: number;
  /**
   * The same for confirmed orders only, which is what «Por lanzar» proposes.
   * The rest of `missing` is only needed if the holds become orders.
   */
  missingForOrders: number;
}

export interface PlanFilamentPosition {
  skuId: string;
  onHandGrams: number;
  /** Taken by jobs already printing or queued. */
  queuedGrams: number;
  /** Taken by the runs the plan proposes. */
  plannedGrams: number;
  freeGrams: number;
  missingGrams: number;
}

/** When a job already printing or queued starts and ends, as the plan places it in the window. */
export interface PlanJobTiming {
  id: string;
  printerId: string;
  start: string;
  end: string;
}

export interface PlanResult {
  now: string;
  /** Active demands only, in priority order. */
  demands: PlanDemandPlan[];
  items: PlanItemPosition[];
  filaments: PlanFilamentPosition[];
  /** Every run the plan places, in start order, holds included. */
  runs: PlanRun[];
  /** The jobs already launched, with the time the plan gives them, in start order. */
  jobs: PlanJobTiming[];
  /** What to launch, for confirmed orders only, in priority order of what each covers first. */
  proposals: PlanProposal[];
  /** Things a person should know: a plate that does not fit the window, a job past its estimate. */
  warnings: string[];
}

/** A sale being considered and not saved: planned after everyone else, taking nothing from anybody. */
export interface PlanCandidateLine {
  description: string;
  quantity: number;
  variantId: string | null;
  custom: PlanCustomWork | null;
}
