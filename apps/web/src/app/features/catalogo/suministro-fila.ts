import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { borrowedPhoto } from '../../core/article-photos';
import { FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { RecipeSupply, SupplyOption } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { emptyPickerText, messageOf } from './catalogo.util';

/**
 * One per-unit component of the recipe (66 g of sweets, 1 bag, 1 printed
 * front), or the row that adds one. Printed parts are listed apart from
 * supplies because they are not bought: the plates that print them carry
 * their cost.
 */
@Component({
  selector: 'app-suministro-fila',
  imports: [ReactiveFormsModule, ItemPicker, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; gap: 0.5rem; align-items: end; padding: 0.5rem 0; border-top: 1px solid var(--line); }
      label { display: grid; gap: 0.15rem; font-size: var(--fs-xs); color: var(--muted); }
      label pp-item-picker, label input { font-size: var(--fs-md); color: var(--text); }
      .actions { display: flex; gap: 0.25rem; }
      .note { grid-column: 1 / -1; margin: 0; }
      @media (max-width: 40rem) { form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } label.item, .actions { grid-column: 1 / -1; } }
    `,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label class="item">{{ isPart() ? 'Pieza' : 'Insumo' }}
        <pp-item-picker formControlName="itemId" [options]="pickerOptions()" [placeholder]="isPart() ? 'Elige la pieza…' : 'Elige un insumo…'" [emptyText]="emptyText()" />
      </label>
      <label>Cantidad por unidad{{ unit() ? ' (' + unit() + ')' : '' }}
        <input type="number" min="0.001" step="any" inputmode="decimal" formControlName="quantity" />
      </label>
      <div class="actions">
        <button type="submit" [disabled]="busy() || (supply() !== null && form.pristine)">
          {{ supply() ? 'Guardar' : 'Agregar' }}
        </button>
        @if (supply()) {
          <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" [attr.aria-label]="isPart() ? 'Quitar pieza' : 'Quitar insumo'">✕</button>
        }
      </div>
      @if (selected(); as item) {
        @if (isPart() && madeHere().has(item.id)) {
          <p class="note muted hint">Sale de las placas de esta receta: su costo ya está en las corridas.</p>
        } @else if (!onlyInRow()) {
          <!-- An item not among the options yet has no known cost: better silent than «sin costo». -->
          <p class="note muted hint">
            @if (isPart()) {
              @if (item.costPerUnit === null) {
                La imprime otra receta y todavía no se cerró ninguna impresión suya: no suma al costo.
              } @else {
                La imprime otra receta: cuesta {{ item.costPerUnit | money:3 }} por unidad, lo que costó imprimirla.
              }
            } @else if (item.costPerUnit === null) {
              Sin costo registrado: no se ha comprado este insumo. Se puede probar un costo provisional en el cálculo.
            } @else {
              Costo registrado: {{ item.costPerUnit | money:3 }} por {{ item.unit }}.
            }
          </p>
        }
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
  /** 'part' for the printed parts of the recipe, 'supply' for what is bought. */
  readonly mode = input<'supply' | 'part'>('supply');
  /** The parts the recipe's own plates print, whose cost is already in the runs. */
  readonly madeHere = input<ReadonlySet<string>>(new Set());
  readonly changed = output<void>();

  protected readonly isPart = computed(() => this.mode() === 'part');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly chosenId = signal('');

  /**
   * The options, plus the row's own item when they do not have it yet. A
   * saved row always says what it holds: drawn as «Elige un insumo…», a part
   * an import had just created looked like an empty row to delete (E2-01).
   */
  private readonly known = computed<SupplyOption[]>(() => {
    const supply = this.supply();
    const list = this.supplies();
    if (!supply || !this.onlyInRow()) return list;
    return [{ id: supply.inventoryItemId, costPerUnit: null, ...supply.item }, ...list];
  });

  /** The saved row's item is not among the options yet, so its cost is not known here. */
  protected readonly onlyInRow = computed(() => {
    const supply = this.supply();
    return supply !== null && !this.supplies().some((item) => item.id === supply.inventoryItemId);
  });

  protected readonly options = computed(() => {
    const own = this.supply()?.inventoryItemId;
    return this.known().filter((item) => item.id === own || !this.usedIds().includes(item.id));
  });

  protected readonly emptyText = computed(() => emptyPickerText(this.mode(), this.supplies().length));

  /** The same options, with the photo that tells two bags apart. */
  protected readonly pickerOptions = computed<PickerOption[]>(() =>
    this.options().map((item) => ({
      value: item.id,
      label: item.name,
      hint: item.unit,
      imagePath: item.imagePath,
      // A part with no photo of its own shows the plate that prints it.
      photo: borrowedPhoto(item.id, item.kind),
      kind: item.kind ?? 'supply',
    })),
  );

  protected readonly selected = computed(() => this.known().find((item) => item.id === this.chosenId()) ?? null);
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
        this.form.markAsPristine();
      } else {
        await this.data.addSupply(this.recipeId(), itemId, Number(quantity));
        // The adding row starts empty again: keeping the last quantity is how
        // 2 g of sweets got into a recipe that wanted 50.
        this.fill(null);
      }
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar el insumo.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.supply();
    const fallback = this.isPart() ? 'esta pieza' : 'este insumo';
    if (!current || !confirm(`¿Quitar "${this.selected()?.name ?? fallback}" de la receta?`)) return;

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
    // A product almost always takes one of each part; a supply has no usual amount.
    const quantity = supply?.quantityPerUnit ?? (this.isPart() ? 1 : null);
    this.form.reset({ itemId: supply?.inventoryItemId ?? '', quantity });
    // The item of a saved row is fixed: to change it, remove the row and add another.
    if (supply) this.form.controls.itemId.disable({ emitEvent: false });
  }
}
