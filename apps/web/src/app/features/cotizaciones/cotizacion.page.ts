import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Item, Page, ResourceHeader, type BadgeTone, type HeaderAction } from '../../ui';
import { documentTitle } from '../../core/document-title';
import { todayLocal } from '../../core/dates';
import { Desglose } from '../cotizador/desglose';
import {
  CotizadorData,
  DataError,
  frozenFilaments,
  QUOTE_STATUS_LABELS,
  type QuoteDetail,
  type QuoteStatus,
  type StoredLine,
} from '../cotizador/cotizador.data';
import { totalFor } from '../../core/pricing';
import { supplyQuantityText } from '../cotizador/quantity-text';
import {
  calculateLine,
  materialLines,
  VALUATION_LABELS,
  type LineResult,
  type MaterialLineRow,
  type SupplyDraft,
} from '../cotizador/quote-model';
import { CurrentWorkspace } from '../../core/workspace';
import { PlanService } from '../../core/plan';
import { CotizacionAceptar } from './cotizacion-aceptar';
import { CotizacionSeparo } from './cotizacion-separo';
import { CotizacionSituacion } from './cotizacion-situacion';
import { buildQuoteDocument } from './quote-document';

/** A stored line, read back exactly as it was calculated. */
interface FrozenLine {
  stored: StoredLine;
  result: LineResult | null;
  materials: MaterialLineRow[];
  /** True when the frozen inputs no longer reproduce the stored price. */
  drifted: boolean;
}

const TONES: Record<QuoteStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'good',
  rejected: 'bad',
  expired: 'warn',
};

const A_CENT = 0.005;

@Component({
  selector: 'app-cotizacion',
  imports: [
    RouterLink,
    Page,
    Card,
    Badge,
    AsyncState,
    Empty,
    Item,
    ResourceHeader,
    Desglose,
    CotizacionAceptar,
    CotizacionSeparo,
    CotizacionSituacion,
    ...FORMAT_PIPES,
  ],
  templateUrl: './cotizacion.page.html',
  styles: `
    :host { display: block; }
    pp-card { display: block; margin-bottom: 1rem; }
    .banner { margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.9rem; }
    .banner.warn { background: var(--warn-soft); color: var(--warn); }
    .banner.bad { background: var(--danger-soft); color: var(--danger); }
    .banner.info { background: var(--info-soft); color: var(--info); }
    dl.facts { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0; }
    dl.facts dt { color: var(--muted); font-size: 0.85rem; }
    dl.facts dd { margin: 0; }
    .totals { display: grid; gap: 0.35rem; margin: 1rem 0 0; }
    .totals > div { display: flex; justify-content: space-between; gap: 1rem; }
    .totals dt, .totals dd { margin: 0; }
    .totals .big dt, .totals .big dd { font-size: 1.1rem; font-weight: 600; }
    .line { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
    .line:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
    .line-head { margin-bottom: 0.75rem; }
    .line-head strong { font-size: var(--fs-lg); }
  `,
})
export class CotizacionPage {
  private readonly data = inject(CotizadorData);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly router = inject(Router);
  private readonly planner = inject(PlanService);

  /** Bound from the :id segment of the route. */
  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** A refused step, shown over the quote: `error` would replace the whole page. */
  protected readonly actionError = signal<string | null>(null);
  protected readonly quote = signal<QuoteDetail | null>(null);
  /** Rejecting closes the quote for good, so it is asked twice. */
  protected readonly confirmingReject = signal(false);
  /** The panel that shows the order about to be created. */
  protected readonly accepting = signal(false);
  private readonly acceptPanel = viewChild(CotizacionAceptar, { read: ElementRef });
  protected readonly downloading = signal(false);
  /** Kept apart from `error` so a failed download does not hide the quote. */
  protected readonly pdfError = signal<string | null>(null);

  private readonly today = todayLocal();

  constructor() {
    // A required input is not set yet while the constructor runs, and the id
    // can change when the router reuses this component for another quote.
    effect(() => void this.load(this.id()));
    // The main button sits at the bottom of a phone screen: bring the panel it
    // opens into view instead of leaving it above the fold.
    effect(() => {
      const panel = this.acceptPanel()?.nativeElement as HTMLElement | undefined;
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ------------------------------------------------------------ reading

  /**
   * Re-runs the frozen inputs through the shared formulas with the frozen
   * parameters. Nothing is recalculated with today's prices on purpose: a
   * quote that was sent has to keep saying what it said.
   */
  protected readonly lines = computed<FrozenLine[]>(() => {
    const quote = this.quote();
    const snapshot = quote?.snapshot ?? null;
    if (quote === null) return [];

    // Sin el snapshot de parámetros no se puede **recalcular** la línea, pero
    // sí mostrarla: los importes guardados son los que el cliente aceptó, y
    // esconderlos hacía que la ficha dijera "no tiene líneas" cuando sí las
    // tenía. El PDF siempre las imprimió; esto las devuelve a la pantalla.
    if (snapshot === null) {
      return quote.storedLines.map((stored) => ({
        stored,
        result: null,
        materials: [],
        drifted: false,
      }));
    }

    return quote.storedLines.map((stored) => {
      const skus = frozenFilaments(stored);
      const draft = {
        description: stored.description,
        variantId: stored.variantId,
        quantity: stored.quantity,
        setupMinutes: stored.setupMinutes,
        minutesPerUnit: stored.minutesPerUnit,
        plates: stored.plates,
        supplies: stored.supplies,
      };

      const result = calculateLine(
        draft,
        skus,
        snapshot.profile,
        snapshot.printer,
        snapshot.priceSettings,
        // A catalogue line was priced from the price list, not from its cost
        // (ADR-019): its frozen price is the list. Recalculating it from the
        // cost always "drifted" and told the seller the quote was wrong.
        stored.variantId !== null ? { listPrice: stored.unitPrice, tiers: [] } : null,
      );

      return {
        stored,
        result,
        materials: materialLines(draft, skus, snapshot.profile, snapshot.printer),
        drifted:
          result !== null && Math.abs(result.price.total - stored.unitPrice) > A_CENT,
      };
    });
  });

  protected readonly overdue = computed(() => {
    const quote = this.quote();
    if (quote === null || quote.validUntil === null) return false;
    if (quote.status === 'accepted' || quote.status === 'rejected') return false;

    return quote.validUntil < this.today;
  });

  protected readonly tone = computed<BadgeTone>(() => {
    const quote = this.quote();
    if (quote === null) return 'neutral';

    return this.overdue() ? 'warn' : TONES[quote.status];
  });

  protected readonly statusLabel = computed(() => {
    const quote = this.quote();
    return quote === null ? '' : QUOTE_STATUS_LABELS[quote.status];
  });

  protected readonly valuationLabel = computed(() => {
    const snapshot = this.quote()?.snapshot;
    return snapshot === undefined || snapshot === null ? '' : VALUATION_LABELS[snapshot.valuation];
  });

  /** «50 g», not a bare «50»: the quote keeps the quantity, the stock item its unit. */
  protected supplyQuantity(supply: SupplyDraft): string {
    const unit = supply.inventoryItemId === null ? null : this.quote()?.supplyUnits[supply.inventoryItemId];
    return supplyQuantityText(supply.quantity, unit);
  }

  /** What the supply adds, by the domain's rule rather than a product in the template. */
  protected supplyCost(supply: SupplyDraft): number {
    return totalFor(supply.unitCost, supply.quantity);
  }

  /**
   * A version that is history (there is a newer one) or a document that
   * already has its order is not sent, accepted nor held again: the
   * database refuses it, and the screen does not offer it (T4-09).
   */
  protected readonly historical = computed(() => {
    const quote = this.quote();
    return quote !== null && (quote.hasNewerVersion || quote.order !== null);
  });
  protected readonly canSend = computed(() => this.quote()?.status === 'draft' && !this.historical());
  protected readonly canAccept = computed(() => this.quote()?.status === 'sent' && !this.historical());
  /** An old version can still be rejected: it only lets go of what it held. */
  protected readonly canReject = computed(() => this.quote()?.status === 'sent' && this.quote()?.order === null);
  /** Not of a document that already has its order: the new version could not be sent. */
  protected readonly canVersion = computed(() => this.quote() !== null && this.quote()?.order === null);

  /** Who it is for and what it is: "Colegio San Martín · 30 × Botella de poción". */
  protected readonly heading = computed(() => {
    const quote = this.quote();
    return quote ? documentTitle(quote.customerName, quote.storedLines) : 'Cotización';
  });

  protected readonly code = computed(() => {
    const quote = this.quote();
    if (!quote) return null;
    return quote.version > 1 ? `${quote.number} · versión ${quote.version}` : quote.number;
  });

  /**
   * The one step this quote asks for next: send the draft, then hear back
   * from the customer, then go to the order it became. Rejecting, the PDF and
   * a new version wait in "Más". While the acceptance panel is open, its own
   * button is the one to press, so the header steps aside.
   */
  protected readonly mainAction = computed<HeaderAction | null>(() => {
    if (this.canSend()) return { label: 'Marcar como enviada', busy: this.busy() };
    if (this.canAccept()) return this.accepting() ? null : { label: 'El cliente aceptó', busy: this.busy() };
    if (this.quote()?.order) return { label: 'Ver el pedido' };
    return null;
  });

  protected onMainAction(): void {
    const quote = this.quote();
    if (this.canSend()) void this.apply('sent');
    else if (this.canAccept()) this.openAccept();
    else if (quote?.order) void this.router.navigate(['/pedidos', quote.order.id]);
  }

  protected openAccept(): void {
    this.confirmingReject.set(false);
    this.accepting.set(true);
  }

  /** The hold moved: the new end and, when it started again, the new place in the line. */
  protected onHoldChanged(hold: { heldAt: string | null; holdUntil: string | null }): void {
    this.quote.update((quote) => (quote === null ? quote : { ...quote, ...hold }));
  }

  /**
   * The quote changed elsewhere (another tab accepted it, a newer version
   * appeared): read it again so the page says what is true now.
   */
  protected async onStale(message: string): Promise<void> {
    this.actionError.set(message);
    await this.reload();
  }

  protected async reload(): Promise<void> {
    const quote = this.quote();
    if (quote === null) return;
    try {
      this.quote.set(await this.data.quote(quote.id));
    } catch (cause) {
      this.actionError.set(cause instanceof DataError ? cause.message : 'No pudimos volver a leer la cotización.');
    }
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.actionError.set(null);
    this.quote.set(null);
    // A panel left open belongs to the quote it was opened on.
    this.accepting.set(false);
    this.confirmingReject.set(false);

    try {
      this.quote.set(await this.data.quote(id));
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos leer la cotización.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------ printing

  /**
   * Builds the PDF from the stored amounts and hands it to the browser.
   * jsPDF is loaded only here: it weighs more than the rest of the screen and
   * most visits never ask for a file.
   */
  protected async downloadPdf(): Promise<void> {
    const quote = this.quote();
    if (quote === null || this.downloading()) return;

    this.downloading.set(true);
    this.pdfError.set(null);

    try {
      const { name } = await this.workspace.info();
      const { downloadQuotePdf } = await import('./quote-pdf');
      downloadQuotePdf(buildQuoteDocument(quote, name));
    } catch {
      this.pdfError.set('No pudimos generar el PDF de esta cotización.');
    } finally {
      this.downloading.set(false);
    }
  }

  // ------------------------------------------------------------ writing

  protected askReject(): void {
    this.accepting.set(false);
    this.confirmingReject.set(true);
  }

  /**
   * Sends or rejects. Read back afterwards instead of patched here: sending
   * starts the hold and rejecting ends it, and the database decides both.
   */
  protected async apply(status: QuoteStatus): Promise<void> {
    if (this.busy()) return;
    const quote = this.quote();
    if (quote === null) return;

    this.busy.set(true);
    this.actionError.set(null);

    try {
      // From the status this page shows: if another tab moved it, nothing changes.
      await this.data.setStatus(quote.id, quote.status, status);
      // Sending starts a hold and rejecting ends it: everybody's plan moved.
      this.planner.invalidate();
      this.quote.set(await this.data.quote(quote.id));
      this.confirmingReject.set(false);
    } catch (cause) {
      this.actionError.set(
        cause instanceof DataError ? cause.message : 'No pudimos cambiar el estado.',
      );
      this.confirmingReject.set(false);
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
