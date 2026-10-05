import { Component, computed, inject, signal } from '@angular/core';
import { Badge, Empty, AsyncState, FORMAT_PIPES, Page } from '../../ui';
import {
  InventarioData,
  type BrandOption,
  type FinishOption,
  type MaterialOption,
  type SkuSummary,
} from './inventario.data';
import { describeError } from './inventario.errors';
import { safeHex } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';
import { Modal } from './modal';
import { SkuForm } from './sku-form';

const COST_PER_GRAM_DIGITS = 3;

@Component({
  selector: 'app-filamentos',
  imports: [Page, AsyncState, Empty, Badge, Modal, SkuForm, FORMAT_PIPES],
  template: `
    <pp-page title="Filamentos" subtitle="Productos de filamento con su stock y costo promedio por gramo">
      <button actions type="button" (click)="editing.set('new')">+ Nuevo filamento</button>

      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
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
                    <th>Color</th>
                    <th class="hide-small">Marca</th>
                    <th class="hide-small">Material</th>
                    <th class="hide-small">Acabado</th>
                    <th class="num">Disponible</th>
                    <th class="num hide-small">Costo por g</th>
                    <th class="num hide-small">Mínimo</th>
                    <th><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (sku of visible(); track sku.id) {
                    <tr [class.inactive]="!sku.active">
                      <td>
                        <span class="row nowrap">
                          <span
                            class="swatch"
                            [class.empty]="!hex(sku)"
                            [style.background]="hex(sku)"
                            aria-hidden="true"
                          ></span>
                          <span>
                            <span class="strong">{{ sku.colorName }}</span>
                            @if (!sku.active) { <pp-badge>Inactivo</pp-badge> }
                            <small class="sub only-small">
                              {{ sku.brandName }} · {{ sku.materialCode }}@if (sku.finishName) { · {{ sku.finishName }} }
                            </small>
                            @if (sku.abrasive) {
                              <small class="sub"><pp-badge tone="warn">Abrasivo</pp-badge> {{ nozzleWarning(sku) }}</small>
                            }
                          </span>
                        </span>
                      </td>
                      <td class="hide-small">{{ sku.brandName }}</td>
                      <td class="hide-small">{{ sku.materialCode }}</td>
                      <td class="hide-small">{{ sku.finishName ?? '—' }}</td>
                      <td class="num">
                        {{ sku.availableG | grams }}
                        @if (sku.belowMinimum) {
                          <small class="sub"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
                        }
                      </td>
                      <td class="num hide-small">{{ sku.weightedCostPerGram | money: costDigits }}</td>
                      <td class="num hide-small">{{ sku.minStockG | grams }}</td>
                      <td class="actions-cell">
                        <button type="button" class="secondary" (click)="editing.set(sku)">Editar</button>
                      </td>
                    </tr>
                  }
                </tbody>
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
            (saved)="onSaved(target === 'new')"
            (cancelled)="editing.set(null)"
          />
        </app-modal>
      }
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .nowrap { flex-wrap: nowrap; align-items: flex-start; }
      .inactive { opacity: 0.6; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap;
      }
      .toolbar .check { margin-bottom: 0.4rem; }
    `,
  ],
})
export class FilamentosPage {
  private readonly data = inject(InventarioData);

  protected readonly costDigits = COST_PER_GRAM_DIGITS;
  protected readonly skus = signal<SkuSummary[]>([]);
  protected readonly brands = signal<BrandOption[]>([]);
  protected readonly materials = signal<MaterialOption[]>([]);
  protected readonly finishes = signal<FinishOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly editing = signal<SkuSummary | 'new' | null>(null);
  protected readonly search = signal('');
  protected readonly onlyLow = signal(false);

  protected readonly lowCount = computed(() => this.skus().filter((sku) => sku.belowMinimum).length);

  protected readonly visible = computed(() => {
    const needle = this.search().trim().toLowerCase();
    return this.skus().filter((sku) => {
      if (this.onlyLow() && !sku.belowMinimum) return false;
      if (!needle) return true;
      return [sku.colorName, sku.brandName, sku.materialCode, sku.finishName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  });

  constructor() {
    void this.load();
  }

  protected hex(sku: SkuSummary): string | null {
    return safeHex(sku.colorHex);
  }

  /** The "because of ..." part comes straight from the view; the sentence around it is all that is built here. */
  protected nozzleWarning(sku: SkuSummary): string {
    return `Desgasta la boquilla por ${sku.abrasiveBecause ?? 'su composición'}.`;
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected async onSaved(wasNew: boolean): Promise<void> {
    this.editing.set(null);
    this.notice.set(wasNew ? 'Filamento creado.' : 'Cambios guardados.');
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const [skus, brands, materials, finishes] = await Promise.all([
        this.data.skus(),
        this.data.brands(),
        this.data.materials(),
        this.data.finishes(),
      ]);
      this.skus.set(skus);
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
