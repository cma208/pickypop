import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Badge, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { VariantCostModel } from './variant-cost.model';

/** Quantity discounts of a variant, each with the margin it leaves after costs. */
@Component({
  selector: 'app-escalera-precios',
  imports: [ReactiveFormsModule, Card, Badge, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      table { min-width: 28rem; }
      .low td:first-child { box-shadow: inset 3px 0 0 var(--danger); }
      form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 0.5rem; align-items: end; margin-top: 1rem; }
      label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .alert { margin-top: 0.75rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); background: var(--danger-soft); color: var(--danger); font-size: 0.85rem; }
      .alert ul { margin: 0.3rem 0 0; padding-left: 1.1rem; }
      .alert p { margin: 0; }
      @media (max-width: 30rem) { form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } form button { grid-column: 1 / -1; } }
    `,
  ],
  template: `
    <pp-card heading="Escalera de precios">
      <p class="muted hint">
        Precio por unidad según la cantidad pedida: rige el escalón más alto cuyo mínimo se alcanza.
        El costo por unidad baja con el lote, por eso el margen cambia en cada escalón.
      </p>
      @if (ladder().length === 0) {
        <p class="muted">Sin precios todavía. Define el precio de lista de la variante o agrega un escalón.</p>
      } @else {
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Cantidad</th>
                <th class="num">Precio unit.</th>
                <th class="num">Costo unit.</th>
                <th class="num">Margen</th>
                <th class="num">Precio para el objetivo</th>
                <th aria-label="Quitar"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of ladder(); track row.key) {
                <tr [class.low]="row.belowTarget">
                  <td>{{ row.tierId === null ? 'Lista (' + row.quantity + ' u.)' : 'Desde ' + row.quantity + (row.quantity === 1 ? ' unidad' : ' unidades') }}</td>
                  <td class="num">{{ row.unitPrice | money }}</td>
                  <td class="num">{{ row.costPerUnit | money }}</td>
                  <td class="num">
                    @if (row.margin !== null) {
                      <pp-badge [tone]="row.belowTarget ? 'bad' : 'good'">{{ row.margin | percent1 }}</pp-badge>
                    } @else {
                      —
                    }
                  </td>
                  <td class="num">{{ row.targetPrice | money }}</td>
                  <td>
                    @if (row.tierId; as id) {
                      <button type="button" class="ghost" [disabled]="busy()" (click)="remove(id, row.quantity)"
                        [attr.aria-label]="'Quitar el escalón desde ' + row.quantity + ' unidades'">✕</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (cost.blocker(); as reason) {
        <p class="muted hint">Para ver costo y margen: {{ reason }}</p>
      } @else if (lowRows().length > 0) {
        <div class="alert" role="alert">
          <p>
            <strong>Margen por debajo del objetivo ({{ cost.profile()!.targetMargin | percent1 }}):</strong>
          </p>
          <ul>
            @for (row of lowRows(); track row.key) {
              <li>
                {{ row.tierId === null ? 'Precio de lista' : 'Escalón desde ' + row.quantity + ' u.' }}: a {{ row.quantity }} u. el costo es {{ row.costPerUnit | money }} por unidad y deja {{ row.margin | percent1 }}.
                Para llegar al objetivo el precio tendría que ser de {{ row.targetPrice | money }} o más.
              </li>
            }
          </ul>
        </div>
      } @else if (ladder().length > 0) {
        <p class="ok" role="status">Todos los precios alcanzan el margen objetivo de {{ cost.profile()!.targetMargin | percent1 }}.</p>
      }

      <form [formGroup]="form" (ngSubmit)="add()" novalidate>
        <label>Desde (unidades)
          <input type="number" min="1" step="1" inputmode="numeric" formControlName="minQuantity" />
        </label>
        <label>Precio unitario (S/)
          <input type="number" min="0" step="0.01" inputmode="decimal" formControlName="unitPrice" />
        </label>
        <button type="submit" [disabled]="busy()">Agregar escalón</button>
      </form>
      @if (form.touched && form.invalid) {
        <p class="error hint">Indica una cantidad entera desde 1 y un precio que no sea negativo.</p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </pp-card>
  `,
})
export class EscaleraPrecios {
  private readonly data = inject(CatalogoData);
  protected readonly cost = inject(VariantCostModel);

  readonly variantId = input.required<string>();
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly ladder = this.cost.ladder;
  protected readonly lowRows = computed(() => this.ladder().filter((row) => row.belowTarget));

  protected readonly form = new FormGroup({
    minQuantity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]),
    unitPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
  });

  protected async add(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const { minQuantity, unitPrice } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.addTier(this.variantId(), Number(minQuantity), Number(unitPrice));
      this.form.reset();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos agregar el escalón.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(id: string, quantity: number): Promise<void> {
    if (!confirm(`¿Quitar el escalón desde ${quantity} unidades?`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteTier(id);
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar el escalón.'));
    } finally {
      this.busy.set(false);
    }
  }
}
