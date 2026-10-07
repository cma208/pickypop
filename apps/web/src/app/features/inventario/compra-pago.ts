import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { inputToIso, nowForInput } from '../../core/dates';
import { errorOf } from '../../core/form-errors';
import { roundMoney } from '../../core/pricing';
import { Field, FORMAT_PIPES } from '../../ui';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '../finanzas/finanzas.models';
import { PaymentCategoryNote } from '../finanzas/payment-category-note';
import { InventarioData, type PaymentAccount, type PurchaseSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';

const NO_ACCOUNT = '';
const NO_METHOD = '';

/**
 * Pays what is still owed on a purchase: the one bought on credit, the one paid
 * in two parts, and every purchase registered before a purchase could be paid
 * at all.
 */
@Component({
  selector: 'app-compra-pago',
  imports: [ReactiveFormsModule, Field, PaymentCategoryNote, ...FORMAT_PIPES],
  styles: [
    INVENTORY_STYLES,
    `
      :host { display: block; }
      .box { padding: 0.9rem 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
      h4 { margin: 0 0 0.6rem; font-size: 0.9rem; }
    `,
  ],
  template: `
    <form class="box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h4>Registrar el pago · falta {{ purchase().pending | money }}</h4>
      @if (accounts().length === 0) {
        <p class="muted">No hay cuentas activas desde donde pagar. Crea una en Finanzas › Cuentas.</p>
      } @else {
        <div class="form-grid">
          <pp-field label="Desde qué cuenta" [required]="true" [error]="accountError()">
            <select formControlName="accountId">
              <option [value]="noAccount" disabled>Elige una cuenta…</option>
              @for (account of accounts(); track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
            </select>
          </pp-field>
          <pp-field label="Monto (S/)" [required]="true" hint="Por defecto, lo que falta." [error]="amountError()">
            <input type="number" min="0.01" step="0.01" formControlName="amount" inputmode="decimal" />
          </pp-field>
          <pp-field label="Fecha y hora" [required]="true">
            <input type="datetime-local" formControlName="occurredAt" />
          </pp-field>
          <pp-field label="Medio de pago">
            <select formControlName="method">
              <option [value]="noMethod">{{ defaultMethodOption() }}</option>
              @for (method of methods; track method) {
                <option [value]="method">{{ methodLabel[method] }}</option>
              }
            </select>
          </pp-field>
        </div>
        <app-payment-category-note kind="purchase" />
        @if (error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }
        <div class="form-actions">
          <button type="submit" [disabled]="saving()">{{ saving() ? 'Registrando…' : 'Registrar pago' }}</button>
        </div>
      }
    </form>
  `,
})
export class CompraPago {
  private readonly data = inject(InventarioData);

  readonly purchase = input.required<PurchaseSummary>();
  readonly accounts = input.required<PaymentAccount[]>();
  /** The money is recorded; the list that owns the purchase reloads it. */
  readonly paid = output<void>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABELS;
  protected readonly noAccount = NO_ACCOUNT;
  protected readonly noMethod = NO_METHOD;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    accountId: new FormControl(NO_ACCOUNT, { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    occurredAt: new FormControl(nowForInput(), { nonNullable: true, validators: [Validators.required] }),
    method: new FormControl<PaymentMethod | typeof NO_METHOD>(NO_METHOD, { nonNullable: true }),
  });

  private readonly chosenAccountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: NO_ACCOUNT,
  });

  protected readonly defaultMethodOption = computed(() => {
    const method = this.accounts().find((account) => account.id === this.chosenAccountId())?.defaultMethod;
    return method ? `El de la cuenta (${PAYMENT_METHOD_LABELS[method]})` : 'El de la cuenta';
  });

  constructor() {
    // The suggestion follows what is owed, so a second partial payment already
    // proposes the rest.
    effect(() => {
      const pending = this.purchase().pending;
      untracked(() => this.form.controls.amount.setValue(roundMoney(pending)));
    });
  }

  protected accountError(): string | null {
    return errorOf(this.form.controls.accountId, { required: 'Elige desde qué cuenta salió el dinero.' });
  }

  protected amountError(): string | null {
    return errorOf(this.form.controls.amount, {
      required: 'Indica cuánto pagaste.',
      min: 'El monto tiene que ser mayor que cero.',
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.error.set(null);
    if (this.form.invalid) return;

    const { accountId, amount, occurredAt, method } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.data.recordPurchasePayment({
        purchaseId: this.purchase().id,
        accountId,
        amount: amount ?? 0,
        method: method === NO_METHOD ? null : method,
        occurredAt: inputToIso(occurredAt),
      });
      this.paid.emit();
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos registrar el pago. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
