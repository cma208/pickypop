import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { dateTimeLong } from '../../core/dates';
import { PlanService } from '../../core/plan';
import { Card, Item } from '../../ui';
import type { QuoteDetail } from '../cotizador/cotizador.data';
import { Promesa } from '../cotizador/promesa';
import { readyLine, readyPhrase, saleBuyText } from '../cotizador/promise-text';
import { quoteSituation, type QuoteSituation } from './quote-situation';

/**
 * "¿Para cuándo?" on the quote itself. Sent with its hold running, it is a
 * demand of the plan and says its situation from its place in the line,
 * exactly as production sees it. A draft, or a quote whose hold is gone,
 * says what it would get if the customer confirmed today: at the end of the
 * line, with what is left.
 */
@Component({
  selector: 'app-cotizacion-situacion',
  imports: [Card, Item, Promesa],
  template: `
    @if (situation(); as s) {
      <pp-card [heading]="s.held ? 'Situación' : '¿Para cuándo?'">
        @if (s.promise.readyAt; as readyAt) {
          <p class="ready">
            Toda la cotización: <strong>{{ ready(readyAt) }}</strong>
          </p>
          @if (risk(s); as text) { <p class="muted context">Si falla una placa: {{ text }}.</p> }
        }
        <p class="muted context">{{ context(s) }}</p>
        @if (buy(s); as text) {
          <p class="buy">{{ text }} La fecha supone que llega a tiempo; no frena la venta.</p>
        }

        <ul class="lines">
          @for (stored of quote().storedLines; track stored.id; let index = $index) {
            <li>
              <pp-item
                size="inline"
                kind="product"
                [photo]="{ kind: 'variant', id: stored.variantId }"
                [name]="stored.quantity + ' × ' + stored.description"
              />
              @if (s.promise.lines[index]; as answer) {
                <app-promesa [promise]="answer" [now]="s.promise.now" heading="" forWhom="Para esta línea" />
              } @else {
                <p class="muted">A medida y sin placas: el plan no sabe cuánto tarda.</p>
              }
            </li>
          }
        </ul>
      </pp-card>
    } @else if (failed()) {
      <pp-card heading="¿Para cuándo?">
        <p class="muted">No pudimos leer el plan del taller. La cotización sigue igual; vuelve a abrirla en un momento.</p>
      </pp-card>
    }
  `,
  styles: `
    pp-card { display: block; margin-bottom: 1rem; }
    .ready { margin: 0; font-size: var(--fs-md); }
    .context { margin: 0.25rem 0 0; font-size: var(--fs-sm); }
    .buy { margin: 0.6rem 0 0; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); }
    .lines { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0.9rem; }
    .lines li { display: grid; gap: 0.4rem; }
  `,
})
export class CotizacionSituacion {
  private readonly planner = inject(PlanService);

  readonly quote = input.required<QuoteDetail>();

  protected readonly situation = signal<QuoteSituation | null>(null);
  protected readonly failed = signal(false);

  /** Only a quote that may still be accepted has a "¿para cuándo?". */
  private readonly open = computed(() => this.quote().status === 'draft' || this.quote().status === 'sent');

  constructor() {
    effect(() => {
      const quote = this.quote();
      const open = this.open();
      this.planner.version();
      untracked(() => (open ? void this.load(quote) : this.situation.set(null)));
    });
  }

  protected ready(readyAt: string): string {
    if (this.situation()?.promise.unknown) return 'Sin fecha: hay una línea que el plan no sabe cuánto tarda.';
    return readyLine(readyAt, this.situation()?.promise.now ?? new Date().toISOString());
  }

  protected risk(situation: QuoteSituation): string | null {
    const lines = situation.promise.lines.flatMap((line) => (line ? [line.plan] : []));
    const latest = lines.reduce<string | null>(
      (top, line) => (top === null || Date.parse(line.readyAtIfFailure) > Date.parse(top) ? line.readyAtIfFailure : top),
      null,
    );
    if (latest === null || latest === situation.promise.readyAt) return null;
    return readyPhrase(latest, situation.promise.now);
  }

  protected buy(situation: QuoteSituation): string | null {
    return saleBuyText(situation.promise);
  }

  protected context(situation: QuoteSituation): string {
    const quote = this.quote();
    if (situation.held) {
      const until = quote.holdUntil ? ` hasta el ${dateTimeLong(quote.holdUntil)}` : '';
      return `Separa lo que pide y su lugar en la fila${until}. Así la ven producción y los demás vendedores.`;
    }
    if (quote.status === 'draft') {
      return 'Si la envías hoy y el cliente confirma. Un borrador todavía no separa nada: lo que hay en el estante puede tomarlo otra venta.';
    }
    if (quote.holdUntil !== null) {
      return `El separo venció el ${dateTimeLong(quote.holdUntil)}. Si el cliente acepta hoy, entra al final de la fila con lo que quede.`;
    }
    return 'No separa nada. Si el cliente acepta hoy, entra al final de la fila con lo que quede.';
  }

  private async load(quote: QuoteDetail): Promise<void> {
    try {
      const { input, result } = await this.planner.current();
      if (this.quote() !== quote) return;
      this.situation.set(quoteSituation(input, result, quote, (change) => this.planner.whatIf(input, change)));
      this.failed.set(false);
    } catch {
      // It informs; the quote is still the quote without it.
      this.situation.set(null);
      this.failed.set(true);
    }
  }
}
