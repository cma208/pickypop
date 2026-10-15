import { Validators, type AbstractControl, type ValidatorFn } from '@angular/forms';
import { maxDecimals } from '../../core/form-errors';
import { unitPrice } from '../../core/format';
import { PURCHASE_LIMITS } from '../../core/pricing';
import type { SupplyCostSource } from '../cotizador/supply-costs';
import { invalidMessage } from './form-helpers';
import type { InventoryItemSummary } from './inventario.data';
import type { ItemKind } from './inventario.format';

/**
 * What one unit of a bought article is worth, and where that came from, as
 * `inventory_item_costs` says it (ADR-023, point 7). Shared by the list of
 * Insumos and Empaque, the article form and the movement dialog, so the three
 * name the same cost the same way.
 */

/**
 * The kinds that are bought, and so carry a cost of their own. A printed part
 * is produced: its cost is what printing it cost (`part_stock`), and its
 * standard cost is only that view's fallback, which this field must never
 * overwrite with an empty value.
 */
export const BOUGHT_KINDS: readonly ItemKind[] = ['supply', 'packaging', 'spare_part'];

export function isBought(kind: ItemKind): boolean {
  return BOUGHT_KINDS.includes(kind);
}

/** What `inventory_items.standard_cost` keeps: a fifth decimal the database refuses rather than rounding it away. */
export const COST_DECIMALS = 4;

/**
 * With four decimals, «more than zero» is «at least 0.0001». A zero is not a
 * cost: it is what the article was already worth by accident, and what this
 * whole field exists to end.
 */
const SMALLEST_COST = 1 / 10 ** COST_DECIMALS;

/** The validators of a cost per unit. The cap is the price per unit a purchase line takes. */
export const COST_VALIDATORS: ValidatorFn[] = [
  Validators.min(SMALLEST_COST),
  Validators.max(PURCHASE_LIMITS.unitPrice),
  maxDecimals(COST_DECIMALS),
];

/** Word for word what the database says past the cap, so both read the same. */
export const COST_CAP_MESSAGE = 'El costo por unidad va hasta S/ 100 000: revisa el número.';

/** The reason behind «Sin costo», for anyone who reads the list. */
const NO_COST_REASON = 'Sin costo cuenta como S/ 0 al armar, entregar y cotizar.';

/** How it is fixed: only for whoever has «Editar» and «Comprar», never for «Solo lectura» (ADR-025). */
const NO_COST_FIX = 'Ponle su costo en «Editar», o regístralo con «Comprar».';

/** Said under the pointer of «Sin costo». */
export function noCostTitle(canOperate: boolean): string {
  return canOperate ? `${NO_COST_REASON} ${NO_COST_FIX}` : NO_COST_REASON;
}

/**
 * An active article that has neither a purchase nor a standard cost: every
 * assembly, delivery and quote counts it at S/ 0. A switched-off one is not
 * used any more, so it is not nagged about. One rule for the badge, the
 * filter and its count, so the three never disagree.
 */
export function lacksCost(item: Pick<InventoryItemSummary, 'active' | 'costPerUnit'>): boolean {
  return item.active && item.costPerUnit === null;
}

const SOURCE_LABELS: Record<Exclude<SupplyCostSource, 'unknown'>, string> = {
  purchase: 'De la última compra',
  standard: 'Costo estándar',
  produced: 'De una impresión',
};

/** «De la última compra», «Costo estándar»; null when there is no cost to explain. */
export function costSourceLabel(source: SupplyCostSource): string | null {
  return source === 'unknown' ? null : SOURCE_LABELS[source];
}

/** The unit a sentence names: a unit still being typed reads as «unidad», never as «Costo por  (S/)». */
export function costUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim() || 'unidad';
}

export function costLabel(unit: string | null | undefined): string {
  return `Costo por ${costUnit(unit)} (S/)`;
}

/** Word for word the database's refusal (`move_item_stock`), said before it has to. */
export function noCostSentence(name: string, unit: string): string {
  return `${name} todavía no tiene costo: escribe cuánto vale cada ${costUnit(unit)}.`;
}

/**
 * The database refused a movement because the article has no cost. The
 * dialog thought it had one (another tab cleared it): it asks for it now,
 * instead of only showing the refusal.
 */
export function isNoCostRefusal(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return code === 'P0001' && typeof message === 'string' && message.includes('todavía no tiene costo');
}

/**
 * The field's own sentences, the same the database would say. Shown while
 * typing too, not only after the blur: a zero is wrong the moment it is
 * written. Each one reads the key its validator gives (core/form-errors.ts).
 */
export function costMessage(control: AbstractControl, unit: string, required: boolean): string | null {
  if (!control.touched && !control.dirty) return null;
  if (control.value === null || control.value === '') return required ? 'Este campo es obligatorio.' : null;
  const errors = control.errors;
  if (!errors) return null;
  const per = costUnit(unit);
  if (typeof errors['decimals'] === 'number') return `El costo por ${per} admite hasta ${errors['decimals']} decimales.`;
  if (errors['min']) return `El costo por ${per} tiene que ser mayor que cero.`;
  if (errors['max']) return COST_CAP_MESSAGE;
  return invalidMessage(control);
}

/** «a S/ 0.80 por unidad (de la última compra)»: the cost a movement went at, and why that one. */
export function costAt(cost: number, source: SupplyCostSource, unit: string): string {
  const label = costSourceLabel(source);
  const origin = label ? ` (${label.charAt(0).toLowerCase()}${label.slice(1)})` : '';
  return `a ${unitPrice(cost)} por ${costUnit(unit)}${origin}`;
}

/** Only the direction of `difference` counts: an exit leaves at the cost an entry comes in at. */
function verb(difference: number): string {
  return difference < 0 ? 'Sale' : 'Entra';
}

/** «Entra a S/ 0.80 por unidad (de la última compra).» What a movement of an article that has a cost moves it at. */
export function costNote(cost: number, source: SupplyCostSource, unit: string, difference: number): string {
  return `${verb(difference)} ${costAt(cost, source, unit)}.`;
}

/** What the person typed for an article without a cost: it moves at that, and keeps it. */
export function typedCostNote(cost: number, unit: string, difference: number): string {
  return `${verb(difference)} a ${unitPrice(cost)} por ${costUnit(unit)}, que queda como su costo.`;
}

/** Under the field of the movement dialog. */
export function typedCostHint(unit: string): string {
  return `Lo que vale cada ${costUnit(unit)}. Queda como su costo mientras no haya compras.`;
}

/** What the movement dialog does about the cost, worked out from the article and what is typed. */
export interface MovementCost {
  /** The field shows, and has to be filled. */
  asks: boolean;
  /** Why the movement cannot go yet: no cost, and none typed. */
  missing: string | null;
  /** Typed but wrong: the field itself says why. */
  invalid: boolean;
  /** What the preview adds: the cost the stock moves at. */
  note: string | null;
}

export interface MovementCostInput {
  item: Pick<InventoryItemSummary, 'name' | 'unit' | 'costPerUnit' | 'costSource'>;
  mode: 'in' | 'out' | 'count';
  /** The stock change the preview shows; null while it is incomplete or changes nothing. */
  difference: number | null;
  typed: number | null;
  typedValid: boolean;
  /** The database said the article has no cost, whatever the dialog was shown. */
  demanded: boolean;
}

/**
 * An article with no cost that changes its stock needs one: an entry, an
 * exit or a count that differs, the same rule as `move_item_stock`. A count
 * that matches moves nothing and asks nothing. One that has a cost keeps it,
 * and the dialog only says which: what was paid goes through Compras.
 */
export function movementCost({ item, mode, difference, typed, typedValid, demanded }: MovementCostInput): MovementCost {
  const cost = item.costPerUnit;
  if (!demanded && item.costSource !== 'unknown' && cost !== null) {
    const note = difference === null ? null : costNote(cost, item.costSource, item.unit, difference);
    return { asks: false, missing: null, invalid: false, note };
  }
  if (mode === 'count' && difference === null) return { asks: false, missing: null, invalid: false, note: null };
  if (typed === null) return { asks: true, missing: noCostSentence(item.name, item.unit), invalid: false, note: null };
  if (!typedValid) return { asks: true, missing: null, invalid: true, note: null };
  const note = difference === null ? null : typedCostNote(typed, item.unit, difference);
  return { asks: true, missing: null, invalid: false, note };
}

/** What the article form says under its cost: whether a purchase already decides it. */
export function standardCostHint(lastPurchaseCost: number | null, unit: string): string {
  const per = costUnit(unit);
  if (lastPurchaseCost !== null) {
    return `Hoy vale la última compra: ${unitPrice(lastPurchaseCost)} por ${per}. Este valor solo se usa mientras no haya compras.`;
  }
  return `Lo que vale cada ${per} mientras no haya compras. Sin costo, cuenta como S/ 0 al armar, entregar y cotizar.`;
}
