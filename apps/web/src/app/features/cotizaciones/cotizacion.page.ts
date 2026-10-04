import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page, type BadgeTone } from '../../ui';
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
import { calculateLine, materialLines, VALUATION_LABELS, type LineResult, type MaterialLineRow } from '../cotizador/quote-model';

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
  imports: [RouterLink, Page, Card, Badge, AsyncState, Empty, Desglose, ...FORMAT_PIPES],
  templateUrl: './cotizacion.page.html',
  styles: `
    :host { display: block; }
    pp-card { display: block; margin-bottom: 1rem; }
    .banner { margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.9rem; }
    .banner.warn { background: var(--warn-soft); color: var(--warn); }
    .banner.bad { background: var(--danger-soft); color: var(--danger); }
    .banner.info { background: var(--accent-soft); color: var(--accent); }
    dl.facts { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0; }
    dl.facts dt { color: var(--muted); font-size: 0.85rem; }
    dl.facts dd { margin: 0; }
    .totals { display: grid; gap: 0.35rem; margin: 1rem 0 0; }
    .totals > div { display: flex; justify-content: space-between; gap: 1rem; }
    .totals dt, .totals dd { margin: 0; }
    .totals .big dt, .totals .big dd { font-size: 1.1rem; font-weight: 600; }
    .line { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
    .line:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
    .line h3 { margin: 0 0 0.25rem; font-size: 1rem; }
    .line .meta { margin: 0 0 0.75rem; font-size: 0.85rem; }
  `,
})
export class CotizacionPage {
  private readonly data = inject(CotizadorData);

  /** Component input binding is not wired up in the app, so read the route. */
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly quote = signal<QuoteDetail | null>(null);
  protected readonly confirming = signal<QuoteStatus | null>(null);

  private readonly today = new Date().toISOString().slice(0, 10);

  constructor() {
    void this.load();
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
    if (quote === null || snapshot === null) return [];

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

  protected readonly canSend = computed(() => this.quote()?.status === 'draft');
  protected readonly canClose = computed(() => this.quote()?.status === 'sent');

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.quote.set(await this.data.quote(this.id));
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos leer la cotización.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------ writing

  /** Accepting or rejecting closes the quote, so it is asked twice. */
  protected ask(status: QuoteStatus): void {
    this.confirming.set(status);
  }

  protected cancelAsk(): void {
    this.confirming.set(null);
  }

  protected async apply(status: QuoteStatus): Promise<void> {
    const quote = this.quote();
    if (quote === null || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);

    try {
      await this.data.setStatus(quote.id, status);
      this.quote.set({ ...quote, status });
      this.confirming.set(null);
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos cambiar el estado.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected readonly confirmLabel = computed(() => {
    switch (this.confirming()) {
      case 'accepted':
        return '¿Confirmas que el cliente aceptó esta cotización?';
      case 'rejected':
        return '¿Confirmas que el cliente la rechazó?';
      default:
        return '';
    }
  });
}
