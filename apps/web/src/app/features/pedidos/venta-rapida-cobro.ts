import { Component, computed, DestroyRef, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { inputToIso, nowForInput } from '../../core/dates';
import { Field, FORMAT_PIPES } from '../../ui';
import { beforeOpening, beforeOpeningNotice } from '../finanzas/opening-balance';
import { PaymentCategoryNote } from '../finanzas/payment-category-note';
import type { AccountOption } from './pedidos.data';
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from './pedidos.labels';
import type { SaleTotals } from './quick-sale';

export type QuickPaymentForm = FormGroup<{
  amount: FormControl<number | null>;
  /** True until somebody types an amount other than the total: then the amount stops following it. */
  followTotal: FormControl<boolean>;
  accountId: FormControl<string>;
  method: FormControl<PaymentMethod | ''>;
  reference: FormControl<string>;
  /** Empty while the sale is dated the moment it is made; a datetime-local value once somebody picks another. */
  soldAt: FormControl<string>;
}>;

export function createQuickPayment(accountId = ''): QuickPaymentForm {
  return new FormGroup({
    amount: new FormControl<number | null>(0),
    followTotal: new FormControl(true, { nonNullable: true }),
    accountId: new FormControl(accountId, { nonNullable: true }),
    method: new FormControl<PaymentMethod | ''>('', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
    soldAt: new FormControl('', { nonNullable: true }),
  });
}

/**
 * What is collected with the sale. By default all of it, and the amount
 * follows the total while nobody types one. Part of it leaves the rest in
 * «Por cobrar»; zero is «me paga después». The sale is dated when it is made,
 * unless somebody picks another moment: a fair's sales are often written
 * down at night.
 */
@Component({
  selector: 'app-venta-rapida-cobro',
  imports: [ReactiveFormsModule, Field, PaymentCategoryNote, ...FORMAT_PIPES],
  template: `
    <div [formGroup]="group()">
      <div class="amount">
        <pp-field label="Cobrado ahora (S/)" [required]="true">
          <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="amount" (input)="typed($event)" />
        </pp-field>
        <div class="shortcuts">
          <button type="button" class="secondary" (click)="all()">Todo</button>
          <button type="button" class="secondary" (click)="later()">Me paga después</button>
        </div>
      </div>
      @if (totals().total > 0 && totals().owed > 0) {
        <p class="owed" role="status">Quedan {{ totals().owed | money }} por cobrar: la venta queda en Por cobrar.</p>
      }

      @if (collects()) {
        <div class="pair">
          <pp-field label="Cuenta" [required]="true" hint="Donde entró el dinero">
            <select formControlName="accountId">
              <option value="">Elige una cuenta…</option>
              @for (account of accounts(); track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
            </select>
          </pp-field>
          <pp-field label="Medio de pago" [hint]="methodHint()">
            <select formControlName="method">
              <option value="">{{ defaultMethodOption() }}</option>
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
      }

      @if (values().soldAt) {
        <pp-field label="Fecha y hora de la venta" hint="Con ella quedan la venta, la entrega y el cobro.">
          <input type="datetime-local" formControlName="soldAt" [attr.max]="latest()" />
        </pp-field>
        <p class="when"><button type="button" class="inline-link" (click)="now()">Es ahora</button></p>
      } @else {
        <p class="when muted">
          Fecha: en el momento de vender.
          <button type="button" class="inline-link" (click)="pickDate()">Fue otro día</button>
        </p>
      }
      @if (openingWarning(); as text) {
        <p class="alert-warn" role="status">{{ text }}</p>
      }
    </div>
  `,
  styles: `
    .amount { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 0.5rem; }
    .amount pp-field { flex: 1 1 8rem; }
    .shortcuts { display: flex; gap: 0.4rem; margin-bottom: 0.9rem; }
    .owed { margin: -0.4rem 0 0.9rem; font-size: var(--fs-sm); color: var(--warn); }
    .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 0.75rem; }
    .when { margin: -0.4rem 0 0.9rem; font-size: var(--fs-sm); }
  `,
})
export class VentaRapidaCobro implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly group = input.required<QuickPaymentForm>();
  readonly accounts = input.required<AccountOption[]>();
  readonly totals = input.required<SaleTotals>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;

  protected readonly values = signal(createQuickPayment().getRawValue());

  protected readonly collects = computed(() => (this.values().amount ?? 0) > 0);
  private readonly account = computed(() => this.accounts().find((row) => row.id === this.values().accountId));

  protected readonly defaultMethodOption = computed(() => {
    const method = this.account()?.defaultMethod;
    return method ? `El de la cuenta (${PAYMENT_METHOD_LABEL[method]})` : 'El de la cuenta';
  });

  protected readonly methodHint = computed(() => {
    const account = this.account();
    return account && !account.defaultMethod ? `${account.name} no tiene uno por defecto: elígelo.` : 'Opcional';
  });

  /** The same warning Caja and the order's collection give (E5-02). */
  protected readonly openingWarning = computed(() => {
    const account = this.account();
    if (!account || !this.collects()) return null;
    const soldAt = this.values().soldAt;
    const when = soldAt ? inputToIso(soldAt) : new Date().toISOString();
    return beforeOpening(when, account.openingBalanceOn)
      ? beforeOpeningNotice(account, 'el cobro cuenta para la venta')
      : null;
  });

  constructor() {
    // While nobody typed an amount, it is all of it: the most common sale.
    // Only a different amount is written: every write tells the page the
    // form changed, the page computes the totals again, and an unconditional
    // write here would never stop.
    effect(() => {
      const total = this.totals().total;
      untracked(() => {
        const { followTotal, amount } = this.group().controls;
        if (followTotal.value && amount.value !== total) amount.setValue(total);
      });
    });
  }

  ngOnInit(): void {
    const group = this.group();
    this.values.set(group.getRawValue());
    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.values.set(group.getRawValue()));
    // A method picked for one account means nothing for another: Plin into
    // «Efectivo» would reach Caja as it was sent. Back to the account's own.
    group.controls.accountId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => group.controls.method.setValue(''));
  }

  /** The latest moment the date field accepts: now, in Lima. */
  protected latest(): string {
    return nowForInput();
  }

  /**
   * Typing the total itself is «all of it»: it keeps following, so a product
   * added afterwards is collected too instead of quietly going to «Por
   * cobrar». Any other amount is what was paid, and stays.
   */
  protected typed(event: Event): void {
    const typed = (event.target as HTMLInputElement).valueAsNumber;
    const total = this.totals().total;
    this.group().controls.followTotal.setValue(total > 0 && typed === total);
  }

  protected all(): void {
    this.group().patchValue({ followTotal: true, amount: this.totals().total });
  }

  protected later(): void {
    this.group().patchValue({ followTotal: false, amount: 0 });
  }

  protected pickDate(): void {
    this.group().controls.soldAt.setValue(nowForInput());
  }

  protected now(): void {
    this.group().controls.soldAt.setValue('');
  }
}
