import type { PlanCandidateLine, PlanCustomWork, PlanFilamentUse } from '@pickypop/domain';
import type { FilamentDraft, LineDraft, PlateDraft, SupplyDraft } from './quote-model';

/**
 * A line of the calculator, as the plan reads it.
 *
 * It mirrors what the database does with the same line once the quote is sent
 * (`app.custom_work_json`): the seller has to hear the same date in the
 * calculator as on the quote afterwards, or the promise moves for no reason
 * the moment the quote is saved.
 */

/** What the plan needs of a line; the calculator's draft and a stored line both have it. */
export type LineForPlan = Pick<
  LineDraft,
  'description' | 'variantId' | 'quantity' | 'setupMinutes' | 'minutesPerUnit' | 'plates' | 'supplies'
>;

/** How a filament is named when its SKU is not known: what the slicer said, or nothing. */
const UNKNOWN_FILAMENT = 'Filamento';
const UNKNOWN_SUPPLY = 'Insumo';

/**
 * Units are whole, as the quote stores them (`Math.round`, at least one).
 * Null while the field is empty or not a number yet: nothing to ask the plan.
 */
export function candidateQuantity(quantity: number): number | null {
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  return Math.round(quantity);
}

/**
 * The line as a sale the plan can place. A catalogue line is made by its
 * recipe; a made-to-order one by its own plates. Null when the plan has
 * nothing to work with: no quantity yet, or made to order without plates.
 */
export function candidateLine(
  line: LineForPlan,
  filamentLabel: (skuId: string) => string | null,
): PlanCandidateLine | null {
  const quantity = candidateQuantity(line.quantity);
  if (quantity === null) return null;
  const description = line.description.trim() || 'Esta línea';

  if (line.variantId !== null) return { description, quantity, variantId: line.variantId, custom: null };
  if (line.plates.length === 0) return null;
  return { description, quantity, variantId: null, custom: customWork(line, filamentLabel) };
}

/** Made-to-order work from the calculator's plates and supplies. Nothing of it is printed yet. */
export function customWork(
  line: Pick<LineForPlan, 'plates' | 'supplies' | 'setupMinutes' | 'minutesPerUnit'>,
  filamentLabel: (skuId: string) => string | null,
): PlanCustomWork {
  return {
    plates: line.plates.map((plate) => customPlate(plate, filamentLabel)),
    supplies: line.supplies.map(customSupply),
    setupMinutes: nonNegative(line.setupMinutes),
    minutesPerUnit: nonNegative(line.minutesPerUnit),
    printedUnits: 0,
  };
}

function customPlate(plate: PlateDraft, filamentLabel: (skuId: string) => string | null) {
  return {
    label: plate.label.trim() || 'Placa',
    printSeconds: nonNegative(plate.printTimeSeconds),
    // The database reads less than one unit per run as one (`greatest(…, 1)`),
    // so the calculator does too: the date must not change once it is sent.
    unitsPerRun: Math.max(Number.isFinite(plate.unitsPerRun) ? plate.unitsPerRun : 1, 1),
    filaments: plate.filaments.map((filament) => filamentUse(filament, filamentLabel)),
  };
}

function filamentUse(filament: FilamentDraft, filamentLabel: (skuId: string) => string | null): PlanFilamentUse {
  const skuId = filament.filamentSkuId || null;
  const fromFile = [filament.type, filament.colorHex].filter((part) => part).join(' ');
  return {
    skuId,
    label: (skuId === null ? null : filamentLabel(skuId)) ?? (fromFile || UNKNOWN_FILAMENT),
    grams: nonNegative(filament.grams),
  };
}

function customSupply(supply: SupplyDraft) {
  return {
    itemId: supply.inventoryItemId || null,
    label: supply.label.trim() || UNKNOWN_SUPPLY,
    scope: supply.scope,
    quantity: nonNegative(supply.quantity),
  };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Whether two lists of candidates ask the plan the same. Typing a price or a
 * note must not ask again: only what changes the answer does.
 */
export function sameCandidates(
  a: readonly (PlanCandidateLine | null)[],
  b: readonly (PlanCandidateLine | null)[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
