import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, Empty, AsyncState, FORMAT_PIPES, Page } from '../../ui';
import {
  InventarioData,
  type BrandOption,
  type FinishOption,
  type MaterialOption,
  type SkuSummary,
  type SpoolSummary,
} from './inventario.data';
import { describeError } from './inventario.errors';
import {
  SPOOL_STATUSES,
  SPOOL_STATUS_LABELS,
  safeHex,
  type SpoolStatus,
} from './inventario.format';
import { INVENTORY_STYLES, POSITION_STYLES } from './inventario.styles';
import { InventoryPlan, type InventoryPositions } from './inventory-plan';
import { Modal } from './modal';
import { SkuForm } from './sku-form';
import { SpoolLabelForm } from './spool-label-form';
import { filamentCells, type PositionCells } from './stock-position';
import { WeighForm } from './weigh-form';

const COST_PER_GRAM_DIGITS = 3;

type Dialog = { kind: 'weigh' | 'label'; spool: SpoolSummary };

/** A filament with what the plan says of its grams. `cells` is null while the plan is not there. */
interface SkuRow {
  sku: SkuSummary;
  cells: PositionCells | null;
}

/**
 * One screen for both halves of the same thing: the filament you buy and the
 * spools of it you physically have. They used to be two menu entries, and the
 * names never taught the difference — you had to already know it. Nested, the
 * distinction explains itself: a filament opens and its spools are inside.
 */
@Component({
  selector: 'app-filamentos',
  imports: [Page, AsyncState, Empty, Badge, Modal, SkuForm, WeighForm, SpoolLabelForm, RouterLink, FORMAT_PIPES],
  template: `
    <pp-page title="Filamentos" subtitle="Lo que compras, y los rollos de cada uno que tienes en el estante">
      <button actions type="button" (click)="editing.set('new')">+ Nuevo filamento</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }
      @if (planError(); as text) {
        <p class="alert-warn" role="status">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (skus().length === 0) {
          <pp-empty message="Aún no hay filamentos registrados.">
            <button type="button" (click)="editing.set('new')">Registrar el primero</button>
          </pp-empty>
        } @else {
          <div class="toolbar">
            <label class="filter wide">
              Buscar
              <input type="search" [value]="search()" (input)="onSearch($event)" placeholder="Color, marca, material…" />
            </label>
            <label class="check">
              <input type="checkbox" [checked]="onlyLow()" (change)="onlyLow.set(!onlyLow())" />
              Solo bajo mínimo ({{ lowCount() }})
            </label>
          </div>

          @if (visible().length === 0) {
            <pp-empty message="Ningún filamento coincide con el filtro." />
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><span class="sr-only">Desplegar</span></th>
                    <th>Color</th>
                    <th class="num">Hay</th>
                    <th class="wide-only">Separado</th>
                    <th class="num wide-only">Libre</th>
                    <th class="wide-only">Falta</th>
                    <th class="num hide-small">Costo por g</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                @for (row of visible(); track row.sku.id) {
                  @let sku = row.sku;
                  <tbody>
                    <tr [class.inactive]="!sku.active">
                      <td class="c-toggle">
                        <button
                          type="button"
                          class="ghost toggle"
                          [attr.aria-expanded]="isOpen(sku.id)"
                          [attr.aria-label]="(isOpen(sku.id) ? 'Ocultar' : 'Ver') + ' los rollos de ' + sku.colorName"
                          (click)="toggle(sku.id)"
                        >
                          <span aria-hidden="true">{{ isOpen(sku.id) ? '▾' : '▸' }}</span>
                        </button>
                      </td>
                      <td>
                        <span class="row swatch-row">
                          <span
                            class="swatch"
                            [class.empty]="!hex(sku.colorHex)"
                            [style.background]="hex(sku.colorHex)"
                            aria-hidden="true"
                          ></span>
                          <span>
                            <span class="strong">{{ sku.colorName }}</span>
                            @if (!sku.active) { <pp-badge>Inactivo</pp-badge> }
                            <small class="sub">
                              {{ sku.brandName }} · {{ sku.materialCode }}@if (sku.finishName) { · {{ sku.finishName }} }
                            </small>
                            @if (sku.abrasive) {
                              <small class="sub">
                                <pp-badge>Abrasivo</pp-badge> {{ nozzleWarning(sku.abrasiveBecause) }}
                              </small>
                            }
                            <small class="sub spool-count">{{ spoolCountLabel(sku.id) }}</small>
                          </span>
                        </span>
                        @if (row.cells?.missing; as missing) {
                          <div class="badge-line narrow-only"><pp-badge tone="warn">{{ missing }}</pp-badge></div>
                        }
                      </td>
                      <td class="num">
                        <span class="nowrap">{{ row.cells?.onHand ?? (sku.onHandG | grams) }}</span>
                        @if (row.cells; as cells) {
                          <small class="sub narrow-only">{{ cells.compact }}</small>
                        }
                        <small class="sub hide-small nowrap">Mínimo {{ sku.minStockG | grams }}</small>
                        @if (sku.belowMinimum && !row.cells?.missing) {
                          <small class="sub badge-line"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
                        }
                      </td>
                      <td class="wide-only">{{ row.cells?.separated ?? '—' }}</td>
                      <td class="num wide-only">{{ row.cells?.free ?? '—' }}</td>
                      <td class="wide-only">
                        @if (row.cells?.missing; as missing) {
                          <pp-badge tone="warn">{{ missing }}</pp-badge>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="num hide-small">{{ sku.weightedCostPerGram | money: costDigits }}</td>
                      <td class="actions-cell">
                        <button type="button" class="secondary" (click)="editing.set(sku)">Editar</button>
                      </td>
                    </tr>

                    @if (isOpen(sku.id)) {
                      <tr class="spools">
                        <td [attr.colspan]="columnCount">
                          @if (spoolsOf(sku.id).length === 0) {
                            <p class="muted none">
                              Sin rollos de este filamento. Los rollos se crean al
                              <a routerLink="/inventario/compras">registrar una compra</a>.
                            </p>
                          } @else {
                            @for (spool of spoolsOf(sku.id); track spool.id) {
                              <div class="spool">
                                <div class="spool-id">
                                  <span class="strong">{{ spool.code ?? 'Sin código' }}</span>
                                  <small class="sub">{{ spool.location ?? 'Sin ubicación' }}</small>
                                </div>
                                <div class="spool-qty num">
                                  {{ spool.remainingG | grams }}
                                  <small class="sub">de {{ spool.initialWeightG | grams }}</small>
                                </div>
                                <div class="spool-cost num">
                                  {{ spool.unitCost | money }}
                                  <small class="sub">{{ spool.costPerGram | money: costDigits }} por g</small>
                                </div>
                                <div class="spool-status">
                                  <select
                                    class="status"
                                    [value]="spool.status"
                                    [disabled]="busyId() === spool.id"
                                    [attr.aria-label]="'Estado del rollo ' + (spool.code ?? '')"
                                    (change)="onStatusChange(spool, $event)"
                                  >
                                    @for (status of statuses; track status) {
                                      <option [value]="status" [selected]="status === spool.status">
                                        {{ labels[status] }}
                                      </option>
                                    }
                                  </select>
                                </div>
                                <div class="spool-actions">
                                  <button type="button" class="secondary" (click)="dialog.set({ kind: 'weigh', spool })">
                                    Pesar
                                  </button>
                                  <button type="button" class="ghost" (click)="dialog.set({ kind: 'label', spool })">
                                    Ubicación
                                  </button>
                                </div>
                              </div>
                            }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                }
              </table>
            </div>
          }
        }
      </pp-async>

      @if (editing(); as target) {
        <app-modal [heading]="target === 'new' ? 'Nuevo filamento' : 'Editar filamento'" (closed)="editing.set(null)">
          <app-sku-form
            [sku]="target === 'new' ? null : target"
            [brandOptions]="brands()"
            [materialOptions]="materials()"
            [finishOptions]="finishes()"
            (saved)="onSaved(target === 'new' ? 'Filamento creado.' : 'Cambios guardados.')"
            (cancelled)="editing.set(null)"
          />
        </app-modal>
      }

      @if (dialog(); as current) {
        @if (current.kind === 'weigh') {
          <app-modal [heading]="'Registrar pesaje · ' + (current.spool.code ?? 'rollo')" (closed)="dialog.set(null)">
            <app-weigh-form
              [spool]="current.spool"
              (saved)="onSaved('Pesaje registrado: el ajuste ya está en el kardex.')"
              (cancelled)="dialog.set(null)"
            />
          </app-modal>
        } @else {
          <app-modal [heading]="'Ubicación · ' + (current.spool.code ?? 'rollo')" (closed)="dialog.set(null)">
            <app-spool-label-form
              [spool]="current.spool"
              (saved)="onSaved('Rollo actualizado.')"
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
      /* The swatch stays beside the name, and the text under it wraps. The
         global nowrap class would keep it on one line and push the row off a phone. */
      .swatch-row { flex-wrap: nowrap; align-items: flex-start; }
      .inactive { opacity: 0.6; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap;
      }
      .toolbar .check { margin-bottom: 0.4rem; }
      tbody { border: 0; }

      .c-toggle { width: 2rem; padding-right: 0; }
      .toggle { padding: 0.15rem 0.35rem; font-size: 0.8rem; line-height: 1; }
      .spool-count { color: var(--muted); }

      /* The spools of one filament: a shaded strip under their row. */
      .spools > td { background: var(--accent-soft); padding: 0.4rem 0.7rem 0.6rem 2.7rem; }
      .spools .none { margin: 0.3rem 0; font-size: 0.85rem; }

      .spool {
        display: grid;
        grid-template-columns: minmax(7rem, 1.4fr) minmax(6rem, 1fr) minmax(6rem, 1fr) auto auto;
        align-items: center;
        gap: 0.5rem 0.9rem;
        padding: 0.45rem 0;
        border-bottom: 1px solid var(--line);
      }
      .spool:last-child { border-bottom: 0; }
      .spool .status { width: auto; padding: 0.2rem 0.35rem; font-size: 0.8rem; }
      .spool-actions { display: flex; gap: 0.4rem; justify-content: flex-end; }

      /* On a phone the strip stops pretending to be a table. */
      @media (max-width: 40rem) {
        .spools > td { padding-left: 0.7rem; }
        .spool { grid-template-columns: 1fr auto; }
        .spool-cost { grid-column: 1; }
        .spool-status { grid-column: 2; justify-self: end; }
        .spool-actions { grid-column: 1 / -1; justify-content: flex-start; }
      }
    `,
  ],
})
export class FilamentosPage {
  private readonly data = inject(InventarioData);
  private readonly planner = inject(InventoryPlan);

  protected readonly costDigits = COST_PER_GRAM_DIGITS;
  protected readonly statuses = SPOOL_STATUSES;
  protected readonly labels = SPOOL_STATUS_LABELS;
  /** Keep in step with the header row, or the spool strip stops spanning it. */
  protected readonly columnCount = 8;

  protected readonly skus = signal<SkuSummary[]>([]);
  protected readonly spools = signal<SpoolSummary[]>([]);
  protected readonly brands = signal<BrandOption[]>([]);
  protected readonly materials = signal<MaterialOption[]>([]);
  protected readonly finishes = signal<FinishOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly editing = signal<SkuSummary | 'new' | null>(null);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly search = signal('');
  protected readonly onlyLow = signal(false);
  protected readonly open = signal<ReadonlySet<string>>(new Set());
  private readonly positions = signal<InventoryPositions | null>(null);
  protected readonly planError = signal<string | null>(null);

  protected readonly lowCount = computed(() => this.skus().filter((sku) => sku.belowMinimum).length);

  private readonly spoolsBySku = computed(() => {
    const grouped = new Map<string, SpoolSummary[]>();
    for (const spool of this.spools()) {
      const bucket = grouped.get(spool.skuId);
      if (bucket) bucket.push(spool);
      else grouped.set(spool.skuId, [spool]);
    }
    return grouped;
  });

  protected readonly visible = computed<SkuRow[]>(() => {
    const needle = this.search().trim().toLowerCase();
    const positions = this.positions();
    return this.skus()
      .filter((sku) => {
        if (this.onlyLow() && !sku.belowMinimum) return false;
        if (!needle) return true;
        return [sku.colorName, sku.brandName, sku.materialCode, sku.finishName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .map((sku) => ({ sku, cells: positions ? filamentCells(positions.filaments.get(sku.id)) : null }));
  });

  constructor() {
    void this.load();
  }

  protected hex(colorHex: string | null): string | null {
    return safeHex(colorHex);
  }

  /** The "because of ..." part comes straight from the view; the sentence around it is all that is built here. */
  protected nozzleWarning(because: string | null): string {
    return `Desgasta la boquilla por ${because ?? 'su composición'}.`;
  }

  protected spoolsOf(skuId: string): SpoolSummary[] {
    return this.spoolsBySku().get(skuId) ?? [];
  }

  protected spoolCountLabel(skuId: string): string {
    const total = this.spoolsOf(skuId).length;
    if (total === 0) return 'Sin rollos';
    return total === 1 ? '1 rollo' : `${total} rollos`;
  }

  protected isOpen(skuId: string): boolean {
    return this.open().has(skuId);
  }

  protected toggle(skuId: string): void {
    const next = new Set(this.open());
    if (!next.delete(skuId)) next.add(skuId);
    this.open.set(next);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected async onStatusChange(spool: SpoolSummary, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const status = select.value as SpoolStatus;
    if (status === spool.status) return;

    this.notice.set(null);
    this.actionError.set(null);
    this.busyId.set(spool.id);
    try {
      await this.data.changeSpoolStatus(spool, status);
      this.notice.set(`El rollo ${spool.code ?? ''} ahora está: ${SPOOL_STATUS_LABELS[status].toLowerCase()}.`);
      // A discarded or emptied spool stops counting its grams.
      this.planner.changed();
      await this.load();
    } catch (error) {
      select.value = spool.status;
      this.actionError.set(describeError(error, 'No pudimos cambiar el estado del rollo. Inténtalo de nuevo.'));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async onSaved(message: string): Promise<void> {
    this.editing.set(null);
    this.dialog.set(null);
    this.actionError.set(null);
    this.notice.set(message);
    // A weighing moves grams, and a new filament is one more the plan can use.
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
      const [skus, spools, brands, materials, finishes] = await Promise.all([
        this.data.skus(),
        this.data.spools(),
        this.data.brands(),
        this.data.materials(),
        this.data.finishes(),
      ]);
      this.skus.set(skus);
      this.spools.set(spools);
      this.brands.set(brands);
      this.materials.set(materials);
      this.finishes.set(finishes);
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar los filamentos. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
