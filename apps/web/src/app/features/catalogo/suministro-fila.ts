import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { borrowedPhoto } from '../../core/article-photos';
import { FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { RecipeSupply, SupplyOption } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { emptyPickerText, messageOf } from './catalogo.util';
import { breaksItsRules, maxDecimals, wholeNumber } from '../../core/form-errors';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText } from './catalogo.validators';
import { CurrentWorkspace } from '../../core/workspace';
import { lockWhileReadOnly } from '../../core/read-only';

/**
 * What is wrong with a quantity per unit, in words, next to the field. The
 * button used to do nothing for a 0 or a -2 and say nothing (T2-12).
 */
const QUANTITY_MESSAGES: Record<'part' | 'supply', Record<string, string>> = {
  part: {
    required: 'Escribe cuántas lleva cada producto.',
    min: 'Cada producto lleva al menos 1.',
    integer: 'Las piezas van enteras: un producto no lleva media pieza.',
    max: `Hasta ${limitText(LIMITS.perUnit)} por producto.`,
  },
  supply: {
    required: 'Escribe cuánto lleva cada producto.',
    min: 'La cantidad tiene que ser mayor que cero.',
    decimals: `La cantidad va con ${decimalsText(DECIMALS.quantity)}.`,
    max: `Hasta ${limitText(LIMITS.perUnit)} por producto.`,
  },
};

const ITEM_MESSAGES: Record<'part' | 'supply', Record<string, string>> = {
  part: { required: 'Elige la pieza.' },
  supply: { required: 'Elige el insumo.' },
};

/** The smallest amount of a supply the column keeps: 0.001 g. */
const SMALLEST_SUPPLY = 0.001;

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
    @if (supply() || canOperate()) {
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label class="item">{{ isPart() ? 'Pieza' : 'Insumo' }}
        <pp-item-picker formControlName="itemId" [options]="pickerOptions()" [placeholder]="isPart() ? 'Elige la pieza…' : 'Elige un insumo…'" [emptyText]="emptyText()" />
      </label>
      <label>Cantidad por unidad{{ unit() ? ' (' + unit() + ')' : '' }}
        <input type="number" min="0.001" step="any" inputmode="decimal" formControlName="quantity" />
      </label>
      @if (canOperate()) {
        <div class="actions">
          <button type="submit" [disabled]="busy() || (supply() !== null && form.pristine)">
            {{ supply() ? 'Guardar' : 'Agregar' }}
          </button>
          @if (supply() && isOwner()) {
            <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" [attr.aria-label]="isPart() ? 'Quitar pieza' : 'Quitar insumo'">✕</button>
          }
        </div>
      }
      @if (formError(); as message) {
        <p class="note error">{{ message }}</p>
      }
      @if (inactive()) {
        <p class="note muted hint">
          {{ isPart() ? 'Está desactivada' : 'Está desactivado' }} en Inventario: no se ofrece en las recetas ni entra en el
          conteo del estante. Si la receta {{ isPart() ? 'la' : 'lo' }} sigue usando, vuelve a {{ isPart() ? 'activarla' : 'activarlo' }} ahí.
        </p>
      } @else if (selected(); as item) {
        @if (isPart() && madeHere().has(item.id)) {
          <p class="note muted hint">Sale de las placas de esta receta: su costo ya está en las corridas.</p>
        } @else if (!onlyInRow()) {
          <!-- An item not among the options yet has no known cost: better silent than «sin costo». -->
          <p class="note muted hint">
            @if (isPart() && !printedElsewhere().has(item.id)) {
              <!-- Nothing prints it: «la imprime otra receta» was said without checking (T2-07). -->
              @if (item.costPerUnit === null) {
                Ninguna placa la imprime: no suma al costo y el plan no sabe con qué placa hacerla. Agrégala a lo que
                sale de una placa de esta receta, o quítala si el producto ya no la lleva.
              } @else {
                Ninguna placa la imprime ahora: suma {{ item.costPerUnit | money:3 }} por unidad, lo que costó imprimirla
                antes, pero el plan no sabe con qué placa hacer más. Agrégala a lo que sale de una placa de esta receta.
              }
            } @else if (isPart()) {
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
    }
  `,
})
export class SuministroFila {
  private readonly data = inject(CatalogoData);
  private readonly workspace = inject(CurrentWorkspace);
  /** The day to day: owner and operator. A viewer is shown what there is, with nothing to change (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  /** Removing is the owner's: the database refuses everyone else (T2-10). */
  protected readonly isOwner = this.workspace.isOwner;

  readonly recipeId = input.required<string>();
  readonly supply = input<RecipeSupply | null>(null);
  /** Supplies that can still be added; for a saved row, the list also holds its own item. */
  readonly supplies = input.required<SupplyOption[]>();
  readonly usedIds = input<string[]>([]);
  /** 'part' for the printed parts of the recipe, 'supply' for what is bought. */
  readonly mode = input<'supply' | 'part'>('supply');
  /** The parts the recipe's own plates print, whose cost is already in the runs. */
  readonly madeHere = input<ReadonlySet<string>>(new Set());
  /** The parts that a plate of some other active recipe prints. */
  readonly printedElsewhere = input<ReadonlySet<string>>(new Set());
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
    const off = this.isPart() ? ' (desactivada)' : ' (desactivado)';
    const name = supply.item.active === false ? supply.item.name + off : supply.item.name;
    return [{ id: supply.inventoryItemId, costPerUnit: null, ...supply.item, name }, ...list];
  });

  /** The row's article was switched off in Inventory: it is still in the recipe, and says so (T2-13). */
  protected readonly inactive = computed(() => this.supply()?.item.active === false);

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
    quantity: new FormControl<number | null>(null, [Validators.required, (control) => this.quantityRule(control)]),
  });

  /** A part is counted, a supply weighed: the same field takes different numbers. */
  private quantityRule(control: AbstractControl): ValidationErrors | null {
    if (control.value === null || control.value === '') return null;
    const value = Number(control.value);
    const part = this.isPart();
    if (value < (part ? 1 : SMALLEST_SUPPLY)) return { min: true };
    const shape = part ? wholeNumber(control) : maxDecimals(DECIMALS.quantity)(control);
    if (shape) return shape;
    return value > LIMITS.perUnit ? { max: true } : null;
  }

  protected formError(): string | null {
    const mode = this.mode();
    return (
      fieldError(this.form.controls.itemId, ITEM_MESSAGES[mode]) ??
      fieldError(this.form.controls.quantity, QUANTITY_MESSAGES[mode])
    );
  }

  constructor() {
    lockWhileReadOnly(this.form, this.canOperate, () => {
      // The item of a saved row is fixed: to change it, remove the row and add another.
      if (this.supply()) this.form.controls.itemId.disable({ emitEvent: false });
    });
    effect(() => {
      const supply = this.supply();
      untracked(() => {
        if (!this.form.dirty) this.fill(supply);
      });
    });
    this.form.controls.itemId.valueChanges.subscribe((id) => this.chosenId.set(id));
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { itemId, quantity } = this.form.getRawValue();
    this.busy.set(true);
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
      void this.workspace.afterRefusal(error);
      // A refusal may come from a tab that is behind: read the recipe again.
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.supply();
    const fallback = this.isPart() ? 'esta pieza' : 'este insumo';
    if (!current || this.busy() || !confirm(`¿Quitar «${current.item.name || fallback}» de la receta?`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteSupply(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar el insumo.'));
      void this.workspace.afterRefusal(error);
    } finally {
      this.busy.set(false);
    }
    // Removed or refused, what the page shows may be old: read it again.
    this.changed.emit();
  }

  private fill(supply: RecipeSupply | null): void {
    this.chosenId.set(supply?.inventoryItemId ?? '');
    // A product almost always takes one of each part; a supply has no usual amount.
    const quantity = supply?.quantityPerUnit ?? (this.isPart() ? 1 : null);
    this.form.reset({ itemId: supply?.inventoryItemId ?? '', quantity });
    // The item of a saved row is fixed: to change it, remove the row and add another.
    if (supply) this.form.controls.itemId.disable({ emitEvent: false });
    // A part saved as 1.5 before pieces had to be whole: said at once, so it gets fixed.
    if (supply && breaksItsRules(this.form.controls.quantity)) this.form.controls.quantity.markAsTouched();
  }
}
