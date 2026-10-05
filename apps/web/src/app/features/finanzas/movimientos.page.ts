import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { FinanzasData, type AccountSummary, type LedgerFilter, type LedgerRow } from './finanzas.data';
import {
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_SHORT,
  TRANSACTION_TYPE_TONES,
  timeLabel,
  type CategoryOption,
  type TransactionType,
} from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { ledgerTotals, markVoidable } from './ledger-totals';
import { TransactionForm } from './transaction-form';
import { VoidForm } from './void-form';

const NO_FILTER: LedgerFilter = { accountId: null, type: null, from: null, to: null };

@Component({
  selector: 'app-movimientos-financieros',
  imports: [Page, AsyncState, Empty, Badge, TransactionForm, VoidForm, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    FINANCE_STYLES,
    `
      .time { color: var(--muted); font-variant-numeric: tabular-nums; }
      .reason { color: var(--danger); }
    `,
  ],
  template: `
    <pp-page title="Movimientos de dinero" subtitle="El libro: todo lo que entró, salió y cambió de cuenta">
      <button actions type="button" (click)="openForm()">Registrar movimiento</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }

      @if (formOpen()) {
        <app-transaction-form
          [allAccounts]="accounts()"
          [allCategories]="categories()"
          (saved)="afterChange($event)"
          (cancelled)="formOpen.set(false)"
        />
      }

      @if (voiding(); as row) {
        @for (key of [row.key]; track key) {
          <app-void-form [row]="row" (voided)="afterChange($event)" (cancelled)="voiding.set(null)" />
        }
      }

      <div class="filters">
        <label class="filter wide">
          Cuenta
          <select [value]="filter().accountId ?? ''" (change)="onAccount($event)">
            <option value="">Todas</option>
            @for (account of accounts(); track account.id) {
              <option [value]="account.id">{{ account.name }}</option>
            }
          </select>
        </label>
        <label class="filter">
          Tipo
          <select [value]="filter().type ?? ''" (change)="onType($event)">
            <option value="">Todos</option>
            @for (type of types; track type) {
              <option [value]="type">{{ typeLabels[type] }}</option>
            }
          </select>
        </label>
        <label class="filter">
          Desde
          <input type="date" [value]="filter().from ?? ''" (change)="onDate('from', $event)" />
        </label>
        <label class="filter">
          Hasta
          <input type="date" [value]="filter().to ?? ''" (change)="onDate('to', $event)" />
        </label>
        <label class="check">
          <input type="checkbox" [checked]="showVoided()" (change)="showVoided.set(!showVoided())" />
          Ver anulados
        </label>
        @if (hasFilter()) {
          <button type="button" class="secondary" (click)="clear()">Limpiar filtros</button>
        }
      </div>

      @if (rangeProblem()) {
        <p class="alert alert-warn" role="alert">La fecha «desde» no puede ser posterior a «hasta».</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (visible().length === 0) {
          <pp-empty
            [message]="
              hasFilter()
                ? 'No hay movimientos con estos filtros.'
                : 'Todavía no hay movimientos de dinero registrados.'
            "
          >
            <button type="button" (click)="openForm()">Registrar el primero</button>
          </pp-empty>
        } @else {
          <div class="totals">
            <div>
              <span class="cap">Entradas</span>
              <span class="amount pos">{{ totals().inflow | money }}</span>
            </div>
            <div>
              <span class="cap">Salidas</span>
              <span class="amount neg">{{ totals().outflow | money }}</span>
            </div>
            <div>
              <span class="cap">Neto</span>
              <span class="amount" [class.neg]="totals().net < 0">{{ totals().net | money }}</span>
            </div>
            @if (totals().transfers > 0) {
              <div>
                <span class="cap">Transferencias (no cambian el total)</span>
                <span class="amount">{{ totals().transferAmount | money }}</span>
              </div>
            }
            @if (totals().voided > 0) {
              <div>
                <span class="cap">Anulados (no suman)</span>
                <span class="amount muted">{{ totals().voided }}</span>
              </div>
            }
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th class="hide-small">Cuenta</th>
                  <th class="hide-small">Categoría</th>
                  <th class="num">Monto</th>
                  <th><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of visible(); track row.key) {
                  <tr [class.voided]="row.voided">
                    <td class="nowrap">
                      {{ row.occurredAt | fecha }}
                      <small class="sub time">{{ hora(row) }}</small>
                    </td>
                    <td>
                      <pp-badge [tone]="row.voided ? 'neutral' : tones[row.type]">
                        {{ typeShort[row.type] }}
                      </pp-badge>
                      @if (row.voided) { <pp-badge tone="bad">Anulado</pp-badge> }
                      @if (row.otherAccountName) {
                        <small class="sub">
                          {{ row.isCounterLeg ? 'Viene de' : 'Va a' }} {{ row.otherAccountName }}
                        </small>
                      }
                      @if (row.counterparty) { <small class="sub">{{ row.counterparty }}</small> }
                      @if (row.origin) { <small class="sub">{{ row.origin }}</small> }
                      @if (row.note) { <small class="sub">{{ row.note }}</small> }
                      @if (row.reference) { <small class="sub">Ref. {{ row.reference }}</small> }
                      @if (row.voidReason) { <small class="sub reason">Motivo: {{ row.voidReason }}</small> }
                      <small class="sub only-small">{{ row.accountName }}</small>
                    </td>
                    <td class="hide-small">
                      {{ row.accountName }}
                      @if (row.paymentMethod) {
                        <small class="sub">{{ methodLabels[row.paymentMethod] }}</small>
                      }
                    </td>
                    <td class="hide-small">{{ row.categoryName ?? '—' }}</td>
                    <td
                      class="num amount-cell"
                      [class.pos]="!row.voided && row.signedAmount > 0"
                      [class.neg]="!row.voided && row.signedAmount < 0"
                    >
                      {{ row.voided ? (row.amount | money) : (row.signedAmount | money) }}
                    </td>
                    <td class="right nowrap">
                      @if (row.canVoid) {
                        <button type="button" class="ghost" (click)="startVoid(row)">Anular</button>
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
export class MovimientosFinancierosPage {
  private readonly data = inject(FinanzasData);

  protected readonly types = TRANSACTION_TYPES;
  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;
  protected readonly typeShort = TRANSACTION_TYPE_SHORT;
  protected readonly tones = TRANSACTION_TYPE_TONES;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly rows = signal<LedgerRow[]>([]);
  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly voiding = signal<LedgerRow | null>(null);
  protected readonly showVoided = signal(true);
  protected readonly filter = signal<LedgerFilter>(NO_FILTER);

  /** Guards against a slower, older response landing after a newer one. */
  private requestId = 0;

  protected readonly hasFilter = computed(() =>
    Object.values(this.filter()).some((value) => value !== null),
  );

  protected readonly rangeProblem = computed(() => {
    const { from, to } = this.filter();
    return from !== null && to !== null && from > to;
  });

  protected readonly visible = computed(() =>
    markVoidable(this.showVoided() ? this.rows() : this.rows().filter((row) => !row.voided)),
  );

  protected readonly totals = computed(() => ledgerTotals(this.visible()));

  constructor() {
    void this.loadOptions();
    void this.load();
  }

  protected hora(row: LedgerRow): string {
    return row.occurredAt ? timeLabel(row.occurredAt) : '';
  }

  protected openForm(): void {
    this.notice.set(null);
    this.voiding.set(null);
    this.formOpen.set(true);
  }

  protected startVoid(row: LedgerRow): void {
    this.notice.set(null);
    this.formOpen.set(false);
    this.voiding.set(row);
  }

  protected afterChange(message: string): void {
    this.formOpen.set(false);
    this.voiding.set(null);
    this.notice.set(message);
    void this.loadOptions();
    void this.load();
  }

  protected onAccount(event: Event): void {
    this.update({ accountId: (event.target as HTMLSelectElement).value || null });
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TransactionType | '';
    this.update({ type: value || null });
  }

  protected onDate(field: 'from' | 'to', event: Event): void {
    this.update({ [field]: (event.target as HTMLInputElement).value || null });
  }

  protected clear(): void {
    this.update(NO_FILTER);
  }

  private update(change: Partial<LedgerFilter>): void {
    this.filter.update((current) => ({ ...current, ...change }));
    void this.load();
  }

  private async loadOptions(): Promise<void> {
    try {
      const [accounts, categories] = await Promise.all([this.data.accounts(), this.data.categories()]);
      this.accounts.set(accounts);
      this.categories.set(categories);
    } catch (error) {
      // The book still reads without the pickers; they just stay empty.
      console.error(error);
    }
  }

  private async load(): Promise<void> {
    if (this.rangeProblem()) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }

    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.data.ledger(this.filter());
      if (request !== this.requestId) return;
      this.rows.set(rows);
    } catch (error) {
      if (request !== this.requestId) return;
      this.error.set(friendlyError(error, 'No pudimos cargar los movimientos. Inténtalo de nuevo.'));
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }
}
