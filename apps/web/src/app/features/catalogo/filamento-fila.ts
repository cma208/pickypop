import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogoData } from './catalogo.data';
import type { Lookups, RecipeFilament } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { maxDecimals, wholeNumber } from '../../core/form-errors';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText } from './catalogo.validators';
import { CurrentWorkspace } from '../../core/workspace';
import { lockWhileReadOnly } from '../../core/read-only';

const DEFAULT_COLOR = '#808080';

const SLOT_MESSAGES: Record<string, string> = {
  required: 'Ranura: escribe su número.',
  min: 'Ranura: desde 1.',
  integer: 'Ranura: un número entero.',
  max: `Ranura: hasta ${LIMITS.slot}.`,
};

const GRAMS_MESSAGES: Record<string, string> = {
  required: 'Gramos: escribe los de una corrida; si no usa nada, pon 0.',
  min: 'Gramos: no pueden ser negativos.',
  max: `Gramos: hasta ${limitText(LIMITS.grams)} por corrida.`,
  decimals: `Gramos: ${decimalsText(DECIMALS.grams)}.`,
};

/** One filament of a plate: a saved row to edit, or an empty row to add. */
@Component({
  selector: 'app-filamento-fila',
  imports: [ReactiveFormsModule],
  styles: [
    SHARED_STYLES,
    `
      form { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr) 3.2rem minmax(0, 1.2fr) 6rem auto; gap: 0.4rem; align-items: end; padding: 0.5rem 0; border-top: 1px solid var(--line); }
      label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      input[type='color'] { padding: 0.1rem; height: 2.1rem; }
      .actions { display: flex; gap: 0.25rem; }
      .err { grid-column: 1 / -1; margin: 0; font-size: 0.8rem; }
      @media (max-width: 40rem) {
        form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        label.sku, .actions { grid-column: 1 / -1; }
      }
    `,
  ],
  template: `
    @if (filament() || canOperate()) {
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label>Ranura
        <input type="number" min="1" step="1" inputmode="numeric" formControlName="slot" />
      </label>
      <label>Material
        <select formControlName="materialId">
          <option value="">Sin material</option>
          @for (material of lookups().materials; track material.id) {
            <option [value]="material.id">{{ material.code }}</option>
          }
        </select>
      </label>
      <label>Color
        <input type="color" formControlName="colorHex" />
      </label>
      <label class="sku">SKU asignado
        <select formControlName="skuId">
          <option value="">Sin asignar</option>
          @for (sku of skuOptions(); track sku.id) {
            <option [value]="sku.id">{{ sku.label }}{{ sku.active ? '' : ' (inactivo)' }}</option>
          }
        </select>
      </label>
      <label>Gramos por corrida
        <input type="number" min="0" step="0.01" inputmode="decimal" formControlName="grams" />
      </label>
      @if (canOperate()) {
        <div class="actions">
          <button type="submit" [disabled]="busy() || (filament() !== null && form.pristine)"
            [attr.aria-label]="filament() ? 'Guardar filamento' : 'Agregar filamento'">
            {{ filament() ? 'Guardar' : 'Agregar' }}
          </button>
          @if (filament() && isOwner()) {
            <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar filamento">✕</button>
          }
        </div>
      }
      @if (formError(); as message) {
        <p class="err error">{{ message }}</p>
      }
      @if (error(); as message) {
        <p class="err error" role="alert">{{ message }}</p>
      }
    </form>
    }
  `,
})
export class FilamentoFila {
  private readonly data = inject(CatalogoData);
  private readonly workspace = inject(CurrentWorkspace);
  /** The day to day: owner and operator. A viewer is shown what there is, with nothing to change (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  /** Removing is the owner's: the database refuses everyone else (T2-10). */
  protected readonly isOwner = this.workspace.isOwner;

  readonly plateId = input.required<string>();
  readonly filament = input<RecipeFilament | null>(null);
  readonly lookups = input.required<Lookups>();
  /** Suggested slot for a new row. */
  readonly nextSlot = input(1);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    slot: new FormControl<number | null>(1, [Validators.required, Validators.min(1), wholeNumber, Validators.max(LIMITS.slot)]),
    materialId: new FormControl('', { nonNullable: true }),
    colorHex: new FormControl(DEFAULT_COLOR, { nonNullable: true }),
    skuId: new FormControl('', { nonNullable: true }),
    grams: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(LIMITS.grams),
      maxDecimals(DECIMALS.grams),
    ]),
  });

  protected formError(): string | null {
    const { slot, grams } = this.form.controls;
    return fieldError(slot, SLOT_MESSAGES) ?? fieldError(grams, GRAMS_MESSAGES);
  }

  private readonly materialId = signal('');
  private filling = false;

  /** SKUs of the chosen material, or all of them while none is chosen. */
  protected readonly skuOptions = computed(() => {
    const material = this.materialId();
    return this.lookups().skus.filter((sku) => !material || sku.materialId === material);
  });

  constructor() {
    lockWhileReadOnly(this.form, this.canOperate);
    effect(() => {
      const filament = this.filament();
      const next = this.nextSlot();
      untracked(() => {
        if (!this.form.dirty) this.fill(filament, next);
      });
    });

    this.form.controls.materialId.valueChanges.subscribe((id) => {
      this.materialId.set(id);
      if (this.filling) return;
      const sku = this.lookups().skus.find((candidate) => candidate.id === this.form.controls.skuId.value);
      if (sku && id && sku.materialId !== id) this.form.controls.skuId.setValue('');
    });

    // Picking a spool product fills in what it already knows.
    this.form.controls.skuId.valueChanges.subscribe((id) => {
      const sku = this.lookups().skus.find((candidate) => candidate.id === id);
      if (!sku || this.filling) return;
      this.form.patchValue({ materialId: sku.materialId, ...(sku.colorHex ? { colorHex: sku.colorHex.toLowerCase() } : {}) });
    });
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const input = {
      slot: Number(value.slot),
      materialId: value.materialId || null,
      colorHex: value.colorHex,
      skuId: value.skuId || null,
      grams: Number(value.grams),
    };

    this.busy.set(true);
    try {
      const current = this.filament();
      if (current) {
        await this.data.updateFilament(current.id, input);
      } else {
        await this.data.addFilament(this.plateId(), input);
      }
      this.form.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar el filamento.'));
      void this.workspace.afterRefusal(error);
      // A refusal may come from a tab that is behind: read the recipe again.
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.filament();
    if (!current || this.busy() || !confirm(`¿Quitar el filamento de la ranura ${current.slot}?`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteFilament(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar el filamento.'));
      void this.workspace.afterRefusal(error);
    } finally {
      this.busy.set(false);
    }
    // Removed or refused, what the page shows may be old: read it again.
    this.changed.emit();
  }

  private fill(filament: RecipeFilament | null, nextSlot: number): void {
    this.filling = true;
    this.materialId.set(filament?.materialId ?? '');
    this.form.reset({
      slot: filament?.slot ?? nextSlot,
      materialId: filament?.materialId ?? '',
      colorHex: filament?.colorHex?.toLowerCase() ?? DEFAULT_COLOR,
      skuId: filament?.skuId ?? '',
      grams: filament?.grams ?? null,
    });
    this.filling = false;
  }
}
