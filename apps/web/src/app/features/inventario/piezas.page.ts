import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page, Thumb } from '../../ui';
import { InventarioData, type PartStock } from './inventario.data';
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
  imports: [Page, Card, AsyncState, Empty, Badge, Thumb, RouterLink, FORMAT_PIPES],
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
      @if (actionError(); as text) {
        <p class="alert" role="alert">{{ text }}</p>
      }

      <div class="stack">
        <p class="muted">
          Para juntar estas piezas con sus dulces y su empaque, ve a
          <a routerLink="/inventario/armar">Armar productos</a>: ahí se elige el producto terminado y se ve antes
          qué se va a consumir.
        </p>

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
                        <td>
                          <span class="with-thumb">
                            <pp-thumb size="sm" [path]="part.imagePath" [name]="part.name" />
                            <span class="strong">{{ part.name }}</span>
                          </span>
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
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

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

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.parts.set(await this.data.partStock());
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos cargar las piezas. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
