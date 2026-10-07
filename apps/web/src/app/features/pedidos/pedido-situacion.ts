import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlanDemandPlan, PlanInput, PlanResult } from '@pickypop/domain';
import { dateTimeLong } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { PlanService } from '../../core/plan';
import { lineSituation, readyText, shortageText } from '../../core/plan-format';
import { SUPABASE } from '../../core/supabase';
import { Badge, Card } from '../../ui';
import {
  demandLabel,
  dueText,
  passWarning,
  placeOf,
  readyChanges,
  withOrderAhead,
  type QueuePlace,
  type ReadyChange,
} from './pedido-fila';

interface PriorityChange {
  passedLabel: string;
  reason: string;
  changedAt: string;
}

/** How many of those ahead are named before saying "y N más". */
const NAMED_AHEAD = 3;

/**
 * Where the order stands (ADR-021): its place in the line, what each line has
 * on the shelf, to assemble or to print, and when it would be ready. From the
 * same plan the queue and the shelf read, so the three never disagree.
 *
 * «Pasar adelante» is never refused: the owner decided a person may choose,
 * after seeing who was there first and whose date moves.
 */
@Component({
  selector: 'app-pedido-situacion',
  imports: [Card, Badge, RouterLink],
  template: `
    @if (demand(); as d) {
      <pp-card heading="Situación">
        <div class="head">
          @if (d.unknown) {
            <p class="ready">Sin fecha: hay una línea que el plan no sabe cuánto tarda.</p>
          } @else {
            <p class="ready">
              Estaría listo <strong>{{ ready(d.readyAt) }}</strong>
              @if (d.readyAtIfFailure !== d.readyAt) {
                <span class="muted"> · si falla una placa, {{ ready(d.readyAtIfFailure) }}</span>
              }
            </p>
          }
          @if (d.late) { <pp-badge tone="bad">Llega tarde</pp-badge> }
        </div>
        @if (due(d); as text) { <p class="muted due">{{ text }}</p> }
        @if (d.needsPurchase) {
          <p class="buy">Antes hay que comprar {{ buy(d) }}. Mientras tanto, la fecha supone que llega ya.</p>
        }

        <ul class="lines">
          @for (line of d.lines; track line.lineId) {
            <li>
              <span class="strong">{{ line.quantity }} × {{ line.description }}</span>
              <span class="muted">{{ situation(line) }} · {{ line.unknown ?? ready(line.readyAt) }}</span>
            </li>
          }
        </ul>

        @if (place(); as p) {
          <p class="place">
            @if (p.position === 1) {
              Va primero en la fila.
            } @else {
              Va {{ p.position }}.º en la fila. Antes: {{ aheadText(p) }}.
            }
          </p>

          @if (p.ahead.length > 0 && !passing()) {
            <button type="button" class="secondary" (click)="startPassing(p)">Pasar adelante</button>
          }

          @if (passing() && target(); as t) {
            <div class="pass">
              <label>
                Pasar delante de
                <select [value]="t.id" (change)="choose($event)">
                  @for (ahead of reversedAhead(p); track ahead.id) {
                    <option [value]="ahead.id">{{ label(ahead) }}</option>
                  }
                </select>
              </label>

              <p class="warning">{{ warning(t) }}</p>

              @if (changes(); as moved) {
                @if (moved.length > 0) {
                  <p class="muted">Con este cambio:</p>
                  <ul class="changes">
                    @for (change of moved; track change.label) {
                      <li>
                        {{ change.label }}: de {{ change.from }} a <strong>{{ change.to }}</strong>
                        @if (change.becomesLate) { <pp-badge tone="bad">pasaría a llegar tarde</pp-badge> }
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="muted">Ninguna fecha cambia: lo que hay alcanza para los dos.</p>
                }
              }

              <label>
                ¿Por qué? <span class="muted">(queda en el historial del pedido)</span>
                <textarea rows="2" [value]="reason()" (input)="reason.set(read($event))"></textarea>
              </label>
              <div class="row">
                <button type="button" (click)="confirm(t)" [disabled]="busy() || reason().trim() === ''">
                  {{ busy() ? 'Pasando…' : 'Pasar adelante igual' }}
                </button>
                <button type="button" class="ghost" (click)="passing.set(false)" [disabled]="busy()">No</button>
              </div>
              @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
            </div>
          }
        }

        @if (history().length > 0) {
          <details class="history">
            <summary>Cambios de lugar ({{ history().length }})</summary>
            <ul>
              @for (change of history(); track change.changedAt) {
                <li>{{ when(change.changedAt) }}: pasó delante de {{ change.passedLabel }}. «{{ change.reason }}»</li>
              }
            </ul>
          </details>
        }

        <p class="muted small">
          Lo dice el plan del taller, el mismo que ve la cola. <a routerLink="/produccion">Ver la cola</a>
        </p>
      </pp-card>
    }
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .ready { margin: 0; font-size: 1rem; }
    .due { margin: 0.25rem 0 0; }
    .buy { margin: 0.6rem 0 0; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); }
    .lines { list-style: none; margin: 0.9rem 0; padding: 0; display: grid; gap: 0.4rem; }
    .lines li { display: grid; gap: 0.1rem; }
    .place { margin: 0.5rem 0; }
    .pass { display: grid; gap: 0.6rem; margin-top: 0.75rem; padding: 0.75rem; border: 1px solid var(--line); border-radius: var(--radius-sm); }
    .pass label { display: grid; gap: 0.25rem; font-size: 0.85rem; }
    .warning { margin: 0; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--info-soft); }
    .changes { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .history { margin-top: 0.75rem; font-size: 0.85rem; }
    .history ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
    .small { font-size: 0.8rem; margin: 0.75rem 0 0; }
    .error { margin: 0; }
  `,
})
export class PedidoSituacion {
  private readonly planner = inject(PlanService);
  private readonly supabase = inject(SUPABASE);

  readonly orderId = input.required<string>();
  /** Who goes first changed: the page reads the order again. */
  readonly changed = output<void>();

  private readonly input = signal<PlanInput | null>(null);
  private readonly result = signal<PlanResult | null>(null);
  protected readonly history = signal<PriorityChange[]>([]);
  protected readonly passing = signal(false);
  protected readonly targetId = signal<string | null>(null);
  protected readonly changes = signal<ReadyChange[] | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly demand = computed(
    () => this.result()?.demands.find((demand) => demand.kind === 'order' && demand.id === this.orderId()) ?? null,
  );
  protected readonly place = computed(() => {
    const result = this.result();
    return result ? placeOf(result, this.orderId()) : null;
  });
  protected readonly target = computed(
    () => this.place()?.ahead.find((demand) => demand.id === this.targetId()) ?? null,
  );

  protected readonly situation = lineSituation;
  protected readonly label = demandLabel;
  protected readonly warning = passWarning;
  protected readonly due = dueText;

  constructor() {
    effect(() => {
      const id = this.orderId();
      this.planner.version();
      untracked(() => void this.load(id));
    });
  }

  protected ready(iso: string): string {
    const now = this.result()?.now ?? new Date().toISOString();
    return readyText(iso, now);
  }

  protected buy(demand: PlanDemandPlan): string {
    return shortageText(demand.lines.flatMap((line) => line.shortages));
  }

  protected when(iso: string): string {
    return dateTimeLong(iso);
  }

  protected aheadText(place: QueuePlace): string {
    const nearest = [...place.ahead].reverse();
    const named = nearest.slice(0, NAMED_AHEAD).map(demandLabel).join(', ');
    const rest = nearest.length - NAMED_AHEAD;
    return rest > 0 ? `${named} y ${rest} más` : named;
  }

  protected reversedAhead(place: QueuePlace): PlanDemandPlan[] {
    return [...place.ahead].reverse();
  }

  protected read(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected startPassing(place: QueuePlace): void {
    const nearest = place.ahead[place.ahead.length - 1];
    if (!nearest) return;
    this.reason.set('');
    this.error.set(null);
    this.passing.set(true);
    this.simulate(nearest.id);
  }

  protected choose(event: Event): void {
    this.simulate((event.target as HTMLSelectElement).value);
  }

  protected async confirm(target: PlanDemandPlan): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.rpc('prioritize_order', {
        p_order_id: this.orderId(),
        p_before_kind: target.kind,
        p_before_id: target.id,
        p_reason: this.reason().trim(),
      });
      if (error) throw error;
      this.passing.set(false);
      this.planner.invalidate();
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cambiar el lugar del pedido.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** What moves for whom, before anybody confirms. */
  private simulate(targetId: string): void {
    this.targetId.set(targetId);
    this.changes.set(null);
    const before = this.result();
    const input = this.input();
    if (!before || !input) return;
    const after = this.planner.whatIf(input, (snapshot) => withOrderAhead(snapshot, this.orderId(), targetId));
    this.changes.set(readyChanges(before, after));
  }

  private async load(orderId: string): Promise<void> {
    try {
      const [{ input, result }, history] = await Promise.all([
        this.planner.current(),
        this.supabase
          .from('order_priority_changes')
          .select('passed_label, reason, changed_at')
          .eq('order_id', orderId)
          .order('changed_at', { ascending: false }),
      ]);
      if (history.error) throw history.error;
      this.input.set(input);
      this.result.set(result);
      this.history.set(
        history.data.map((row) => ({ passedLabel: row.passed_label, reason: row.reason, changedAt: row.changed_at })),
      );
    } catch {
      // The situation is a help, not the order: if the plan cannot be read,
      // the rest of the page still works and this card stays away.
      this.input.set(null);
      this.result.set(null);
    }
  }
}
