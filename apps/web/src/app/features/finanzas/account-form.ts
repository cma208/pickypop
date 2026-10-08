import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { todayLocal } from '../../core/dates';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { roundMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { Field, FORMAT_PIPES } from '../../ui';
import {
  ACCOUNT_FIELD_MESSAGES,
  notAfterToday,
  notBlank,
  openingShift,
  openingShiftNotice,
  withinLedgerLimit,
  type AccountInput,
  type OpeningShift,
} from './account-edit';
import { FinanzasData, isRefusal, StaleAccountError, type AccountSummary } from './finanzas.data';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABELS,
  defaultMethodFor,
  MAX_LEDGER_AMOUNT,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_SHORT,
  type AccountKind,
  type PaymentMethod,
} from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';

/** How many of the movements that change side are listed before «y N más». */
const SHIFT_LIST_LIMIT = 8;

/**
 * Create or edit a place where the workshop's money sits. Whether it is
 * active is not here: Cuentas has its own button for that, and a form that
 * sent it back from an old tab reactivated accounts without a word (T5-09).
 */
@Component({
  selector: 'app-account-form',
  imports: [ReactiveFormsModule, Field, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES, `.shift { margin: 0 0 0.75rem; padding-left: 1.25rem; font-size: var(--fs-sm); }`],
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
          <input
            type="number"
            step="0.01"
            [attr.min]="-maxAmount"
            [attr.max]="maxAmount"
            inputmode="decimal"
            formControlName="openingBalance"
          />
        </pp-field>
        <pp-field
          label="Fecha del saldo de apertura"
          [required]="true"
          hint="Un movimiento con fecha anterior ya está dentro de este saldo: no lo cambia, aunque sí cuenta en Resultados"
          [error]="error('openingBalanceOn')"
        >
          <input type="date" [attr.max]="today" formControlName="openingBalanceOn" />
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

      @if (shiftNotice(); as text) {
        <section aria-live="polite">
          <p class="alert alert-warn">{{ text }}</p>
          <ul class="shift">
            @for (leg of shownLegs(); track $index) {
              <li>{{ leg.occurredAt | fecha }} · {{ typeShort[leg.type] }} · {{ leg.signedAmount | money }}</li>
            }
          </ul>
          @if (moreLegs() > 0) {
            <p class="muted">y {{ moreLegs() }} más.</p>
          }
          <label class="check">
            <input type="checkbox" [checked]="shiftConfirmed()" (change)="shiftConfirmed.set(!shiftConfirmed())" />
            Sí, cambiar la fecha igual
          </label>
        </section>
      }

      @if (failure(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="saving() || (!!shift() && !shiftConfirmed())">
          {{ saving() ? 'Guardando…' : 'Guardar cuenta' }}
        </button>
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
  /** The database said no: the account on screen may be out of date. */
  readonly refused = output<void>();
  /**
   * The account changed in another tab while this form had it open (T5-09).
   * Nothing was saved, and the form cannot be: its fields still hold the old
   * version, and saving them would undo the other change. Cuentas closes it.
   */
  readonly outdated = output<string>();
  readonly cancelled = output<void>();

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly typeShort = TRANSACTION_TYPE_SHORT;
  protected readonly maxAmount = MAX_LEDGER_AMOUNT;
  protected readonly today = todayLocal();

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** The movements that change side if the opening day moves, waiting to be confirmed. */
  protected readonly shift = signal<OpeningShift | null>(null);
  protected readonly shiftConfirmed = signal(false);

  protected readonly form = this.fb.group({
    name: ['', notBlank],
    kind: ['cash' as AccountKind],
    openingBalance: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, withinLedgerLimit] }),
    // The day the account already has is not judged again: see notAfterToday.
    openingBalanceOn: [
      todayLocal(),
      [Validators.required, notAfterToday(todayLocal, () => this.account()?.openingBalanceOn ?? null)],
    ],
    // A new account starts as a cash box, and a cash box takes cash.
    defaultPaymentMethod: [(defaultMethodFor('cash') ?? '') as PaymentMethod | ''],
    note: [''],
  });

  protected readonly shiftNotice = computed(() => {
    const shift = this.shift();
    const account = this.account();
    if (!shift || !account) return null;
    const value = this.form.getRawValue();
    return openingShiftNotice(
      shift,
      account,
      { from: account.openingBalanceOn, to: value.openingBalanceOn },
      roundMoney(Number(value.openingBalance) - account.openingBalance),
    );
  });

  protected readonly shownLegs = computed(() => this.shift()?.legs.slice(0, SHIFT_LIST_LIMIT) ?? []);
  protected readonly moreLegs = computed(() => Math.max((this.shift()?.legs.length ?? 0) - SHIFT_LIST_LIMIT, 0));

  constructor() {
    this.form.controls.kind.valueChanges.pipe(takeUntilDestroyed()).subscribe((kind) => this.followKind(kind));

    // The last error goes once the person corrects something (T5-11), and a
    // confirmation is for the dates and the amount it was shown with.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.failure.set(null));
    this.form.controls.openingBalanceOn.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.resetShift());
    this.form.controls.openingBalance.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.resetShift());
  }

  /**
   * Picking another kind of account moves the suggested method with it, until
   * the person chooses one themselves. An account that already exists keeps
   * what it has: changing its kind is not a reason to change how it is paid.
   */
  private followKind(kind: AccountKind): void {
    const method = this.form.controls.defaultPaymentMethod;
    if (this.account() || !method.pristine) return;
    method.setValue(defaultMethodFor(kind) ?? '');
  }

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
      });
    }
  }

  protected error(control: keyof typeof ACCOUNT_FIELD_MESSAGES): string | null {
    return errorOf(this.form.controls[control], ACCOUNT_FIELD_MESSAGES[control]);
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const input = this.input();
    this.saving.set(true);
    this.failure.set(null);
    try {
      if (await this.needsConfirmation(input)) return;

      const account = this.account();
      if (account) {
        const changed = await this.data.updateAccount(account, input);
        this.saved.emit(changed ? 'Cuenta actualizada.' : 'No había cambios: la cuenta quedó como estaba.');
      } else {
        await this.data.createAccount(input);
        this.saved.emit('Cuenta creada.');
      }
    } catch (error) {
      if (error instanceof StaleAccountError) {
        this.outdated.emit(error.message);
        return;
      }
      this.failure.set(friendlyError(error, 'No pudimos guardar la cuenta. Inténtalo de nuevo.'));
      if (isRefusal(error)) this.refused.emit();
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Moving the opening day of an account that has movements takes some out of
   * its balance, or brings some in. That is said, with which ones, and
   * confirmed before saving (T5-02).
   */
  private async needsConfirmation(input: AccountInput): Promise<boolean> {
    const account = this.account();
    if (!account || account.movements === 0 || input.openingBalanceOn === account.openingBalanceOn) return false;
    if (this.shift() && this.shiftConfirmed()) return false;

    const legs = await this.data.accountLegs(account.id);
    const shift = openingShift(legs, account.openingBalanceOn, input.openingBalanceOn);
    this.shift.set(shift);
    this.shiftConfirmed.set(false);
    return shift !== null;
  }

  private resetShift(): void {
    this.shift.set(null);
    this.shiftConfirmed.set(false);
  }

  private input(): AccountInput {
    const value = this.form.getRawValue();
    return {
      name: value.name.trim(),
      kind: value.kind,
      openingBalance: roundMoney(Number(value.openingBalance)),
      openingBalanceOn: value.openingBalanceOn,
      defaultPaymentMethod: value.defaultPaymentMethod === '' ? null : value.defaultPaymentMethod,
      note: textOrNull(value.note),
    };
  }
}
