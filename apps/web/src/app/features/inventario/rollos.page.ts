import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { InventarioData, type SpoolSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import {
  SPOOL_STATUSES,
  SPOOL_STATUS_LABELS,
  safeHex,
  type SpoolStatus,
} from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';
import { Modal } from './modal';
import { SpoolLabelForm } from './spool-label-form';
import { WeighForm } from './weigh-form';

const COST_PER_GRAM_DIGITS = 3;

type Dialog = { kind: 'weigh' | 'label'; spool: SpoolSummary };

@Component({
  selector: 'app-rollos',
  imports: [Page, AsyncState, Empty, Badge, Modal, WeighForm, SpoolLabelForm, FORMAT_PIPES],
  template: `
    <pp-page title="Rollos" subtitle="Cada rollo con su estado, ubicación, gramos restantes y costo real">
      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (spools().length === 0) {
          <pp-empty message="Todavía no hay rollos. Se crean al registrar una compra de filamento." />
        } @else {
          <div class="toolbar">
            <label class="filter">
              Estado
              <select [value]="statusFilter()" (change)="onStatusFilter($event)">
                <option value="">Todos</option>
                @for (status of statuses; track status) {
                  <option [value]="status">{{ labels[status] }}</option>
                }
              </select>
            </label>
            <label class="filter wide">
              Filamento
              <select [value]="skuFilter()" (change)="onSkuFilter($event)">
                <option value="">Todos</option>
                @for (sku of skuOptions(); track sku.id) {
                  <option [value]="sku.id">{{ sku.label }}</option>
                }
              </select>
            </label>
          </div>

          @if (visible().length === 0) {
            <pp-empty message="Ningún rollo coincide con los filtros." />
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rollo</th>
                    <th class="hide-small">Filamento</th>
                    <th>Estado</th>
                    <th class="hide-small">Ubicación</th>
                    <th class="num">Restante</th>
                    <th class="num hide-small">Costo del rollo</th>
                    <th class="num hide-small">Costo por g</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (spool of visible(); track spool.id) {
                    <tr>
                      <td class="c-code">
                        <span class="row nowrap">
                          <span
                            class="swatch"
                            [class.empty]="!hex(spool)"
                            [style.background]="hex(spool)"
                            aria-hidden="true"
                          ></span>
                          <span>
                            <span class="strong">{{ spool.code ?? 'Sin código' }}</span>
                            <small class="sub only-small">{{ spool.skuLabel }}</small>
                            @if (spool.abrasive) {
                              <small class="sub only-small">
                                <pp-badge tone="warn">Abrasivo</pp-badge> {{ nozzleWarning(spool) }}
                              </small>
                            }
                            <small class="sub only-small">
                              {{ spool.location ?? 'Sin ubicación' }} · {{ spool.unitCost | money }}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td class="hide-small">
                        {{ spool.skuLabel }}
                        @if (spool.abrasive) {
                          <small class="sub"><pp-badge tone="warn">Abrasivo</pp-badge> {{ nozzleWarning(spool) }}</small>
                        }
                      </td>
                      <td class="c-status">
                        <select
                          class="status"
                          [value]="spool.status"
                          [disabled]="busyId() === spool.id"
                          [attr.aria-label]="'Estado del rollo ' + (spool.code ?? '')"
                          (change)="onStatusChange(spool, $event)"
                        >
                          @for (status of statuses; track status) {
                            <option [value]="status" [selected]="status === spool.status">{{ labels[status] }}</option>
                          }
                        </select>
                      </td>
                      <td class="hide-small">{{ spool.location ?? '—' }}</td>
                      <td class="num c-qty">
                        {{ spool.remainingG | grams }}
                        <small class="sub">de {{ spool.initialWeightG | grams }}</small>
                      </td>
                      <td class="num hide-small">{{ spool.unitCost | money }}</td>
                      <td class="num hide-small">{{ spool.costPerGram | money: costDigits }}</td>
                      <td class="actions-cell c-actions">
                        <button type="button" class="secondary" (click)="dialog.set({ kind: 'weigh', spool })">
                          Pesar
                        </button>
                        <button type="button" class="ghost" (click)="dialog.set({ kind: 'label', spool })">
                          Ubicación
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="muted count">{{ visible().length }} de {{ spools().length }} rollos</p>
          }
        }
      </pp-async>

      @if (dialog(); as current) {
        @if (current.kind === 'weigh') {
          <app-modal [heading]="'Registrar pesaje · ' + (current.spool.code ?? 'rollo')" (closed)="dialog.set(null)">
            <app-weigh-form
              [spool]="current.spool"
              (saved)="onSaved('Pesaje registrado: el ajuste ya está en los movimientos.')"
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
    `
      .nowrap { flex-wrap: nowrap; align-items: flex-start; }
      .status { width: auto; padding: 0.25rem 0.4rem; font-size: 0.85rem; }
      .count { font-size: 0.8rem; margin-top: 0.75rem; }
      /* On a phone each spool becomes a small card instead of a cramped row. */
      @media (max-width: 40rem) {
        thead { display: none; }
        tr {
          display: grid; grid-template-columns: 1fr auto; gap: 0.5rem 0.75rem;
          padding: 0.75rem 0.25rem; border-bottom: 1px solid var(--line);
        }
        td { display: block; padding: 0; border: 0; }
        .c-code { grid-column: 1; grid-row: 1; }
        .c-qty { grid-column: 2; grid-row: 1; }
        .c-status { grid-column: 1 / -1; grid-row: 2; }
        .c-actions { grid-column: 1 / -1; grid-row: 3; text-align: left; }
      }
      .sr-only {
        position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap;
      }
    `,
  ],
})
export class RollosPage {
  private readonly data = inject(InventarioData);

  protected readonly statuses = SPOOL_STATUSES;
  protected readonly labels = SPOOL_STATUS_LABELS;
  protected readonly costDigits = COST_PER_GRAM_DIGITS;

  protected readonly spools = signal<SpoolSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly statusFilter = signal<SpoolStatus | ''>('');
  protected readonly skuFilter = signal('');

  protected readonly skuOptions = computed(() => {
    const unique = new Map(this.spools().map((spool) => [spool.skuId, spool.skuLabel]));
    return [...unique].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  protected readonly visible = computed(() =>
    this.spools().filter(
      (spool) =>
        (!this.statusFilter() || spool.status === this.statusFilter()) &&
        (!this.skuFilter() || spool.skuId === this.skuFilter()),
    ),
  );

  constructor() {
    void this.load();
  }

  /** The "because of ..." part comes straight from the view; the sentence around it is all that is built here. */
  protected nozzleWarning(spool: SpoolSummary): string {
    return `Desgasta la boquilla por ${spool.abrasiveBecause ?? 'su composición'}.`;
  }

  protected hex(spool: SpoolSummary): string | null {
    return safeHex(spool.colorHex);
  }

  protected onStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as SpoolStatus | '');
  }

  protected onSkuFilter(event: Event): void {
    this.skuFilter.set((event.target as HTMLSelectElement).value);
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
      await this.load();
    } catch (error) {
      select.value = spool.status;
      this.actionError.set(describeError(error, 'No pudimos cambiar el estado del rollo. Inténtalo de nuevo.'));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async onSaved(message: string): Promise<void> {
    this.dialog.set(null);
    this.actionError.set(null);
    this.notice.set(message);
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.spools.set(await this.data.spools());
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar los rollos. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
