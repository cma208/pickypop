import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { nowForInput } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { roundMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { Field, FORMAT_PIPES } from '../../ui';
import { FinanzasData, type AccountSummary } from './finanzas.data';
import {
  categoriesFor,
  categoryFitsType,
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
import { buildTransactionDraft, draftProblem, effectsOf } from './transaction-draft';

/** What each type is for, so nobody has to guess between the five. */
const TYPE_HINTS: Record<TransactionType, string> = {
  income: 'Dinero que entra al taller y es ganancia: una venta suelta, un servicio.',
  expense: 'Dinero que sale del taller: luz, envíos, publicidad, repuestos.',
  transfer: 'Dinero que cambia de bolsillo. No es ganancia ni gasto: el total del taller no cambia.',
  owner_contribution: 'Plata tuya que metes al taller. Es capital, no utilidad.',
  owner_draw: 'Plata del taller que sacas para ti. Es capital, no gasto.',
};

interface Preview {
  name: string;
  before: number;
  after: number;
}

/**
 * Registers one movement of money. The five types share a form because they
 * are the same row; what changes is which fields the type allows. A transfer
 * names both accounts here and is stored as a single row, never as two.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, Field, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES],
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

      <div class="grid two">
        <pp-field [label]="isTransfer() ? 'Sale de la cuenta' : 'Cuenta'" [required]="true">
          <select formControlName="accountId">
            <option value="">Elige una cuenta</option>
            @for (account of accounts(); track account.id) {
              <option [value]="account.id">{{ account.name }} · {{ account.balance | money }}</option>
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
          <pp-field
            label="Categoría"
            [hint]="categories().length === 0 ? 'No hay categorías de este tipo todavía.' : undefined"
          >
            <select formControlName="categoryId">
              <option value="">Sin categoría</option>
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </pp-field>
        }

        <pp-field label="Monto" [required]="true">
          <input type="number" step="0.01" min="0" inputmode="decimal" formControlName="amount" />
        </pp-field>

        <pp-field label="Fecha y hora" [required]="true">
          <input type="datetime-local" formControlName="occurredAt" />
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
          <p class="notice">
            @for (line of preview(); track line.name) {
              <span class="block">
                <strong>{{ line.name }}</strong>: {{ line.before | money }} → {{ line.after | money }}
              </span>
            }
            @if (isTransfer()) {
              <span class="block">El total del taller no cambia: el dinero solo cambia de bolsillo.</span>
            }
          </p>
        }
      </section>

      @if (failure(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="saving() || !!problem()">
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

  readonly allAccounts = input.required<AccountSummary[]>();
  readonly allCategories = input.required<CategoryOption[]>();
  readonly saved = output<string>();
  readonly cancelled = output<void>();

  protected readonly types = TRANSACTION_TYPES;
  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

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

  /** Money can only be moved in and out of an account that is still open. */
  protected readonly accounts = computed(() => this.allAccounts().filter((account) => account.active));

  protected readonly isTransfer = computed(() => this.values().type === 'transfer');
  protected readonly typeHint = computed(() => TYPE_HINTS[this.values().type]);

  protected readonly destinations = computed(() =>
    this.accounts().filter((account) => account.id !== this.values().accountId),
  );

  protected readonly categories = computed(() => categoriesFor(this.values().type, this.allCategories()));

  protected readonly counterpartyLabel = computed(() =>
    TYPE_DIRECTION[this.values().type] === 'income' ? 'De quién lo recibiste' : 'A quién le pagaste',
  );

  protected readonly problem = computed(() => draftProblem(this.values()));

  /** What each account will be worth once this is saved. */
  protected readonly preview = computed<Preview[]>(() => {
    if (this.problem()) return [];

    const byId = new Map(this.accounts().map((account) => [account.id, account]));

    return effectsOf(buildTransactionDraft(this.values())).flatMap((effect) => {
      const account = byId.get(effect.accountId);
      if (!account) return [];
      return [{ name: account.name, before: account.balance, after: roundMoney(account.balance + effect.delta) }];
    });
  });

  constructor() {
    // A category belongs to one direction only, so one that no longer fits
    // the chosen type has to go before the database rejects the pairing.
    this.form.controls.type.valueChanges.subscribe((type) => {
      if (!categoryFitsType(type, this.form.controls.categoryId.value || null, this.allCategories())) {
        this.form.controls.categoryId.setValue('');
      }
      if (type !== 'transfer') this.form.controls.counterAccountId.setValue('');
    });

    // The account usually decides how the money moves, so it fills the method in.
    this.form.controls.accountId.valueChanges.subscribe((id) => {
      const account = this.allAccounts().find((candidate) => candidate.id === id);
      if (account?.defaultPaymentMethod) {
        this.form.controls.paymentMethod.setValue(account.defaultPaymentMethod);
      }
      if (this.form.controls.counterAccountId.value === id) {
        this.form.controls.counterAccountId.setValue('');
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.problem() || this.saving()) return;

    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.createTransaction(buildTransactionDraft(this.values()));
      this.saved.emit('Movimiento registrado.');
    } catch (error) {
      this.failure.set(friendlyError(error, 'No pudimos registrar el movimiento. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
