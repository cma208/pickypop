import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { readPlateDetails, readSlicedFile, SlicedFileError } from '../../core/sliced-file';
import type { Lookups, Recipe } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { buildDraft, type ImportDraft } from './importacion';
import { ImportarPlacas, type ImportOutcome } from './importar-placas';
import { PlacaEditor } from './placa-editor';
import type { PartOption } from './salida-fila';
import { SuministroFila } from './suministro-fila';

const MINUTES_PER_HOUR = 60;

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

          @if (importDraft(); as draft) {
            <app-importar-placas
              [recipeId]="current.id"
              [firstIndex]="nextPlateIndex()"
              [draft]="draft"
              [parts]="importParts()"
              [perProduct]="perProduct()"
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

      const draft = buildDraft(fileName, info, details, { skus: this.lookups()?.skus ?? [], parts, learned });
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
    const pending = [
      outcome.unmatchedFilaments > 0 ? `elige el rollo de ${outcome.unmatchedFilaments} filamento(s) que no reconocimos` : null,
      outcome.withoutThumbnail > 0 ? `${outcome.withoutThumbnail} vista(s) no se pudieron guardar` : null,
    ].filter((text): text is string => text !== null);

    this.importNote.set(
      `Se cargaron ${outcome.created} placa(s) de «${fileName}».` + (pending.length > 0 ? ` Falta: ${pending.join('; ')}.` : ''),
    );
    this.changed.emit();
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
