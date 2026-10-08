import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { inputToIso, nowForInput } from '../../core/dates';
import { textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { roundMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { Field, FORMAT_PIPES } from '../../ui';
import { refusedByDatabase } from '../pedidos/pedidos.errors';
import { requestKey, type SentRequest } from '../pedidos/request-key';
import { FinanzasData, isRefusal, type AccountSummary, type PaymentInput, type ReceivableRow } from './finanzas.data';
import {
  collectionCategoriesFor,
  MAX_LEDGER_AMOUNT,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type CategoryOption,
  type PaymentMethod,
} from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { beforeOpening, beforeOpeningNotice } from './opening-balance';
import { FUTURE_DATE_PROBLEM, isInTheFuture, TOO_LARGE_PROBLEM } from './transaction-draft';

/**
 * Collects money against an order. The amount, the overpayment check and the
 * order's payment status are all decided by `record_payment`, so this form
 * only gathers what it needs and repeats what the function answers.
 */
@Component({
  selector: 'app-payment-form',
  imports: [ReactiveFormsModule, Field, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES],
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h3>Cobrar el pedido {{ receivable().number }}</h3>

      <p class="muted">
        {{ receivable().customerName ?? 'Sin cliente' }} · total {{ receivable().total | money }} ·
        ya cobrado {{ receivable().paid | money }} ·
        <strong>pendiente {{ receivable().balance | money }}</strong>
      </p>

      <div class="grid two">
        <pp-field label="Cuenta donde entra el dinero" [required]="true">
          <select formControlName="accountId">
            <option value="">Elige una cuenta</option>
            @for (account of accounts(); track account.id) {
              <option [value]="account.id">{{ account.name }}</option>
            }
          </select>
        </pp-field>

        <pp-field label="Medio de pago" [hint]="methodHint()">
          <select formControlName="paymentMethod">
            <option value="">{{ defaultMethodLabel() }}</option>
            @for (method of methods; track method) {
              <option [value]="method">{{ methodLabels[method] }}</option>
            }
          </select>
        </pp-field>

        <pp-field label="Monto" [required]="true">
          <input type="number" step="0.01" min="0" [attr.max]="maxAmount" inputmode="decimal" formControlName="amount" />
        </pp-field>

        <pp-field label="Fecha y hora" [required]="true">
          <input type="datetime-local" [attr.max]="latest" formControlName="occurredAt" />
        </pp-field>

        <pp-field label="Categoría" hint="Si no eliges, se usa la de Configuración › Categorías de dinero.">
          <select formControlName="categoryId">
            <option value="">{{ defaultCategoryName() ? 'Por defecto: ' + defaultCategoryName() : 'Sin categoría' }}</option>
            @for (category of categories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </pp-field>

        <pp-field label="Referencia" hint="Código de operación de Yape, voucher…">
          <input formControlName="reference" autocomplete="off" />
        </pp-field>
      </div>

      <pp-field label="Nota" hint="Si la dejas vacía queda «Cobro del pedido {{ receivable().number }}»">
        <input formControlName="note" autocomplete="off" />
      </pp-field>

      <section aria-live="polite">
        @if (problem(); as text) {
          <p class="alert alert-warn">{{ text }}</p>
        } @else if (remaining() !== null && remaining()! < 0) {
          <p class="alert alert-warn">
            Es más de lo que debe este pedido: quedan pendientes
            {{ receivable().balance | money }}. Si lo intentas, la base lo va a rechazar.
          </p>
        } @else if (remaining() !== null) {
          <p class="notice">
            Después de este cobro quedará pendiente <strong>{{ remaining() | money }}</strong>.
          </p>
        }
        @if (openingNotice(); as text) {
          <p class="alert alert-warn">{{ text }}</p>
        }
      </section>

      @if (failure(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="saving() || !!problem()">
          {{ saving() ? 'Registrando…' : 'Registrar cobro' }}
        </button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class PaymentForm {
  private readonly data = inject(FinanzasData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly receivable = input.required<ReceivableRow>();
  readonly allAccounts = input.required<AccountSummary[]>();
  readonly allCategories = input.required<CategoryOption[]>();
  readonly saved = output<string>();
  /** The database said no, in these words: what the list showed may be out of date. */
  readonly refused = output<string>();
  readonly cancelled = output<void>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly maxAmount = MAX_LEDGER_AMOUNT;
  /** The picker stops at now: a collection is recorded once the money came in. */
  protected readonly latest = nowForInput();

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** What the database files the collection under when none is chosen. */
  protected readonly defaultCategoryName = signal<string | null>(null);

  /**
   * The last collection sent and its key (`record_payment`'s `p_key`). Sent
   * again unchanged, after a double click or a lost answer, it keeps the key
   * and the database records it once; anything changed is another collection.
   */
  private lastSent: SentRequest<PaymentInput> | null = null;
  /** The amount is being moved to the debt read again, not by the person: the refusal stays on screen. */
  private following = false;

  protected readonly form = this.fb.group({
    accountId: [''],
    paymentMethod: ['' as PaymentMethod | ''],
    amount: new FormControl<number | null>(null),
    occurredAt: [nowForInput()],
    categoryId: [''],
    reference: [''],
    note: [''],
  });

  private readonly changes = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly values = computed(() => {
    this.changes();
    return this.form.getRawValue();
  });

  protected readonly accounts = computed(() => this.allAccounts().filter((account) => account.active));
  /** Capital is the owner's money, and a collection is a sale: those are not offered (T5-06). */
  protected readonly categories = computed(() => collectionCategoriesFor(this.allCategories()));

  private readonly chosenAccount = computed(() =>
    this.accounts().find((account) => account.id === this.values().accountId),
  );

  /** What the order owes, as a number: the form follows it only when it changes, not on every reload. */
  private readonly balance = computed(() => this.receivable().balance);

  protected readonly defaultMethodLabel = computed(() => {
    const method = this.chosenAccount()?.defaultPaymentMethod;
    return method ? `El de la cuenta (${this.methodLabels[method]})` : 'El que tenga la cuenta por defecto';
  });

  protected readonly methodHint = computed(() =>
    this.chosenAccount() && !this.chosenAccount()?.defaultPaymentMethod
      ? 'Esta cuenta no tiene medio por defecto: elige uno.'
      : 'Puedes dejarlo así y se usa el de la cuenta.',
  );

  protected readonly problem = computed(() => {
    const { accountId, amount, occurredAt } = this.values();
    if (!accountId) return 'Elige la cuenta donde entra el dinero.';
    // Read again after a refusal, the chosen account may have been deactivated meanwhile.
    if (!this.chosenAccount()) return 'La cuenta elegida ya no recibe cobros (se desactivó): elige otra.';
    if (amount === null || !Number.isFinite(amount)) return 'Indica el monto del cobro.';
    if (roundMoney(amount) <= 0) return 'El monto tiene que ser mayor que cero.';
    if (roundMoney(amount) > MAX_LEDGER_AMOUNT) return TOO_LARGE_PROBLEM;
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return 'Indica la fecha y la hora del cobro.';
    if (isInTheFuture(inputToIso(occurredAt))) return FUTURE_DATE_PROBLEM;
    return null;
  });

  /** A collection dated before the account opened pays the order but leaves the balance alone (E5-02). */
  protected readonly openingNotice = computed(() => {
    const account = this.chosenAccount();
    const { occurredAt } = this.values();
    if (!account || this.problem()) return null;
    return beforeOpening(inputToIso(occurredAt), account.openingBalanceOn)
      ? beforeOpeningNotice(account, 'el cobro cuenta para el pedido')
      : null;
  });

  /**
   * What would be left owing. The pending amount on screen is a snapshot, so
   * an overcollection is not blocked here: the function holds the order and
   * answers with the real figures, which is the only answer worth showing.
   */
  protected readonly remaining = computed(() => {
    const { amount } = this.values();
    if (this.problem() || amount === null) return null;
    return roundMoney(this.receivable().balance - roundMoney(amount));
  });

  constructor() {
    // Only a label for the empty option: without it the form works the same.
    void this.data
      .paymentCategories()
      .then((categories) => this.defaultCategoryName.set(categories.order?.name ?? null))
      .catch(() => undefined);

    // The suggestion follows the debt, so the form already proposes what is
    // left to collect without anyone typing it. Read again after a refusal
    // (another tab collected part of it), it proposes what is left now. Only
    // while the person has not typed an amount: putting the whole debt over
    // the 5 they received would change the collection, and its key, without
    // them noticing.
    effect(() => {
      const balance = this.balance();
      untracked(() => {
        const amount = this.form.controls.amount;
        if (amount.dirty) return;
        this.following = true;
        amount.setValue(balance);
        this.following = false;
      });
    });

    // The last error goes away when the person corrects what it was about.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.following) this.failure.set(null);
    });
  }

  protected async submit(): Promise<void> {
    // First, before any await: a second click arrives before the button is
    // drawn disabled, and it must not send the collection again.
    if (this.saving() || this.problem()) return;

    const value = this.values();
    const payment: PaymentInput = {
      orderId: this.receivable().orderId,
      accountId: value.accountId,
      amount: roundMoney(value.amount ?? 0),
      paymentMethod: value.paymentMethod === '' ? null : value.paymentMethod,
      occurredAt: inputToIso(value.occurredAt),
      categoryId: textOrNull(value.categoryId),
      reference: textOrNull(value.reference),
      note: textOrNull(value.note),
    };
    // Taken before sending and kept for the whole send: a change typed
    // meanwhile is the next collection, not this one.
    this.lastSent = requestKey(this.lastSent, payment);
    const { key } = this.lastSent;
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.recordPayment(payment, key);
    } catch (error) {
      // Saving stays on while it asks: a click meanwhile must not send it again.
      if (!(await this.recordedAnyway(error, key))) {
        this.failed(error);
        return;
      }
    } finally {
      this.saving.set(false);
    }

    this.lastSent = null;
    this.saved.emit(`Cobro registrado en el pedido ${this.receivable().number}.`);
  }

  /**
   * A refusal says nothing was saved. A lost answer does not: the collection
   * may be in the book already, and its key says so.
   */
  private async recordedAnyway(error: unknown, key: string): Promise<boolean> {
    if (refusedByDatabase(error)) return false;
    return this.data.entryRecorded(key).catch(() => false);
  }

  private failed(error: unknown): void {
    // `record_payment` writes its refusals in Spanish and with the amounts
    // in them; friendlyError passes those through untouched.
    const message = refusedByDatabase(error)
      ? friendlyError(error, 'No pudimos registrar el cobro. Inténtalo de nuevo.')
      : `${friendlyError(error, 'No pudimos registrar el cobro.')} Vuelve a tocar «Registrar cobro» sin cambiar nada: si llegó a guardarse, no se cobra dos veces.`;
    this.failure.set(message);
    if (isRefusal(error)) this.refused.emit(message);
  }
}
