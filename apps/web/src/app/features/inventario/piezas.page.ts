import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page } from '../../ui';
import { InventarioData, type AssemblyOption, type PartStock } from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';

const COST_DIGITS = 3;

/**
 * Las piezas impresas en el estante, y la operación de armar.
 *
 * Es la pantalla que vuelve honesto el costeo: mientras una placa de nueve
 * tapas no dejaba nada contable, su costo entero caía sobre la primera venta.
 * Aquí las nueve existen, y cada producto armado consume una.
 */
@Component({
  selector: 'app-piezas',
  imports: [Page, Card, AsyncState, Empty, Badge, FORMAT_PIPES],
  styles: [
    INVENTORY_STYLES,
    `
      .stack { display: grid; gap: 1rem; }
      .assemble { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; gap: 0.6rem; align-items: end; }
      .assemble label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      @media (max-width: 40rem) { .assemble { grid-template-columns: 1fr; } }
      .low { color: var(--warn); }
    `,
  ],
  template: `
    <pp-page title="Piezas impresas" subtitle="Lo que sale de las placas y espera en el estante para armar un producto">
      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }

      <div class="stack">
        <pp-card heading="Armar un producto">
          <p class="muted">
            Consume las piezas y los insumos de su receta, todo o nada. Si falta algo, no se arma nada y te dice
            exactamente qué y cuánto falta.
          </p>
          <pp-async [loading]="loading()" [error]="error()">
            @if (options().length === 0) {
              <pp-empty message="Ninguna variante tiene receta todavía. La receta es la que dice con qué se arma." />
            } @else {
              <div class="assemble">
                <label>
                  Producto
                  <select [value]="variantId()" (change)="onVariant($event)">
                    <option value="">Elige una variante…</option>
                    @for (option of options(); track option.variantId) {
                      <option [value]="option.variantId">{{ option.label }}</option>
                    }
                  </select>
                </label>
                <label>
                  Unidades
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    [value]="units()"
                    (input)="onUnits($event)"
                  />
                </label>
                <button type="button" [disabled]="!canAssemble() || busy()" (click)="assemble()">
                  {{ busy() ? 'Armando…' : 'Armar' }}
                </button>
              </div>
            }
          </pp-async>
        </pp-card>

        <pp-card heading="En el estante">
          <pp-async [loading]="loading()" [error]="error()">
            @if (parts().length === 0) {
              <pp-empty
                message="Todavía no hay piezas. Una placa produce piezas cuando dices qué pieza produce en su receta y cierras la impresión."
              />
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
                    </tr>
                  </thead>
                  <tbody>
                    @for (part of parts(); track part.inventoryItemId) {
                      <tr>
                        <td><span class="strong">{{ part.name }}</span></td>
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
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </pp-async>
        </pp-card>
      </div>
    </pp-page>
  `,
})
export class PiezasPage {
  private readonly data = inject(InventarioData);

  protected readonly costDigits = COST_DIGITS;
  protected readonly parts = signal<PartStock[]>([]);
  protected readonly options = signal<AssemblyOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly variantId = signal('');
  protected readonly units = signal(1);

  protected readonly canAssemble = computed(() => this.variantId() !== '' && this.units() > 0);

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

  protected onVariant(event: Event): void {
    this.variantId.set((event.target as HTMLSelectElement).value);
  }

  protected onUnits(event: Event): void {
    this.units.set(Number((event.target as HTMLInputElement).value));
  }

  protected async assemble(): Promise<void> {
    if (!this.canAssemble() || this.busy()) return;

    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      await this.data.assemble(this.variantId(), this.units());
      const label = this.options().find((option) => option.variantId === this.variantId())?.label ?? 'producto';
      this.notice.set(`Armadas ${this.units()} de ${label}. Las piezas y los insumos ya salieron del stock.`);
      await this.load();
    } catch (error) {
      // El mensaje de la base dice qué falta y cuánto: se muestra tal cual.
      this.actionError.set(describeError(error, 'No pudimos armar el producto.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const [parts, options] = await Promise.all([this.data.partStock(), this.data.assemblyOptions()]);
      this.parts.set(parts);
      this.options.set(options);
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las piezas. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
