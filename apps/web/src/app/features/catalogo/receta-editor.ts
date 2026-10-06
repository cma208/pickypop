import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { readSlicedFile, SlicedFileError } from '../../core/sliced-file';
import { suggestFilamentSku } from '../../core/filament-match';
import type { ImportedPlate, Lookups, Recipe } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { PlacaEditor } from './placa-editor';
import { SuministroFila } from './suministro-fila';

const MINUTES_PER_HOUR = 60;

/** The production recipe of a variant: times, plates with filaments, and supplies per unit. */
@Component({
  selector: 'app-receta-editor',
  imports: [ReactiveFormsModule, Card, Field, PlacaEditor, SuministroFila, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      .explain { margin: 0 0 1rem; padding: 0.75rem 0.9rem; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 8px 8px 0; font-size: 0.85rem; }
      .explain p { margin: 0 0 0.4rem; }
      .explain p:last-child { margin: 0; }
      h3 { margin: 1.25rem 0 0.5rem; font-size: 0.95rem; }
      .assembled { display: grid; gap: 0.5rem; margin: 0 0 1rem; padding: 0; border: 0; }
      .assembled legend { margin-bottom: 0.35rem; font-weight: 600; font-size: 0.9rem; }
      .assembled label { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem; align-items: start; font-size: 0.85rem; }
      .assembled input { margin-top: 0.2rem; }
      .import { display: grid; gap: 0.4rem; justify-items: start; margin-bottom: 0.9rem; }
      .import .pick { position: relative; display: inline-block; }
      .import .pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      .import .as-button { display: inline-block; padding: 0.45rem 0.85rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.9rem; }
      .import .pick:hover .as-button { background: var(--accent-soft); }
      .import .ok { color: var(--good); font-size: 0.85rem; margin: 0; }
      .import code { font-size: 0.85em; }
    `,
  ],
  template: `
    <pp-card heading="Receta de producción">
      @if (lookupsError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else if (!recipe()) {
        <p class="muted">Esta variante todavía no tiene receta. Con ella se calcula cuánto cuesta fabricarla.</p>
        @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
        <button type="button" [disabled]="busy()" (click)="create()">{{ busy() ? 'Creando…' : 'Crear receta' }}</button>
      } @else if (lookups(); as lookupData) {
        @if (recipe(); as current) {
          <div class="explain">
            <p>
              <strong>Preparación por lote:</strong> el tiempo de laminar, acomodar la placa y cargar filamento.
              Se paga <em>una sola vez</em> por tanda, así que pesa menos en cada unidad cuanto más grande es el lote.
            </p>
            <p>
              <strong>Minutos por unidad:</strong> lo que lleva terminar cada pieza (armar, rellenar, empacar).
              <em>No baja</em> con el volumen, y por eso es lo que más decide el costo.
              @if (laborRate() !== null) {
                A {{ laborRate() | money }} la hora, cada minuto por unidad suma {{ laborRate()! / minutesPerHour | money }} a cada pieza.
              }
            </p>
          </div>

          <form [formGroup]="header" (ngSubmit)="saveHeader()" novalidate>
            <fieldset class="assembled">
              <legend>¿Cómo se entrega?</legend>
              <label>
                <input type="radio" formControlName="assembled" [value]="true" />
                <span><strong>Se arma.</strong> Sus piezas, dulces y empaque se juntan en «Armar productos», y al cliente se le entrega el producto armado.</span>
              </label>
              <label>
                <input type="radio" formControlName="assembled" [value]="false" />
                <span><strong>Sale tal cual de la impresora.</strong> No pasa por «Armar»: al entregarlo se descuentan directo sus piezas y su empaque. Un llavero, por ejemplo.</span>
              </label>
            </fieldset>
            <div class="fields">
              <pp-field label="Preparación por lote (minutos)" [error]="headerInvalid('setupMinutes') ? 'No puede ser negativo.' : null">
                <input type="number" min="0" step="any" inputmode="decimal" formControlName="setupMinutes" />
              </pp-field>
              <pp-field label="Minutos por unidad" [error]="headerInvalid('minutesPerUnit') ? 'No puede ser negativo.' : null">
                <input type="number" min="0" step="any" inputmode="decimal" formControlName="minutesPerUnit" />
              </pp-field>
            </div>
            <pp-field label="Nota de la receta">
              <textarea formControlName="note" rows="2"></textarea>
            </pp-field>
            @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
            <div class="bar">
              <button type="submit" [disabled]="busy() || header.pristine">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
              <span class="muted hint">Versión {{ current.version }}</span>
            </div>
          </form>

          <h3>Placas</h3>
          <p class="muted hint">
            Un producto puede salir de varias placas (la botella en una, las tapas en otra). Los gramos son los de
            una corrida de la placa, con la purga que reporta el laminador.
          </p>

          <div class="import">
            <label class="pick">
              <input type="file" accept=".3mf,.gcode.3mf" (change)="importFile($event, current.id)" [disabled]="importing()" />
              <span class="as-button">{{ importing() ? 'Leyendo…' : 'Cargar desde archivo laminado' }}</span>
            </label>
            <span class="muted hint">
              El <code>.gcode.3mf</code> de Bambu Studio. Trae los minutos y los gramos de cada placa, y propone el
              rollo del taller que más se le parece. Se lee en tu computadora: no se sube a ningún sitio.
            </span>
            @if (importNote(); as message) { <p class="ok" role="status">{{ message }}</p> }
            @if (importError(); as message) { <p class="error" role="alert">{{ message }}</p> }
          </div>
          <div class="stack">
            @for (plate of current.plates; track plate.id) {
              <app-placa-editor [recipeId]="current.id" [plate]="plate" [lookups]="lookupData" (changed)="changed.emit()" />
            }
            <app-placa-editor [recipeId]="current.id" [nextIndex]="nextPlateIndex()" [lookups]="lookupData" (changed)="changed.emit()" />
          </div>

          <h3>Insumos por unidad</h3>
          <p class="muted hint">Lo que se gasta en cada pieza terminada: dulces, empaque, imanes…</p>
          @for (supply of current.supplies; track supply.id) {
            <app-suministro-fila [recipeId]="current.id" [supply]="supply" [supplies]="lookupData.supplies" [usedIds]="usedSupplyIds()" (changed)="changed.emit()" />
          }
          <app-suministro-fila [recipeId]="current.id" [supplies]="lookupData.supplies" [usedIds]="usedSupplyIds()" (changed)="changed.emit()" />
        }
      } @else {
        <p class="muted">Cargando datos de materiales…</p>
      }
    </pp-card>
  `,
})
export class RecetaEditor {
  private readonly data = inject(CatalogoData);

  readonly variantId = input.required<string>();
  readonly recipe = input<Recipe | null>(null);
  readonly lookups = input<Lookups | null>(null);
  readonly lookupsError = input<string | null>(null);
  /** Labor rate per hour, to say what a minute per unit costs. */
  readonly laborRate = input<number | null>(null);
  readonly changed = output<void>();

  protected readonly minutesPerHour = MINUTES_PER_HOUR;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importNote = signal<string | null>(null);
  protected readonly importError = signal<string | null>(null);

  protected readonly nextPlateIndex = computed(
    () => Math.max(0, ...(this.recipe()?.plates.map((plate) => plate.plateIndex) ?? [])) + 1,
  );
  protected readonly usedSupplyIds = computed(
    () => this.recipe()?.supplies.map((supply) => supply.inventoryItemId) ?? [],
  );

  /**
   * Lee un `.gcode.3mf` y crea las placas que trae, con sus filamentos.
   *
   * El lector es el mismo del cotizador, sobre el mismo archivo. Las unidades
   * por corrida quedan en 1 **a propósito**: el laminador sabe cuánto pesa y
   * cuánto tarda la placa, pero no cuántas piezas vendibles salen de ella.
   * Eso lo sabe quien la armó, y ponerlo en 1 obliga a mirarlo en vez de
   * heredar un número inventado.
   */
  protected async importFile(event: Event, recipeId: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.importing.set(true);
    this.importError.set(null);
    this.importNote.set(null);

    try {
      const { fileName, info } = await readSlicedFile(file);
      const skus = this.lookups()?.skus ?? [];

      const plates: ImportedPlate[] = info.plates.map((plate, offset) => ({
        label: plateLabel(plate.objectNames[0], offset),
        unitsPerRun: 1,
        printTimeS: plate.predictionSeconds ?? 0,
        sourceFileName: fileName,
        filaments: plate.filaments
          .filter((filament) => (filament.usedGrams ?? 0) > 0)
          .map((filament) => {
            const skuId = suggestFilamentSku(filament, skus);
            return {
              slot: filament.id,
              grams: filament.usedGrams ?? 0,
              colorHex: filament.colorHex,
              materialId: skus.find((sku) => sku.id === skuId)?.materialId ?? null,
              skuId,
            };
          }),
      }));

      if (plates.length === 0) {
        this.importError.set('Ese archivo no trae placas con material. Revisa que esté laminado.');
        return;
      }

      const created = await this.data.importPlates(recipeId, this.nextPlateIndex(), plates);
      const unmatched = plates.reduce(
        (total, plate) => total + plate.filaments.filter((filament) => filament.skuId === null).length,
        0,
      );
      this.importNote.set(
        `Se cargaron ${created} placa(s) de «${fileName}». Revisa las unidades por corrida` +
          (unmatched > 0 ? ` y elige el rollo de ${unmatched} filamento(s) que no reconocimos.` : '.'),
      );
      this.changed.emit();
    } catch (error) {
      this.importError.set(
        error instanceof SlicedFileError ? error.message : messageOf(error, 'No pudimos leer el archivo.'),
      );
    } finally {
      this.importing.set(false);
    }
  }

  protected readonly header = new FormGroup({
    setupMinutes: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    minutesPerUnit: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    note: new FormControl('', { nonNullable: true }),
    assembled: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      const recipe = this.recipe();
      untracked(() => {
        if (recipe && !this.header.dirty) {
          this.header.reset({
            setupMinutes: recipe.setupMinutes,
            minutesPerUnit: recipe.minutesPerUnit,
            note: recipe.note ?? '',
            assembled: recipe.assembled,
          });
        }
      });
    });
  }

  protected headerInvalid(name: 'setupMinutes' | 'minutesPerUnit'): boolean {
    const control = this.header.controls[name];
    return control.touched && control.invalid;
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.createRecipe(this.variantId());
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos crear la receta.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveHeader(): Promise<void> {
    const recipe = this.recipe();
    this.header.markAllAsTouched();
    if (!recipe || this.header.invalid || this.busy()) return;

    const value = this.header.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.updateRecipe(recipe.id, {
        setupMinutes: Number(value.setupMinutes),
        minutesPerUnit: Number(value.minutesPerUnit),
        note: value.note,
        assembled: value.assembled,
      });
      this.header.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la receta.'));
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * "thermoformed potion bottle - frontal shape.stl" es el nombre del archivo,
 * no una etiqueta. Se limpia y se corta: la etiqueta se lee en una fila de
 * tabla, y de todos modos el dueño la va a reescribir.
 */
function plateLabel(objectName: string | undefined, offset: number): string {
  const clean = (objectName ?? '')
    .replace(/\.(stl|3mf|step|obj)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (clean === '') return `Placa ${offset + 1}`;

  const short = clean.length > 36 ? `${clean.slice(0, 35).trimEnd()}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
