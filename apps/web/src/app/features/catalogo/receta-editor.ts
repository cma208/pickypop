import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Lookups, Recipe } from './catalogo.models';
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
              <button type="submit" [disabled]="busy() || header.pristine">{{ busy() ? 'Guardando…' : 'Guardar tiempos' }}</button>
              <span class="muted hint">Versión {{ current.version }}</span>
            </div>
          </form>

          <h3>Placas</h3>
          <p class="muted hint">
            Un producto puede salir de varias placas (la botella en una, las tapas en otra). Los gramos son los de
            una corrida de la placa, con la purga que reporta el laminador.
          </p>
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

  protected readonly nextPlateIndex = computed(
    () => Math.max(0, ...(this.recipe()?.plates.map((plate) => plate.plateIndex) ?? [])) + 1,
  );
  protected readonly usedSupplyIds = computed(
    () => this.recipe()?.supplies.map((supply) => supply.inventoryItemId) ?? [],
  );

  protected readonly header = new FormGroup({
    setupMinutes: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    minutesPerUnit: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    note: new FormControl('', { nonNullable: true }),
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
