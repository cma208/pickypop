import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, FORMAT_PIPES, Page } from '../../ui';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_PIPES, ITEM_KINDS, ITEM_KIND_LABELS, type ItemKind } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';
import { ItemForm } from './item-form';
import { ItemMovementForm } from './item-movement-form';
import { Modal } from './modal';

type Dialog = { kind: 'edit'; item: InventoryItemSummary | null } | { kind: 'move'; item: InventoryItemSummary };

@Component({
  selector: 'app-insumos',
  imports: [Page, AsyncState, Empty, Badge, Modal, ItemForm, ItemMovementForm, FORMAT_PIPES, INVENTORY_PIPES],
  template: `
    <pp-page title="Insumos y empaque" subtitle="Dulces, imanes, bolsas, boquillas y todo lo que se cuenta por unidad">
      <button actions type="button" (click)="dialog.set({ kind: 'edit', item: null })">+ Nuevo artículo</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (items().length === 0) {
          <pp-empty message="Aún no hay artículos registrados.">
            <button type="button" (click)="dialog.set({ kind: 'edit', item: null })">Registrar el primero</button>
          </pp-empty>
        } @else {
          <div class="toolbar">
            <label class="filter wide">
              Buscar
              <input type="search" [value]="search()" (input)="onSearch($event)" placeholder="Nombre del artículo" />
            </label>
            <label class="filter">
              Tipo
              <select [value]="kindFilter()" (change)="onKind($event)">
                <option value="">Todos</option>
                @for (kind of kinds; track kind) {
                  <option [value]="kind">{{ labels[kind] }}</option>
                }
              </select>
            </label>
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
                    <th class="hide-small">Tipo</th>
                    <th class="num">Existencias</th>
                    <th class="num hide-small">Mínimo</th>
                    <th class="hide-small">Perecible</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of visible(); track item.id) {
                    <tr [class.inactive]="!item.active">
                      <td>
                        <span class="strong">{{ item.name }}</span>
                        @if (!item.active) { <pp-badge>Inactivo</pp-badge> }
                        <small class="sub only-small">
                          {{ labels[item.kind] }}@if (item.perishable) { · Perecible }
                        </small>
                      </td>
                      <td class="hide-small">{{ labels[item.kind] }}</td>
                      <td class="num">
                        {{ item.onHand | qty: item.unit }}
                        @if (item.belowMinimum) {
                          <small class="sub"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
                        }
                      </td>
                      <td class="num hide-small">{{ item.minStock | qty: item.unit }}</td>
                      <td class="hide-small">{{ item.perishable ? 'Sí' : 'No' }}</td>
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
    `
      .inactive { opacity: 0.6; }
      .low { margin-bottom: 0.4rem; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap;
      }
    `,
  ],
})
export class InsumosPage {
  private readonly data = inject(InventarioData);

  protected readonly kinds = ITEM_KINDS;
  protected readonly labels = ITEM_KIND_LABELS;

  protected readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly search = signal('');
  protected readonly kindFilter = signal<ItemKind | ''>('');
  protected readonly onlyLow = signal(false);

  protected readonly lowCount = computed(() => this.items().filter((item) => item.belowMinimum).length);

  protected readonly visible = computed(() => {
    const needle = this.search().trim().toLowerCase();
    return this.items().filter(
      (item) =>
        (!this.onlyLow() || item.belowMinimum) &&
        (!this.kindFilter() || item.kind === this.kindFilter()) &&
        (!needle || item.name.toLowerCase().includes(needle)),
    );
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
    await this.load();
  }

  private async load(): Promise<void> {
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
