import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Page, type BadgeTone } from '../../ui';
import {
  InventarioData,
  MOVEMENTS_LIMIT,
  type InventoryItemSummary,
  type MovementFilter,
  type MovementRow,
  type SpoolSummary,
} from './inventario.data';
import { describeError } from './inventario.errors';
import {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  dayHeading,
  dayKey,
  signedQuantity,
  sourceLabel,
  timeLabel,
  type MovementType,
} from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';

const TYPE_TONES: Record<MovementType, BadgeTone> = {
  purchase: 'good',
  production: 'good',
  consumption: 'info',
  waste: 'warn',
  adjustment: 'neutral',
  maintenance: 'neutral',
  reservation: 'neutral',
  release: 'neutral',
};

/** Reservations change what is available, not what is on the shelf. */
const LOGICAL_ONLY: ReadonlySet<MovementType> = new Set(['reservation', 'release']);

interface DayGroup {
  day: string;
  heading: string;
  rows: MovementRow[];
}

const NO_FILTER: MovementFilter = { type: null, spoolId: null, itemId: null, from: null, to: null };

@Component({
  selector: 'app-movimientos',
  imports: [Page, AsyncState, Empty, Badge],
  template: `
    <pp-page
      title="Kardex"
      subtitle="Cada entrada y salida que explica las existencias de hoy"
    >
      <div class="toolbar">
        <label class="filter">
          Tipo
          <select [value]="filter().type ?? ''" (change)="onType($event)">
            <option value="">Todos</option>
            @for (type of types; track type) {
              <option [value]="type">{{ labels[type] }}</option>
            }
          </select>
        </label>
        <label class="filter wide">
          Rollo
          <select [value]="filter().spoolId ?? ''" (change)="onSpool($event)">
            <option value="">Todos</option>
            @for (spool of spools(); track spool.id) {
              <option [value]="spool.id">{{ spool.code ?? 'Sin código' }} · {{ spool.skuLabel }}</option>
            }
          </select>
        </label>
        <label class="filter wide">
          Artículo
          <select [value]="filter().itemId ?? ''" (change)="onItem($event)">
            <option value="">Todos</option>
            @for (item of items(); track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select>
        </label>
        <label class="filter">
          Desde
          <input type="date" [value]="filter().from ?? ''" (change)="onDate('from', $event)" />
        </label>
        <label class="filter">
          Hasta
          <input type="date" [value]="filter().to ?? ''" (change)="onDate('to', $event)" />
        </label>
        @if (hasFilter()) {
          <button type="button" class="secondary clear" (click)="clear()">Limpiar filtros</button>
        }
      </div>

      @if (rangeProblem()) {
        <p class="alert alert-warn" role="alert">La fecha «desde» no puede ser posterior a «hasta».</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (groups().length === 0 && !rangeProblem()) {
          <pp-empty [message]="hasFilter() ? 'No hay movimientos con estos filtros.' : 'Todavía no hay movimientos de stock.'" />
        }

        @for (group of groups(); track group.day) {
          <section class="day">
            <h2>{{ group.heading }}</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Movimiento</th>
                    <th class="num">Cantidad</th>
                    <th class="hide-small">Origen</th>
                    <th class="hide-small">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.id) {
                    <tr>
                      <td class="time">{{ time(row) }}</td>
                      <td>
                        <pp-badge [tone]="tones[row.type]">{{ labels[row.type] }}</pp-badge>
                        <span class="strong subject">{{ row.subject }}</span>
                        <small class="sub only-small">{{ source(row) }}@if (row.note) { · {{ row.note }} }</small>
                      </td>
                      <td class="num qty" [class.pos]="isPositive(row)" [class.neg]="isNegative(row)" [class.muted]="isLogical(row)">
                        {{ signed(row) }}
                        @if (isLogical(row)) { <small class="sub">no mueve el stock físico</small> }
                      </td>
                      <td class="hide-small">{{ source(row) }}</td>
                      <td class="hide-small note">{{ row.note ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (truncated()) {
          <p class="alert alert-warn">
            Mostramos los últimos {{ limit }} movimientos. Afina los filtros o el rango de fechas para ver los demás.
          </p>
        }
      </pp-async>
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .clear { align-self: flex-end; margin-bottom: 0.1rem; }
      .day { margin-bottom: 1.5rem; }
      .day h2 {
        margin: 0 0 0.25rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--line);
        font-size: 0.95rem; color: var(--muted);
      }
      .time { color: var(--muted); font-variant-numeric: tabular-nums; width: 1%; white-space: nowrap; }
      .subject { margin-left: 0.4rem; }
      .qty { font-weight: 600; white-space: nowrap; }
      .note { color: var(--muted); max-width: 18rem; }
    `,
  ],
})
export class MovimientosPage {
  private readonly data = inject(InventarioData);

  protected readonly types = MOVEMENT_TYPES;
  protected readonly labels = MOVEMENT_TYPE_LABELS;
  protected readonly tones = TYPE_TONES;
  protected readonly limit = MOVEMENTS_LIMIT;

  protected readonly spools = signal<SpoolSummary[]>([]);
  protected readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly rows = signal<MovementRow[]>([]);
  protected readonly truncated = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<MovementFilter>(NO_FILTER);

  /** Guards against an older, slower response overwriting a newer one. */
  private requestId = 0;

  protected readonly hasFilter = computed(() => Object.values(this.filter()).some((value) => value !== null));

  protected readonly rangeProblem = computed(() => {
    const { from, to } = this.filter();
    return from !== null && to !== null && from > to;
  });

  protected readonly groups = computed<DayGroup[]>(() => {
    const byDay = new Map<string, MovementRow[]>();
    for (const row of this.rows()) {
      const day = dayKey(row.occurredAt);
      byDay.set(day, [...(byDay.get(day) ?? []), row]);
    }
    return [...byDay].map(([day, rows]) => ({ day, heading: dayHeading(day), rows }));
  });

  constructor() {
    void this.loadOptions();
    void this.load();
  }

  protected time(row: MovementRow): string {
    return timeLabel(row.occurredAt);
  }

  protected source(row: MovementRow): string {
    return sourceLabel(row.sourceType);
  }

  protected signed(row: MovementRow): string {
    return signedQuantity(row.quantity, row.unit);
  }

  protected isLogical(row: MovementRow): boolean {
    return LOGICAL_ONLY.has(row.type);
  }

  protected isPositive(row: MovementRow): boolean {
    return !this.isLogical(row) && row.quantity > 0;
  }

  protected isNegative(row: MovementRow): boolean {
    return !this.isLogical(row) && row.quantity < 0;
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as MovementType | '';
    this.update({ type: value || null });
  }

  /** A movement belongs to a spool or to an item, never both: picking one clears the other. */
  protected onSpool(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.update({ spoolId: value || null, itemId: null });
  }

  protected onItem(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.update({ itemId: value || null, spoolId: null });
  }

  protected onDate(field: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.update({ [field]: value || null });
  }

  protected clear(): void {
    this.update(NO_FILTER);
  }

  private update(change: Partial<MovementFilter>): void {
    this.filter.update((current) => ({ ...current, ...change }));
    void this.load();
  }

  private async loadOptions(): Promise<void> {
    try {
      const [spools, items] = await Promise.all([this.data.spools(), this.data.items()]);
      this.spools.set(spools);
      this.items.set(items);
    } catch (error) {
      // The kardex still works without the filter lists; they just stay empty.
      console.error(error);
    }
  }

  private async load(): Promise<void> {
    if (this.rangeProblem()) {
      this.rows.set([]);
      this.truncated.set(false);
      this.loading.set(false);
      return;
    }

    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.data.movements(this.filter());
      if (request !== this.requestId) return;
      this.rows.set(page.rows);
      this.truncated.set(page.truncated);
    } catch (error) {
      if (request !== this.requestId) return;
      this.error.set(describeError(error, 'No pudimos cargar los movimientos. Inténtalo de nuevo.'));
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }
}
