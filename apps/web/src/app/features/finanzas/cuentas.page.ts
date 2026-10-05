import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { sumMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { AccountForm } from './account-form';
import { FinanzasData, type AccountSummary } from './finanzas.data';
import { ACCOUNT_KIND_LABELS, PAYMENT_METHOD_LABELS } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';

@Component({
  selector: 'app-cuentas',
  imports: [Page, AsyncState, Empty, Badge, AccountForm, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES],
  template: `
    <pp-page title="Cuentas" subtitle="Dónde está el dinero del taller y cuánto hay en cada sitio">
      <button actions type="button" (click)="openForm(null)">Nueva cuenta</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }

      @if (formOpen()) {
        <!-- Keyed by account so picking another one restarts the form. -->
        @for (key of [editing()?.id ?? 'new']; track key) {
          <app-account-form [account]="editing()" (saved)="afterSave($event)" (cancelled)="closeForm()" />
        }
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (accounts().length === 0) {
          <pp-empty message="Todavía no hay cuentas. Crea la primera para empezar a registrar el dinero.">
            <button type="button" (click)="openForm(null)">Nueva cuenta</button>
          </pp-empty>
        } @else {
          <div class="totals">
            <div>
              <span class="cap">Total del taller</span>
              <span class="amount" [class.neg]="total() < 0">{{ total() | money }}</span>
            </div>
            <div>
              <span class="cap">Cuentas activas</span>
              <span class="amount">{{ activeCount() }} de {{ accounts().length }}</span>
            </div>
          </div>

          @if (inactiveWithMoney()) {
            <p class="alert alert-warn">
              Hay cuentas desactivadas con saldo. Siguen contando en el total del taller hasta que
              muevas ese dinero a otra cuenta.
            </p>
          }

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th class="num hide-small">Apertura</th>
                  <th class="num hide-small">Entradas</th>
                  <th class="num hide-small">Salidas</th>
                  <th class="num">Saldo</th>
                  <th class="num hide-small">Movimientos</th>
                  <th><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (account of accounts(); track account.id) {
                  <tr [class.voided]="!account.active">
                    <td>
                      <span class="strong">{{ account.name }}</span>
                      @if (!account.active) { <pp-badge>Desactivada</pp-badge> }
                      <small class="sub">
                        {{ kindLabels[account.kind] }}
                        @if (account.defaultPaymentMethod) {
                          · cobra por {{ methodLabels[account.defaultPaymentMethod] }}
                        } @else {
                          · sin medio de pago por defecto
                        }
                      </small>
                      <small class="sub only-small">
                        Apertura {{ account.openingBalance | money }} · {{ account.movements }} movimientos
                      </small>
                      @if (account.note) { <small class="sub">{{ account.note }}</small> }
                    </td>
                    <td class="num hide-small">
                      {{ account.openingBalance | money }}
                      <small class="sub">{{ account.openingBalanceOn | fecha }}</small>
                    </td>
                    <td class="num hide-small pos">{{ account.totalIn | money }}</td>
                    <td class="num hide-small neg">{{ account.totalOut | money }}</td>
                    <td class="num amount-cell" [class.neg]="account.balance < 0">
                      {{ account.balance | money }}
                    </td>
                    <td class="num hide-small">
                      {{ account.movements }}
                      @if (account.lastMovementAt) {
                        <small class="sub">último {{ account.lastMovementAt | fecha }}</small>
                      }
                    </td>
                    <td class="right nowrap">
                      <button type="button" class="secondary" (click)="openForm(account)">Editar</button>
                      <button type="button" class="ghost" (click)="toggleActive(account)">
                        {{ account.active ? 'Desactivar' : 'Reactivar' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </pp-async>
    </pp-page>
  `,
})
export class CuentasPage {
  private readonly data = inject(FinanzasData);

  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<AccountSummary | null>(null);

  /** Every account holds workshop money, active or not. */
  protected readonly total = computed(() => sumMoney(this.accounts().map((account) => account.balance)));
  protected readonly activeCount = computed(() => this.accounts().filter((account) => account.active).length);
  protected readonly inactiveWithMoney = computed(() =>
    this.accounts().some((account) => !account.active && account.balance !== 0),
  );

  constructor() {
    void this.load();
  }

  protected openForm(account: AccountSummary | null): void {
    this.editing.set(account);
    this.formOpen.set(true);
    this.notice.set(null);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected afterSave(message: string): void {
    this.closeForm();
    this.notice.set(message);
    void this.load();
  }

  protected async toggleActive(account: AccountSummary): Promise<void> {
    const turningOff = account.active;
    if (turningOff && !confirm(`¿Desactivar la cuenta «${account.name}»? Dejará de poder recibir cobros.`)) {
      return;
    }

    this.actionError.set(null);
    try {
      await this.data.setAccountActive(account.id, !account.active);
      this.notice.set(turningOff ? 'Cuenta desactivada.' : 'Cuenta reactivada.');
      await this.load();
    } catch (error) {
      this.actionError.set(friendlyError(error, 'No pudimos cambiar el estado de la cuenta.'));
    }
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.accounts.set(await this.data.accounts());
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar las cuentas. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
