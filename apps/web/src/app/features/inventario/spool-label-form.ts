import { Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { blankToNull } from './form-helpers';
import { InventarioData, type SpoolSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { CurrentWorkspace } from '../../core/workspace';

const UNIQUE_VIOLATION = '23505';

/** Edits the physical identity of a spool: the label on the shelf and where it is. */
@Component({
  selector: 'app-spool-label-form',
  imports: [ReactiveFormsModule, Field],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form-grid">
        <pp-field label="Ubicación" hint="AMS 1, ranura 2, estante A…">
          <input formControlName="location" autocomplete="off" />
        </pp-field>
        <pp-field label="Código del rollo" hint="La etiqueta o QR pegada al carrete">
          <input formControlName="code" autocomplete="off" />
        </pp-field>
      </div>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  `,
  styles: [INVENTORY_STYLES],
})
export class SpoolLabelForm {
  private readonly data = inject(InventarioData);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly spool = input.required<SpoolSummary>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    location: ['', Validators.maxLength(60)],
    code: ['', Validators.maxLength(40)],
  });

  ngOnInit(): void {
    const { location, code } = this.spool();
    this.form.setValue({ location: location ?? '', code: code ?? '' });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;

    const { location, code } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.updateSpoolLabel(this.spool().id, blankToNull(code), blankToNull(location));
      this.saved.emit();
    } catch (error) {
      void this.workspace.afterRefusal(error);
      const duplicated = (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
      this.error.set(
        duplicated
          ? 'Ya hay otro rollo con ese código. Elige uno distinto.'
          : describeError(error, 'No pudimos guardar los cambios. Inténtalo de nuevo.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
