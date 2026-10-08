import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { money } from '../../core/format';
import { sumMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { AccountForm } from './account-form';
import { FinanzasData, isRefusal, type AccountSummary } from './finanzas.data';
import { ACCOUNT_KIND_LABELS, PAYMENT_METHOD_LABELS } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { beforeOpeningSummary } from './opening-balance';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * The question before deactivating. With money still in it the account keeps
 * counting in the workshop's total, so the question says how much and how to
 * take it out (T5-12).
 */
function deactivateQuestion(account: AccountSummary): string {
  const head = `¿Desactivar la cuenta «${account.name}»? Dejará de recibir cobros y pagos.`;
  if (account.balance > 0) {
    return `${head} Todavía tiene ${money(account.balance)}: para sacarlos, haz en Caja una transferencia desde ella a otra cuenta.`;
  }
  if (account.balance < 0) {
    return `${head} Está en ${money(account.balance)}: desactivada, ya no podrá recibir lo que le falta.`;
  }
  return head;
}

@Component({
  selector: 'app-cuentas',
  imports: [Page, AsyncState, Empty, Badge, AccountForm, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    FINANCE_STYLES,
    `
      .early { color: var(--warn); font-weight: 400; white-space: normal; max-width: 14rem; margin-left: auto; }
      .form-anchor { scroll-margin-top: 1rem; }
    `,
  ],
  template: `
    <pp-page title="Cuentas" subtitle="Dónde está el dinero del taller y cuánto hay en cada sitio">
      @if (isOwner()) {
        <button actions type="button" (click)="openForm(null)">Nueva cuenta</button>
      }

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }
      @if (isOwner() === false) {
        <p class="muted">Solo el dueño del taller crea, edita o desactiva cuentas. Aquí las ves para saber cuánto hay.</p>
      }

      <div class="form-anchor" #formAnchor>
        @if (formOpen()) {
          <!-- Keyed by account so picking another one restarts the form. -->
          @for (key of [editing()?.id ?? 'new']; track key) {
            <app-account-form
              [account]="editing()"
              (saved)="afterSave($event)"
              (refused)="reload()"
              (outdated)="afterOutdated($event)"
              (cancelled)="closeForm()"
            />
          }
        }
      </div>

      <pp-async [loading]="loading()" [error]="error()">
        @if (accounts().length === 0) {
          <pp-empty message="Todavía no hay cuentas. Crea la primera para empezar a registrar el dinero.">
            @if (isOwner()) {
              <button type="button" (click)="openForm(null)">Nueva cuenta</button>
            }
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

          @if (anyBeforeOpening()) {
            <div class="explainer">
              <p>
                <strong>Lo anterior a la apertura no cambia el saldo.</strong> El saldo de apertura es lo que había
                en la cuenta ese día, así que un movimiento con fecha anterior ya está dentro de él: contarlo otra
                vez lo restaría o sumaría dos veces. Sigue contando en Resultados de su mes.
              </p>
            </div>
          }

          <!-- The way out is spelled out: Caja offers a deactivated account with money as the origin of a transfer (T5-12, T1-22). -->
          @if (inactiveWithMoney()) {
            <p class="alert alert-warn">
              Hay cuentas desactivadas con saldo. Siguen contando en el total del taller hasta que saques ese dinero:
              en Caja › Registrar movimiento › «Transferencia entre cuentas», elígela en «Sale de la cuenta» y
              transfiere su saldo a una cuenta activa.
            </p>
          }
          @if (inactiveOwing()) {
            <p class="alert alert-warn">
              Hay cuentas desactivadas con saldo negativo. Una cuenta desactivada no recibe dinero: para dejarla en
              cero, reactívala, transfiérele lo que falta desde otra cuenta y vuelve a desactivarla.
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
                      @if (earlyText(account); as text) {
                        <small class="sub early">{{ text }}</small>
                      }
                    </td>
                    <td class="num hide-small">
                      {{ account.movements }}
                      @if (account.lastMovementAt) {
                        <small class="sub">último {{ account.lastMovementAt | fecha }}</small>
                      }
                    </td>
                    <td class="right nowrap">
                      @if (isOwner()) {
                        <button type="button" class="secondary" (click)="openForm(account)">Editar</button>
                        <button type="button" class="ghost" [disabled]="switching()" (click)="toggleActive(account)">
                          {{ account.active ? 'Desactivar' : 'Reactivar' }}
                        </button>
                      }
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
  private readonly injector = inject(Injector);
  private readonly formAnchor = viewChild<ElementRef<HTMLElement>>('formAnchor');

  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<AccountSummary | null>(null);
  private readonly workspace = inject(CurrentWorkspace);
  /**
   * Accounts are the owner's to set up (ADR-025): anyone else sees them without
   * the buttons the database would refuse. Null until the role is read.
   */
  protected readonly isOwner = computed(() => (this.workspace.roleKnown() ? this.workspace.isOwner() : null));
  protected readonly switching = signal(false);

  /** Every account holds workshop money, active or not. */
  protected readonly total = computed(() => sumMoney(this.accounts().map((account) => account.balance)));
  protected readonly activeCount = computed(() => this.accounts().filter((account) => account.active).length);
  protected readonly inactiveWithMoney = computed(() =>
    this.accounts().some((account) => !account.active && account.balance > 0),
  );
  protected readonly inactiveOwing = computed(() =>
    this.accounts().some((account) => !account.active && account.balance < 0),
  );
  protected readonly anyBeforeOpening = computed(() =>
    this.accounts().some((account) => account.movementsBeforeOpening > 0),
  );

  /** Why the balance is not the opening plus everything Caja lists for this account. */
  protected earlyText(account: AccountSummary): string | null {
    return beforeOpeningSummary(account);
  }

  constructor() {
    void this.load();
  }

  protected openForm(account: AccountSummary | null): void {
    this.editing.set(account);
    this.formOpen.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    // «Editar» sits in the table below the form: the page is brought up to it.
    afterNextRender(
      () => this.formAnchor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
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

  /** The database refused: what the list shows may be out of date. The form read the role again. */
  protected reload(): void {
    void this.load();
  }

  /** The account changed elsewhere while it was being edited: the old form goes, the list is read again. */
  protected afterOutdated(message: string): void {
    this.closeForm();
    this.notice.set(null);
    this.actionError.set(message);
    void this.load();
  }

  protected async toggleActive(account: AccountSummary): Promise<void> {
    if (this.switching()) return;
    const turningOff = account.active;
    if (turningOff && !confirm(deactivateQuestion(account))) return;

    this.switching.set(true);
    this.actionError.set(null);
    try {
      await this.data.setAccountActive(account, !account.active);
      this.notice.set(turningOff ? 'Cuenta desactivada.' : 'Cuenta reactivada.');
    } catch (error) {
      this.actionError.set(friendlyError(error, 'No pudimos cambiar el estado de la cuenta.'));
      if (!isRefusal(error)) return;
      void this.workspace.afterRefusal(error);
    } finally {
      this.switching.set(false);
    }
    await this.load();
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
