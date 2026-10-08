import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page, Thumb } from '../../ui';
import { borrowedPhoto } from '../../core/article-photos';
import { friendlyError } from '../../core/friendly-error';
import { InventarioData, type AssemblyComponent, type AssemblyOption } from './inventario.data';
import { INVENTORY_PIPES, ITEM_KIND_LABELS } from './inventario.format';
import { INVENTORY_STYLES, POSITION_STYLES } from './inventario.styles';
import { assemblyOutcome, type AssemblyOutcome } from './assembly';
import { InventoryPlan, type InventoryPositions } from './inventory-plan';
import { assembledMessage, assembledText, claimsTitle } from './stock-position';

/** What the card of a product says it has on the shelf, and whose it is. */
interface Built {
  text: string;
  who: string | null;
}

/**
 * Armar un producto terminado.
 *
 * El orden importa y antes estaba al revés: se elegía una variante de una
 * lista de texto, se escribía una cantidad y recién al pulsar el botón la base
 * contestaba si alcanzaba. Aquí se elige el producto por su foto, se dice
 * cuántos, y la pantalla enseña **antes** qué va a consumir y qué falta.
 *
 * La base sigue siendo la que decide: `assemble_product` es todo o nada y
 * vuelve a comprobar el stock. Esto no reemplaza esa comprobación, la
 * adelanta, que es distinto —entre que se mira y se pulsa, alguien pudo
 * consumir una tapa—.
 */
@Component({
  selector: 'app-armar',
  imports: [Page, Card, AsyncState, Empty, Badge, Thumb, ...FORMAT_PIPES, ...INVENTORY_PIPES],
  template: `
    <pp-page title="Armar productos" subtitle="Juntar piezas, dulces y empaque en un producto terminado">
      @if (planError(); as text) {
        <p class="alert-warn" role="status">{{ text }}</p>
      }
      <pp-async [loading]="loading()" [error]="error()">
        @if (options().length === 0) {
          <pp-empty message="Todavía no hay productos con receta. Se definen en Catálogo y recetas." />
        } @else {
          <div class="picker">
            @for (option of options(); track option.variantId) {
              <button
                type="button"
                class="option"
                [class.chosen]="chosen()?.variantId === option.variantId"
                [attr.aria-pressed]="chosen()?.variantId === option.variantId"
                (click)="choose(option)"
              >
                <pp-thumb size="fill" kind="product" [path]="option.imagePath" [name]="option.productName" />
                <span class="name">{{ option.productName }}</span>
                <span class="variant muted">{{ option.variantName }}</span>
                <span class="stock">
                  @if (option.componentCount === 0) {
                    <pp-badge tone="warn">Sin receta cargada</pp-badge>
                  } @else if (option.buildableUnits > 0) {
                    <pp-badge tone="good">Alcanza para {{ option.buildableUnits }}</pp-badge>
                  } @else {
                    <pp-badge tone="bad">No alcanza</pp-badge>
                  }
                </span>
                @let built = builtOf(option);
                <span class="muted small sub" [attr.title]="built.who">{{ built.text }}</span>
              </button>
            }
          </div>

          @if (chosen(); as option) {
            <pp-card [heading]="'Armar ' + option.productName + ' · ' + option.variantName">
              <div class="qty">
                <label>
                  ¿Cuántas?
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    [value]="units()"
                    (input)="onUnits($event)"
                  />
                </label>
                @if (!confirming()) {
                  <button type="button" [disabled]="!canAssemble()" (click)="review()">Armar {{ units() }}</button>
                }
                <!-- Right after assembling, the stock left may not reach another one: that is not a failure, the message below says what happened. -->
                @if (!enough() && !busy() && !result()) {
                  <span class="muted">Falta stock para {{ units() }}. Alcanza para {{ option.buildableUnits }}.</span>
                }
              </div>

              @if (confirming()) {
                @let outcome = preview(option);
                <div class="confirm" role="alert">
                  <p><strong>Esto no se puede deshacer.</strong> Salen del estante:</p>
                  <ul class="moves">
                    @for (row of outcome.leaving; track row.component.inventoryItemId) {
                      <li>
                        <pp-thumb
                          size="option"
                          [kind]="row.component.kind"
                          [path]="row.component.imagePath"
                          [photo]="borrowedPhoto(row.component.inventoryItemId, row.component.kind)"
                          [name]="row.component.name"
                        />
                        <span><span class="strong">{{ row.amount }}</span> de {{ row.component.name }}</span>
                      </li>
                    }
                  </ul>
                  <p>Entra al estante:</p>
                  <ul class="moves">
                    <li>
                      <pp-thumb size="option" kind="product" [path]="option.imagePath" [name]="option.productName" />
                      <span class="strong">{{ outcome.entering }}</span>
                    </li>
                  </ul>
                  <!-- ADR-022: what is sold off the shelf costs what it really cost, the hands that assembled it included. -->
                  <p class="muted">
                    Cada unidad entra valorizada en lo que consume más la mano de obra de su receta: los minutos por
                    unidad, y la preparación una vez por armado, a la tarifa del perfil de costo vigente. Es lo que
                    costará en Resultados cuando se venda.
                  </p>
                  <div class="actions">
                    <button type="button" [disabled]="busy()" (click)="assemble()">{{ busy() ? 'Armando…' : 'Sí, armar' }}</button>
                    <button type="button" class="secondary" [disabled]="busy()" (click)="confirming.set(false)">Volver</button>
                  </div>
                </div>
              }

              <!-- Right under the button: below the table it was out of sight, and the page looked as if it had failed. -->
              @if (result(); as message) {
                <p class="notice" role="status">{{ message }}</p>
              }
              @if (assembleError(); as message) {
                <p class="alert" role="alert">{{ message }}</p>
              }

              @if (componentsError(); as message) {
                <p class="alert" role="alert">{{ message }}</p>
              }

              @if (components().length === 0) {
                <pp-empty message="Esta variante no tiene componentes en su receta. Cárgalos en Catálogo y recetas." />
              } @else {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Componente</th>
                        <th class="num">Hace falta</th>
                        <th class="num">Hay</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of needs(); track row.component.inventoryItemId) {
                        <tr [class.short]="row.missing > 0">
                          <td>
                            <span class="with-thumb">
                              <pp-thumb
                                size="row"
                                [kind]="row.component.kind"
                                [path]="row.component.imagePath"
                                [photo]="borrowedPhoto(row.component.inventoryItemId, row.component.kind)"
                                [name]="row.component.name"
                              />
                              <span>
                                <span class="strong">{{ row.component.name }}</span>
                                <small class="sub">{{ kindLabel[row.component.kind] }}</small>
                              </span>
                            </span>
                          </td>
                          <td class="num">{{ row.needed | qty: row.component.unit }}</td>
                          <td class="num">{{ row.component.onHand | qty: row.component.unit }}</td>
                          <td>
                            @if (row.missing > 0) {
                              <pp-badge tone="bad">{{ missingVerb(row.missing) }} {{ row.missing | qty: row.component.unit }}</pp-badge>
                            } @else {
                              <pp-badge tone="good">Alcanza</pp-badge>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </pp-card>
          }
        }
      </pp-async>
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    POSITION_STYLES,
    `
    .picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }
    .option {
      display: grid; justify-items: start; gap: 0.3rem;
      padding: 0.7rem; border: 1.5px solid var(--line); border-radius: var(--radius);
      background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .option:hover { border-color: var(--muted); }
    .option.chosen { border-color: var(--accent); background: var(--accent-soft); }
    .option .name { font-weight: 600; }
    .option .variant { font-size: 0.85rem; }
    .option .small { font-size: 0.78rem; }
    .qty { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
    .qty label { display: grid; gap: 0.25rem; font-size: 0.85rem; }
    .qty input { width: 7rem; }
    tr.short td { background: var(--danger-soft); }
    .confirm { margin-bottom: 0.9rem; padding: 0.8rem; border: 1px solid var(--warn); border-radius: var(--radius); background: var(--warn-soft); }
    .confirm p { margin: 0 0 0.4rem; }
    .moves { list-style: none; margin: 0 0 0.6rem; padding: 0; display: grid; gap: 0.35rem; }
    .moves li { display: flex; align-items: center; gap: 0.6rem; }
    .confirm .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `,
  ],
})
export class ArmarPage {
  private readonly data = inject(InventarioData);
  private readonly planner = inject(InventoryPlan);

  protected readonly kindLabel = ITEM_KIND_LABELS;
  /** A piece without a photo shows the plate that prints it. */
  protected readonly borrowedPhoto = borrowedPhoto;

  protected readonly options = signal<AssemblyOption[]>([]);
  protected readonly components = signal<AssemblyComponent[]>([]);
  protected readonly chosen = signal<AssemblyOption | null>(null);
  protected readonly units = signal(1);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly componentsError = signal<string | null>(null);
  protected readonly assembleError = signal<string | null>(null);
  protected readonly result = signal<string | null>(null);
  /** «Armar» first shows what will move; only «Sí, armar» moves it (E3-04). */
  protected readonly confirming = signal(false);
  /** Who the assembled units are for. Without the plan the card still says how many there are. */
  private readonly positions = signal<InventoryPositions | null>(null);
  protected readonly planError = signal<string | null>(null);

  /** Lo que haría falta para la cantidad pedida, y cuánto falta de cada cosa. */
  protected readonly needs = computed(() =>
    this.components().map((component) => {
      const needed = component.quantityPerUnit * this.units();
      return { component, needed, missing: Math.max(0, needed - component.onHand) };
    }),
  );

  protected readonly enough = computed(
    () => this.components().length > 0 && this.needs().every((row) => row.missing === 0),
  );

  protected readonly canAssemble = computed(() => this.enough() && this.units() > 0 && !this.busy());

  constructor() {
    void this.load();
    void this.loadPlan();
  }

  /**
   * "3 armadas · 3 para PED-0003": what is already assembled is not all
   * free, and before this card said only the first half.
   */
  protected builtOf(option: AssemblyOption): Built {
    const positions = this.positions();
    const itemId = positions?.finishedItemOf.get(option.variantId);
    const position = itemId ? positions?.items.get(itemId) : undefined;
    if (!positions || !position) return { text: assembledText(option.assembledOnHand, []), who: null };
    return {
      text: assembledText(position.onHand, position.claims),
      who: position.claims.length > 0 ? claimsTitle(position.claims, 'unidad', positions.timeZone) : null,
    };
  }

  /** «Falta 1 unidad», «Faltan 3 unidades»: the verb agrees with how many are missing. */
  protected missingVerb(missing: number): string {
    return missing === 1 ? 'Falta' : 'Faltan';
  }

  protected onUnits(event: Event): void {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    this.units.set(Number.isFinite(value) && value > 0 ? value : 1);
    this.result.set(null);
    this.assembleError.set(null);
    // A confirmation is for the quantity it showed, never for a new one.
    this.confirming.set(false);
  }

  protected preview(option: AssemblyOption): AssemblyOutcome {
    return assemblyOutcome(this.units(), option, this.components());
  }

  protected review(): void {
    if (!this.canAssemble()) return;
    this.result.set(null);
    this.assembleError.set(null);
    this.confirming.set(true);
  }

  protected async choose(option: AssemblyOption): Promise<void> {
    this.chosen.set(option);
    this.components.set([]);
    this.result.set(null);
    this.assembleError.set(null);
    this.componentsError.set(null);
    this.confirming.set(false);

    try {
      this.components.set(await this.data.assemblyComponents(option.variantId));
    } catch (error) {
      this.componentsError.set(friendlyError(error, 'No pudimos leer la receta de este producto.'));
    }
  }

  protected async assemble(): Promise<void> {
    const option = this.chosen();
    if (!option || !this.canAssemble()) return;

    this.busy.set(true);
    this.assembleError.set(null);
    this.result.set(null);

    try {
      const units = this.units();
      await this.data.assemble(option.variantId, units);
      // Parts went out and products came in: who gets what has changed.
      this.planner.changed();
      void this.loadPlan();
      await this.load();
      // La tarjeta elegida trae ahora otros números, y la receta otros saldos.
      const refreshed = this.options().find((row) => row.variantId === option.variantId);
      if (refreshed) await this.choose(refreshed);
      // Choosing clears the last message, so this one goes after it: it was the only sign that anything happened.
      this.result.set(assembledMessage(units, option));
    } catch (error) {
      // La base escribe aquí qué falta y cuánto: es mejor mensaje que cualquiera de aquí.
      this.assembleError.set(friendlyError(error, 'No pudimos armar el producto.'));
    } finally {
      this.busy.set(false);
      this.confirming.set(false);
    }
  }

  /** A plan that fails leaves the cards with their count, which comes from the shelf. */
  private async loadPlan(): Promise<void> {
    try {
      this.positions.set(await this.planner.read());
      this.planError.set(null);
    } catch (error) {
      this.positions.set(null);
      this.planError.set(this.planner.problem(error));
    }
  }

  private async load(): Promise<void> {
    try {
      this.options.set(await this.data.assemblyOptions());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los productos que se pueden armar.'));
    } finally {
      this.loading.set(false);
    }
  }
}
