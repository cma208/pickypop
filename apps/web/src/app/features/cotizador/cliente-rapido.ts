import { Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { errorOf, textOrNull } from '../../core/form-errors';
import { Field } from '../../ui';
import { CotizadorData, DataError, type CustomerOption } from './cotizador.data';

/**
 * A customer created without leaving the quote: name and phone, the same two
 * things «Nuevo pedido» asks for. The rest (document, e-mail) is filled in
 * Clientes when it is needed for an invoice.
 */
@Component({
  selector: 'app-cliente-rapido',
  imports: [ReactiveFormsModule, Field],
  template: `
    <div class="quick" [formGroup]="form">
      <p class="title">Nuevo cliente</p>
      <div class="grid two">
        <pp-field label="Nombre del cliente" [required]="true" [error]="nameError()">
          <input type="text" formControlName="name" autocomplete="off" />
        </pp-field>
        <pp-field label="Teléfono" hint="Opcional">
          <input type="tel" formControlName="phone" autocomplete="off" />
        </pp-field>
      </div>
      @if (failed(); as message) { <p class="error" role="alert">{{ message }}</p> }
      <div class="row">
        <button type="button" (click)="create()" [disabled]="busy()">{{ busy() ? 'Creando…' : 'Crear y elegir' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()" [disabled]="busy()">Cancelar</button>
      </div>
    </div>
  `,
  styles: `
    .quick { padding: 0.9rem; border: 1px dashed var(--line); border-radius: var(--radius); }
    .title { margin: 0 0 0.6rem; font-weight: 600; font-size: 0.9rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .error { margin: 0 0 0.6rem; }
  `,
})
export class ClienteRapido {
  private readonly data = inject(CotizadorData);

  /** The customer exists now: the screen chooses it. */
  readonly created = output<CustomerOption>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly failed = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    phone: new FormControl('', { nonNullable: true }),
  });

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, {
      required: 'Escribe el nombre del cliente.',
      maxlength: 'El nombre es demasiado largo.',
    });
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    this.failed.set(null);
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    try {
      const { name, phone } = this.form.getRawValue();
      this.created.emit(await this.data.createCustomer(name.trim(), textOrNull(phone)));
      this.form.reset();
    } catch (cause) {
      this.failed.set(cause instanceof DataError ? cause.message : 'No pudimos crear el cliente. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}
