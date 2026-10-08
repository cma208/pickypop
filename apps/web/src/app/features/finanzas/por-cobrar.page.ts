import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { sumMoney } from '../../core/pricing';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { FinanzasData, type AccountSummary, type ReceivableRow } from './finanzas.data';
import { agingBucket, AGING_LABELS, AGING_TONES, type CategoryOption } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';
import { PaymentForm } from './payment-form';

/** Lowercase and strip accents so "perez" finds "Pérez". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Component({
  selector: 'app-por-cobrar',
  imports: [Page, AsyncState, Empty, Badge, PaymentForm, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES],
  template: `
    <pp-page
      title="Por cobrar"
      subtitle="Pedidos ya entregados que todavía no están pagados, y cuánto llevan esperando"
    >
      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }

      @if (collecting(); as row) {
        @for (key of [row.orderId]; track key) {
          <app-payment-form
            [receivable]="row"
            [allAccounts]="accounts()"
            [allCategories]="categories()"
            (saved)="afterPayment($event)"
            (cancelled)="collecting.set(null)"
          />
        }
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (rows().length === 0) {
          <pp-empty message="No hay nada por cobrar: ningún pedido entregado tiene saldo pendiente." />
        } @else {
          <div class="totals">
            <div>
              <span class="cap">Total por cobrar</span>
              <span class="amount">{{ totalPending() | money }}</span>
            </div>
            <div>
              <span class="cap">Vencido</span>
              <span class="amount" [class.neg]="totalOverdue() > 0">{{ totalOverdue() | money }}</span>
            </div>
            <div>
              <span class="cap">Pedidos</span>
              <span class="amount">{{ rows().length }}</span>
            </div>
          </div>

          <div class="filters">
            <label class="filter wide">
              Buscar
              <input
                type="search"
                placeholder="Número de pedido o cliente"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
              />
            </label>
            <label class="check">
              <input type="checkbox" [checked]="onlyOverdue()" (change)="onlyOverdue.set(!onlyOverdue())" />
              Solo vencidos ({{ overdueCount() }})
            </label>
          </div>

          @if (visible().length === 0) {
            <pp-empty message="Ningún pedido coincide con el filtro." />
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th class="hide-small">Vencimiento</th>
                    <th class="num hide-small">Total</th>
                    <th class="num hide-small">Cobrado</th>
                    <th class="num">Pendiente</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of visible(); track row.orderId) {
                    <tr>
                      <td>
                        <span class="strong">{{ row.number }}</span>
                        <small class="sub">{{ row.customerName ?? 'Sin cliente' }}</small>
                        @if (row.customerPhone) { <small class="sub">{{ row.customerPhone }}</small> }
                        <small class="sub">Pedido del {{ row.orderedOn | fecha }}</small>
                        <small class="sub only-small">
                          Total {{ row.total | money }} · cobrado {{ row.paid | money }}
                        </small>
                      </td>
                      <td class="hide-small">
                        {{ row.dueDate ? (row.dueDate | fecha) : 'Sin fecha' }}
                        <small class="sub">
                          <pp-badge [tone]="tones[bucket(row)]">{{ aging(row) }}</pp-badge>
                        </small>
                      </td>
                      <td class="num hide-small">{{ row.total | money }}</td>
                      <td class="num hide-small">{{ row.paid | money }}</td>
                      <td class="num amount-cell">
                        {{ row.balance | money }}
                        <small class="sub only-small">
                          <pp-badge [tone]="tones[bucket(row)]">{{ aging(row) }}</pp-badge>
                        </small>
                      </td>
                      <td class="right nowrap">
                        <button type="button" (click)="startPayment(row)">Cobrar</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </pp-async>
    </pp-page>
  `,
})
export class PorCobrarPage {
  private readonly data = inject(FinanzasData);

  protected readonly tones = AGING_TONES;

  protected readonly rows = signal<ReceivableRow[]>([]);
  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly categories = signal<CategoryOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly collecting = signal<ReceivableRow | null>(null);
  protected readonly query = signal('');
  protected readonly onlyOverdue = signal(false);

  protected readonly totalPending = computed(() => sumMoney(this.rows().map((row) => row.balance)));
  protected readonly totalOverdue = computed(() =>
    sumMoney(this.rows().filter((row) => row.daysOverdue > 0).map((row) => row.balance)),
  );
  protected readonly overdueCount = computed(() => this.rows().filter((row) => row.daysOverdue > 0).length);

  protected readonly visible = computed(() => {
    const needle = normalize(this.query().trim());
    return this.rows().filter(
      (row) =>
        (!this.onlyOverdue() || row.daysOverdue > 0) &&
        (needle === '' || normalize(`${row.number} ${row.customerName ?? ''}`).includes(needle)),
    );
  });

  constructor() {
    void this.loadOptions();
    void this.load();
  }

  protected bucket(row: ReceivableRow) {
    return agingBucket(row.daysOverdue);
  }

  protected aging(row: ReceivableRow): string {
    if (row.daysOverdue <= 0) return AGING_LABELS.current;
    return `${row.daysOverdue} ${row.daysOverdue === 1 ? 'día' : 'días'} de atraso`;
  }

  protected startPayment(row: ReceivableRow): void {
    this.notice.set(null);
    this.collecting.set(row);
  }

  protected afterPayment(message: string): void {
    this.collecting.set(null);
    this.notice.set(message);
    void this.load();
  }

  private async loadOptions(): Promise<void> {
    try {
      const [accounts, categories] = await Promise.all([this.data.accounts(), this.data.categories()]);
      this.accounts.set(accounts);
      this.categories.set(categories);
    } catch (error) {
      // The list still reads without them; the collection form would not.
      console.error(error);
    }
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.rows.set(await this.data.receivables());
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar lo que está por cobrar. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
