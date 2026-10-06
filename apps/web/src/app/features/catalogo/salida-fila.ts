import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ItemPicker, type PickerOption } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { PlateOutput } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';

export interface PartOption {
  id: string;
  name: string;
  unit: string;
  imagePath: string | null;
}

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
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <label class="part">Pieza
        <pp-item-picker
          placeholder="Elige la pieza…"
          [options]="options()"
          [value]="form.controls.inventoryItemId.value"
          (chosen)="choose($event)"
        />
      </label>
      <label>Por corrida
        <input type="number" min="1" step="1" inputmode="numeric" formControlName="unitsPerRun" />
      </label>
      <div class="actions">
        <button type="submit" [disabled]="busy() || (current() !== null && form.pristine)"
          [attr.aria-label]="current() ? 'Guardar pieza' : 'Agregar pieza'">
          {{ current() ? 'Guardar' : 'Agregar' }}
        </button>
        @if (current()) {
          <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar pieza">✕</button>
        }
      </div>
      @if (form.touched && form.invalid) {
        <p class="err error">Elige la pieza y cuántas salen por corrida.</p>
      }
      @if (error(); as message) {
        <p class="err error" role="alert">{{ message }}</p>
      }
    </form>
  `,
})
export class SalidaFila {
  private readonly data = inject(CatalogoData);

  readonly plateId = input.required<string>();
  readonly current = input<PlateOutput | null>(null);
  readonly parts = input.required<PartOption[]>();
  /** Parts this plate already makes, so the empty row does not offer them twice. */
  readonly usedIds = input<string[]>([]);
  /** Position for a new row. */
  readonly nextPosition = input(1);
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    inventoryItemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    unitsPerRun: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  protected readonly options = computed<PickerOption[]>(() => {
    const mine = this.current()?.inventoryItemId;
    const taken = new Set(this.usedIds().filter((id) => id !== mine));
    return this.parts()
      .filter((part) => !taken.has(part.id))
      .map((part) => ({ value: part.id, label: part.name, imagePath: part.imagePath }));
  });

  constructor() {
    effect(() => {
      const output = this.current();
      untracked(() => {
        if (!this.form.dirty) {
          this.form.reset({ inventoryItemId: output?.inventoryItemId ?? '', unitsPerRun: output?.unitsPerRun ?? null });
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
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    const input = { inventoryItemId: value.inventoryItemId, unitsPerRun: Number(value.unitsPerRun) };

    this.busy.set(true);
    this.error.set(null);
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
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.current();
    if (!current || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deletePlateOutput(current.id);
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar la pieza de la placa.'));
    } finally {
      this.busy.set(false);
    }
  }
}
