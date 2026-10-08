import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { inputToIso, nowForInput, todayLocal } from '../../core/dates';
import { errorOf, maxDecimals, notInFuture } from '../../core/form-errors';
import { roundMoney } from '../../core/pricing';
import { Field, FORMAT_PIPES } from '../../ui';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '../finanzas/finanzas.models';
import { beforeOpening, beforeOpeningNotice } from '../finanzas/opening-balance';
import { PaymentCategoryNote } from '../finanzas/payment-category-note';
import { InventarioData, type PaymentAccount, type PurchaseSummary } from './inventario.data';
import { describeError, noAnswerReason, outcomeUnknown } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { noAccountsText } from './accounts-hint';
import { notBefore, purchaseDateFloor } from './purchase-dates';

const NO_ACCOUNT = '';
const NO_METHOD = '';
const MIN_PAYMENT = 0.01;
const MONEY_DECIMALS = 2;
const MONEY = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      /* Only there to lock what it holds: the grid keeps the form's spacing. */
      fieldset.contents { display: contents; }
    `,
  ],
  template: `
    <form class="box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h4>Registrar el pago · falta {{ purchase().pending | money }}</h4>
      @if (accounts().length === 0) {
        <p class="muted">{{ noAccounts() }}</p>
      } @else {
        <!-- Locked while it is on its way and while nobody knows whether it went in: see locked. -->
        <fieldset class="contents" [disabled]="locked()">
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
          <pp-field label="Fecha y hora" [required]="true" [error]="momentError()">
            <input type="datetime-local" formControlName="occurredAt" [min]="oldestMoment" [max]="latestMoment" />
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
        </fieldset>
        <app-payment-category-note kind="purchase" />
        @if (openingNotice(); as text) {
          <p class="alert-warn">{{ text }}</p>
        }
        @if (uncertain(); as reason) {
          <p class="alert" role="alert">
            <strong>No sabemos si el pago se registró.</strong> {{ reason }} Vuelve a pulsar «Registrar pago»: si ya
            había entrado, no se registra dos veces. Mientras tanto el pago no se puede cambiar, porque cambiado sería
            otro. Para empezar otro, pulsa «Ocultar» y vuelve a abrir el detalle.
          </p>
        } @else if (error(); as message) {
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
  /** Only the owner creates accounts: the operator is told whom to ask. */
  readonly isOwner = input(false);
  /** The money is recorded; the list that owns the purchase reloads it. */
  readonly paid = output<void>();
  /**
   * It did not go through, or nobody knows: the purchase may have been paid
   * from another tab, or this very payment may have gone in before the answer
   * was lost. The list reloads behind the message, without touching the
   * amount that was typed or the key it was asked with.
   */
  readonly refused = output<void>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABELS;
  protected readonly noAccount = NO_ACCOUNT;
  protected readonly noMethod = NO_METHOD;
  protected readonly oldestMoment = `${purchaseDateFloor(todayLocal())}T00:00`;
  protected readonly latestMoment = nowForInput();
  protected readonly noAccounts = computed(() => noAccountsText(this.isOwner()));
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Why there is no answer, when the payment may have gone in anyway. Cleared by the answer to a retry. */
  protected readonly uncertain = signal<string | null>(null);
  /**
   * The form says what was sent until the answer settles it. Edited while
   * «Registrando…», it would get a new key, and the retry a lost answer asks
   * for would pay twice.
   */
  protected readonly locked = computed(() => this.saving() || this.uncertain() !== null);

  protected readonly form = new FormGroup({
    accountId: new FormControl(NO_ACCOUNT, { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(MIN_PAYMENT),
      maxDecimals(MONEY_DECIMALS),
    ]),
    occurredAt: new FormControl(nowForInput(), {
      nonNullable: true,
      validators: [Validators.required, notInFuture, notBefore(purchaseDateFloor(todayLocal()))],
    }),
    method: new FormControl<PaymentMethod | typeof NO_METHOD>(NO_METHOD, { nonNullable: true }),
  });

  /**
   * Names this payment for the database, which writes it once however many
   * times it arrives: a double click, or an answer lost on the way back
   * (T1-01). A change the person makes to the form is another payment, with a
   * key of its own; the suggestion following what is owed is not (see below).
   */
  private paymentKey = crypto.randomUUID();

  /** True while the screen, not the person, writes the suggested amount. */
  private suggesting = false;

  /**
   * What is owed, as a number: the list hands over a new purchase object on
   * every reload, and only a different amount owed should move the suggestion.
   */
  private readonly pending = computed(() => roundMoney(this.purchase().pending));

  private readonly chosenAccountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: NO_ACCOUNT,
  });

  private readonly chosenMoment = toSignal(this.form.controls.occurredAt.valueChanges, {
    initialValue: this.form.controls.occurredAt.value,
  });

  private readonly chosenAmount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });

  /** A payment dated before the account opened settles the purchase but leaves the balance alone (E5-02). */
  protected readonly openingNotice = computed(() => {
    const account = this.accounts().find((candidate) => candidate.id === this.chosenAccountId());
    const moment = this.chosenMoment();
    if (!account || !moment || Number.isNaN(Date.parse(moment))) return null;
    return beforeOpening(inputToIso(moment), account.openingBalanceOn)
      ? beforeOpeningNotice(account, 'el pago cuenta para la compra')
      : null;
  });

  protected readonly defaultMethodOption = computed(() => {
    const method = this.accounts().find((account) => account.id === this.chosenAccountId())?.defaultMethod;
    return method ? `El de la cuenta (${PAYMENT_METHOD_LABELS[method]})` : 'El de la cuenta';
  });

  /** More than is owed is refused by the database too; said here, it is said before the click. */
  private readonly overPending = computed(() => {
    const amount = this.chosenAmount();
    return typeof amount === 'number' && amount > this.pending();
  });

  constructor() {
    // The suggestion follows what is owed, so a second partial payment already
    // proposes the rest. Only while the person has not typed an amount: the
    // list reloads after a refusal, and a reload that put the whole debt where
    // somebody typed 10 turned the retry into paying everything.
    effect(() => {
      const pending = this.pending();
      untracked(() => this.suggest(pending));
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      // A retry after a lost answer has to go with the same key, or the
      // database cannot tell it is the same payment and writes it twice.
      // Neither is a change that slips in while it is locked.
      if (!this.suggesting && !this.locked()) this.paymentKey = crypto.randomUUID();
    });
  }

  private suggest(pending: number): void {
    const amount = this.form.controls.amount;
    if (amount.dirty || this.locked()) return;
    this.suggesting = true;
    try {
      amount.setValue(pending);
    } finally {
      this.suggesting = false;
    }
  }

  protected accountError(): string | null {
    return errorOf(this.form.controls.accountId, { required: 'Elige desde qué cuenta salió el dinero.' });
  }

  protected amountError(): string | null {
    const control = this.form.controls.amount;
    if (this.overPending() && (control.touched || control.dirty)) {
      return `No puede pasar de lo que falta: S/ ${MONEY.format(this.purchase().pending)}.`;
    }
    return errorOf(control, {
      required: 'Indica cuánto pagaste.',
      min: 'El monto mínimo es S/ 0.01.',
      decimals: 'El monto va en céntimos: hasta 2 decimales.',
    });
  }

  protected momentError(): string | null {
    return errorOf(this.form.controls.occurredAt, {
      required: 'Indica cuándo pagaste.',
      future: 'La fecha no puede ser futura: registra el pago cuando lo hagas.',
      tooOld: 'La fecha es de hace más de dos años: revisa el año.',
    });
  }

  protected async submit(): Promise<void> {
    // Before anything else: a second click while the first is on its way does nothing.
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.error.set(null);
    // A retry after a lost answer sends what was sent, and the database judges
    // it: if it went in, the key returns it, even if the reload says less is owed now.
    if (!this.uncertain() && (this.form.invalid || this.overPending())) return;

    const { accountId, amount, occurredAt, method } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.data.recordPurchasePayment(
        {
          purchaseId: this.purchase().id,
          accountId,
          amount: amount ?? 0,
          method: method === NO_METHOD ? null : method,
          occurredAt: inputToIso(occurredAt),
        },
        this.paymentKey,
      );
      this.uncertain.set(null);
      this.paymentKey = crypto.randomUUID();
      // The next payment starts from what is still owed, not from this one.
      this.form.controls.amount.markAsPristine();
      this.paid.emit();
    } catch (error) {
      if (outcomeUnknown(error)) {
        this.uncertain.set(noAnswerReason(error));
      } else {
        // The database answered no: nothing was written, with this key or before.
        this.uncertain.set(null);
        this.error.set(describeError(error, 'No pudimos registrar el pago. Inténtalo de nuevo.'));
      }
      this.refused.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
