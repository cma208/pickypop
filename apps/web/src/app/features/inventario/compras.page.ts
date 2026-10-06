import { Component, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { CompraForm, type SavedPurchase } from './compra-form';
import { CompraPago } from './compra-pago';
import {
  InventarioData,
  type InventoryItemSummary,
  type PaymentAccount,
  type PurchaseSummary,
  type SkuSummary,
  type SupplierOption,
} from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_PIPES } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';

@Component({
  selector: 'app-compras',
  imports: [Page, AsyncState, Empty, Badge, CompraForm, CompraPago, FORMAT_PIPES, INVENTORY_PIPES],
  template: `
    <pp-page
      [title]="creating() ? 'Nueva compra' : 'Compras'"
      [subtitle]="creating() ? 'Cada rollo entra con su costo real, envío incluido' : 'Lo que compraste y los rollos que generó'"
    >
      @if (!creating()) {
        <button actions type="button" [disabled]="loading() || !!error()" (click)="startNew()">+ Nueva compra</button>
      }

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (warning(); as text) {
        <p class="alert alert-warn" role="alert">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (creating()) {
          <app-compra-form
            [skuOptions]="skus()"
            [itemOptions]="items()"
            [supplierOptions]="suppliers()"
            [accountOptions]="accounts()"
            (saved)="onSaved($event)"
            (cancelled)="creating.set(false)"
          />
        } @else if (purchases().length === 0) {
          <pp-empty message="Todavía no registraste ninguna compra.">
            <button type="button" (click)="startNew()">Registrar la primera compra</button>
          </pp-empty>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th class="hide-small">Documento</th>
                  <th class="num">Total</th>
                  <th>Pago</th>
                  <th class="num hide-small">Rollos</th>
                  <th><span class="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                @for (purchase of purchases(); track purchase.id) {
                  <tr>
                    <td class="date">{{ purchase.purchasedAt | fechaDia }}</td>
                    <td>
                      {{ purchase.supplierName ?? 'Sin proveedor' }}
                      <small class="sub only-small">
                        {{ purchase.spoolCount }} {{ purchase.spoolCount === 1 ? 'rollo' : 'rollos' }}
                        @if (purchase.documentRef) { · {{ purchase.documentRef }} }
                      </small>
                    </td>
                    <td class="hide-small">{{ purchase.documentRef ?? '—' }}</td>
                    <td class="num">{{ purchase.total | money }}</td>
                    <td>
                      @if (purchase.pending <= 0) {
                        <pp-badge tone="good">Pagada</pp-badge>
                      } @else if (purchase.paid > 0) {
                        <pp-badge tone="warn">Falta {{ purchase.pending | money }}</pp-badge>
                      } @else {
                        <pp-badge tone="warn">Por pagar</pp-badge>
                      }
                    </td>
                    <td class="num hide-small">{{ purchase.spoolCount }}</td>
                    <td class="actions-cell">
                      <button
                        type="button"
                        class="ghost"
                        [attr.aria-expanded]="expandedId() === purchase.id"
                        (click)="toggle(purchase.id)"
                      >
                        {{ expandedId() === purchase.id ? 'Ocultar' : 'Detalle' }}
                      </button>
                    </td>
                  </tr>
                  @if (expandedId() === purchase.id) {
                    <tr class="detail">
                      <td colspan="7">
                        <ul>
                          @for (line of purchase.lines; track line.id) {
                            <li>
                              <span>{{ line.label }}</span>
                              <span class="muted">
                                {{ line.quantity }} × {{ line.unitPrice | money }}
                                @if (line.extra > 0) { + {{ line.extra | money }} de envío y otros }
                              </span>
                            </li>
                          }
                        </ul>
                        <p class="muted meta">
                          Envío {{ purchase.shippingCost | money }} · Otros {{ purchase.otherCosts | money }}
                          · Reparto
                          <pp-badge>{{ purchase.allocation === 'by_weight' ? 'por peso' : 'por monto' }}</pp-badge>
                          @if (purchase.note) { · {{ purchase.note }} }
                        </p>
                        @if (purchase.pending > 0) {
                          <app-compra-pago [purchase]="purchase" [accounts]="accounts()" (paid)="onPaid()" />
                        } @else {
                          <p class="muted meta">Pagada: {{ purchase.paid | money }}.</p>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </pp-async>
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .date { white-space: nowrap; }
      .detail td { background: var(--bg); }
      .detail ul { margin: 0 0 0.5rem; padding: 0; list-style: none; display: grid; gap: 0.25rem; }
      .detail li { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .meta { margin: 0; font-size: 0.85rem; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap;
      }
    `,
  ],
})
export class ComprasPage {
  private readonly data = inject(InventarioData);

  protected readonly purchases = signal<PurchaseSummary[]>([]);
  protected readonly skus = signal<SkuSummary[]>([]);
  protected readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly suppliers = signal<SupplierOption[]>([]);
  protected readonly accounts = signal<PaymentAccount[]>([]);
  protected readonly warning = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly expandedId = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected startNew(): void {
    this.notice.set(null);
    this.warning.set(null);
    this.creating.set(true);
  }

  protected toggle(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected async onSaved(saved: SavedPurchase): Promise<void> {
    const { rolls, paymentFailed } = saved;
    this.creating.set(false);
    this.notice.set(
      rolls > 0
        ? `Compra registrada. Se crearon ${rolls} ${rolls === 1 ? 'rollo' : 'rollos'} con su costo final.`
        : 'Compra registrada. El stock de insumos ya subió.',
    );
    this.warning.set(
      paymentFailed
        ? 'No pudimos registrar el pago, así que la compra quedó «por pagar». Ábrela con «Detalle» y regístralo ahí.'
        : null,
    );
    await this.load();
  }

  protected async onPaid(): Promise<void> {
    this.warning.set(null);
    this.notice.set('Pago registrado. Ya figura en Caja, ligado a la compra.');
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const [purchases, skus, items, suppliers, accounts] = await Promise.all([
        this.data.purchases(),
        this.data.skus(),
        this.data.items(),
        this.data.suppliers(),
        this.data.paymentAccounts(),
      ]);
      this.purchases.set(purchases);
      this.accounts.set(accounts);
      this.skus.set(skus);
      this.items.set(items);
      this.suppliers.set(suppliers);
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las compras. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
