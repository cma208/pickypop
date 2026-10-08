import type { AbstractControl } from '@angular/forms';
import { PURCHASE_LIMITS } from '../../core/pricing';
import { invalidMessage } from './form-helpers';

/**
 * How far the numbers of a filament and of a supply reasonably go. Past them
 * it is a typo: 175 for 1.75 mm, 100000 g for a 1 kg roll. A diameter like
 * that does not even fit its column, and the screen could only say «Inténtalo
 * de nuevo»; a weight like that fits, and every purchase of the filament
 * brings in rolls of 100 kg. The database refuses the same, as a net
 * (`filament_skus_guard_ranges`, `inventory_items_guard_ranges`).
 */
export const ARTICLE_LIMITS = {
  diameterMm: { min: 1, max: 3 },
  netWeightG: { min: 1, max: 10_000 },
  tareG: { max: 5_000 },
  minStockG: { max: 100_000 },
  replacementCostPerKg: { max: 10_000 },
  /** The same cap a purchase line and a manual movement have. */
  itemMinStock: { max: PURCHASE_LIMITS.quantityPerLine },
} as const;

/** What a filament and an item keep: two decimals for grams, millimetres and soles; three for an item's quantity. */
export const ARTICLE_DECIMALS = { filament: 2, itemQuantity: 3 } as const;

/** Said next to the field when the number is out of range. */
export const OUT_OF_RANGE = {
  diameterMm: 'El diámetro va de 1 a 3 mm: el común es 1.75.',
  netWeightG: 'El peso neto va de 1 a 10 000 g por rollo: revisa el número.',
  tareG: 'La tara va hasta 5 000 g: es el carrete vacío.',
  minStockG: 'El mínimo va hasta 100 000 g (100 kg): revisa el número.',
  replacementCostPerKg: 'El costo de reposición va hasta S/ 10 000 por kg: revisa el número.',
  itemMinStock: 'El mínimo va hasta 1 000 000: revisa el número.',
} as const;

/** The field's own sentence for a number out of range; for anything else, the usual message. */
export function rangeMessage(control: AbstractControl, outOfRange: string): string | null {
  if (control.touched && (control.hasError('min') || control.hasError('max'))) return outOfRange;
  return invalidMessage(control);
}
