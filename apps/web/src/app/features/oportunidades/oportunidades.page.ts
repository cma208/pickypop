import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { OportunidadDetalle } from './oportunidad-detalle';
import { OportunidadForm } from './oportunidad-form';
import { OportunidadesData, type OpportunityCard } from './oportunidades.data';
import {
  daysIdle,
  DROPPABLE_STAGES,
  isDerived,
  STAGES,
  STAGE_HELP,
  STAGE_LABEL,
  STAGE_TONE,
  STALE_AFTER_DAYS,
  type Stage,
} from './oportunidades.models';
import { CurrentWorkspace, READ_ONLY_NOTE } from '../../core/workspace';

/**
 * El tablero comercial. Seis columnas, y arrastrar una tarjeta cambia su etapa.
 *
 * Sin librería de kanban: `draggable` nativo basta para seis columnas, y una
 * dependencia por esto costaría más de lo que resuelve. Arrastrar es el atajo
 * del ratón; el camino que siempre funciona —teclado, móvil, lector de
 * pantalla— es el selector "Mover a" de cada tarjeta, que no es un respaldo
 * sino la forma principal.
 */
@Component({
  selector: 'app-oportunidades',
  imports: [Page, AsyncState, Empty, Badge, OportunidadForm, OportunidadDetalle, ...FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      .board { display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.75rem; align-items: flex-start; }
      .column {
        flex: 0 0 15rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.6rem;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--bg);
      }
      .column.over { border-color: var(--accent); background: var(--accent-soft); }
      .column.derived { border-style: dashed; }
      .column > header { display: grid; gap: 0.15rem; }
      .column h2 { margin: 0; font-size: 0.85rem; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; }
      .column .count { font-size: 0.75rem; color: var(--muted); }
      .column .help { font-size: 0.72rem; color: var(--muted); margin: 0; }
      .card {
        display: grid;
        gap: 0.3rem;
        width: 100%;
        padding: 0.6rem;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: grab;
      }
      .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .card.dragging { opacity: 0.5; }
      .card .title { font-weight: 600; font-size: 0.9rem; }
      .card .who, .card .meta { font-size: 0.78rem; color: var(--muted); }
      .card .amount { font-weight: 650; }
      .card .stale { color: var(--warn); }
      .card .blocked { font-size: 0.75rem; }
      .move { display: grid; gap: 0.2rem; margin-top: 0.2rem; }
      .move select { font-size: 0.78rem; padding: 0.2rem 0.3rem; }
      .move span { font-size: 0.7rem; color: var(--muted); }
      .reason { display: grid; gap: 0.3rem; margin-top: 0.4rem; }
      .reason input { font-size: 0.8rem; }
      .reason .form-actions button { padding: 0.2rem 0.6rem; font-size: 0.8rem; }
      @media (max-width: 30rem) {
        .column { flex-basis: 85vw; }
      }
    `,
  ],
  template: `
    <pp-page
      title="Oportunidades"
      subtitle="Los tratos en curso: lo que un cliente pidió, lo que se le cotizó y en qué quedó"
    >
      @if (canOperate()) {
        <button actions type="button" (click)="openForm(null)">Nuevo trato</button>
      } @else if (roleKnown()) {
        <p class="muted">{{ readOnlyNote }}</p>
      }

      @if (formOpen() && canOperate()) {
        @for (key of [editing()?.id ?? 'new']; track key) {
          <app-oportunidad-form [opportunity]="editing()" (saved)="afterSave()" (cancelled)="closeForm()" />
        }
      }

      @if (selected(); as card) {
        <app-oportunidad-detalle
          [opportunity]="card"
          (changed)="reload()"
          (edit)="openForm(card)"
          (closed)="selectedId.set(null)"
        />
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (cards().length === 0) {
          <pp-empty
            message="Todavía no hay ningún trato. Un trato agrupa las cotizaciones que le mandaste a un cliente y los pedidos que salieron de ahí."
          >
            @if (canOperate()) {
              <button type="button" (click)="openForm(null)">Nuevo trato</button>
            }
          </pp-empty>
        } @else {
          @if (moveError(); as message) { <p class="error" role="alert">{{ message }}</p> }

          <div class="board">
            @for (stage of stages; track stage) {
              <section
                class="column"
                [class.over]="dragOver() === stage"
                [class.derived]="derived(stage)"
                (dragover)="onDragOver($event, stage)"
                (dragleave)="dragOver.set(null)"
                (drop)="onDrop($event, stage)"
              >
                <header>
                  <h2>{{ labels[stage] }}</h2>
                  <span class="count">{{ inStage(stage).length }} · {{ totalOf(stage) | money }}</span>
                  <p class="help">{{ help[stage] }}</p>
                </header>

                @for (card of inStage(stage); track card.id) {
                  <div
                    class="card"
                    [class.dragging]="dragging() === card.id"
                    [draggable]="canOperate() && !derived(stage)"
                    (dragstart)="onDragStart($event, card)"
                    (dragend)="dragging.set(null)"
                  >
                    <button type="button" class="ghost title" (click)="selectedId.set(card.id)">
                      {{ card.title }}
                    </button>
                    <span class="who">{{ card.customerName ?? 'Sin cliente' }}</span>
                    <span class="amount">{{ card.amount | money }}</span>
                    @if (card.blockedReason; as reason) {
                      <span class="blocked"><pp-badge tone="warn">⏸ {{ reason }}</pp-badge></span>
                    }
                    <span class="meta" [class.stale]="stale(card)">{{ idleLabel(card) }}</span>
                    <span class="meta">
                      {{ card.quotes }} cot. · {{ card.orders }} ped.
                      @if (card.expectedClose) { · decide {{ card.expectedClose | fecha }} }
                    </span>

                    @if (askingReasonFor() === card.id) {
                      <div class="reason">
                        <label>
                          <span class="muted">¿Por qué se perdió?</span>
                          <input
                            [value]="lostReason()"
                            (input)="lostReason.set($any($event.target).value)"
                            placeholder="Ej.: se fue con otro taller por precio"
                          />
                        </label>
                        <div class="form-actions">
                          <button type="button" (click)="confirmLost(card)" [disabled]="moving()">Darlo por perdido</button>
                          <button type="button" class="ghost" (click)="askingReasonFor.set(null)">Cancelar</button>
                        </div>
                      </div>
                    } @else if (canOperate() && !derived(stage)) {
                      <label class="move">
                        <span>Mover a</span>
                        <select [value]="stage" (change)="onPick(card, $event)">
                          @for (target of droppable; track target) {
                            <option [value]="target" [selected]="target === stage">{{ labels[target] }}</option>
                          }
                        </select>
                      </label>
                    }
                  </div>
                }

                @if (inStage(stage).length === 0) {
                  <p class="help">—</p>
                }
              </section>
            }
          </div>
        }
      </pp-async>
    </pp-page>
  `,
})
export class OportunidadesPage {
  private readonly data = inject(OportunidadesData);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator sell; a viewer only reads (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  protected readonly roleKnown = this.workspace.roleKnown;
  protected readonly readOnlyNote = READ_ONLY_NOTE;

  protected readonly stages = STAGES;
  protected readonly droppable = DROPPABLE_STAGES;
  protected readonly labels = STAGE_LABEL;
  protected readonly tones = STAGE_TONE;
  protected readonly help = STAGE_HELP;

  protected readonly cards = signal<OpportunityCard[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly moveError = signal<string | null>(null);
  protected readonly moving = signal(false);
  protected readonly dragging = signal<string | null>(null);
  protected readonly dragOver = signal<Stage | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<OpportunityCard | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly askingReasonFor = signal<string | null>(null);
  protected readonly lostReason = signal('');

  protected readonly selected = computed(() =>
    this.cards().find((card) => card.id === this.selectedId()) ?? null,
  );

  constructor() {
    void this.reload();
  }

  protected derived(stage: Stage): boolean {
    return isDerived(stage);
  }

  protected inStage(stage: Stage): OpportunityCard[] {
    return this.cards().filter((card) => card.stage === stage);
  }

  protected totalOf(stage: Stage): number {
    return this.inStage(stage).reduce((sum, card) => sum + card.amount, 0);
  }

  protected stale(card: OpportunityCard): boolean {
    return daysIdle(card.lastActivityAt) >= STALE_AFTER_DAYS;
  }

  protected idleLabel(card: OpportunityCard): string {
    const days = daysIdle(card.lastActivityAt);
    if (days === 0) return 'Se movió hoy';
    if (days === 1) return 'Un día sin moverse';
    return `${days} días sin moverse`;
  }

  protected onDragStart(event: DragEvent, card: OpportunityCard): void {
    this.dragging.set(card.id);
    event.dataTransfer?.setData('text/plain', card.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onDragOver(event: DragEvent, stage: Stage): void {
    if (isDerived(stage)) return; // "Cerrado" no acepta tarjetas: se llega solo.
    event.preventDefault();
    this.dragOver.set(stage);
  }

  protected onDrop(event: DragEvent, stage: Stage): void {
    event.preventDefault();
    this.dragOver.set(null);

    const id = event.dataTransfer?.getData('text/plain') ?? this.dragging();
    this.dragging.set(null);
    const card = this.cards().find((item) => item.id === id);
    if (card) void this.moveTo(card, stage);
  }

  protected onPick(card: OpportunityCard, event: Event): void {
    const stage = (event.target as HTMLSelectElement).value as Stage;
    void this.moveTo(card, stage);
  }

  protected confirmLost(card: OpportunityCard): void {
    void this.commit(card, 'lost', this.lostReason());
  }

  /**
   * Perder un trato es el único movimiento que pide motivo: es el dato que
   * sirve para no volver a perderlo por lo mismo, y después de guardarlo ya
   * nadie se acuerda.
   */
  private async moveTo(card: OpportunityCard, stage: Stage): Promise<void> {
    if (stage === card.stage) return;

    if (stage === 'lost') {
      this.lostReason.set('');
      this.askingReasonFor.set(card.id);
      return;
    }

    await this.commit(card, stage, null);
  }

  private async commit(card: OpportunityCard, stage: Stage, reason: string | null): Promise<void> {
    this.moving.set(true);
    this.moveError.set(null);
    try {
      await this.data.setStage(card.id, stage, reason?.trim() || null);
      this.askingReasonFor.set(null);
      await this.reload(false);
    } catch (error) {
      void this.workspace.afterRefusal(error);
      this.moveError.set(friendlyError(error, 'No pudimos mover el trato. Inténtalo de nuevo.'));
    } finally {
      this.moving.set(false);
    }
  }

  protected openForm(card: OpportunityCard | null): void {
    this.editing.set(card);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected afterSave(): void {
    this.closeForm();
    void this.reload();
  }

  protected async reload(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading.set(true);
    try {
      this.cards.set(await this.data.board());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar el tablero. Inténtalo de nuevo en un momento.'));
    } finally {
      this.loading.set(false);
    }
  }
}
