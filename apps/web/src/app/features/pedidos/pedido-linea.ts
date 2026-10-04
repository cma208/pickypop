import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, FORMAT_PIPES } from '../../ui';
import { CostEstimator } from './cost-estimate';
import { PedidosData, roundMoney, type VariantOption } from './pedidos.data';

const TYPING_DELAY_MS = 300;

export type OrderLineForm = FormGroup<{
  variantId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
  /** Filled in by the line itself once it knows what the recipe costs. */
  estimatedUnitCost: FormControl<number | null>;
}>;

export function createOrderLineForm(): OrderLineForm {
  return new FormGroup({
    variantId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    }),
    unitPrice: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    estimatedUnitCost: new FormControl<number | null>(null),
  });
}

/**
 * One order line: variant, quantity and unit price. The price is suggested by
 * the database's tier ladder for the chosen quantity, and can be adjusted.
 */
@Component({
  selector: 'app-pedido-linea',
  imports: [ReactiveFormsModule, Field, ...FORMAT_PIPES],
  template: `
    <div class="line" [formGroup]="group()">
      <div class="head">
        <strong>Línea {{ index() + 1 }}</strong>
        @if (removable()) {
          <button type="button" class="ghost" (click)="remove.emit()" [attr.aria-label]="'Quitar la línea ' + (index() + 1)">
            Quitar
          </button>
        }
      </div>

      <pp-field label="Producto y variante" [required]="true" [error]="fieldError('variantId')">
        <select formControlName="variantId">
          <option value="">Elige una variante…</option>
          @for (variant of variants(); track variant.id) {
            <option [value]="variant.id">{{ variant.label }}</option>
          }
        </select>
      </pp-field>

      <div class="numbers">
        <pp-field label="Cantidad" [required]="true" [error]="fieldError('quantity')">
          <input type="number" inputmode="numeric" min="1" step="1" formControlName="quantity" />
        </pp-field>

        @if (isSale()) {
          <pp-field label="Precio unitario (S/)" [error]="fieldError('unitPrice')">
            <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="unitPrice" (input)="priceEdited = true" />
          </pp-field>
        }
      </div>

      <div class="notes muted">
        @if (loading()) {
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
    </div>
  `,
  styles: `
    .line { padding: 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; }
    .notes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; font-size: 0.8rem; }
    .total { margin-left: auto; color: var(--text); }
    .warn-text { color: var(--warn); }
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
  readonly remove = output<void>();

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
    this.lastKey = this.key();
    this.group()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onChange());
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
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

  protected fieldError(name: 'variantId' | 'quantity' | 'unitPrice'): string | null {
    const control = this.group().controls[name];
    if (!control.invalid || !(control.touched || this.showErrors())) return null;
    if (name === 'variantId') return 'Elige una variante del catálogo.';
    if (name === 'quantity') return 'La cantidad debe ser un número entero de 1 o más.';
    return 'El precio no puede ser negativo.';
  }

  private key(): string {
    const { variantId, quantity } = this.group().getRawValue();
    return `${variantId}|${quantity}`;
  }

  /** Only a new variant or quantity asks for a new suggestion, not a price edit. */
  private onChange(): void {
    const key = this.key();
    if (key === this.lastKey) return;

    const variantChanged = key.split('|')[0] !== this.lastKey.split('|')[0];
    this.lastKey = key;
    if (variantChanged) this.priceEdited = false;

    clearTimeout(this.timer);
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
