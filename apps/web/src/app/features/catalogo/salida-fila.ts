import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { borrowedPhoto } from '../../core/article-photos';
import { ItemPicker, type PickerOption } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { PlateOutput } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { wholeNumber } from '../../core/form-errors';
import { fieldError, LIMITS, limitText } from './catalogo.validators';
import { removeOutputQuestion, swapOutputQuestion } from './plate-removal';
import { CurrentWorkspace } from '../../core/workspace';
import { lockWhileReadOnly } from '../../core/read-only';

export interface PartOption {
  id: string;
  name: string;
  unit: string;
  imagePath: string | null;
}

const PART_MESSAGES: Record<string, string> = { required: 'Elige la pieza.' };

const UNITS_MESSAGES: Record<string, string> = {
  required: 'Escribe cuántas salen por corrida.',
  min: 'Por corrida sale al menos 1.',
  integer: 'Las piezas salen enteras: escribe un número sin decimales.',
  max: `Hasta ${limitText(LIMITS.perRun)} por corrida.`,
};

/** What the row of a switched-off part says, so nobody takes it for an empty row to delete (T2-13). */
export const INACTIVE_PART_NOTE =
  'Está desactivada en Inventario › Piezas impresas: no se ofrece en las recetas ni entra en el conteo del estante. ' +
  'Si esta placa la sigue imprimiendo, vuelve a activarla ahí.';

/**
 * One part that comes out of a plate: a saved row to edit, or an empty row to
 * add. A plate can make several different parts at once (seven caps and seven
 * bodies), so this is a list and not a single field.
 */
@Component({
  selector: 'app-salida-fila',
  imports: [ReactiveFormsModule, ItemPicker],
  styles: [
    SHARED_STYLES,
    `
      form { display: grid; grid-template-columns: minmax(0, 1fr) 7rem auto; gap: 0.4rem; align-items: end; padding: 0.5rem 0; border-top: 1px solid var(--line); }
      label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .actions { display: flex; gap: 0.25rem; }
      .err { grid-column: 1 / -1; margin: 0; font-size: 0.8rem; }
      @media (max-width: 40rem) {
        form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        label.part, .actions { grid-column: 1 / -1; }
      }
    `,
  ],
  template: `
    @if (current() || canOperate()) {
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label class="part">Pieza
        <pp-item-picker
          placeholder="Elige la pieza…"
          [options]="options()"
          [value]="form.controls.inventoryItemId.value"
          [disabled]="!canOperate()"
          (chosen)="choose($event)"
        />
      </label>
      <label>Por corrida
        <input type="number" min="1" step="1" inputmode="numeric" formControlName="unitsPerRun" />
      </label>
      @if (canOperate()) {
        <div class="actions">
          <button type="submit" [disabled]="busy() || (current() !== null && form.pristine)"
            [attr.aria-label]="current() ? 'Guardar pieza' : 'Agregar pieza'">
            {{ current() ? 'Guardar' : 'Agregar' }}
          </button>
          @if (current() && isOwner()) {
            <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar pieza">✕</button>
          }
        </div>
      }
      @if (inactive()) {
        <p class="err muted hint">{{ inactiveNote }}</p>
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
export class SalidaFila {
  private readonly data = inject(CatalogoData);
  private readonly workspace = inject(CurrentWorkspace);
  /** The day to day: owner and operator. A viewer is shown what there is, with nothing to change (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  /** Removing is the owner's: the database refuses everyone else (T2-10). */
  protected readonly isOwner = this.workspace.isOwner;
  protected readonly inactiveNote = INACTIVE_PART_NOTE;

  readonly plateId = input.required<string>();
  readonly current = input<PlateOutput | null>(null);
  readonly parts = input.required<PartOption[]>();
  /** Parts this plate already makes, so the empty row does not offer them twice. */
  readonly usedIds = input<string[]>([]);
  /** Position for a new row. */
  readonly nextPosition = input(1);
  /** No other output of the recipe prints this row's part: removing it or changing it leaves the part with no plate. */
  readonly soleSource = input(false);
  /**
   * The recipe lists this row's part per unit. A plate may print a part for
   * another product that this recipe does not take: losing the row then only
   * stops it coming out of the runs.
   */
  readonly asked = input(true);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    inventoryItemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    unitsPerRun: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      wholeNumber,
      Validators.max(LIMITS.perRun),
    ]),
  });

  /** The saved part is switched off: the page's options only hold active ones. */
  protected readonly inactive = computed(() => this.current()?.part?.active === false);

  protected readonly options = computed<PickerOption[]>(() => {
    const current = this.current();
    const mine = current?.inventoryItemId;
    const taken = new Set(this.usedIds().filter((id) => id !== mine));
    const options: PickerOption[] = this.parts()
      .filter((part) => !taken.has(part.id))
      .map((part) => ({
        value: part.id,
        label: part.name,
        imagePath: part.imagePath,
        // A part with no photo of its own shows the plate that prints it.
        photo: borrowedPhoto(part.id, 'part'),
        kind: 'part' as const,
      }));
    // The row's own part, when the options do not have it (switched off, or
    // created after the page read them): with its name and photo, never as
    // «Elige la pieza…», which read as an empty row to delete (T2-13).
    if (current && !options.some((option) => option.value === current.inventoryItemId)) {
      const part = current.part;
      options.unshift({
        value: current.inventoryItemId,
        label: part ? (part.active ? part.name : `${part.name} (desactivada)`) : 'Pieza',
        hint: part && !part.active ? 'Desactivada en Inventario' : undefined,
        imagePath: part?.imagePath ?? null,
        photo: borrowedPhoto(current.inventoryItemId, 'part'),
        kind: 'part' as const,
      });
    }
    return options;
  });

  protected formError(): string | null {
    const { inventoryItemId, unitsPerRun } = this.form.controls;
    return fieldError(inventoryItemId, PART_MESSAGES) ?? fieldError(unitsPerRun, UNITS_MESSAGES);
  }

  constructor() {
    lockWhileReadOnly(this.form, this.canOperate);
    effect(() => {
      const output = this.current();
      untracked(() => {
        if (!this.form.dirty) {
          this.form.reset({ inventoryItemId: output?.inventoryItemId ?? '', unitsPerRun: output?.unitsPerRun ?? null });
          // Saved before pieces had to be whole: said at once, so it gets fixed.
          if (this.form.controls.unitsPerRun.invalid && output) this.form.controls.unitsPerRun.markAsTouched();
        }
      });
    });
  }

  protected choose(id: string): void {
    this.form.controls.inventoryItemId.setValue(id);
    this.form.controls.inventoryItemId.markAsDirty();
    this.form.controls.inventoryItemId.markAsTouched();
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const input = { inventoryItemId: value.inventoryItemId, unitsPerRun: Number(value.unitsPerRun) };
    const saved = this.current();
    if (saved && this.soleSource() && saved.inventoryItemId !== input.inventoryItemId) {
      const newName = this.parts().find((part) => part.id === input.inventoryItemId)?.name ?? 'otra pieza';
      const who = { asked: this.asked(), owner: this.isOwner() };
      if (!confirm(swapOutputQuestion(this.partName(saved), newName, who))) return;
    }

    this.busy.set(true);
    try {
      const current = this.current();
      if (current) {
        await this.data.updatePlateOutput(current.id, input);
      } else {
        await this.data.addPlateOutput(this.plateId(), this.nextPosition(), input);
        this.form.reset({ inventoryItemId: '', unitsPerRun: null });
      }
      this.form.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la pieza de la placa.'));
      void this.workspace.afterRefusal(error);
      // A refusal may come from a tab that is behind: read the recipe again.
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.current();
    if (!current || this.busy()) return;
    // The only plate that prints the part: say what that does before (T2-07).
    if (this.soleSource() && !confirm(removeOutputQuestion(this.partName(current), this.asked()))) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deletePlateOutput(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar la pieza de la placa.'));
      void this.workspace.afterRefusal(error);
    } finally {
      this.busy.set(false);
    }
    // Removed or refused, what the page shows may be old: read it again.
    this.changed.emit();
  }

  private partName(output: PlateOutput): string {
    return output.part?.name ?? this.parts().find((part) => part.id === output.inventoryItemId)?.name ?? 'esta pieza';
  }
}
