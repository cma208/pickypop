import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { todayLocal } from '../../core/dates';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Field } from '../../ui';
import { FinanzasData, type AccountSummary } from './finanzas.data';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type AccountKind,
  type PaymentMethod,
} from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';

const MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
};

/** Create or edit a place where the workshop's money sits. */
@Component({
  selector: 'app-account-form',
  imports: [ReactiveFormsModule, Field],
  styles: [SECTION_STYLES, FINANCE_STYLES],
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h3>{{ account() ? 'Editar cuenta' : 'Nueva cuenta' }}</h3>

      <div class="grid two">
        <pp-field label="Nombre" [required]="true" [error]="error('name')">
          <input formControlName="name" autocomplete="off" placeholder="Caja chica, Yape, BCP…" />
        </pp-field>
        <pp-field label="Tipo" [required]="true">
          <select formControlName="kind">
            @for (kind of kinds; track kind) {
              <option [value]="kind">{{ kindLabels[kind] }}</option>
            }
          </select>
        </pp-field>
        <pp-field
          label="Saldo de apertura"
          hint="Lo que ya había en la cuenta el día que la registras aquí"
          [error]="error('openingBalance')"
        >
          <input type="number" step="0.01" inputmode="decimal" formControlName="openingBalance" />
        </pp-field>
        <pp-field label="Fecha del saldo de apertura" [required]="true" [error]="error('openingBalanceOn')">
          <input type="date" formControlName="openingBalanceOn" />
        </pp-field>
        <pp-field
          label="Medio de pago por defecto"
          hint="Con esto el cobro de un pedido no vuelve a preguntarlo"
        >
          <select formControlName="defaultPaymentMethod">
            <option value="">Sin medio por defecto</option>
            @for (method of methods; track method) {
              <option [value]="method">{{ methodLabels[method] }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Nota">
          <input formControlName="note" autocomplete="off" />
        </pp-field>
      </div>

      <label class="check">
        <input type="checkbox" formControlName="active" /> Cuenta activa
      </label>

      @if (failure(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cuenta' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class AccountForm {
  private readonly data = inject(FinanzasData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly account = input<AccountSummary | null>(null);
  readonly saved = output<string>();
  readonly cancelled = output<void>();

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    kind: ['cash' as AccountKind],
    openingBalance: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required] }),
    openingBalanceOn: [todayLocal(), Validators.required],
    defaultPaymentMethod: ['' as PaymentMethod | ''],
    note: [''],
    active: [true],
  });

  // Signal inputs are only set after construction, so the form is filled here.
  ngOnInit(): void {
    const account = this.account();
    if (account) {
      this.form.setValue({
        name: account.name,
        kind: account.kind,
        openingBalance: account.openingBalance,
        openingBalanceOn: account.openingBalanceOn,
        defaultPaymentMethod: account.defaultPaymentMethod ?? '',
        note: account.note ?? '',
        active: account.active,
      });
    }
  }

  protected error(control: keyof typeof this.form.controls): string | null {
    return errorOf(this.form.controls[control], MESSAGES);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.saveAccount(this.account()?.id ?? null, {
        name: value.name,
        kind: value.kind,
        openingBalance: Number(value.openingBalance),
        openingBalanceOn: value.openingBalanceOn,
        defaultPaymentMethod: value.defaultPaymentMethod === '' ? null : value.defaultPaymentMethod,
        note: textOrNull(value.note),
        active: value.active,
      });
      this.saved.emit(this.account() ? 'Cuenta actualizada.' : 'Cuenta creada.');
    } catch (error) {
      this.failure.set(friendlyError(error, 'No pudimos guardar la cuenta. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
