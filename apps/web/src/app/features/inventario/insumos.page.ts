import { Component, computed, inject, input, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Item, Page } from '../../ui';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { ITEM_KINDS, ITEM_KIND_LABELS, type ItemKind } from './inventario.format';
import { INVENTORY_STYLES, POSITION_STYLES } from './inventario.styles';
import { InventoryPlan, type InventoryPositions } from './inventory-plan';
import { ItemForm } from './item-form';
import { ItemMovementForm } from './item-movement-form';
import { Modal } from './modal';
import { amount, itemCells, type PositionCells } from './stock-position';

type Dialog = { kind: 'edit'; item: InventoryItemSummary | null } | { kind: 'move'; item: InventoryItemSummary };

/** An article with what the plan says of it. `cells` is null while the plan is not there. */
interface ItemRow {
  item: InventoryItemSummary;
  /** "Repuesto · Perecible": the kind only where a screen mixes kinds. */
  sub: string;
  cells: PositionCells | null;
}

@Component({
  selector: 'app-insumos',
  imports: [Page, AsyncState, Empty, Badge, Item, Modal, ItemForm, ItemMovementForm],
  template: `
    <pp-page [title]="heading()" [subtitle]="subtitle()">
      <button actions type="button" (click)="dialog.set({ kind: 'edit', item: null })">+ Nuevo artículo</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (planError(); as text) {
        <p class="alert-warn" role="status">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (mine().length === 0) {
          <pp-empty [message]="emptyMessage()">
            <button type="button" (click)="dialog.set({ kind: 'edit', item: null })">Registrar el primero</button>
          </pp-empty>
        } @else {
          <div class="toolbar">
            <label class="filter wide">
              Buscar
              <input type="search" [value]="search()" (input)="onSearch($event)" placeholder="Nombre del artículo" />
            </label>
            @if (kindsHere().length > 1) {
              <label class="filter">
                Tipo
                <select [value]="kindFilter()" (change)="onKind($event)">
                  <option value="">Todos</option>
                  @for (kind of kindsHere(); track kind) {
                    <option [value]="kind">{{ labels[kind] }}</option>
                  }
                </select>
              </label>
            }
            <label class="check low">
              <input type="checkbox" [checked]="onlyLow()" (change)="onlyLow.set(!onlyLow())" />
              Solo bajo mínimo ({{ lowCount() }})
            </label>
          </div>

          @if (visible().length === 0) {
            <pp-empty message="Ningún artículo coincide con el filtro." />
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th class="num">Hay</th>
                    <th class="wide-only">Separado</th>
                    <th class="num wide-only">Libre</th>
                    <th class="wide-only">Falta</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of visible(); track row.item.id) {
                    @let item = row.item;
                    <tr [class.inactive]="!item.active">
                      <td>
                        <pp-item [kind]="item.kind" [path]="item.imagePath" [name]="item.name">
                          <span sub>
                            {{ row.sub }}
                            @if (!item.imagePath) {
                              {{ row.sub ? '· ' : '' }}Sin foto ·
                              <button type="button" class="inline-link" (click)="dialog.set({ kind: 'edit', item })">Agregar</button>
                            }
                          </span>
                          @if (!item.active) { <pp-badge>Inactivo</pp-badge> }
                        </pp-item>
                        @if (row.cells?.missing; as missing) {
                          <div class="badge-line narrow-only"><pp-badge tone="warn">{{ missing }}</pp-badge></div>
                        }
                      </td>
                      <td class="num">
                        <span class="nowrap">{{ row.cells?.onHand ?? amount(item.onHand, item.unit) }}</span>
                        @if (row.cells; as cells) {
                          <small class="sub narrow-only" [attr.title]="cells.who || null">{{ cells.compact }}</small>
                        }
                        <small class="sub hide-small nowrap">Mínimo {{ amount(item.minStock, item.unit) }}</small>
                        @if (item.belowMinimum && !row.cells?.missing) {
                          <small class="sub badge-line"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
                        }
                      </td>
                      <td class="wide-only separated" [attr.title]="row.cells?.who || null">{{ row.cells?.separated ?? '—' }}</td>
                      <td class="num wide-only">{{ row.cells?.free ?? '—' }}</td>
                      <td class="wide-only">
                        @if (row.cells?.missing; as missing) {
                          <pp-badge tone="warn">{{ missing }}</pp-badge>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="actions-cell">
                        <button type="button" class="secondary" (click)="dialog.set({ kind: 'move', item })">
                          Movimiento
                        </button>
                        <button type="button" class="ghost" (click)="dialog.set({ kind: 'edit', item })">Editar</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </pp-async>

      @if (dialog(); as current) {
        @if (current.kind === 'edit') {
          <app-modal [heading]="current.item ? 'Editar artículo' : 'Nuevo artículo'" (closed)="dialog.set(null)">
            <app-item-form
              [item]="current.item"
              [kinds]="kindsHere()"
              (saved)="onSaved(current.item ? 'Cambios guardados.' : 'Artículo creado.')"
              (cancelled)="dialog.set(null)"
            />
          </app-modal>
        } @else {
          <app-modal [heading]="'Movimiento · ' + current.item.name" (closed)="dialog.set(null)">
            <app-item-movement-form
              [item]="current.item"
              (saved)="onSaved('Movimiento registrado. Lo ves en el kardex.')"
              (cancelled)="dialog.set(null)"
            />
          </app-modal>
        }
      }
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    POSITION_STYLES,
    `
      .inactive { opacity: 0.6; }
      .low { margin-bottom: 0.4rem; }
    `,
  ],
})
export class InsumosPage {
  private readonly data = inject(InventarioData);
  private readonly planner = inject(InventoryPlan);

  /**
   * Which kinds this screen holds, from the route. Supplies and packaging used
   * to share one list; with four bags and three glues that was fine, and with
   * forty of each it stops being: you do not look for a bag in the same place
   * you look for a nozzle.
   */
  readonly scope = input<ItemKind[] | null>(null);
  readonly heading = input('Insumos y empaque');
  readonly subtitle = input('Lo que se compra y se gasta, por unidad, gramo o ml');

  protected readonly labels = ITEM_KIND_LABELS;
  /** Grams the way the plan's columns say them: "520 g", "1 kg". */
  protected readonly amount = amount;
  protected readonly kindsHere = computed(() => this.scope() ?? ITEM_KINDS);

  protected readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly search = signal('');
  protected readonly kindFilter = signal<ItemKind | ''>('');
  protected readonly onlyLow = signal(false);
  private readonly positions = signal<InventoryPositions | null>(null);
  protected readonly planError = signal<string | null>(null);

  protected readonly lowCount = computed(() => this.mine().filter((item) => item.belowMinimum).length);

  /** «Aún no hay insumos y repuestos registrados» but «Aún no hay empaque registrado»: the participle agrees with the noun. */
  protected readonly emptyMessage = computed(() => {
    const scope = this.scope();
    const onlyPackaging = scope?.length === 1 && scope[0] === 'packaging';
    return onlyPackaging ? 'Aún no hay empaque registrado.' : `Aún no hay ${this.heading().toLowerCase()} registrados.`;
  });

  /** What belongs on this screen at all, before any filter the person sets. */
  protected readonly mine = computed(() => {
    const scope = this.scope();
    return scope ? this.items().filter((item) => scope.includes(item.kind)) : this.items();
  });

  protected readonly visible = computed<ItemRow[]>(() => {
    const needle = this.search().trim().toLowerCase();
    const positions = this.positions();
    const mixed = this.kindsHere().length > 1;
    return this.mine()
      .filter(
        (item) =>
          (!this.onlyLow() || item.belowMinimum) &&
          (!this.kindFilter() || item.kind === this.kindFilter()) &&
          (!needle || item.name.toLowerCase().includes(needle)),
      )
      .map((item) => ({
        item,
        sub: [mixed ? this.labels[item.kind] : null, item.perishable ? 'Perecible' : null].filter(Boolean).join(' · '),
        cells: positions ? itemCells(item.kind, item.unit, positions.items.get(item.id), positions.timeZone) : null,
      }));
  });

  constructor() {
    void this.load();
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onKind(event: Event): void {
    this.kindFilter.set((event.target as HTMLSelectElement).value as ItemKind | '');
  }

  protected async onSaved(message: string): Promise<void> {
    this.dialog.set(null);
    this.notice.set(message);
    // A movement changes what there is, and so who gets what.
    this.planner.changed();
    await this.load();
  }

  private async load(): Promise<void> {
    await Promise.all([this.loadStock(), this.loadPlan()]);
  }

  private async loadPlan(): Promise<void> {
    try {
      this.positions.set(await this.planner.read());
      this.planError.set(null);
    } catch (error) {
      this.planError.set(this.planner.problem(error));
    }
  }

  private async loadStock(): Promise<void> {
    this.error.set(null);
    try {
      this.items.set(await this.data.items());
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar los artículos. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
