import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORMAT_PIPES, Thumb } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Lookups, RecipePlate } from './catalogo.models';
import { CatalogoPermissions } from './catalogo.permissions';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText, maxDecimals } from './catalogo.validators';
import { isOnlySourceOf, partsOnlyThisPlateMakes, removePlateQuestion } from './plate-removal';
import { FilamentoFila } from './filamento-fila';
import { describeObjects } from './importacion';
import { SalidaFila, type PartOption } from './salida-fila';

const SECONDS_PER_MINUTE = 60;
/**
 * A sliced file says 2666 s, which is 44.4333… minutes. Two decimals read like
 * a time and still give back the same second on save: they are off by 0.3 s at most.
 */
const MINUTE_DECIMALS = 100;

const UNITS_MESSAGES: Record<string, string> = {
  required: 'Productos por corrida: escribe cuántos alcanza a hacer una corrida.',
  min: 'Productos por corrida: tienen que ser más que cero.',
  max: `Productos por corrida: hasta ${limitText(LIMITS.perRun)}.`,
  decimals: `Productos por corrida: ${decimalsText(DECIMALS.quantity)}.`,
};

const MINUTES_MESSAGES: Record<string, string> = {
  required: 'Tiempo: escribe cuántos minutos tarda una corrida.',
  min: 'Tiempo: al menos 1 minuto.',
  max: `Tiempo: hasta ${limitText(LIMITS.plateMinutes)} minutos (una semana).`,
  decimals: `Tiempo: ${decimalsText(DECIMALS.minutes)}.`,
};

/** A plate of the recipe with its filaments, or the form that adds a new plate. */
@Component({
  selector: 'app-placa-editor',
  imports: [ReactiveFormsModule, Thumb, FilamentoFila, SalidaFila, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      section { padding: 0.9rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
      h4 { margin: 0; font-size: 0.95rem; }
      .head { display: flex; align-items: center; gap: 0.75rem; margin: 0 0 0.6rem; }
      .said { margin: 0 0 0.35rem; font-size: 0.82rem; }
      label { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .plate { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.9fr) auto; gap: 0.5rem; align-items: end; }
      .filaments, .outputs { margin-top: 0.75rem; }
      .filaments h5, .outputs h5 { margin: 0 0 0.25rem; font-size: 0.8rem; color: var(--muted); font-weight: 600; }
      .err { margin: 0.5rem 0 0; font-size: 0.8rem; }
      @media (max-width: 40rem) { .plate { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } label.name { grid-column: 1 / -1; } }
    `,
  ],
  template: `
    <section>
      <div class="head">
        @if (plate(); as current) {
          <pp-thumb size="bed" kind="plate" [path]="current.thumbnailPath" [name]="current.label ?? 'Placa ' + current.plateIndex" />
        }
        <h4>{{ plate() ? 'Placa ' + plate()!.plateIndex + (plate()!.label ? ' · ' + plate()!.label : '') : 'Agregar placa' }}</h4>
      </div>
      <form class="plate" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <label class="name">Etiqueta
          <input formControlName="label" placeholder="Ej. Botella, Tapas" autocomplete="off" />
        </label>
        <label title="Para el costo: cuántos productos terminados alcanza a hacer una corrida de esta placa">Productos por corrida
          <input type="number" min="0.001" step="any" inputmode="decimal" formControlName="unitsPerRun" />
        </label>
        <label>Tiempo (minutos)
          <input type="number" min="1" step="any" inputmode="decimal" formControlName="printMinutes" />
        </label>
        <div class="bar" style="margin: 0">
          <button type="submit" [disabled]="busy() || (plate() !== null && form.pristine)">
            {{ plate() ? 'Guardar' : 'Agregar' }}
          </button>
          @if (plate() && permissions.isOwner()) {
            <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar placa">✕</button>
          }
        </div>
      </form>
      @if (formError(); as message) {
        <p class="err error">{{ message }}</p>
      }
      @if (error(); as message) {
        <p class="err error" role="alert">{{ message }}</p>
      }
      @if (plate(); as current) {
        <p class="muted hint">Tiempo total por corrida: {{ current.printTimeS | duration }}.</p>
        <div class="filaments">
          <h5>Filamentos de esta placa (gramos de UNA corrida)</h5>
          @for (filament of current.filaments; track filament.id) {
            <app-filamento-fila [plateId]="current.id" [filament]="filament" [lookups]="lookups()" (changed)="changed.emit()" />
          }
          <app-filamento-fila [plateId]="current.id" [lookups]="lookups()" [nextSlot]="nextSlot()" (changed)="changed.emit()" />
        </div>
        <div class="outputs">
          <h5>Lo que sale de esta placa al estante (piezas de UNA corrida)</h5>
          @if (current.fileRecord; as record) {
            @if (record.objects.length > 0) {
              <p class="said">
                El archivo dice: <strong>{{ said(record.objects) }}</strong>
                <span class="muted">
                  · placa {{ record.filePlate ?? '?' }}@if (current.sourceFileName) { de «{{ current.sourceFileName }}»}
                </span>
              </p>
            }
          }
          @if (current.outputs.length === 0) {
            <p class="muted hint">Sin piezas, la placa no deja nada en el estante al cerrar la impresión.</p>
          }
          @for (out of current.outputs; track out.id) {
            <app-salida-fila [plateId]="current.id" [current]="out" [parts]="parts()" [usedIds]="usedPartIds()" [soleSource]="soleOutputs().has(out.id)" (changed)="changed.emit()" />
          }
          <app-salida-fila [plateId]="current.id" [parts]="parts()" [usedIds]="usedPartIds()" [nextPosition]="current.outputs.length + 1" (changed)="changed.emit()" />
        </div>
      }
    </section>
  `,
})
export class PlacaEditor {
  private readonly data = inject(CatalogoData);

  protected readonly permissions = inject(CatalogoPermissions);

  readonly recipeId = input.required<string>();
  readonly plate = input<RecipePlate | null>(null);
  /** Every plate of the recipe, to tell which parts only this one prints. */
  readonly plates = input<readonly RecipePlate[]>([]);
  /** Number for a new plate. */
  readonly nextIndex = input(1);
  readonly lookups = input.required<Lookups>();
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /**
   * The parts a plate can make, from the page's options. Each plate used to
   * read them once on its own, so a part an import had just created was
   * missing from the plate added next until the page was reloaded (E2-01).
   */
  protected readonly parts = computed<PartOption[]>(() =>
    this.lookups()
      .supplies.filter((item) => item.kind === 'part')
      .map((item) => ({ id: item.id, name: item.name, unit: item.unit, imagePath: item.imagePath ?? null })),
  );
  protected readonly usedPartIds = computed(() => this.plate()?.outputs.map((out) => out.inventoryItemId) ?? []);
  /** This plate's outputs that are the only ones in the recipe printing their part. */
  protected readonly soleOutputs = computed(() => {
    const plate = this.plate();
    if (!plate) return new Set<string>();
    const plates = this.plates().length > 0 ? this.plates() : [plate];
    return new Set(plate.outputs.filter((out) => isOnlySourceOf(out, plates)).map((out) => out.id));
  });

  protected readonly nextSlot = computed(
    () => Math.max(0, ...(this.plate()?.filaments.map((filament) => filament.slot) ?? [])) + 1,
  );

  protected readonly form = new FormGroup({
    label: new FormControl('', { nonNullable: true }),
    unitsPerRun: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.001),
      Validators.max(LIMITS.perRun),
      maxDecimals(DECIMALS.quantity),
    ]),
    printMinutes: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(LIMITS.plateMinutes),
      maxDecimals(DECIMALS.minutes),
    ]),
  });

  /**
   * The first field that is wrong, by name. «Ambos mayores que cero» was
   * shown for 0.5 minutes, which is greater than zero (T2-20).
   */
  protected formError(): string | null {
    const { unitsPerRun, printMinutes } = this.form.controls;
    return fieldError(unitsPerRun, UNITS_MESSAGES) ?? fieldError(printMinutes, MINUTES_MESSAGES);
  }

  constructor() {
    effect(() => {
      const plate = this.plate();
      untracked(() => {
        if (!this.form.dirty) this.fill(plate);
      });
    });
  }

  protected said(objects: { name: string; count: number }[]): string {
    return describeObjects(objects);
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const input = {
      label: value.label,
      unitsPerRun: Number(value.unitsPerRun),
      printTimeS: Math.round(Number(value.printMinutes) * SECONDS_PER_MINUTE),
    };

    this.busy.set(true);
    try {
      const current = this.plate();
      if (current) {
        await this.data.updatePlate(current.id, input);
      } else {
        await this.data.addPlate(this.recipeId(), this.nextIndex(), input);
      }
      this.form.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la placa.'));
      // A refusal may come from a tab that is behind: read the recipe again.
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Says, before removing, which parts no other plate of the recipe prints:
   * they stay in the recipe with nothing to print them, so they stop adding
   * to the cost and the plan cannot make them (T2-07).
   */
  protected async remove(): Promise<void> {
    const current = this.plate();
    if (!current || this.busy()) return;
    const orphans = partsOnlyThisPlateMakes(current, this.plates()).map((id) => this.partName(current, id));
    if (!confirm(removePlateQuestion(current, orphans))) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deletePlate(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar la placa.'));
    } finally {
      this.busy.set(false);
    }
    // Removed or refused, what the page shows may be old: read it again.
    this.changed.emit();
  }

  private partName(plate: RecipePlate, id: string): string {
    const output = plate.outputs.find((candidate) => candidate.inventoryItemId === id);
    return output?.part?.name ?? this.lookups().supplies.find((item) => item.id === id)?.name ?? 'una pieza';
  }

  private fill(plate: RecipePlate | null): void {
    this.form.reset({
      label: plate?.label ?? '',
      unitsPerRun: plate?.unitsPerRun ?? null,
      printMinutes: plate ? Math.round((plate.printTimeS / SECONDS_PER_MINUTE) * MINUTE_DECIMALS) / MINUTE_DECIMALS : null,
    });
  }
}
