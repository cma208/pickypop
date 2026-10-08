import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Item, Page } from '../../ui';
import { InventarioData, type InventoryItemSummary, type PartStock } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES, POSITION_STYLES } from './inventario.styles';
import { InventoryPlan, type InventoryPositions } from './inventory-plan';
import { ItemForm } from './item-form';
import { Modal } from './modal';
import { PiezasDesactivadas } from './piezas-desactivadas';
import { deactivatedNote, deactivationWarning, PartRecipes, type PartUse } from './piezas-recetas';
import { itemCells, type PositionCells } from './stock-position';
import { CurrentWorkspace, READ_ONLY_NOTE } from '../../core/workspace';

const COST_DIGITS = 3;
const PART_ONLY = ['part'] as const;

/** Null is a new piece; an item is the piece being edited. */
type Editing = { item: InventoryItemSummary | null };

/** A piece with what the plan says of it. `cells` is null while the plan is not there. */
interface PartRow {
  part: PartStock;
  cells: PositionCells | null;
}

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
  imports: [Page, Card, AsyncState, Empty, Badge, Item, RouterLink, Modal, ItemForm, PiezasDesactivadas, FORMAT_PIPES],
  styles: [
    INVENTORY_STYLES,
    POSITION_STYLES,
    `
      .low { color: var(--warn); }
    `,
  ],
  template: `
    <pp-page title="Piezas impresas" subtitle="Lo que sale de las placas y espera en el estante para armar un producto">
      <a actions class="button secondary" routerLink="/inventario/armar">Armar productos</a>
      @if (canOperate()) {
        <button actions type="button" (click)="editing.set({ item: null })">+ Nueva pieza</button>
      }
      @if (roleKnown() && !canOperate()) {
        <p class="muted">{{ readOnlyNote }}</p>
      }

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }
      @if (planError(); as text) {
        <p class="alert-warn" role="status">{{ text }}</p>
      }

      <pp-card heading="En el estante">
        <pp-async [loading]="loading()" [error]="error()">
          @if (parts().length === 0) {
            <pp-empty
              [message]="
                inactiveParts().length > 0
                  ? 'No hay piezas activas. Las desactivadas están más abajo.'
                  : 'Todavía no hay piezas. Crea una y di en la receta qué placa la produce.'
              "
            >
              @if (canOperate()) {
                <button type="button" (click)="editing.set({ item: null })">Crear la primera pieza</button>
              }
            </pp-empty>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pieza</th>
                    <th class="num">Hay</th>
                    <th class="wide-only">Separado</th>
                    <th class="num wide-only">Libre</th>
                    <th class="wide-only">Falta</th>
                    <th class="num hide-small">Costo por unidad</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.part.inventoryItemId) {
                    @let part = row.part;
                    <tr>
                      <td>
                        <pp-item kind="part" [path]="part.imagePath" [photo]="{ kind: 'item', id: part.inventoryItemId }" [name]="part.name">
                          @if (!part.imagePath) {
                            <span sub>
                              @if (platePhotoStandsIn(part)) {
                                Foto de la placa ·
                                @if (canOperate()) { <button type="button" class="inline-link" (click)="edit(part)">Agregar la suya</button> }
                              } @else {
                                Sin foto ·
                                @if (canOperate()) { <button type="button" class="inline-link" (click)="edit(part)">Agregar</button> }
                              }
                            </span>
                          }
                        </pp-item>
                        @if (row.cells?.missing; as missing) {
                          <div class="badge-line narrow-only"><pp-badge tone="warn">{{ missing }}</pp-badge></div>
                        }
                      </td>
                      <td class="num">
                        <span class="nowrap">{{ row.cells?.onHand ?? part.onHand + ' ' + unitLabel(part) }}</span>
                        @if (row.cells; as cells) {
                          <small class="sub narrow-only" [attr.title]="cells.who || null">{{ cells.compact }}</small>
                        }
                        <small class="sub hide-small nowrap">Mínimo {{ part.minStock }}</small>
                        @if (part.belowMinimum && !row.cells?.missing) {
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
                      <td class="num hide-small">
                        @if (part.costPerUnit === null) {
                          <span class="low">Sin costo</span>
                        } @else {
                          {{ part.costPerUnit | money: costDigits }}
                        }
                        <small class="sub">{{ sourceLabel(part.costSource) }}</small>
                      </td>
                      <td class="actions-cell">
                        @if (canOperate()) {
                          <button type="button" class="ghost" (click)="edit(part)">Editar</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </pp-async>
      </pp-card>

      @if (inactiveParts().length > 0) {
        <app-piezas-desactivadas [parts]="inactiveParts()" [busyId]="reactivating()" [readOnly]="!canOperate()" (reactivate)="reactivate($event)" />
      }

      @if (canOperate() && editing(); as current) {
        <app-modal [heading]="current.item ? 'Editar pieza' : 'Nueva pieza'" (closed)="editing.set(null)">
          @if (current.item?.active && editWarning(); as warning) {
            <p class="alert-warn" role="status">{{ warning }}</p>
          }
          <app-item-form
            [item]="current.item"
            [kinds]="partOnly"
            (saved)="afterSave(current.item)"
            (cancelled)="editing.set(null)"
          />
        </app-modal>
      }
    </pp-page>
  `,
})
export class PiezasPage {
  private readonly data = inject(InventarioData);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator keep the inventory; a viewer only reads it (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  protected readonly roleKnown = this.workspace.roleKnown;
  protected readonly readOnlyNote = READ_ONLY_NOTE;
  private readonly planner = inject(InventoryPlan);
  private readonly photos = inject(ArticlePhotos);
  private readonly recipes = inject(PartRecipes);

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
  /** The recipes that use the piece being edited, to warn before it is switched off. */
  private readonly editUses = signal<PartUse[]>([]);
  protected readonly editWarning = computed(() => {
    const item = this.editing()?.item;
    return item ? deactivationWarning(item.name, this.editUses()) : null;
  });
  /** Pieces whose picture is the thumbnail of their plate, because they have no photo of their own. */
  private readonly platePhotos = signal<ReadonlySet<string>>(new Set());
  private readonly positions = signal<InventoryPositions | null>(null);
  protected readonly planError = signal<string | null>(null);

  protected readonly rows = computed<PartRow[]>(() => {
    const positions = this.positions();
    return this.parts().map((part) => ({
      part,
      cells: positions
        ? itemCells('part', part.unit, positions.items.get(part.inventoryItemId), positions.timeZone)
        : null,
    }));
  });

  private readonly itemById = computed(() => new Map(this.items().map((item) => [item.id, item])));

  /** Switched off: out of `part_stock`, so out of the table above, but not out of reach. */
  protected readonly inactiveParts = computed(() => this.items().filter((item) => !item.active));
  protected readonly reactivating = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  /** "1 unidad" pero "8 unidades": la tabla se lee mal en singular siempre. */
  protected unitLabel(part: PartStock): string {
    if (part.unit !== 'unidad') return part.unit;
    return part.onHand === 1 ? 'unidad' : 'unidades';
  }

  /** The picture shown beside a piece without a photo is its plate's: the row says so instead of «sin foto». */
  protected platePhotoStandsIn(part: PartStock): boolean {
    return this.platePhotos().has(part.inventoryItemId);
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
    this.editUses.set([]);
    this.editing.set({ item });
    void this.loadUses(item.id);
  }

  /**
   * A piece that recipes still use and was just switched off says so, and
   * which recipes: «Cambios guardados.» let it go quietly (T2-13).
   */
  protected async afterSave(before: InventoryItemSummary | null): Promise<void> {
    if (!before) {
      await this.onSaved('Pieza creada. Dile en la receta qué placa la produce.');
      return;
    }
    const uses = this.editUses();
    await this.onSaved('Cambios guardados.');
    const after = this.itemById().get(before.id);
    if (before.active && after && !after.active) this.notice.set(deactivatedNote(after.name, uses));
  }

  private async loadUses(partId: string): Promise<void> {
    try {
      const uses = await this.recipes.uses(partId);
      if (this.editing()?.item?.id === partId) this.editUses.set(uses);
    } catch {
      // Only a warning: the form works the same without it.
    }
  }

  protected async reactivate(part: InventoryItemSummary): Promise<void> {
    if (this.reactivating()) return;
    this.reactivating.set(part.id);
    this.actionError.set(null);
    this.notice.set(null);
    try {
      await this.data.setItemActive(part.id, true);
      await this.onSaved(`«${part.name}» vuelve a estar activa: ya se ofrece en las recetas y entra en el conteo.`);
    } catch (error) {
      this.actionError.set(describeError(error, 'No pudimos volver a activar la pieza. Inténtalo de nuevo.'));
      void this.workspace.afterRefusal(error);
    } finally {
      this.reactivating.set(null);
    }
  }

  protected async onSaved(message: string): Promise<void> {
    this.editing.set(null);
    this.notice.set(message);
    // A new piece, or a renamed one, is part of the plan too.
    this.planner.changed();
    await this.load();
  }

  private async load(): Promise<void> {
    await Promise.all([this.loadStock(), this.loadPlan()]);
  }

  private async loadStock(): Promise<void> {
    this.error.set(null);
    try {
      const [parts, items] = await Promise.all([this.data.partStock(), this.data.items()]);
      this.parts.set(parts);
      this.items.set(items.filter((item) => item.kind === 'part'));
      void this.findPlatePhotos(parts);
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las piezas. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async findPlatePhotos(parts: PartStock[]): Promise<void> {
    const withoutPhoto = parts.filter((part) => !part.imagePath);
    const found = await Promise.all(
      withoutPhoto.map(async (part) => {
        const photo = await this.photos.resolve({ kind: 'item', id: part.inventoryItemId });
        return photo.fromPlate ? part.inventoryItemId : null;
      }),
    );
    this.platePhotos.set(new Set(found.filter((id): id is string => id !== null)));
  }

  private async loadPlan(): Promise<void> {
    try {
      this.positions.set(await this.planner.read());
      this.planError.set(null);
    } catch (error) {
      this.planError.set(this.planner.problem(error));
    }
  }
}
