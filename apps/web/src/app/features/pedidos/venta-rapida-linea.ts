import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORMAT_PIPES, Thumb } from '../../ui';
import { CostEstimator } from './cost-estimate';
import { PedidosData } from './pedidos.data';
import { freeUnits, lineTotal, validQuantity, type CostStatus, type VariantInfo } from './quick-sale';

const TYPING_DELAY_MS = 300;

export type QuickLineForm = FormGroup<{
  variantId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number | null>;
  /** From the same estimator as «Nuevo pedido», for this quantity, to six decimals. */
  estimatedUnitCost: FormControl<number | null>;
  /** Not typed by anybody: whether the estimate above is there yet. The sale waits for it. */
  costStatus: FormControl<CostStatus>;
}>;

/** A product tapped on the shelf: one unit at its list price, until the ladder says otherwise. */
export function createQuickLine(variantId: string, listPrice: number | null): QuickLineForm {
  return new FormGroup({
    variantId: new FormControl(variantId, { nonNullable: true }),
    quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    unitPrice: new FormControl<number | null>(listPrice, [Validators.required, Validators.min(0)]),
    estimatedUnitCost: new FormControl<number | null>(null),
    costStatus: new FormControl<CostStatus>('pending', { nonNullable: true }),
  });
}

/**
 * One product of the quick sale: its photo, how many (never past what is
 * free), the price of the ladder for that quantity, which can be changed, and
 * the cost the order line will carry. Price and cost are asked again only
 * when the quantity changes, not when the price is edited.
 */
@Component({
  selector: 'app-venta-rapida-linea',
  imports: [ReactiveFormsModule, Thumb, ...FORMAT_PIPES],
  template: `
    <div class="line" [formGroup]="group()">
      <pp-thumb size="lead" kind="product" [path]="item().imagePath" [name]="item().productName" />
      <div class="body">
        <div class="head">
          <span class="name">
            <strong>{{ item().productName }}</strong>
            <span class="muted">{{ item().variantName }}</span>
          </span>
          <button type="button" class="ghost" (click)="remove.emit()" [attr.aria-label]="'Quitar ' + label()">Quitar</button>
        </div>

        <div class="numbers">
          <div class="stepper" role="group" [attr.aria-label]="'Cantidad de ' + label()">
            <button type="button" class="secondary" (click)="step(-1)" [disabled]="quantity() <= 1" aria-label="Una menos">−</button>
            <input type="number" inputmode="numeric" min="1" [attr.max]="free()" step="1" formControlName="quantity" aria-label="Cantidad" />
            <button type="button" class="secondary" (click)="step(1)" [disabled]="quantity() >= free()" aria-label="Una más">+</button>
          </div>
          <label class="price">
            <span class="muted">S/</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="unitPrice" (input)="priceEdited = true" [attr.aria-label]="'Precio por unidad de ' + label()" />
            <span class="muted">c/u</span>
          </label>
          <strong class="subtotal num">{{ subtotal() | money }}</strong>
        </div>

        <div class="notes muted">
          @if (free() > 0) {
            <span>{{ freeText() }} en el estante</span>
          } @else {
            <span class="error">Ya no está libre en el estante: quítalo de la venta.</span>
          }
          @if (suggested() !== null && group().controls.unitPrice.value !== suggested()) {
            <span>
              Precio de lista para {{ quantity() }}: {{ suggested() | money }}
              <button type="button" class="inline-link" (click)="useSuggested()">Usar</button>
            </span>
          } @else if (priceFailed()) {
            <span>No pudimos leer la escalera de precios: revisa el precio.</span>
          }
          @switch (status()) {
            @case ('pending') { <span>Calculando el costo…</span> }
            @case ('failed') {
              <span class="error">
                No pudimos calcular el costo.
                <button type="button" class="inline-link" (click)="retry()">Reintentar</button>
              </span>
            }
            @default {
              @if (estimate() !== null) {
                <span>Costo estimado {{ estimate() | money }} c/u</span>
              } @else {
                <span class="warn-text">Sin costo estimado: la receta no tiene placas o no hay impresora registrada, así que Resultados la contará sin costo.</span>
              }
              @if (unpriced().length > 0) {
                <span class="warn-text">Es un mínimo: {{ unpriced().join(', ') }} sin costo registrado.</span>
              }
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .line { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.75rem 0; border-top: 1px solid var(--line); }
    .body { flex: 1; min-width: 0; display: grid; gap: 0.45rem; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
    .name { display: grid; min-width: 0; }
    .name .muted { font-size: var(--fs-sm); }
    .head button { min-height: var(--control-h-compact); padding-block: 0.15rem; }
    .numbers { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; }
    .stepper { display: inline-flex; align-items: center; gap: 0.25rem; }
    .stepper button { min-width: var(--control-h); padding-inline: 0; font-size: 1.1rem; }
    .stepper input { width: 3.75rem; text-align: center; }
    .price { display: inline-flex; align-items: center; gap: 0.3rem; }
    .price input { width: 5.75rem; }
    .subtotal { margin-left: auto; }
    .notes { display: flex; flex-wrap: wrap; gap: 0.15rem 0.75rem; font-size: var(--fs-xs); }
    .warn-text { color: var(--warn); }
  `,
})
export class VentaRapidaLinea implements OnInit {
  private readonly data = inject(PedidosData);
  private readonly estimator = inject(CostEstimator);
  private readonly destroyRef = inject(DestroyRef);

  readonly group = input.required<QuickLineForm>();
  readonly item = input.required<VariantInfo>();
  /** What the plan says is free now. Zero once somebody else took it. */
  readonly free = input.required<number>();
  readonly remove = output<void>();

  protected readonly quantity = signal(1);
  protected readonly status = signal<CostStatus>('pending');
  protected readonly suggested = signal<number | null>(null);
  protected readonly priceFailed = signal(false);
  protected readonly estimate = signal<number | null>(null);
  protected readonly unpriced = signal<string[]>([]);
  protected priceEdited = false;

  protected readonly label = computed(() => `${this.item().productName} ${this.item().variantName}`);
  protected readonly freeText = computed(() => freeUnits(this.free()));

  private lastQuantity = Number.NaN;
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.group()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onChange());
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
    this.onChange(0);
  }

  protected subtotal(): number {
    return lineTotal(this.group().getRawValue());
  }

  protected step(delta: number): void {
    const next = Math.min(this.free(), Math.max(1, (validQuantity(this.quantity()) ? this.quantity() : 0) + delta));
    this.group().controls.quantity.setValue(next);
  }

  protected useSuggested(): void {
    const price = this.suggested();
    if (price === null) return;
    this.priceEdited = false;
    this.group().controls.unitPrice.setValue(price);
  }

  protected retry(): void {
    this.lastQuantity = Number.NaN;
    this.onChange(0);
  }

  /** Only a new quantity asks again; typing a price, or the status written below, does not. */
  private onChange(delay = TYPING_DELAY_MS): void {
    const quantity = this.group().controls.quantity.value;
    this.quantity.set(quantity);
    if (Object.is(quantity, this.lastQuantity)) return;
    this.lastQuantity = quantity;

    clearTimeout(this.timer);
    this.sequence++;
    this.setStatus('pending');
    if (!validQuantity(quantity)) return;
    this.timer = setTimeout(() => void this.refresh(quantity), delay);
  }

  private async refresh(quantity: number): Promise<void> {
    const { variantId } = this.group().getRawValue();
    const request = ++this.sequence;

    const [price, cost] = await Promise.allSettled([
      this.data.suggestedPrice(variantId, quantity),
      this.estimator.forVariant(variantId, quantity),
    ]);
    if (request !== this.sequence) return;

    this.priceFailed.set(price.status === 'rejected');
    const suggested = price.status === 'fulfilled' ? price.value : null;
    this.suggested.set(suggested);
    if (!this.priceEdited && suggested !== null) this.group().controls.unitPrice.setValue(suggested);

    if (cost.status === 'rejected') {
      this.setStatus('failed');
      return;
    }
    this.estimate.set(cost.value?.perUnit ?? null);
    this.unpriced.set(cost.value?.unpricedSupplies ?? []);
    this.group().controls.estimatedUnitCost.setValue(cost.value?.perUnit ?? null, { emitEvent: false });
    this.setStatus('ready');
  }

  /** Written in the form too: the page reads it to know whether the sale can go. */
  private setStatus(status: CostStatus): void {
    this.status.set(status);
    this.group().controls.costStatus.setValue(status);
  }
}
