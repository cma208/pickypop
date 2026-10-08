import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { readPlateDetails, readSlicedFile, SlicedFileError } from '../../core/sliced-file';
import type { Lookups, Recipe } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { CatalogoPermissions, OWNER_ONLY } from './catalogo.permissions';
import { messageOf } from './catalogo.util';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText, maxDecimals } from './catalogo.validators';
import { partsMadeByPlates, splitRecipeRows } from './costing';
import { buildDraft, importSummary, type ImportDraft, type ImportOutcome } from './importacion';
import { ImportarPlacas } from './importar-placas';
import { PlacaEditor } from './placa-editor';
import type { PartOption } from './salida-fila';
import { SuministroFila } from './suministro-fila';

const MINUTES_PER_HOUR = 60;

const MINUTES_MESSAGES: Record<string, string> = {
  required: 'Escribe los minutos; si no hay, pon 0.',
  min: 'No puede ser negativo.',
  max: `Hasta ${limitText(LIMITS.recipeMinutes)} minutos.`,
  decimals: `Los minutos van con ${decimalsText(DECIMALS.minutes)}.`,
};

function minutesControl() {
  return new FormControl<number | null>(0, [
    Validators.required,
    Validators.min(0),
    Validators.max(LIMITS.recipeMinutes),
    maxDecimals(DECIMALS.minutes),
  ]);
}

/** The production recipe of a variant: times, plates with filaments, and supplies per unit. */
@Component({
  selector: 'app-receta-editor',
  imports: [ReactiveFormsModule, Card, Field, ImportarPlacas, PlacaEditor, SuministroFila, ...FORMAT_PIPES],
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
      .refresh { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.9rem; }
    `,
  ],
  template: `
    <pp-card heading="Receta de producción">
      @if (lookupsError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else if (!recipe()) {
        <p class="muted">Esta variante todavía no tiene receta. Con ella se calcula cuánto cuesta fabricarla.</p>
        @if (createError(); as message) { <p class="error" role="alert">{{ message }}</p> }
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
              <pp-field label="Preparación por lote (minutos)" [error]="headerError('setupMinutes')">
                <input type="number" min="0" step="any" inputmode="decimal" formControlName="setupMinutes" />
              </pp-field>
              <pp-field label="Minutos por unidad" [error]="headerError('minutesPerUnit')">
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
          @if (!permissions.isOwner()) {
            <p class="muted hint owner-only">{{ ownerOnly }}</p>
          }

          @if (importDraft(); as draft) {
            <app-importar-placas
              [recipeId]="current.id"
              [firstIndex]="nextPlateIndex()"
              [draft]="draft"
              [parts]="importParts()"
              [perProduct]="perProduct()"
              [skus]="lookupData.skus"
              [materials]="lookupData.materials"
              (saved)="onImported($event, draft.fileName)"
              (cancelled)="importDraft.set(null)"
            />
          } @else {
            <div class="import">
              <label class="pick">
                <input type="file" accept=".3mf,.gcode.3mf" (change)="importFile($event)" [disabled]="importing()" />
                <span class="as-button">{{ importing() ? 'Leyendo…' : 'Cargar desde archivo laminado' }}</span>
              </label>
              <span class="muted hint">
                El <code>.gcode.3mf</code> de Bambu Studio. Trae los minutos, los gramos y la vista de cada placa,
                propone el rollo del taller que más se le parece y las piezas que salen de ella. Antes de guardar
                ves cada placa y lo confirmas. Se lee en tu computadora: el archivo no se sube a ningún sitio.
              </span>
              @if (importNote(); as message) { <p class="ok" role="status">{{ message }}</p> }
              @if (importError(); as message) { <p class="error" role="alert">{{ message }}</p> }
            </div>
          }
          @if (lookupsRefreshError(); as message) {
            <div class="notice refresh" role="alert">
              <p>{{ message }}</p>
              <button type="button" class="secondary" (click)="itemsChanged.emit()">Reintentar</button>
            </div>
          }
          <div class="stack">
            @for (plate of current.plates; track plate.id) {
              <app-placa-editor [recipeId]="current.id" [plate]="plate" [plates]="current.plates" [lookups]="lookupData" (changed)="changed.emit()" />
            }
            <app-placa-editor [recipeId]="current.id" [nextIndex]="nextPlateIndex()" [lookups]="lookupData" (changed)="changed.emit()" />
          </div>

          <h3>Piezas impresas por unidad</h3>
          <p class="muted hint">
            Cuántas de cada pieza lleva una unidad terminada. Con esto «Armar» sabe qué consumir y el plan sabe
            cuántas imprimir. Las que salen de las placas de arriba se agregan solas, una por unidad; su costo ya
            está en las corridas.
          </p>
          @for (supply of partRows(); track supply.id) {
            <app-suministro-fila mode="part" [recipeId]="current.id" [supply]="supply" [supplies]="partOptions()" [usedIds]="usedSupplyIds()" [madeHere]="madeHere()" [printed]="lookupData.printedParts" (changed)="changed.emit()" />
          }
          <app-suministro-fila mode="part" [recipeId]="current.id" [supplies]="partOptions()" [usedIds]="usedSupplyIds()" [madeHere]="madeHere()" [printed]="lookupData.printedParts" (changed)="changed.emit()" />

          <h3>Insumos por unidad</h3>
          <p class="muted hint">Lo que se compra y se gasta en cada unidad terminada: dulces, empaque, imanes…</p>
          @for (supply of supplyRows(); track supply.id) {
            <app-suministro-fila [recipeId]="current.id" [supply]="supply" [supplies]="boughtOptions()" [usedIds]="usedSupplyIds()" (changed)="changed.emit()" />
          }
          <app-suministro-fila [recipeId]="current.id" [supplies]="boughtOptions()" [usedIds]="usedSupplyIds()" (changed)="changed.emit()" />
        }
      } @else {
        <p class="muted">Cargando datos de materiales…</p>
      }
    </pp-card>
  `,
})
export class RecetaEditor {
  private readonly data = inject(CatalogoData);
  protected readonly permissions = inject(CatalogoPermissions);
  protected readonly ownerOnly = OWNER_ONLY.recipeRows;

  readonly variantId = input.required<string>();
  readonly recipe = input<Recipe | null>(null);
  readonly lookups = input<Lookups | null>(null);
  readonly lookupsError = input<string | null>(null);
  /**
   * The options could not be read again after parts were created. The ones
   * read before still serve, so the card stays and only says what is missing.
   */
  readonly lookupsRefreshError = input<string | null>(null);
  /** Labor rate per hour, to say what a minute per unit costs. */
  readonly laborRate = input<number | null>(null);
  readonly changed = output<void>();
  /**
   * The workshop's articles changed under the page (an import created parts),
   * so the lists of options are stale and the page should read them again.
   */
  readonly itemsChanged = output<void>();

  protected readonly minutesPerHour = MINUTES_PER_HOUR;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importNote = signal<string | null>(null);
  protected readonly importError = signal<string | null>(null);

  protected readonly nextPlateIndex = computed(
    () => Math.max(0, ...(this.recipe()?.plates.map((plate) => plate.plateIndex) ?? [])) + 1,
  );
  protected readonly usedSupplyIds = computed(
    () => this.recipe()?.supplies.map((supply) => supply.inventoryItemId) ?? [],
  );

  /** Printed parts are never bought, so they get their own list, apart from sweets and bags. */
  protected readonly partOptions = computed(() => this.lookups()?.supplies.filter((item) => item.kind === 'part') ?? []);
  protected readonly boughtOptions = computed(() => this.lookups()?.supplies.filter((item) => item.kind !== 'part') ?? []);
  private readonly rows = computed(() => splitRecipeRows(this.recipe()?.supplies ?? []));
  protected readonly partRows = computed(() => this.rows().parts);
  protected readonly supplyRows = computed(() => this.rows().supplies);
  protected readonly madeHere = computed(() => {
    const recipe = this.recipe();
    return recipe ? partsMadeByPlates(recipe) : new Set<string>();
  });

  /** The file being reviewed before its plates are saved. */
  protected readonly importDraft = signal<ImportDraft | null>(null);
  protected readonly importParts = signal<PartOption[]>([]);
  /** How many of each part one product takes, when the recipe lists the part as a supply. */
  protected readonly perProduct = computed(
    () => new Map(this.recipe()?.supplies.map((supply) => [supply.inventoryItemId, supply.quantityPerUnit]) ?? []),
  );

  /**
   * Lee un `.gcode.3mf` y arma la revisión de sus placas: minutos, gramos,
   * vista, y la pieza propuesta para cada objeto. No guarda nada: eso pasa
   * cuando la persona confirma en `app-importar-placas`.
   */
  protected async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.importing.set(true);
    this.importError.set(null);
    this.importNote.set(null);

    try {
      const { fileName, info } = await readSlicedFile(file);
      const [details, parts, learned] = await Promise.all([
        readPlateDetails(file, info.plates),
        this.data.parts(),
        this.data.learnedObjectParts(),
      ]);

      const draft = buildDraft(fileName, info, details, {
        skus: this.lookups()?.skus ?? [],
        materials: this.lookups()?.materials ?? [],
        parts,
        learned,
      });
      if (draft.plates.length === 0) {
        this.importError.set('Ese archivo no trae placas con material. Revisa que esté laminado.');
        return;
      }

      this.importParts.set(parts);
      this.importDraft.set(draft);
    } catch (error) {
      this.importError.set(
        error instanceof SlicedFileError ? error.message : messageOf(error, 'No pudimos leer el archivo.'),
      );
    } finally {
      this.importing.set(false);
    }
  }

  protected onImported(outcome: ImportOutcome, fileName: string): void {
    this.importDraft.set(null);
    this.importNote.set(importSummary(outcome, fileName));
    this.changed.emit();
    // The parts of the plates now exist and the database put them in the
    // recipe; without fresh options their rows had no name to show.
    this.itemsChanged.emit();
  }

  protected readonly header = new FormGroup({
    setupMinutes: minutesControl(),
    minutesPerUnit: minutesControl(),
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

  protected headerError(name: 'setupMinutes' | 'minutesPerUnit'): string | null {
    return fieldError(this.header.controls[name], MINUTES_MESSAGES);
  }

  protected async create(): Promise<void> {
    // The button is disabled while busy, but a second click can land before
    // the page redraws it.
    if (this.busy()) return;
    this.busy.set(true);
    this.createError.set(null);
    try {
      await this.data.createRecipe(this.variantId());
      this.changed.emit();
    } catch (error) {
      // Shown only while there is no recipe: when another tab created it a
      // moment ago, the reload brings it and the message has nothing to say.
      this.createError.set(messageOf(error, 'No pudimos crear la receta.'));
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveHeader(): Promise<void> {
    if (this.busy()) return;
    const recipe = this.recipe();
    this.error.set(null);
    this.header.markAllAsTouched();
    if (!recipe || this.header.invalid) return;

    const value = this.header.getRawValue();
    this.busy.set(true);
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
      // A refusal may come from a tab that is behind: read the recipe again.
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
