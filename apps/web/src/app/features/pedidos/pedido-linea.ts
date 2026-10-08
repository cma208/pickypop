import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { requiredText, wholeNumber } from '../../core/form-errors';
import { roundMoney } from '../../core/pricing';
import { Field, FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import { Promesa } from '../cotizador/promesa';
import type { LinePromise } from '../cotizador/sale-promise';
import { CostEstimator } from './cost-estimate';
import { PedidosData, type NewOrderLine, type VariantOption } from './pedidos.data';

const TYPING_DELAY_MS = 300;
/**
 * Reasonable ceilings, said next to the field. Past them the database would
 * refuse anyway (a quantity of 3 000 000 000 broke the lines, T4-02), but
 * with a message about the whole order instead of this field.
 */
export const MAX_LINE_UNITS = 100_000;
export const MAX_UNIT_AMOUNT = 1_000_000;

/**
 * A line is either a variant of the catalogue, whose cost comes from its
 * recipe, or a piece made to order, which has no variant: it is described, and
 * its cost is written by hand. Delivering it takes nothing off the shelf.
 */
export type OrderLineKind = 'catalog' | 'custom';

export type OrderLineForm = FormGroup<{
  kind: FormControl<OrderLineKind>;
  variantId: FormControl<string>;
  /** Only for a custom line: a catalogue line is named after its variant. */
  description: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
  /** From the recipe on a catalogue line; written by hand on a custom one. */
  estimatedUnitCost: FormControl<number | null>;
}>;

export function createOrderLineForm(): OrderLineForm {
  return new FormGroup({
    kind: new FormControl<OrderLineKind>('catalog', { nonNullable: true }),
    variantId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(MAX_LINE_UNITS), wholeNumber],
    }),
    unitPrice: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(MAX_UNIT_AMOUNT)],
    }),
    estimatedUnitCost: new FormControl<number | null>(null, [Validators.max(MAX_UNIT_AMOUNT)]),
  });
}

/**
 * Switches what the line asks for. A catalogue line needs its variant; a
 * custom one needs to say what it is, and its cost is the person's to write.
 * What belonged to the other kind is cleared, so it is not saved by accident.
 */
export function applyLineKind(group: OrderLineForm, kind: OrderLineKind): void {
  const { variantId, description, estimatedUnitCost } = group.controls;
  const custom = kind === 'custom';

  variantId.setValidators(custom ? [] : [Validators.required]);
  description.setValidators(custom ? [requiredText] : []);
  estimatedUnitCost.setValidators(custom ? [Validators.min(0), Validators.max(MAX_UNIT_AMOUNT)] : []);

  group.patchValue({
    kind,
    variantId: custom ? '' : variantId.value,
    description: custom ? description.value : '',
    estimatedUnitCost: null,
  });
  for (const control of [variantId, description, estimatedUnitCost]) control.updateValueAndValidity();
}

const AMOUNT_TEXT = new Intl.NumberFormat('es-PE').format(MAX_UNIT_AMOUNT);
const UNITS_TEXT = new Intl.NumberFormat('es-PE').format(MAX_LINE_UNITS);

/** What is wrong with one field of a line, in the words shown under it. */
export function lineFieldError(
  name: 'variantId' | 'description' | 'quantity' | 'unitPrice' | 'estimatedUnitCost',
  errors: Record<string, unknown>,
): string | null {
  if (Object.keys(errors).length === 0) return null;
  if (name === 'variantId') return 'Elige una variante del catálogo.';
  if (name === 'description') return 'Escribe qué es: así se reconoce en el pedido y al entregarlo.';
  if (name === 'quantity') return `La cantidad debe ser un número entero entre 1 y ${UNITS_TEXT}.`;
  if (name === 'estimatedUnitCost') {
    return errors['max'] ? `El costo por unidad no puede pasar de S/ ${AMOUNT_TEXT}.` : 'El costo no puede ser negativo.';
  }
  if (errors['required']) return 'Escribe el precio por unidad (0 si esta línea va sin costo).';
  if (errors['max']) return `El precio por unidad no puede pasar de S/ ${AMOUNT_TEXT}.`;
  return 'El precio no puede ser negativo.';
}

/** What the database receives for one line of the form. */
export function toNewOrderLine(
  line: ReturnType<OrderLineForm['getRawValue']>,
  variantLabel: (variantId: string) => string | undefined,
): NewOrderLine {
  const custom = line.kind === 'custom';

  return {
    variantId: custom ? null : line.variantId,
    description: custom ? line.description.trim() : (variantLabel(line.variantId) ?? 'Producto'),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    estimatedUnitCost: line.estimatedUnitCost ?? 0,
  };
}

/**
 * One order line. From the catalogue: variant, quantity and unit price, with
 * the price suggested by the database's tier ladder for that quantity and the
 * cost taken from the recipe. Made to order: what it is, quantity, price and
 * the cost the person estimates.
 */
@Component({
  selector: 'app-pedido-linea',
  imports: [ReactiveFormsModule, RouterLink, Field, ItemPicker, Promesa, ...FORMAT_PIPES],
  template: `
    <div class="line" [formGroup]="group()">
      <div class="head">
        <strong>Línea {{ index() + 1 }}</strong>
        <div class="kinds" role="group" [attr.aria-label]="'Tipo de la línea ' + (index() + 1)">
          <button type="button" class="ghost" [class.on]="kind() === 'catalog'" [attr.aria-pressed]="kind() === 'catalog'" (click)="setKind('catalog')">
            Del catálogo
          </button>
          <button type="button" class="ghost" [class.on]="kind() === 'custom'" [attr.aria-pressed]="kind() === 'custom'" (click)="setKind('custom')">
            A medida
          </button>
        </div>
        @if (removable()) {
          <button type="button" class="ghost" (click)="remove.emit()" [attr.aria-label]="'Quitar la línea ' + (index() + 1)">
            Quitar
          </button>
        }
      </div>

      @if (kind() === 'custom') {
        <pp-field label="Qué es" [required]="true" hint="Por ejemplo: «Llavero con nombre, 5 cm»." [error]="fieldError('description')">
          <input type="text" formControlName="description" autocomplete="off" />
        </pp-field>
      } @else {
        <pp-field label="Producto y variante" [required]="true" [error]="fieldError('variantId')">
          <pp-item-picker formControlName="variantId" [options]="variantOptions()" placeholder="Elige una variante…" />
        </pp-field>
      }

      <div class="numbers">
        <pp-field label="Cantidad" [required]="true" [error]="fieldError('quantity')">
          <input type="number" inputmode="numeric" min="1" step="1" formControlName="quantity" />
        </pp-field>

        @if (isSale()) {
          <pp-field label="Precio unitario (S/)" [error]="fieldError('unitPrice')">
            <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="unitPrice" (input)="priceEdited = true" />
          </pp-field>
        }

        @if (kind() === 'custom') {
          <pp-field label="Costo estimado por unidad (S/)" hint="Lo que te cuesta hacer una." [error]="fieldError('estimatedUnitCost')">
            <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="estimatedUnitCost" />
          </pp-field>
        }
      </div>

      <div class="notes muted">
        @if (kind() === 'custom') {
          <span>A medida: se hace para este pedido y al entregarla no sale nada del estante.</span>
        } @else if (loading()) {
          <span>Calculando…</span>
        } @else if (failed()) {
          <span class="error">No pudimos calcular el precio sugerido ni el costo.</span>
        } @else if (group().controls.variantId.value) {
          @if (isSale()) {
            @if (suggested() !== null) {
              <span>
                Sugerido por la escalera: <strong>{{ suggested() | money }}</strong> por unidad.
              </span>
              @if (group().controls.unitPrice.value !== suggested()) {
                <button type="button" class="ghost" (click)="useSuggested()">Usar sugerido</button>
              }
            } @else {
              <span>Esta variante no tiene precio de lista ni escalera: escribe el precio.</span>
            }
          }
          @if (estimatedUnit() !== null) {
            <span>Costo estimado: {{ estimatedUnit() | money }} por unidad.</span>
            @if (unpricedSupplies().length > 0) {
              <span class="warn-text" role="status">
                Es un mínimo: {{ unpricedSupplies().join(', ') }}
                {{ unpricedSupplies().length === 1 ? 'no tiene' : 'no tienen' }} costo registrado y no
                {{ unpricedSupplies().length === 1 ? 'suma' : 'suman' }}.
              </span>
            }
          } @else {
            <span>Sin receta: no hay costo estimado.</span>
          }
        }
        @if (isSale() && lineTotal() > 0) {
          <span class="total">Subtotal: <strong>{{ lineTotal() | money }}</strong></span>
        }
      </div>

      @if (kind() === 'custom') {
        <p class="muted plan-note">
          ¿Para cuándo? A medida y sin placas, el plan no sabe cuánto tarda. Para tener la fecha, cotízala en el
          <a routerLink="/cotizador">Cotizador</a> con su archivo laminado: al aceptarla se crea el pedido con sus placas.
        </p>
      } @else if (promise(); as answer) {
        <app-promesa class="promise" [promise]="answer" [now]="promiseNow()" [stale]="promiseStale()" [forWhom]="promiseFor()" />
      }
    </div>
  `,
  styles: `
    .line { padding: 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .kinds { display: inline-flex; gap: 0.15rem; padding: 0.15rem; border: 1px solid var(--line); border-radius: var(--radius-sm); margin-right: auto; }
    .kinds button { padding-block: 0.25rem; font-size: var(--fs-sm); color: var(--muted); }
    .kinds button.on { background: var(--accent-soft); color: var(--text); font-weight: 600; }
    .numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; }
    .notes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; font-size: 0.8rem; }
    .total { margin-left: auto; color: var(--text); }
    .warn-text { color: var(--warn); }
    .promise { display: block; margin-top: 0.75rem; }
    .plan-note { margin: 0.75rem 0 0; font-size: 0.8rem; }
  `,
})
export class PedidoLinea implements OnInit {
  private readonly data = inject(PedidosData);
  private readonly estimator = inject(CostEstimator);
  private readonly destroyRef = inject(DestroyRef);

  readonly group = input.required<OrderLineForm>();
  readonly variants = input.required<VariantOption[]>();
  readonly index = input(0);
  readonly isSale = input(true);
  readonly removable = input(true);
  readonly showErrors = input(false);
  /** "¿Para cuándo?" for this line, answered by the page for all its lines together. */
  readonly promise = input<LinePromise | null>(null);
  readonly promiseNow = input('');
  readonly promiseStale = input(false);
  readonly promiseFor = input('Para este pedido');
  readonly remove = output<void>();

  /** The catalogue with its photos: "la botella roja" is found by looking, not by reading. */
  protected readonly variantOptions = computed<PickerOption[]>(() =>
    this.variants().map((variant) => ({
      value: variant.id,
      label: variant.label,
      photo: { kind: 'variant', id: variant.id },
      kind: 'product',
    })),
  );

  protected readonly kind = signal<OrderLineKind>('catalog');
  protected readonly suggested = signal<number | null>(null);
  protected readonly estimatedUnit = signal<number | null>(null);
  protected readonly unpricedSupplies = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected priceEdited = false;

  private lastKey = '';
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.kind.set(this.group().controls.kind.value);
    this.lastKey = this.key();
    this.group()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onChange());
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
  }

  protected setKind(kind: OrderLineKind): void {
    if (kind !== this.kind()) applyLineKind(this.group(), kind);
  }

  protected lineTotal(): number {
    const { unitPrice, quantity } = this.group().getRawValue();
    return roundMoney((unitPrice || 0) * (quantity || 0));
  }

  protected useSuggested(): void {
    const price = this.suggested();
    if (price === null) return;
    this.priceEdited = false;
    this.group().controls.unitPrice.setValue(price);
  }

  protected fieldError(name: 'variantId' | 'description' | 'quantity' | 'unitPrice' | 'estimatedUnitCost'): string | null {
    const control = this.group().controls[name];
    if (!control.invalid || !(control.touched || this.showErrors())) return null;
    return lineFieldError(name, control.errors ?? {});
  }

  private key(): string {
    const { kind, variantId, quantity } = this.group().getRawValue();
    return `${kind}|${variantId}|${quantity}`;
  }

  /**
   * Only a new variant or quantity asks for a new suggestion, not a price
   * edit. A custom line asks for nothing: there is no recipe nor ladder to
   * read, and its cost is the one the person wrote.
   */
  private onChange(): void {
    const key = this.key();
    if (key === this.lastKey) return;

    const [kind, variant] = key.split('|');
    const [lastKind, lastVariant] = this.lastKey.split('|');
    this.lastKey = key;
    this.kind.set(kind as OrderLineKind);
    if (variant !== lastVariant || kind !== lastKind) this.priceEdited = false;

    clearTimeout(this.timer);
    if (kind === 'custom') {
      this.sequence++;
      this.loading.set(false);
      this.failed.set(false);
      this.suggested.set(null);
      this.estimatedUnit.set(null);
      this.unpricedSupplies.set([]);
      return;
    }
    this.timer = setTimeout(() => void this.refresh(), TYPING_DELAY_MS);
  }

  private async refresh(): Promise<void> {
    const { variantId, quantity } = this.group().getRawValue();
    const request = ++this.sequence;

    if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
      this.loading.set(false);
      this.suggested.set(null);
      this.estimatedUnit.set(null);
      this.unpricedSupplies.set([]);
      this.group().controls.estimatedUnitCost.setValue(null);
      return;
    }

    this.loading.set(true);
    this.failed.set(false);
    try {
      const [price, cost] = await Promise.all([
        this.data.suggestedPrice(variantId, quantity),
        this.estimator.forVariant(variantId, quantity),
      ]);
      if (request !== this.sequence) return;

      this.suggested.set(price);
      this.estimatedUnit.set(cost?.perUnit ?? null);
      this.unpricedSupplies.set(cost?.unpricedSupplies ?? []);
      this.group().controls.estimatedUnitCost.setValue(cost?.perUnit ?? null);
      if (!this.priceEdited && price !== null) this.group().controls.unitPrice.setValue(price);
    } catch {
      if (request === this.sequence) this.failed.set(true);
    } finally {
      if (request === this.sequence) this.loading.set(false);
    }
  }
}
