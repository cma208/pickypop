import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nowForInput } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { Field, FORMAT_PIPES } from '../../ui';
import { FinanzasData, isRefusal, type AccountSummary } from './finanzas.data';
import {
  cashCategoriesFor,
  cashCategoryHint,
  categoryFitsType,
  MAX_LEDGER_AMOUNT,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TYPE_DIRECTION,
  type CategoryOption,
  type PaymentMethod,
  type TransactionType,
} from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { beforeOpeningNotice } from './opening-balance';
import {
  buildTransactionDraft,
  draftProblem,
  negativeBalanceNotice,
  previewBalances,
  STILL_COUNTS,
  workshopChange,
  type BalancePreview,
  type TransactionPreset,
} from './transaction-draft';

/** What each type is for, so nobody has to guess between the five. */
const TYPE_HINTS: Record<TransactionType, string> = {
  income:
    'Dinero que entra y no es venta, cobro de un pedido ni aporte: un reembolso, la devolución de un proveedor. Suma a la utilidad como «Otros ingresos».',
  expense: 'Dinero que sale del taller: luz, envíos, publicidad, repuestos.',
  transfer: 'Dinero que cambia de bolsillo. No es ganancia ni gasto: el total del taller no cambia.',
  owner_contribution: 'Plata tuya que metes al taller. Es capital, no utilidad.',
  owner_draw: 'Plata del taller que sacas para ti. Es capital, no gasto.',
};

/**
 * A deactivated account still holding money is offered as the origin of a
 * transfer, and only there, so it can be emptied: Cuentas asks for exactly
 * that, and the database lets a transfer leave it (T5-12, T1-22).
 */
function canLeave(account: AccountSummary, type: TransactionType): boolean {
  return account.active || (type === 'transfer' && account.balance > 0);
}

/**
 * Registers one movement of money. The five types share a form because they
 * are the same row; what changes is which fields the type allows. A transfer
 * names both accounts here and is stored as a single row, never as two.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, RouterLink, Field, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    FINANCE_STYLES,
    `.sales-elsewhere { margin: -0.4rem 0 0.9rem; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--info-soft); font-size: var(--fs-sm); }`,
  ],
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h3>Registrar movimiento</h3>

      <pp-field label="Tipo de movimiento" [required]="true" [hint]="typeHint()">
        <select formControlName="type">
          @for (type of types; track type) {
            <option [value]="type">{{ typeLabels[type] }}</option>
          }
        </select>
      </pp-field>
      @if (isIncome()) {
        <!--
          A sale typed here never left the shelf nor carried its cost, and the
          collection of an order typed here counts twice: once as the order's
          sale and again as other income (E5-01).
        -->
        <p class="sales-elsewhere">
          ¿Es una venta? Va por <a routerLink="/pedidos">Pedidos</a> o por la
          <a routerLink="/pedidos/venta-rapida">Venta rápida</a>, que sí sacan lo vendido del estante y llevan su
          costo. ¿Te pagaron un pedido? Se cobra desde el pedido o desde
          <a routerLink="/finanzas/por-cobrar">Por cobrar</a>: anotado aquí, contaría dos veces.
        </p>
      }

      <div class="grid two">
        <pp-field [label]="isTransfer() ? 'Sale de la cuenta' : 'Cuenta'" [required]="true" [hint]="originHint()">
          <select formControlName="accountId">
            <option value="">Elige una cuenta</option>
            @for (account of origins(); track account.id) {
              <option [value]="account.id">
                {{ account.name }}{{ account.active ? '' : ' (desactivada)' }} · {{ account.balance | money }}
              </option>
            }
          </select>
        </pp-field>

        @if (isTransfer()) {
          <pp-field label="Llega a la cuenta" [required]="true">
            <select formControlName="counterAccountId">
              <option value="">Elige una cuenta</option>
              @for (account of destinations(); track account.id) {
                <option [value]="account.id">{{ account.name }} · {{ account.balance | money }}</option>
              }
            </select>
          </pp-field>
        } @else {
          <pp-field label="Categoría" [hint]="categoryHint()">
            <select formControlName="categoryId">
              <option value="">Sin categoría</option>
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </pp-field>
        }

        <pp-field label="Monto" [required]="true">
          <input type="number" step="0.01" min="0" [attr.max]="maxAmount" inputmode="decimal" formControlName="amount" />
        </pp-field>

        <pp-field label="Fecha y hora" [required]="true">
          <input type="datetime-local" [attr.max]="latest" formControlName="occurredAt" />
        </pp-field>

        <pp-field label="Medio de pago" [required]="true">
          <select formControlName="paymentMethod">
            @for (method of methods; track method) {
              <option [value]="method">{{ methodLabels[method] }}</option>
            }
          </select>
        </pp-field>

        @if (!isTransfer()) {
          <pp-field [label]="counterpartyLabel()">
            <input formControlName="counterparty" autocomplete="off" />
          </pp-field>
        }

        <pp-field label="Referencia" hint="Código de operación de Yape, número de voucher…">
          <input formControlName="reference" autocomplete="off" />
        </pp-field>

        <pp-field label="Nota">
          <input formControlName="note" autocomplete="off" />
        </pp-field>
      </div>

      <section aria-live="polite">
        @if (problem(); as text) {
          <p class="alert alert-warn">{{ text }}</p>
        } @else if (preview().length > 0) {
          @for (text of openingNotices(); track text) {
            <p class="alert alert-warn">{{ text }}</p>
          }
          @for (text of negativeNotices(); track text) {
            <p class="alert alert-warn">{{ text }}</p>
          }
          @if (negativeNotices().length > 0) {
            <label class="check">
              <input type="checkbox" [checked]="negativeConfirmed()" (change)="negativeConfirmed.set(!negativeConfirmed())" />
              Sí, registrarlo aunque la cuenta quede en negativo
            </label>
          }
          <p class="notice">
            @for (line of preview(); track line.accountId) {
              <span class="block">
                <strong>{{ line.name }}</strong>:
                @if (line.beforeOpening) {
                  sigue en {{ line.before | money }}
                } @else {
                  {{ line.before | money }} → {{ line.after | money }}
                }
              </span>
            }
            @if (isTransfer() && totalUnchanged()) {
              <span class="block">El total del taller no cambia: el dinero solo cambia de bolsillo.</span>
            }
          </p>
        }
      </section>

      @if (failure(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="saving() || !!problem() || awaitingConfirmation()">
          {{ saving() ? 'Guardando…' : 'Registrar movimiento' }}
        </button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class TransactionForm {
  private readonly data = inject(FinanzasData);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly workspace = inject(CurrentWorkspace);

  readonly allAccounts = input.required<AccountSummary[]>();
  readonly allCategories = input.required<CategoryOption[]>();
  /** Filled in by another form (the correction of a movement that cannot be voided), for the person to review. */
  readonly preset = input<TransactionPreset | null>(null);
  readonly saved = output<string>();
  /** The database said no: the accounts the form offers may be out of date. */
  readonly refused = output<void>();
  readonly cancelled = output<void>();

  protected readonly types = TRANSACTION_TYPES;
  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly maxAmount = MAX_LEDGER_AMOUNT;
  /** The picker stops at now: money is recorded once it has moved (T5-08). */
  protected readonly latest = nowForInput();

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly negativeConfirmed = signal(false);

  /**
   * One movement, one key: the same request sent twice records it once. It
   * is kept while the form does not change, so a retry after a lost answer is
   * still the same movement, and a new one gets a new key.
   */
  private entryKey = crypto.randomUUID();

  protected readonly form = this.fb.group({
    type: ['income' as TransactionType],
    accountId: [''],
    counterAccountId: [''],
    categoryId: [''],
    amount: new FormControl<number | null>(null),
    occurredAt: [nowForInput()],
    paymentMethod: ['cash' as PaymentMethod],
    counterparty: [''],
    reference: [''],
    note: [''],
  });

  private readonly changes = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Every value of the form, recomputed on each keystroke. */
  private readonly values = computed(() => {
    this.changes();
    return this.form.getRawValue();
  });

  protected readonly isTransfer = computed(() => this.values().type === 'transfer');
  protected readonly isIncome = computed(() => this.values().type === 'income');
  protected readonly typeHint = computed(() => TYPE_HINTS[this.values().type]);

  /** Money moves in and out of open accounts; a closed one with money can still be emptied. */
  protected readonly origins = computed(() =>
    this.allAccounts().filter((account) => canLeave(account, this.values().type)),
  );

  protected readonly originHint = computed(() =>
    this.origins().some((account) => !account.active)
      ? 'Una cuenta desactivada con saldo aparece aquí solo para sacar ese dinero a otra cuenta.'
      : undefined,
  );

  protected readonly destinations = computed(() =>
    this.allAccounts().filter((account) => account.active && account.id !== this.values().accountId),
  );

  /** A loose income is not offered the categories of sales nor capital: the database would refuse them. */
  protected readonly categories = computed(() => cashCategoriesFor(this.values().type, this.allCategories()));

  /** Says why a category the person knows is not in the list, and where to make one that fits. */
  /** Where to create a category is said to the owner, who can; the operator is told to ask. */
  protected readonly categoryHint = computed(() =>
    cashCategoryHint(this.values().type, this.allCategories(), this.workspace.isOwner()),
  );

  protected readonly counterpartyLabel = computed(() =>
    TYPE_DIRECTION[this.values().type] === 'income' ? 'De quién lo recibiste' : 'A quién le pagaste',
  );

  protected readonly problem = computed(() => draftProblem(this.values()) ?? this.staleAccountProblem());

  /**
   * The accounts are read again after a refusal: one chosen from the old list
   * may have been deactivated meanwhile. The select would show it blank while
   * the form still held it, and sending it again would be refused again.
   */
  private readonly staleAccountProblem = computed(() => {
    const { type, accountId, counterAccountId } = this.values();
    if (accountId && !this.origins().some((account) => account.id === accountId)) {
      return 'La cuenta elegida ya no recibe ni paga movimientos (se desactivó): elige otra.';
    }
    if (type === 'transfer' && counterAccountId && !this.destinations().some((account) => account.id === counterAccountId)) {
      return 'La cuenta de destino ya no recibe transferencias (se desactivó): elige otra.';
    }
    return null;
  });

  /** What each account will be worth once this is saved. */
  protected readonly preview = computed<BalancePreview[]>(() =>
    this.problem() ? [] : previewBalances(buildTransactionDraft(this.values()), this.allAccounts()),
  );

  /** Said before saving, not discovered afterwards in Cuentas. */
  protected readonly openingNotices = computed(() =>
    this.preview()
      .filter((line) => line.beforeOpening)
      .map((line) => beforeOpeningNotice(line, STILL_COUNTS[this.values().type])),
  );

  /** More money leaving than there is: said, and confirmed, before saving (T5-04). */
  protected readonly negativeNotices = computed(() =>
    this.preview()
      .filter((line) => line.goesNegative)
      .map((line) => negativeBalanceNotice(line)),
  );

  protected readonly awaitingConfirmation = computed(
    () => this.negativeNotices().length > 0 && !this.negativeConfirmed(),
  );

  protected readonly totalUnchanged = computed(() => workshopChange(this.preview()) === 0);

  constructor() {
    // A category belongs to one direction only, so one that no longer fits
    // the chosen type has to go before the database rejects the pairing.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      if (!categoryFitsType(type, this.form.controls.categoryId.value || null, this.allCategories())) {
        this.form.controls.categoryId.setValue('');
      }
      if (type !== 'transfer') this.form.controls.counterAccountId.setValue('');
      const origin = this.allAccounts().find((account) => account.id === this.form.controls.accountId.value);
      if (origin && !canLeave(origin, type)) this.form.controls.accountId.setValue('');
    });

    // The account usually decides how the money moves, so it fills the method in.
    this.form.controls.accountId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const account = this.allAccounts().find((candidate) => candidate.id === id);
      if (account?.defaultPaymentMethod) {
        this.form.controls.paymentMethod.setValue(account.defaultPaymentMethod);
      }
      if (this.form.controls.counterAccountId.value === id) {
        this.form.controls.counterAccountId.setValue('');
      }
    });

    // Whatever changes is another movement: a new key, a new confirmation, and
    // the error of the last attempt goes away once something is corrected (T5-11).
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.entryKey = crypto.randomUUID();
      this.negativeConfirmed.set(false);
      this.failure.set(null);
    });
  }

  // Signal inputs are only set after construction, so the preset is applied here.
  ngOnInit(): void {
    const preset = this.preset();
    if (!preset) return;
    // The type first: changing it clears what does not fit it, then the rest is filled in.
    this.form.controls.type.setValue(preset.type);
    this.form.patchValue({ accountId: preset.accountId, amount: preset.amount, note: preset.note });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.problem() || this.awaitingConfirmation()) return;

    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.createTransaction(buildTransactionDraft(this.values()), this.entryKey);
      this.saved.emit('Movimiento registrado.');
    } catch (error) {
      this.failure.set(friendlyError(error, 'No pudimos registrar el movimiento. Inténtalo de nuevo.'));
      if (isRefusal(error)) this.refused.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
