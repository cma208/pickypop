import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { FormControl } from '@angular/forms';
import { unitPriceFromLineTotal } from '../../core/pricing';
import type { InventoryItemSummary } from './inventario.data';

/**
 * A printed part and an assembled product are made here, never bought
 * (ADR-016, ADR-018): a purchase line for one would value the shelf at a price
 * paid instead of at what producing it cost.
 */
const MADE_HERE: ReadonlySet<string> = new Set(['part', 'finished_good']);

export function canBeBought(item: Pick<InventoryItemSummary, 'kind'>): boolean {
  return !MADE_HERE.has(item.kind);
}

/**
 * The item `?articulo=` names, when a purchase line can take it. «Comprar» on
 * Empaque or Insumos sends its id, but a link can be old or typed by hand: an
 * item switched off, deleted or made here gives null, and the purchase starts
 * with nothing chosen instead of with a line the database would refuse.
 */
export function itemToBuy(
  items: readonly InventoryItemSummary[],
  id: string | null | undefined,
): InventoryItemSummary | null {
  if (!id) return null;
  const item = items.find((candidate) => candidate.id === id);
  return item && item.active && canBeBought(item) ? item : null;
}

export interface LinePriceControls {
  target: FormControl<string>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
  /** What the whole line cost, when that is what the invoice says. Null when the price per unit was typed. */
  lineTotal: FormControl<number | null>;
}

/**
 * Keeps the two ways of saying what a purchase line cost telling the same
 * story: a price per unit, or the total of the line.
 *
 * A gram of filament or a sticker costs a fraction of a cent, and the invoice
 * only says what the whole line came to. So the total can be typed instead,
 * and the price per unit follows it (six decimals, by the domain rule). While
 * a total is there it stays the anchor: change the quantity and the price is
 * worked out again, because the total is what was paid. Typing a price clears
 * the total, and so does changing the product, which makes it another line.
 *
 * The price is written without announcing it: whoever caused the change is
 * already announcing it, and an announcement from here would clear the total
 * that just produced it.
 */
export function linkPriceAndTotal(controls: LinePriceControls, destroyRef: DestroyRef): void {
  const { target, quantity, unitPrice, lineTotal } = controls;

  const priceFromTotal = () => {
    const total = lineTotal.value;
    if (total === null) return;
    unitPrice.setValue(unitPriceFromLineTotal(total, quantity.value ?? 0), { emitEvent: false });
  };
  const forgetTotal = () => lineTotal.setValue(null, { emitEvent: false });

  lineTotal.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(priceFromTotal);
  quantity.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(priceFromTotal);
  unitPrice.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(forgetTotal);
  target.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(forgetTotal);
}
