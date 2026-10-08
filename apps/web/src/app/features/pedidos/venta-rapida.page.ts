import { afterNextRender, Component, computed, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { inputToIso } from '../../core/dates';
import { UserFacingError } from '../../core/friendly-error';
import { AsyncState, Card, Field, FORMAT_PIPES, Page } from '../../ui';
import { PedidosData, type AccountOption } from './pedidos.data';
import { explainError } from './pedidos.errors';
import {
  oneMore,
  saleDone,
  saleKey,
  saleProblem,
  saleTotals,
  sameTotals,
  toQuickSale,
  validQuantity,
  type CustomerChoice,
  type QuickSalePayload,
  type SaleDone,
  type SalePayment,
  type SentSale,
  type ShelfOffer,
  type VariantInfo,
} from './quick-sale';
import { createQuickCustomer, VentaRapidaCliente, WALK_IN_NAME } from './venta-rapida-cliente';
import { createQuickPayment, VentaRapidaCobro, type QuickPaymentForm } from './venta-rapida-cobro';
import { QuickSaleData, type SoldOrder } from './venta-rapida.data';
import { VentaRapidaEstante } from './venta-rapida-estante';
import { VentaRapidaHecha } from './venta-rapida-hecha';
import { createQuickLine, VentaRapidaLinea, type QuickLineForm } from './venta-rapida-linea';

/** Shown for a line whose product left the shelf before its name could be read. */
const UNKNOWN_ITEM: Omit<VariantInfo, 'id'> = { productName: 'Producto', variantName: '', imagePath: null, listPrice: null };

/** Pedidos with every status: a quick sale is born delivered, and «En curso» never shows it. */
const ALL_ORDERS = { estado: 'todos' };

/**
 * «Venta rápida» (ADR-024): what is assembled and free on the shelf, sold,
 * handed over and collected in one step. The database does all of it in one
 * transaction (`quick_sale`); this screen picks the products by their photo,
 * prices them like «Nuevo pedido» and says before the button what would stop
 * the sale.
 */
@Component({
  selector: 'app-venta-rapida',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Page,
    Card,
    Field,
    AsyncState,
    VentaRapidaEstante,
    VentaRapidaLinea,
    VentaRapidaCliente,
    VentaRapidaCobro,
    VentaRapidaHecha,
    ...FORMAT_PIPES,
  ],
  template: `
    <pp-page title="Venta rápida" subtitle="Lo armado del estante: se entrega y se cobra en un solo paso">
      <a actions class="button secondary" routerLink="/pedidos" [queryParams]="allOrders">Ver pedidos</a>

      <pp-async [loading]="loading()" [error]="loadError()">
        <div class="layout">
          <section aria-labelledby="shelf-title">
            <div class="section-head">
              <h2 id="shelf-title">Libre en el estante</h2>
              <button type="button" class="ghost" (click)="reloadShelf()" [disabled]="shelfLoading()">
                {{ shelfLoading() ? 'Actualizando…' : 'Actualizar' }}
              </button>
            </div>
            @if (shelfError(); as message) {
              <p class="alert" role="alert">{{ message }}</p>
            } @else if (!shelfRead()) {
              <p class="muted">Leyendo el estante…</p>
            } @else {
              <app-venta-rapida-estante [offers]="offers()" [inSale]="inSale()" (add)="add($event)" />
            }
          </section>

          <!-- Not a <form>: Enter in a field, or «Ir» on a phone's keyboard, would sell. Only the button does. -->
          <div class="sale" [formGroup]="form">
            @if (done(); as sale) {
              <app-venta-rapida-hecha [sale]="sale" (closed)="done.set(null)" />
            }

            <pp-card heading="La venta">
              @for (line of lines.controls; track line; let i = $index) {
                <app-venta-rapida-linea [group]="line" [item]="itemOf(line)" [free]="freeOf(line)" (remove)="removeLine(i)" />
              } @empty {
                <p class="muted">Toca un producto del estante para agregarlo.</p>
              }
              <dl class="sum">
                <dt>Total</dt>
                <dd class="num total">{{ totals().total | money }}</dd>
                @if (totals().cost > 0) {
                  <dt class="muted">Costo estimado</dt>
                  <dd class="num muted">{{ totals().cost | money }}</dd>
                }
              </dl>
            </pp-card>

            <pp-card heading="Cliente">
              <app-venta-rapida-cliente [group]="form.controls.customer" [customers]="customers()" [owes]="totals().owed > 0" />
              <pp-field label="Nota" hint="Opcional. Por ejemplo: «Feria de Barranco».">
                <input type="text" formControlName="note" autocomplete="off" />
              </pp-field>
            </pp-card>

            <pp-card heading="Cobro">
              <app-venta-rapida-cobro [group]="form.controls.payment" [accounts]="accounts()" [totals]="totals()" />
            </pp-card>

            <div class="go">
              @if (sellError(); as message) {
                <p class="alert" role="alert">
                  {{ message }}
                  @if (unsure()) {
                    <a routerLink="/pedidos" [queryParams]="allOrders">Ver los últimos pedidos</a>
                  }
                </p>
              } @else if (problem(); as text) {
                <p [class]="lines.length > 0 ? 'alert-warn' : 'muted'" role="status">{{ text }}</p>
              }
              <p class="muted small">Al vender, lo vendido sale del estante y queda entregado: no se deshace.</p>
              <button type="button" class="sell" (click)="sell()" [disabled]="selling() || !!problem()">
                {{ selling() ? 'Vendiendo…' : 'Vender ' + (totals().total | money) }}
              </button>
            </div>
          </div>
        </div>
      </pp-async>
    </pp-page>
  `,
  styles: `
    .layout { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
    @media (min-width: 64rem) { .layout { grid-template-columns: minmax(0, 1fr) minmax(22rem, 28rem); } }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; }
    h2 { margin: 0; font-size: var(--fs-lg); font-weight: 650; }
    .sale { display: grid; gap: 1rem; min-width: 0; }
    .sum { display: grid; grid-template-columns: 1fr auto; gap: 0.2rem 1rem; margin: 0.75rem 0 0; padding-top: 0.75rem; border-top: 1px solid var(--line); }
    .sum dd { margin: 0; }
    .total { font-size: var(--fs-lg); font-weight: 650; }
    .go { display: grid; gap: 0.5rem; }
    .go p { margin: 0; }
    .small { font-size: var(--fs-sm); }
    .sell { min-height: 3rem; font-size: var(--fs-md); font-weight: 600; }
  `,
})
export class VentaRapidaPage {
  private readonly data = inject(QuickSaleData);
  private readonly pedidos = inject(PedidosData);
  private readonly injector = inject(Injector);
  private readonly summary = viewChild(VentaRapidaHecha);

  protected readonly form = new FormGroup({
    lines: new FormArray<QuickLineForm>([]),
    customer: createQuickCustomer(),
    payment: createQuickPayment(),
    note: new FormControl('', { nonNullable: true }),
  });

  protected readonly offers = signal<ShelfOffer[]>([]);
  protected readonly customers = signal<CustomerChoice[]>([]);
  protected readonly accounts = signal<AccountOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly shelfLoading = signal(false);
  /** Until the plan answers once, an empty shelf would only mean «not read yet». */
  protected readonly shelfRead = signal(false);
  protected readonly shelfError = signal<string | null>(null);
  protected readonly allOrders = ALL_ORDERS;
  protected readonly selling = signal(false);
  protected readonly sellError = signal<string | null>(null);
  /** The sale failed in a way that does not say whether it was saved. */
  protected readonly unsure = signal(false);
  protected readonly done = signal<SaleDone | null>(null);
  /** Every product seen on the shelf, so a line keeps its photo and name if it stops being free. */
  private readonly known = signal(new Map<string, VariantInfo>());
  /** The last sale sent without an answer that it was made: sent again unchanged, it keeps its key. */
  private lastSent: SentSale | null = null;

  private readonly changes = toSignal(this.form.valueChanges);
  private readonly value = computed(() => {
    this.changes();
    return this.form.getRawValue();
  });
  private readonly offersById = computed(() => new Map(this.offers().map((offer) => [offer.id, offer])));

  protected readonly inSale = computed(
    () => new Map(this.value().lines.map((line) => [line.variantId, validQuantity(line.quantity) ? line.quantity : 0])),
  );
  protected readonly totals = computed(() => saleTotals(this.value().lines, this.value().payment.amount), {
    equal: sameTotals,
  });
  protected readonly problem = computed(() => saleProblem(this.check(this.offersById())));

  constructor() {
    // A refusal speaks of the sale as it was: once the sale changes, what
    // stops it now is `problem`, and the old message would contradict it.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.selling()) return;
      this.sellError.set(null);
      this.unsure.set(false);
    });
    void this.load();
  }

  protected get lines(): FormArray<QuickLineForm> {
    return this.form.controls.lines;
  }

  protected itemOf(line: QuickLineForm): VariantInfo {
    const id = line.controls.variantId.value;
    return this.known().get(id) ?? { id, ...UNKNOWN_ITEM };
  }

  protected freeOf(line: QuickLineForm): number {
    return this.offersById().get(line.controls.variantId.value)?.free ?? 0;
  }

  /** A tap adds one more, never past what is free. */
  protected add(offer: ShelfOffer): void {
    this.sellError.set(null);
    const line = this.lines.controls.find((row) => row.controls.variantId.value === offer.id);
    if (line) line.controls.quantity.setValue(oneMore(line.controls.quantity.value, offer.free));
    else this.lines.push(createQuickLine(offer.id, offer.listPrice));
  }

  protected removeLine(index: number): void {
    this.lines.removeAt(index);
    this.sellError.set(null);
  }

  protected async reloadShelf(): Promise<void> {
    this.shelfLoading.set(true);
    try {
      this.applyOffers(await this.data.offers(true));
      this.shelfError.set(null);
      this.shelfRead.set(true);
    } catch (error) {
      this.shelfError.set(explainError(error, 'No pudimos calcular qué está libre en el estante. Toca «Actualizar» en un momento.'));
    } finally {
      this.shelfLoading.set(false);
    }
  }

  protected async sell(): Promise<void> {
    if (this.selling() || this.problem()) return;
    this.selling.set(true);
    this.sellError.set(null);
    this.unsure.set(false);
    // The last sale's summary would read as this one's, even if this one fails.
    this.done.set(null);
    const value = this.value();
    const payload = toQuickSale({ ...value, payment: this.payment(value.payment) });
    const { key, reused } = saleKey(this.lastSent, payload, () => crypto.randomUUID());
    this.lastSent = { key, payload };
    try {
      // Sent before without an answer, it may be done already: then the
      // shelf it emptied would refuse it, so the database is asked first.
      const made = reused ? await this.data.findSale(key) : null;
      if (made) return await this.sold(payload, made);
      if (!(await this.stillFree())) return;
      await this.sold(payload, await this.data.sell(payload, key));
    } catch (error) {
      await this.failed(error, key, payload);
    } finally {
      this.selling.set(false);
    }
  }

  /**
   * The plan again, right before selling: what was free when it was tapped
   * may have been sold or separated by somebody else since. The database
   * would still refuse what is not on the shelf, but not what is on it and
   * belongs to another order.
   */
  private async stillFree(): Promise<boolean> {
    let fresh: ShelfOffer[];
    try {
      fresh = await this.data.offers(true);
    } catch (error) {
      this.sellError.set(explainError(error, 'No pudimos comprobar qué está libre en el estante. Inténtalo en un momento.'));
      return false;
    }
    this.applyOffers(fresh);
    const changed = saleProblem(this.check(new Map(fresh.map((offer) => [offer.id, offer]))));
    if (changed) this.sellError.set(`El estante cambió mientras elegías. ${changed}`);
    return changed === null;
  }

  private async sold(payload: QuickSalePayload, order: SoldOrder): Promise<void> {
    this.lastSent = null;
    this.done.set(saleDone(order, payload, this.customerName(payload)));
    this.resetSale();
    afterNextRender(() => this.summary()?.show(), { injector: this.injector });
    // A new customer, the walk-in one the first time, and fewer free units.
    await Promise.allSettled([this.reloadShelf(), this.loadCustomers()]);
  }

  /**
   * The next sale starts empty, from the same account and dated when it is
   * made. The method goes back to the account's: the next customer may pay
   * another way, and a method left from the last one would go unnoticed.
   */
  private resetSale(): void {
    this.lines.clear();
    this.form.controls.customer.reset();
    this.form.controls.note.reset();
    this.form.controls.payment.patchValue({ followTotal: true, amount: 0, method: '', reference: '', soldAt: '' });
  }

  /**
   * A refusal of the database (what is short, a payment over the total)
   * says it all, and nothing was saved. Anything else may have failed after
   * the sale was saved: the database is asked by its key before saying so.
   */
  private async failed(error: unknown, key: string, payload: QuickSalePayload): Promise<void> {
    const refused = error instanceof UserFacingError;
    if (!refused) {
      const made = await this.data.findSale(key).catch(() => null);
      if (made) return this.sold(payload, made);
    }
    // What refused it may have changed under the screen: the shelf, or an
    // account deactivated meanwhile. Read again first, then say why, so the
    // reload (which may clear that account) does not wipe the reason.
    await Promise.allSettled([this.reloadShelf(), this.loadAccounts()]);
    this.sellError.set(this.sellFailure(error));
    this.unsure.set(!refused);
  }

  private sellFailure(error: unknown): string {
    if (error instanceof UserFacingError) return error.message;
    return `${explainError(error, 'No pudimos registrar la venta.')} Vuelve a tocar «Vender» sin cambiar nada: si llegó a guardarse, no se repite.`;
  }

  private customerName(payload: QuickSalePayload): string {
    if (payload.customerId) return this.customers().find((row) => row.id === payload.customerId)?.name ?? 'Cliente';
    return payload.customerName ?? this.customers().find((row) => row.walkIn)?.name ?? WALK_IN_NAME;
  }

  private check(offers: ReadonlyMap<string, ShelfOffer>): Parameters<typeof saleProblem>[0] {
    const value = this.value();
    return {
      lines: value.lines,
      offers,
      customer: value.customer,
      payment: this.payment(value.payment),
      accounts: this.accounts(),
    };
  }

  private payment(payment: ReturnType<QuickPaymentForm['getRawValue']>): SalePayment {
    return { ...payment, soldAt: payment.soldAt ? inputToIso(payment.soldAt) : null };
  }

  private applyOffers(offers: ShelfOffer[]): void {
    this.offers.set(offers);
    this.known.update((known) => new Map([...known, ...offers.map((offer) => [offer.id, offer] as const)]));
  }

  private async load(): Promise<void> {
    const shelf = this.reloadShelf();
    try {
      await Promise.all([this.loadAccounts(), this.loadCustomers()]);
      // With one account there is nothing to choose.
      const accounts = this.accounts();
      if (accounts.length === 1) this.form.controls.payment.controls.accountId.setValue(accounts[0]!.id);
    } catch (error) {
      this.loadError.set(explainError(error, 'No pudimos cargar las cuentas y los clientes. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
    await shelf;
  }

  private async loadCustomers(): Promise<void> {
    this.customers.set(await this.data.customers());
  }

  /** Only active accounts. One that stopped being so is no longer chosen: the screen would offer it blank and send it anyway. */
  private async loadAccounts(): Promise<void> {
    const accounts = await this.pedidos.paymentAccounts();
    this.accounts.set(accounts);
    const chosen = this.form.controls.payment.controls.accountId;
    if (chosen.value && !accounts.some((account) => account.id === chosen.value)) chosen.setValue('');
  }
}
