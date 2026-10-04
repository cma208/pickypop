import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { errorOf, textOrNull } from '../configuracion/shared/form-errors';
import { friendlyError } from '../configuracion/shared/friendly-error';
import { SECTION_STYLES } from '../configuracion/shared/styles';
import { ClientesData } from './clientes.data';
import {
  DOC_FORMAT_HINTS,
  DOC_TYPE_LABELS,
  KIND_LABELS,
  documentValidator,
  type CustomerKind,
  type CustomerRecord,
  type DocType,
} from './clientes.models';

/** Create or edit a customer, validating the document the way the database does. */
@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ customer() ? 'Editar cliente' : 'Nuevo cliente' }}</h3>

      <div class="grid two">
        <pp-field label="Tipo de cliente" [required]="true">
          <select formControlName="kind">
            @for (kind of kinds; track kind) {
              <option [value]="kind">{{ kindLabels[kind] }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Nombre o razón social" [required]="true" [error]="nameError()">
          <input formControlName="name" autocomplete="off" />
        </pp-field>
        <pp-field label="Tipo de documento">
          <select formControlName="docType">
            @for (type of docTypes; track type) {
              <option [value]="type">{{ docLabels[type] }}</option>
            }
          </select>
        </pp-field>
        <pp-field
          label="Número de documento"
          [hint]="docError() ? '' : docHint()"
          [error]="docError()"
          [required]="docType() !== 'none'"
        >
          <input
            formControlName="docNumber"
            inputmode="numeric"
            autocomplete="off"
            [attr.maxlength]="docType() === 'ce' ? 12 : 11"
          />
        </pp-field>
        <pp-field label="Teléfono">
          <input formControlName="phone" type="tel" autocomplete="off" />
        </pp-field>
        <pp-field label="Correo" [error]="emailError()">
          <input formControlName="email" type="email" autocomplete="off" />
        </pp-field>
      </div>

      <pp-field label="Notas">
        <textarea rows="3" formControlName="note"></textarea>
      </pp-field>

      <label class="check">
        <input type="checkbox" formControlName="active" /> Cliente activo
      </label>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cliente' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class CustomerForm {
  private readonly data = inject(ClientesData);

  readonly customer = input<CustomerRecord | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly kinds = Object.keys(KIND_LABELS) as CustomerKind[];
  protected readonly docTypes = Object.keys(DOC_TYPE_LABELS) as DocType[];
  protected readonly kindLabels = KIND_LABELS;
  protected readonly docLabels = DOC_TYPE_LABELS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      kind: new FormControl<CustomerKind>('person', { nonNullable: true }),
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      docType: new FormControl<DocType>('none', { nonNullable: true }),
      docNumber: new FormControl('', { nonNullable: true }),
      phone: new FormControl('', { nonNullable: true }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
      note: new FormControl('', { nonNullable: true }),
      active: new FormControl(true, { nonNullable: true }),
    },
    { validators: [documentValidator] },
  );

  protected readonly docType = toSignal(this.form.controls.docType.valueChanges, { initialValue: 'none' as DocType });
  protected readonly docHint = computed(() => DOC_FORMAT_HINTS[this.docType()]);

  ngOnInit(): void {
    const customer = this.customer();
    if (!customer) return;

    this.form.setValue({
      kind: customer.kind,
      name: customer.name,
      docType: customer.docType,
      docNumber: customer.docNumber ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      note: customer.note ?? '',
      active: customer.active,
    });
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre del cliente.' });
  }

  protected emailError(): string | null {
    return errorOf(this.form.controls.email, { email: 'El correo no parece válido. Ej.: nombre@correo.com' });
  }

  /** Shown once the document number was touched, or on a failed submit. */
  protected docError(): string | null {
    const control = this.form.controls.docNumber;
    const message = this.form.errors?.['document'] as string | undefined;
    return message && (control.touched || control.dirty) ? message : null;
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.save(this.customer()?.id ?? null, {
        kind: value.kind,
        name: value.name,
        docType: value.docType,
        docNumber: textOrNull(value.docNumber),
        phone: textOrNull(value.phone),
        email: textOrNull(value.email),
        note: textOrNull(value.note),
        active: value.active,
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el cliente. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
