import { Component, computed, effect, ElementRef, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { inputToIso, nowForInput } from '../../core/dates';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { money } from '../../core/format';
import { roundMoney } from '../../core/pricing';
import { Badge, Card, Field, FORMAT_PIPES } from '../../ui';
import { beforeOpening, beforeOpeningNotice } from '../finanzas/opening-balance';
import { PaymentCategoryNote } from '../finanzas/payment-category-note';
import { PedidosData, type AccountOption, type NewPayment, type PaymentSummary } from './pedidos.data';
import { requestKey, type SentRequest } from './request-key';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  type PaymentMethod,
} from './pedidos.labels';

const NO_ACCOUNT = '';
const NO_METHOD = '';

/**
 * A payment dated after now would be in the balance today and open a month
 * that has not come yet in Resultados (T4-06). The database refuses it too,
 * with the same slack for a clock a little ahead.
 */
const FUTURE_SLACK_MS = 5 * 60_000;

export function notInTheFuture(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value) return null;
  return Date.parse(inputToIso(value)) > Date.now() + FUTURE_SLACK_MS ? { future: true } : null;
}

/** What was collected on a sale, and the form to collect the rest. */
@Component({
  selector: 'app-pedido-cobro',
  imports: [ReactiveFormsModule, Card, Badge, Field, PaymentCategoryNote, ...FORMAT_PIPES],
  template: `
    <pp-card heading="Cobro">
      <div class="row badge-row">
        <!-- «Sin cobrar» on a cancelled order read as money still owed: the list leaves it out too. -->
        @if (!cancelled() && !nothingToCollect()) {
          <pp-badge [tone]="statusTone[summary().paymentStatus]">{{ statusLabel[summary().paymentStatus] }}</pp-badge>
        }
        @if (summary().lastPaymentAt; as last) {
          <span class="muted">Último cobro: {{ last | fecha }}</span>
        }
      </div>

      <dl class="totals">
        <dt>Total</dt><dd class="num">{{ summary().total | money }}</dd>
        <dt>Cobrado</dt><dd class="num">{{ summary().paid | money }}</dd>
        <dt>Saldo pendiente</dt>
        @if (cancelled()) {
          <dd class="num muted">No aplica</dd>
        } @else {
          <dd class="num balance" [class.owed]="summary().balance > 0">{{ summary().balance | money }}</dd>
        }
      </dl>

      @if (notice(); as message) { <p class="notice" role="status">{{ message }}</p> }

      @if (cancelled()) {
        <p class="muted">Un pedido cancelado no admite cobros.</p>
      } @else if (nothingToCollect()) {
        <!-- «Sin cobrar» and «cobrado por completo» at once, on a sale of S/ 0 (T4-16). -->
        <p class="muted">Esta venta suma {{ 0 | money }}: no hay nada que cobrar.</p>
      } @else if (summary().balance <= 0) {
        <p class="muted">Este pedido está cobrado por completo.</p>
      } @else if (accountsError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else if (accountsLoading()) {
        <!-- Until they arrive there are none, and «no hay cuentas» flashed on every new order. -->
        <p class="muted">Cargando las cuentas…</p>
      } @else if (accounts().length === 0) {
        <p class="muted">No hay cuentas activas donde recibir el dinero.</p>
      } @else {
        <form class="form-box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <h3>Registrar un cobro</h3>
          <div class="grid two">
            <pp-field label="Cuenta" [required]="true" [error]="accountError()">
              <select formControlName="accountId">
                <option [value]="noAccount">Elige una cuenta…</option>
                @for (account of accounts(); track account.id) {
                  <option [value]="account.id">{{ account.name }}</option>
                }
              </select>
            </pp-field>
            <pp-field label="Monto (S/)" [required]="true" hint="Por defecto, el saldo pendiente." [error]="amountError()">
              <input type="number" min="0.01" step="0.01" formControlName="amount" inputmode="decimal" />
            </pp-field>
            <pp-field label="Fecha y hora" [required]="true" [error]="dateError()">
              <input type="datetime-local" formControlName="occurredAt" [max]="latest()" />
            </pp-field>
            @if (openingWarning(); as text) {
              <p class="alert alert-warn wide" role="status">{{ text }}</p>
            }
            <pp-field label="Medio de pago" [hint]="methodHint()">
              <select formControlName="method">
                <option [value]="noMethod">{{ defaultMethodOption() }}</option>
                @for (method of methods; track method) {
                  <option [value]="method">{{ methodLabel[method] }}</option>
                }
              </select>
            </pp-field>
          </div>
          <pp-field label="Referencia" hint="Opcional. El código de operación de Yape o del banco.">
            <input type="text" formControlName="reference" autocomplete="off" />
          </pp-field>
          <app-payment-category-note kind="order" />

          @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
          <div class="form-actions">
            <button type="submit" [disabled]="saving()">{{ saving() ? 'Registrando…' : 'Registrar cobro' }}</button>
          </div>
        </form>
      }
    </pp-card>
  `,
  styles: `
    :host { display: block; scroll-margin-top: 1rem; }
    .badge-row { margin-bottom: 0.75rem; font-size: 0.85rem; }
    .totals { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1.5rem; margin: 0 0 1rem; max-width: 22rem; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .balance { font-weight: 600; }
    .balance.owed { color: var(--warn); }
    .wide { grid-column: 1 / -1; margin: 0; }
    .notice { margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); background: var(--good-soft); color: var(--good); font-size: 0.85rem; }
    .form-box { padding: 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
    .form-box h3 { margin: 0 0 0.75rem; font-size: 0.95rem; }
    .form-actions { display: flex; gap: 0.5rem; }
  `,
})
export class PedidoCobro {
  private readonly data = inject(PedidosData);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly orderId = input.required<string>();
  readonly summary = input.required<PaymentSummary>();
  readonly cancelled = input(false);
  /** The money is recorded; the screen that owns the summary reloads it. */
  readonly collected = output<void>();
  /** The database refused: what the card shows may be out of date, and is read again. */
  readonly stale = output<void>();

  protected readonly statusLabel = PAYMENT_STATUS_LABEL;
  protected readonly statusTone = PAYMENT_STATUS_TONE;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;
  protected readonly noAccount = NO_ACCOUNT;
  protected readonly noMethod = NO_METHOD;

  protected readonly accounts = signal<AccountOption[]>([]);
  protected readonly accountsLoading = signal(true);
  protected readonly accountsError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** A sale of S/ 0 has nothing to collect: it is neither unpaid nor paid. */
  protected readonly nothingToCollect = computed(() => this.summary().total <= 0);

  /** The last payment sent and its key: sent again unchanged, it keeps the key. */
  private lastSent: SentRequest<NewPayment> | null = null;

  protected readonly form = new FormGroup({
    accountId: new FormControl(NO_ACCOUNT, { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      (control: AbstractControl<number | null>) => this.withinBalance(control),
    ]),
    occurredAt: new FormControl(nowForInput(), { nonNullable: true, validators: [Validators.required, notInTheFuture] }),
    method: new FormControl<PaymentMethod | typeof NO_METHOD>(NO_METHOD, { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
  });

  private readonly chosenAccountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: NO_ACCOUNT,
  });

  private readonly chosenAccount = computed(() =>
    this.accounts().find((account) => account.id === this.chosenAccountId()),
  );

  private readonly chosenOccurredAt = toSignal(this.form.controls.occurredAt.valueChanges, {
    initialValue: this.form.controls.occurredAt.value,
  });

  /**
   * The same warning Caja gives (E5-02): money collected before the account
   * opened is already inside its opening balance, so the database leaves it
   * out of the balance while it still pays the order.
   */
  protected readonly openingWarning = computed(() => {
    const account = this.chosenAccount();
    const when = this.chosenOccurredAt();
    if (!account || !when) return null;
    return beforeOpening(inputToIso(when), account.openingBalanceOn)
      ? beforeOpeningNotice(account, 'el cobro cuenta para el pedido')
      : null;
  });

  protected readonly defaultMethodOption = computed(() => {
    const method = this.chosenAccount()?.defaultMethod;
    return method ? `Usar el de la cuenta (${PAYMENT_METHOD_LABEL[method]})` : 'Usar el de la cuenta';
  });

  protected readonly methodHint = computed(() => {
    const account = this.chosenAccount();
    if (account && !account.defaultMethod) {
      return `${account.name} no tiene un medio por defecto: elígelo aquí.`;
    }
    return 'Puedes dejarlo en blanco: se usa el medio por defecto de la cuenta.';
  });

  constructor() {
    // The suggestion follows the balance, so the second part of a split
    // payment already proposes what is left.
    effect(() => {
      const balance = this.summary().balance;
      untracked(() => this.form.controls.amount.setValue(roundMoney(balance)));
    });
    void this.loadAccounts();
  }

  /**
   * Brings the card into view with the first field ready, for whoever arrives
   * from another part of the order (after handing it over, to collect).
   */
  focus(): void {
    const card = this.host.nativeElement;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.querySelector<HTMLElement>('form select, form input')?.focus({ preventScroll: true });
  }

  protected accountError(): string | null {
    return errorOf(this.form.controls.accountId, { required: 'Elige la cuenta donde entró el dinero.' });
  }

  protected amountError(): string | null {
    return errorOf(this.form.controls.amount, {
      required: 'Indica cuánto se cobró.',
      min: 'El monto tiene que ser mayor que cero.',
      beyondBalance: `No puede pasar del saldo pendiente, ${money(this.summary().balance)}.`,
    });
  }

  protected dateError(): string | null {
    return errorOf(this.form.controls.occurredAt, {
      required: 'Indica cuándo se cobró.',
      future: 'El cobro no puede tener fecha futura: anótalo con la fecha en que entró el dinero.',
    });
  }

  /** The latest moment the date picker offers: now, in Lima. */
  protected latest(): string {
    return nowForInput();
  }

  private withinBalance(control: AbstractControl<number | null>): ValidationErrors | null {
    const amount = control.value;
    // Empty while the form is built, before the summary arrives: nothing to compare yet.
    if (amount == null) return null;
    return roundMoney(amount) > roundMoney(this.summary().balance) ? { beyondBalance: true } : null;
  }

  protected async submit(): Promise<void> {
    // First, before anything else: a second click arrives before the button
    // is drawn disabled, and it must not send the payment again (T4-01).
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.error.set(null);
    this.notice.set(null);
    if (this.form.invalid) return;

    const { accountId, amount, occurredAt, method, reference } = this.form.getRawValue();
    const payment: NewPayment = {
      orderId: this.orderId(),
      accountId,
      amount: roundMoney(amount ?? 0),
      method: method === NO_METHOD ? null : method,
      occurredAt: inputToIso(occurredAt),
      reference: textOrNull(reference),
    };
    // The same payment sent again keeps its key, and the database records it once.
    this.lastSent = requestKey(this.lastSent, payment);
    this.saving.set(true);
    try {
      await this.data.recordPayment(payment, this.lastSent.key);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos registrar el cobro. Inténtalo de nuevo.'));
      // Somebody else may have collected or voided meanwhile: read it again.
      this.stale.emit();
      return;
    } finally {
      this.saving.set(false);
    }

    this.lastSent = null;
    this.notice.set('Cobro registrado.');
    this.form.patchValue({ reference: '', occurredAt: nowForInput() });
    this.form.controls.reference.markAsUntouched();
    this.collected.emit();
  }

  private async loadAccounts(): Promise<void> {
    try {
      this.accounts.set(await this.data.paymentAccounts());
    } catch (error) {
      this.accountsError.set(friendlyError(error, 'No pudimos leer las cuentas. Recarga la pantalla.'));
    } finally {
      this.accountsLoading.set(false);
    }
  }
}
