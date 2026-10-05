import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { RecipeSupply, SupplyOption } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';

/** One per-unit supply of the recipe (66 g of sweets, 1 bag), or the row that adds one. */
@Component({
  selector: 'app-suministro-fila',
  imports: [ReactiveFormsModule, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; gap: 0.5rem; align-items: end; padding: 0.5rem 0; border-top: 1px solid var(--line); }
      label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .actions { display: flex; gap: 0.25rem; }
      .note { grid-column: 1 / -1; margin: 0; }
      @media (max-width: 40rem) { form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } label.item, .actions { grid-column: 1 / -1; } }
    `,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label class="item">Insumo
        <select formControlName="itemId">
          @if (!supply()) { <option value="">Elige un insumo…</option> }
          @for (item of options(); track item.id) {
            <option [value]="item.id">{{ item.name }} ({{ item.unit }})</option>
          }
        </select>
      </label>
      <label>Cantidad por unidad{{ unit() ? ' (' + unit() + ')' : '' }}
        <input type="number" min="0.001" step="any" inputmode="decimal" formControlName="quantity" />
      </label>
      <div class="actions">
        <button type="submit" [disabled]="busy() || (supply() !== null && form.pristine)">
          {{ supply() ? 'Guardar' : 'Agregar' }}
        </button>
        @if (supply()) {
          <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar insumo">✕</button>
        }
      </div>
      @if (selected(); as item) {
        <p class="note muted hint">
          @if (item.costPerUnit === null) {
            Sin costo registrado: no se ha comprado este insumo. Se puede probar un costo provisional en el cálculo.
          } @else {
            Costo registrado: {{ item.costPerUnit | money:3 }} por {{ item.unit }}.
          }
        </p>
      }
      @if (error(); as message) {
        <p class="note error" role="alert">{{ message }}</p>
      }
    </form>
  `,
})
export class SuministroFila {
  private readonly data = inject(CatalogoData);

  readonly recipeId = input.required<string>();
  readonly supply = input<RecipeSupply | null>(null);
  /** Supplies that can still be added; for a saved row, the list also holds its own item. */
  readonly supplies = input.required<SupplyOption[]>();
  readonly usedIds = input<string[]>([]);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly chosenId = signal('');

  protected readonly options = computed(() => {
    const own = this.supply()?.inventoryItemId;
    return this.supplies().filter((item) => item.id === own || !this.usedIds().includes(item.id));
  });

  protected readonly selected = computed(() => this.supplies().find((item) => item.id === this.chosenId()) ?? null);
  protected readonly unit = computed(() => this.selected()?.unit ?? '');

  protected readonly form = new FormGroup({
    itemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl<number | null>(null, [Validators.required, Validators.min(0.001)]),
  });

  constructor() {
    effect(() => {
      const supply = this.supply();
      untracked(() => {
        if (!this.form.dirty) this.fill(supply);
      });
    });
    this.form.controls.itemId.valueChanges.subscribe((id) => this.chosenId.set(id));
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const { itemId, quantity } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      const current = this.supply();
      if (current) {
        await this.data.updateSupply(current.id, Number(quantity));
      } else {
        await this.data.addSupply(this.recipeId(), itemId, Number(quantity));
      }
      this.form.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar el insumo.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.supply();
    if (!current || !confirm(`¿Quitar "${this.selected()?.name ?? 'este insumo'}" de la receta?`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteSupply(current.id);
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar el insumo.'));
    } finally {
      this.busy.set(false);
    }
  }

  private fill(supply: RecipeSupply | null): void {
    this.chosenId.set(supply?.inventoryItemId ?? '');
    this.form.reset({ itemId: supply?.inventoryItemId ?? '', quantity: supply?.quantityPerUnit ?? null });
    // The item of a saved row is fixed: to change it, remove the row and add another.
    if (supply) this.form.controls.itemId.disable({ emitEvent: false });
  }
}
