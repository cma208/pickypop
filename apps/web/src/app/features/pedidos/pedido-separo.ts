import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { dateTimeLong, inputToIso, isoToInput } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';

interface HoldState {
  holdUntil: string | null;
  /** When the next default hold would end: the workshop's rule, from now. */
  defaultUntil: string;
}

/**
 * The hold of an order on hold: until when it keeps what is set aside and its
 * place in the line. Always shown as a day and an hour, never as a duration.
 * Letting go of it hands the stock to the others at once, and the order goes
 * to the end of the line when it is resumed.
 */
@Component({
  selector: 'app-pedido-separo',
  template: `
    @if (state(); as s) {
      <div class="hold" [class.expired]="!active()">
        @if (active()) {
          <p>
            Conserva lo separado y su lugar en la fila hasta el <strong>{{ until() }}</strong>.
          </p>
        } @else {
          <p>
            El separo terminó{{ s.holdUntil ? ' el ' + until() : '' }}: lo separado ya pasó a los demás pedidos. Si lo
            retomas, entra al final de la fila.
          </p>
        }

        @if (editing()) {
          <div class="row">
            <label>
              Separar hasta
              <input type="datetime-local" [value]="draft()" (input)="draft.set(read($event))" />
            </label>
            <button type="button" (click)="save(draftIso())" [disabled]="busy() || !draft()">
              {{ busy() ? 'Guardando…' : active() ? 'Guardar' : 'Volver a separar' }}
            </button>
            <button type="button" class="ghost" (click)="editing.set(false)" [disabled]="busy()">Cancelar</button>
          </div>
          @if (!active()) {
            <p class="muted small">Al volver a separar, el pedido toma su lugar al final de la fila.</p>
          }
        } @else if (confirmingRelease()) {
          <p class="warn-text">
            ¿Soltar ya? Lo separado pasa en este momento a los demás pedidos y, al retomarlo, este entra al final de la fila.
          </p>
          <div class="row">
            <button type="button" class="danger" (click)="save(null)" [disabled]="busy()">{{ busy() ? 'Soltando…' : 'Sí, soltar ya' }}</button>
            <button type="button" class="ghost" (click)="confirmingRelease.set(false)" [disabled]="busy()">No</button>
          </div>
        } @else {
          <div class="row">
            <button type="button" class="secondary" (click)="startEditing()">{{ active() ? 'Cambiar' : 'Volver a separar' }}</button>
            @if (active()) {
              <button type="button" class="ghost" (click)="confirmingRelease.set(true)">Soltar ya</button>
            }
          </div>
        }
        @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
      </div>
    }
  `,
  styles: `
    .hold { margin: 0.75rem 0; padding: 0.7rem 0.9rem; border-radius: var(--radius-sm); background: var(--info-soft); }
    .hold.expired { background: var(--warn-soft); }
    .hold p { margin: 0 0 0.5rem; }
    .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem; }
    label { display: grid; gap: 0.25rem; font-size: 0.85rem; }
    .small { font-size: 0.8rem; margin-top: 0.4rem; }
    .warn-text { color: var(--warn); }
    .error { margin: 0.5rem 0 0; }
  `,
})
export class PedidoSeparo {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  readonly orderId = input.required<string>();
  /** The hold changed: the page reloads, because who goes first changed too. */
  readonly changed = output<void>();

  protected readonly state = signal<HoldState | null>(null);
  protected readonly editing = signal(false);
  protected readonly confirmingRelease = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly draft = signal('');

  /** Re-read on every check, so a hold that ends while the page is open shows as ended. */
  protected readonly active = computed(() => {
    const until = this.state()?.holdUntil;
    return until !== null && until !== undefined && Date.parse(until) > Date.now();
  });

  protected readonly until = computed(() => {
    const until = this.state()?.holdUntil;
    return until ? dateTimeLong(until) : '';
  });

  protected readonly draftIso = computed(() => (this.draft() ? inputToIso(this.draft()) : null));

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected startEditing(): void {
    const state = this.state();
    if (!state) return;
    this.draft.set(isoToInput(this.active() && state.holdUntil ? state.holdUntil : state.defaultUntil));
    this.error.set(null);
    this.editing.set(true);
  }

  /** `null` lets go of the hold now. */
  protected async save(until: string | null): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.rpc('set_order_hold', {
        p_order_id: this.orderId(),
        p_until: until ?? new Date().toISOString(),
      });
      if (error) throw error;
      this.editing.set(false);
      this.confirmingRelease.set(false);
      await this.load(this.orderId());
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cambiar el separo.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(orderId: string): Promise<void> {
    const workspaceId = await this.workspace.requireId();
    const [order, settings] = await Promise.all([
      this.supabase.from('orders').select('hold_until').eq('id', orderId).maybeSingle(),
      this.supabase
        .from('workshop_settings')
        .select('hold_default_days, hold_default_time')
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
    ]);
    if (order.error || settings.error) {
      this.error.set(friendlyError(order.error ?? settings.error, 'No pudimos leer el separo.'));
      return;
    }
    const days = settings.data?.hold_default_days ?? 1;
    const time = (settings.data?.hold_default_time ?? '23:00').slice(0, 5);
    this.state.set({ holdUntil: order.data?.hold_until ?? null, defaultUntil: defaultUntil(days, time) });
  }
}

/** The workshop's default end of a hold made now: so many days later, at that hour, in Lima. */
function defaultUntil(days: number, time: string): string {
  const today = isoToInput(new Date().toISOString()).slice(0, 10);
  const [year, month, day] = today.split('-').map(Number);
  const target = new Date(Date.UTC(year!, month! - 1, day! + days));
  return inputToIso(`${target.toISOString().slice(0, 10)}T${time}`);
}
