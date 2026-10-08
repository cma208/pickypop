import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { dateTimeLong, inputToIso, isoToInput } from '../../core/dates';
import { Card } from '../../ui';
import { CotizadorData, DataError, type QuoteStatus } from '../cotizador/cotizador.data';
import { holdState, holdUntilProblem } from './quote-hold';
import { PlanService } from '../../core/plan';
import { CurrentWorkspace } from '../../core/workspace';

/** Often enough for "vence" to turn into "venció" while the page stays open. */
const CLOCK_TICK_MS = 30_000;

type Editing = 'change' | 'renew' | 'release' | null;

/**
 * What a quote holds and until when, always said as a day and an hour. A sent
 * quote holds what it asks for for a short while: the end can be moved to a
 * concrete moment, let go of at once, or started again once it expired, which
 * puts the quote at the end of the line. A draft holds nothing yet, and says
 * until when it will hold once it is sent.
 */
@Component({
  selector: 'app-cotizacion-separo',
  imports: [Card],
  template: `
    <pp-card heading="Separo">
      @if (releaseOnly()) {
        @if (state().kind === 'active') {
          <p class="lead">
            Esta versión quedó como historial, pero todavía separa lo que pide hasta el
            <strong>{{ long(holdUntil()!) }}</strong>: lo suelta sola cuando se envíe o se acepte la versión nueva. No se
            alarga.
          </p>
          @if (!canOperate()) {
            <!-- A viewer reads the hold; changing it is writing (ADR-025). -->
          } @else if (editing() === 'release') {
            <div class="ask" role="alert">
              <p>¿Soltar el separo ahora? Lo que aparta queda libre para otros pedidos desde ya.</p>
              <div class="row">
                <button type="button" class="danger" [disabled]="busy()" (click)="release()">Sí, soltar ya</button>
                <button type="button" class="ghost" [disabled]="busy()" (click)="close()">No</button>
              </div>
            </div>
          } @else {
            <div class="row">
              <button type="button" class="ghost" (click)="editing.set('release')">Soltar ya</button>
            </div>
          }
        } @else {
          <p class="lead">Esta versión quedó como historial y no separa nada.</p>
        }
      } @else if (status() === 'draft') {
        <p class="lead">
          Todavía no separa nada.
          @if (draftUntil(); as until) {
            Al marcarla como enviada, separará lo que pide hasta el <strong>{{ long(until) }}</strong>.
          } @else {
            Al marcarla como enviada, separará lo que pide por un plazo corto.
          }
        </p>
      } @else {
        @switch (state().kind) {
          @case ('active') {
            <p class="lead">Separa lo que pide hasta el <strong>{{ long(holdUntil()!) }}</strong>.</p>
          }
          @case ('expired') {
            <p class="lead">El separo venció el <strong>{{ long(holdUntil()!) }}</strong>. Ya no aparta nada.</p>
          }
          @default {
            <p class="lead">Esta proforma no separa nada.</p>
          }
        }

        @switch (canOperate() ? editing() : 'reading') {
          @case ('reading') {
            <!-- A viewer reads the hold; changing it is writing (ADR-025). -->
          }
          @case ('release') {
            <div class="ask" role="alert">
              <p>
                ¿Soltar el separo ahora? Lo que aparta queda libre para otros pedidos desde ya. Si el cliente vuelve,
                la proforma entra al final de la fila.
              </p>
              <div class="row">
                <button type="button" class="danger" [disabled]="busy()" (click)="release()">Sí, soltar ya</button>
                <button type="button" class="ghost" [disabled]="busy()" (click)="close()">No</button>
              </div>
            </div>
          }
          @case (null) {
            <div class="row">
              @if (state().kind === 'active') {
                <button type="button" class="secondary" (click)="open('change')">Cambiar</button>
                <button type="button" class="ghost" (click)="editing.set('release')">Soltar ya</button>
              } @else {
                <button type="button" class="secondary" (click)="open('renew')">
                  {{ state().kind === 'expired' ? 'Volver a separar' : 'Separar' }}
                </button>
              }
            </div>
          }
          @default {
            <form class="edit" (submit)="$event.preventDefault(); save()">
              @if (editing() === 'renew') {
                <p class="warn" role="note">
                  Al separar de nuevo, la proforma pasa al <strong>final de la fila</strong>: quien confirmó o separó
                  mientras tanto va antes.
                </p>
              }
              <label>
                <span>Separar hasta (hora de Lima)</span>
                <input type="datetime-local" [value]="draft()" (input)="draft.set(value($event))" required />
              </label>
              <div class="row">
                <button type="submit" class="secondary" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Separar hasta esa hora' }}</button>
                <button type="button" class="ghost" [disabled]="busy()" (click)="close()">Cancelar</button>
              </div>
            </form>
          }
        }
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </pp-card>
  `,
  styles: `
    .lead { margin: 0 0 0.75rem; }
    .ask, .warn { margin: 0 0 0.75rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); }
    .ask p { margin: 0 0 0.5rem; }
    .edit label { display: grid; gap: 0.3rem; margin-bottom: 0.75rem; max-width: 18rem; font-size: var(--fs-sm); font-weight: 500; }
    .error { margin: 0.75rem 0 0; }
  `,
})
export class CotizacionSeparo {
  private readonly data = inject(CotizadorData);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator sell; a viewer only reads (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  private readonly planner = inject(PlanService);

  readonly quoteId = input.required<string>();
  readonly status = input.required<QuoteStatus>();
  readonly holdUntil = input<string | null>(null);
  /**
   * An old version that was sent: it holds until a newer one is sent or
   * accepted, and the database lets it let go but not start or grow.
   */
  readonly releaseOnly = input(false);

  /** The new end, once the database accepted it. */
  readonly changed = output<{ heldAt: string | null; holdUntil: string | null }>();
  /** The database refused: the quote may have changed elsewhere; the page shows why and reads it again. */
  readonly stale = output<string>();

  protected readonly editing = signal<Editing>(null);
  /** The value of the date and hour field, as "YYYY-MM-DDTHH:mm" in Lima. */
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly draftUntil = signal<string | null>(null);

  private readonly now = signal(new Date());
  protected readonly state = computed(() => holdState(this.holdUntil(), this.now()));
  protected readonly long = dateTimeLong;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // A draft says until when it would hold, by the database's own rule.
    effect(() => {
      if (this.status() === 'draft' && !this.releaseOnly()) void this.data.defaultHoldUntil().then((until) => this.draftUntil.set(until));
    });
  }

  protected async open(mode: 'change' | 'renew'): Promise<void> {
    this.error.set(null);
    const start = mode === 'change' ? this.holdUntil() : await this.data.defaultHoldUntil();
    this.draft.set(start ? isoToInput(start) : '');
    this.editing.set(mode);
  }

  protected close(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  protected save(): Promise<void> {
    const problem = holdUntilProblem(this.draft());
    if (problem !== null) {
      this.error.set(problem);
      return Promise.resolve();
    }
    return this.write(inputToIso(this.draft()));
  }

  protected release(): Promise<void> {
    return this.write(null);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private async write(until: string | null): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.changed.emit(await this.data.setHold(this.quoteId(), until));
      this.planner.invalidate();
      this.now.set(new Date());
      this.editing.set(null);
    } catch (cause) {
      // Said by the page, over the quote it reads again: this card may be gone by then.
      this.editing.set(null);
      this.stale.emit(cause instanceof DataError ? cause.message : 'No pudimos cambiar el separo.');
      void this.workspace.afterRefusal(cause);
    } finally {
      this.busy.set(false);
    }
  }
}
