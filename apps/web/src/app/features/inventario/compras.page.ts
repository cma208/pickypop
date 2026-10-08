import { Component, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Item, Page, type ArticleKind } from '../../ui';
import { CompraForm, type SavedPurchase } from './compra-form';
import { CompraPago } from './compra-pago';
import {
  InventarioData,
  type InventoryItemSummary,
  type PaymentAccount,
  type PurchaseLineView,
  type PurchaseSummary,
  type SkuSummary,
  type SupplierOption,
} from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_PIPES, unitFor } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';
import { InventoryPlan } from './inventory-plan';
import { savedPurchaseNotice } from './purchase-entries';
import { CurrentWorkspace, READ_ONLY_NOTE } from '../../core/workspace';

/** What a supply line is counted in when its item has no unit of its own. */
const DEFAULT_UNIT = 'unidad';

@Component({
  selector: 'app-compras',
  imports: [Page, AsyncState, Empty, Badge, Item, CompraForm, CompraPago, FORMAT_PIPES, INVENTORY_PIPES],
  template: `
    <pp-page
      [title]="creating() ? 'Nueva compra' : 'Compras'"
      [subtitle]="creating() ? 'Cada rollo entra con su costo real, envío incluido' : 'Lo que compraste y los rollos que generó'"
    >
      @if (!creating() && canOperate()) {
        <button actions type="button" [disabled]="loading() || !!error()" (click)="startNew()">+ Nueva compra</button>
      }
      @if (roleKnown() && !canOperate()) {
        <p class="muted">{{ readOnlyNote }}</p>
      }

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (creating() && canOperate()) {
          <app-compra-form
            [skuOptions]="skus()"
            [itemOptions]="items()"
            [supplierOptions]="suppliers()"
            [accountOptions]="accounts()"
            (saved)="onSaved($event)"
            (refused)="refresh()"
            (cancelled)="onCancelled()"
          />
        } @else if (purchases().length === 0) {
          <pp-empty message="Todavía no registraste ninguna compra.">
            @if (canOperate()) {
              <button type="button" (click)="startNew()">Registrar la primera compra</button>
            }
          </pp-empty>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="hide-small">Fecha</th>
                  <th>Qué se compró</th>
                  <th class="hide-small">Documento</th>
                  <th class="num">Total y pago</th>
                  <th><span class="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                @for (purchase of purchases(); track purchase.id) {
                  <tr>
                    <td class="date hide-small">{{ purchase.purchasedAt | fechaDia }}</td>
                    <td>
                      <pp-item
                        [path]="purchase.lines[0]?.imagePath"
                        [kind]="lineKind(purchase.lines[0])"
                        [color]="purchase.lines[0]?.colorHex"
                        [name]="boughtName(purchase)"
                      >
                        <span sub>
                          <span class="only-small">{{ purchase.purchasedAt | fechaDia }} · </span>
                          {{ purchase.supplierName ?? 'Sin proveedor' }}
                          @if (purchase.spoolCount > 0) {
                            · {{ purchase.spoolCount }} {{ purchase.spoolCount === 1 ? 'rollo' : 'rollos' }}
                          }
                        </span>
                      </pp-item>
                    </td>
                    <td class="hide-small">{{ purchase.documentRef ?? '—' }}</td>
                    <td class="num">
                      {{ purchase.total | money }}
                      <small class="sub">
                        @if (purchase.pending <= 0) {
                          Pagada
                        } @else if (purchase.paid > 0) {
                          <pp-badge tone="warn">Falta {{ purchase.pending | money }}</pp-badge>
                        } @else {
                          <pp-badge tone="warn">Por pagar</pp-badge>
                        }
                      </small>
                    </td>
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
                      <td colspan="5">
                        <ul>
                          @for (line of purchase.lines; track line.id) {
                            <li>
                              <pp-item
                                [path]="line.imagePath"
                                [kind]="lineKind(line)"
                                [color]="line.colorHex"
                                [name]="line.label"
                              >
                                <span sub>
                                  {{ lineQuantity(line) }} × {{ line.unitPrice | unitPrice }}
                                  @if (line.extra > 0) { + {{ line.extra | money }} de envío y otros }
                                </span>
                              </pp-item>
                            </li>
                          }
                        </ul>
                        <p class="muted meta">
                          Envío {{ purchase.shippingCost | money }} · Otros {{ purchase.otherCosts | money }}
                          · Reparto
                          <pp-badge>{{ purchase.allocation === 'by_weight' ? 'por peso' : 'por monto' }}</pp-badge>
                          @if (purchase.note) { · {{ purchase.note }} }
                        </p>
                        @if (purchase.pending > 0 && canOperate()) {
                          <app-compra-pago
                            [purchase]="purchase"
                            [accounts]="accounts()"
                            (paid)="onPaid()"
                            (refused)="refresh()"
                          />
                        } @else if (purchase.pending > 0) {
                          <p class="muted meta">Pagado: {{ purchase.paid | money }} · falta {{ purchase.pending | money }}.</p>
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
      .detail ul { margin: 0 0 0.75rem; padding: 0; list-style: none; display: grid; gap: 0.5rem; }
      .meta { margin: 0; font-size: var(--fs-sm); }
    `,
  ],
})
export class ComprasPage {
  private readonly data = inject(InventarioData);
  private readonly planner = inject(InventoryPlan);

  protected readonly purchases = signal<PurchaseSummary[]>([]);
  protected readonly skus = signal<SkuSummary[]>([]);
  protected readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly suppliers = signal<SupplierOption[]>([]);
  protected readonly accounts = signal<PaymentAccount[]>([]);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator keep the inventory; a viewer only reads it (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  protected readonly roleKnown = this.workspace.roleKnown;
  protected readonly readOnlyNote = READ_ONLY_NOTE;
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
    this.creating.set(true);
  }

  /** The list says what was bought, not only from whom: the first line, and how many more. */
  protected boughtName(purchase: PurchaseSummary): string {
    const [first, ...rest] = purchase.lines;
    if (!first) return 'Compra sin líneas';
    return rest.length === 0 ? first.label : `${first.label} y ${rest.length} más`;
  }

  /** The icon of a line without a photo: a spool for filament, the item's kind otherwise. */
  protected lineKind(line: PurchaseLineView | undefined): ArticleKind {
    if (!line) return 'supply';
    return line.isSpool ? 'spool' : (line.itemKind ?? 'supply');
  }

  /** «1000 g», «20 unidades», «3 rollos»: what the line bought, counted in its own unit. */
  protected lineQuantity(line: PurchaseLineView): string {
    const unit = line.isSpool ? (line.quantity === 1 ? 'rollo' : 'rollos') : unitFor(line.quantity, line.unit ?? DEFAULT_UNIT);
    return `${line.quantity} ${unit}`;
  }

  protected toggle(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected async onSaved(saved: SavedPurchase): Promise<void> {
    this.creating.set(false);
    // What came in may be exactly what an order was missing: the plan computes again.
    this.planner.changed();
    this.notice.set(savedPurchaseNotice(saved));
    await this.load();
  }

  /**
   * The database refused something: what this screen shows may be old (a
   * filament switched off, a purchase paid from another tab). The form or the
   * payment keeps its message; the lists behind it come back up to date.
   *
   * Quietly: if the reload fails too (the same lost connection, usually), the
   * page error would replace everything, and with it the open form, what was
   * typed in it and the key a retry needs to not register it twice. What is
   * on screen stays until a reload succeeds.
   */
  protected async refresh(): Promise<void> {
    try {
      await this.fetchLists();
    } catch (error) {
      console.error(error);
    }
  }

  /** Leaving the form: the list shows what is there now, in case what was being saved went in after all. */
  protected onCancelled(): void {
    this.creating.set(false);
    void this.refresh();
  }

  protected async onPaid(): Promise<void> {
    this.notice.set('Pago registrado. Ya figura en Caja, ligado a la compra.');
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      await this.fetchLists();
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las compras. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchLists(): Promise<void> {
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
  }
}
