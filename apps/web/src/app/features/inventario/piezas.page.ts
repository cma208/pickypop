import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Item, Page } from '../../ui';
import { InventarioData, type InventoryItemSummary, type PartStock } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { ItemForm } from './item-form';
import { Modal } from './modal';

const COST_DIGITS = 3;
const PART_ONLY = ['part'] as const;

/** Null is a new piece; an item is the piece being edited. */
type Editing = { item: InventoryItemSummary | null };

/**
 * Las piezas impresas en el estante, y la operación de armar.
 *
 * Es la pantalla que vuelve honesto el costeo: mientras una placa de nueve
 * tapas no dejaba nada contable, su costo entero caía sobre la primera venta.
 * Aquí las nueve existen, y cada producto armado consume una.
 *
 * También es el único sitio donde una pieza se crea y recibe su foto. Antes
 * no había ninguno: Insumos y Empaque las dejan fuera, y la regla del dueño
 * —todo artículo con su foto— no se podía cumplir para la tapa ni la botella.
 */
@Component({
  selector: 'app-piezas',
  imports: [Page, Card, AsyncState, Empty, Badge, Item, RouterLink, Modal, ItemForm, FORMAT_PIPES],
  styles: [
    INVENTORY_STYLES,
    `
      .low { color: var(--warn); }
    `,
  ],
  template: `
    <pp-page title="Piezas impresas" subtitle="Lo que sale de las placas y espera en el estante para armar un producto">
      <a actions class="button secondary" routerLink="/inventario/armar">Armar productos</a>
      <button actions type="button" (click)="editing.set({ item: null })">+ Nueva pieza</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }

      <pp-card heading="En el estante">
        <pp-async [loading]="loading()" [error]="error()">
          @if (parts().length === 0) {
            <pp-empty message="Todavía no hay piezas. Crea una y di en la receta qué placa la produce.">
              <button type="button" (click)="editing.set({ item: null })">Crear la primera pieza</button>
            </pp-empty>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pieza</th>
                    <th class="num">En el estante</th>
                    <th class="num hide-small">Mínimo</th>
                    <th class="num hide-small">Costo por unidad</th>
                    <th class="hide-small">De dónde sale el costo</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (part of parts(); track part.inventoryItemId) {
                    <tr>
                      <td>
                        <pp-item kind="part" [path]="part.imagePath" [photo]="{ kind: 'item', id: part.inventoryItemId }" [name]="part.name">
                          @if (!part.imagePath) {
                            <span sub>
                              Sin foto ·
                              <button type="button" class="inline-link" (click)="edit(part)">Agregar</button>
                            </span>
                          }
                        </pp-item>
                      </td>
                      <td class="num">
                        {{ part.onHand }} {{ unitLabel(part) }}
                        @if (part.belowMinimum) {
                          <small class="sub"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
                        }
                      </td>
                      <td class="num hide-small">{{ part.minStock }}</td>
                      <td class="num hide-small">
                        @if (part.costPerUnit === null) {
                          <span class="low">Sin costo</span>
                        } @else {
                          {{ part.costPerUnit | money: costDigits }}
                        }
                      </td>
                      <td class="hide-small">{{ sourceLabel(part.costSource) }}</td>
                      <td class="actions-cell">
                        <button type="button" class="ghost" (click)="edit(part)">Editar</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </pp-async>
      </pp-card>

      @if (editing(); as current) {
        <app-modal [heading]="current.item ? 'Editar pieza' : 'Nueva pieza'" (closed)="editing.set(null)">
          <app-item-form
            [item]="current.item"
            [kinds]="partOnly"
            (saved)="onSaved(current.item ? 'Cambios guardados.' : 'Pieza creada. Dile en la receta qué placa la produce.')"
            (cancelled)="editing.set(null)"
          />
        </app-modal>
      }
    </pp-page>
  `,
})
export class PiezasPage {
  private readonly data = inject(InventarioData);

  protected readonly costDigits = COST_DIGITS;
  protected readonly partOnly = PART_ONLY;
  protected readonly parts = signal<PartStock[]>([]);
  /** The same pieces as articles: what the edit form works with. */
  private readonly items = signal<InventoryItemSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editing = signal<Editing | null>(null);

  private readonly itemById = computed(() => new Map(this.items().map((item) => [item.id, item])));

  constructor() {
    void this.load();
  }

  /** "1 unidad" pero "8 unidades": la tabla se lee mal en singular siempre. */
  protected unitLabel(part: PartStock): string {
    if (part.unit !== 'unidad') return part.unit;
    return part.onHand === 1 ? 'unidad' : 'unidades';
  }

  protected sourceLabel(source: string | null): string {
    if (source === 'produced') return 'De una impresión';
    if (source === 'standard') return 'Costo estándar';
    return 'Sin registrar';
  }

  protected edit(part: PartStock): void {
    const item = this.itemById().get(part.inventoryItemId);
    if (!item) {
      this.actionError.set('No encontramos esta pieza para editarla. Recarga la página.');
      return;
    }
    this.actionError.set(null);
    this.editing.set({ item });
  }

  protected async onSaved(message: string): Promise<void> {
    this.editing.set(null);
    this.notice.set(message);
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const [parts, items] = await Promise.all([this.data.partStock(), this.data.items()]);
      this.parts.set(parts);
      this.items.set(items.filter((item) => item.kind === 'part'));
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las piezas. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
