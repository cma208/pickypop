import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { FORMAT_PIPES, Thumb } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Lookups, RecipePlate } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import { maxDecimals } from '../../core/form-errors';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText } from './catalogo.validators';
import { isOnlySourceOf, partsOnlyThisPlateMakes, removePlateQuestion, splitByRecipe } from './plate-removal';
import { FilamentoFila } from './filamento-fila';
import { describeObjects } from './importacion';
import { SalidaFila, type PartOption } from './salida-fila';
import { CurrentWorkspace } from '../../core/workspace';
import { lockWhileReadOnly } from '../../core/read-only';

const SECONDS_PER_MINUTE = 60;
/**
 * A sliced file says 2666 s, which is 44.4333… minutes. It is shown with two
 * decimals, and left as it is it goes back as the same 2666 s.
 */
const MINUTE_DECIMALS = 100;
/**
 * A time typed by hand goes in tenths of a minute: 0.1 minutes are 6 seconds,
 * so it is saved to the second as typed. With two decimals, 10.01 minutes
 * (600.6 s) was saved as 601 s and came back as 10.02 (T2-17).
 */
const TYPED_MINUTE_DECIMALS = 1;

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
  decimals: `Tiempo: ${decimalsText(TYPED_MINUTE_DECIMALS)} (0.1 minutos son 6 segundos).`,
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
    <!-- The empty plate that adds one is not shown to someone who only reads (ADR-025). -->
    @if (plate() || canOperate()) {
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
        @if (canOperate()) {
          <div class="bar" style="margin: 0">
            <button type="submit" [disabled]="busy() || (plate() !== null && form.pristine)">
              {{ plate() ? 'Guardar' : 'Agregar' }}
            </button>
            @if (plate() && isOwner()) {
              <button type="button" class="ghost" [disabled]="busy()" (click)="remove()" aria-label="Quitar placa">✕</button>
            }
          </div>
        }
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
            <app-salida-fila [plateId]="current.id" [current]="out" [parts]="parts()" [usedIds]="usedPartIds()" [soleSource]="soleOutputs().has(out.id)" [asked]="asked().has(out.inventoryItemId)" (changed)="changed.emit()" />
          }
          <app-salida-fila [plateId]="current.id" [parts]="parts()" [usedIds]="usedPartIds()" [nextPosition]="current.outputs.length + 1" (changed)="changed.emit()" />
        </div>
      }
    </section>
    }
  `,
})
export class PlacaEditor {
  private readonly data = inject(CatalogoData);

  private readonly workspace = inject(CurrentWorkspace);
  /** The day to day: owner and operator. A viewer is shown what there is, with nothing to change (ADR-025). */
  protected readonly canOperate = this.workspace.canOperate;
  /** Removing is the owner's: the database refuses everyone else (T2-10). */
  protected readonly isOwner = this.workspace.isOwner;

  readonly recipeId = input.required<string>();
  readonly plate = input<RecipePlate | null>(null);
  /** Every plate of the recipe, to tell which parts only this one prints. */
  readonly plates = input<readonly RecipePlate[]>([]);
  /**
   * What the recipe lists per unit. A part this plate prints may be missing on
   * purpose (the plate also prints it for another product), and then losing
   * the plate leaves nothing without a plate.
   */
  readonly askedIds = input<readonly string[]>([]);
  /** Number for a new plate. */
  readonly nextIndex = input(1);
  readonly lookups = input.required<Lookups>();
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /**
   * The saved time as the field was filled: in minutes with two decimals, and
   * the seconds they came from. Null for a new plate.
   */
  private shown: { minutes: number; seconds: number } | null = null;
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
  protected readonly asked = computed<ReadonlySet<string>>(() => new Set(this.askedIds()));
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
      (control: AbstractControl) => this.typedMinutes(control),
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
    lockWhileReadOnly(this.form, this.canOperate);
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
    const current = this.plate();
    const minutes = Number(value.printMinutes);
    const input = {
      label: value.label,
      unitsPerRun: Number(value.unitsPerRun),
      // Untouched, the time goes back to the second it was shown from;
      // typed, it is in tenths of a minute, which are whole seconds.
      printTimeS: this.shown && minutes === this.shown.minutes ? this.shown.seconds : Math.round(minutes * SECONDS_PER_MINUTE),
    };

    this.busy.set(true);
    try {
      if (current) {
        await this.data.updatePlate(current.id, input);
      } else {
        await this.data.addPlate(this.recipeId(), this.nextIndex(), input);
      }
      this.form.markAsPristine();
      this.changed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la placa.'));
      void this.workspace.afterRefusal(error);
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
    const sole = splitByRecipe(partsOnlyThisPlateMakes(current, this.plates()), this.asked());
    const names = (ids: string[]) => ids.map((id) => this.partName(current, id));
    if (!confirm(removePlateQuestion(current, { asked: names(sole.asked), notAsked: names(sole.notAsked) }))) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deletePlate(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos quitar la placa.'));
      void this.workspace.afterRefusal(error);
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

  /**
   * The saved time passes as shown, even with two decimals; anything typed
   * goes in tenths of a minute.
   */
  private typedMinutes(control: AbstractControl): ValidationErrors | null {
    if (this.shown && Number(control.value) === this.shown.minutes) return null;
    return maxDecimals(TYPED_MINUTE_DECIMALS)(control);
  }

  private fill(plate: RecipePlate | null): void {
    this.shown = plate
      ? {
          minutes: Math.round((plate.printTimeS / SECONDS_PER_MINUTE) * MINUTE_DECIMALS) / MINUTE_DECIMALS,
          seconds: plate.printTimeS,
        }
      : null;
    this.form.reset({
      label: plate?.label ?? '',
      unitsPerRun: plate?.unitsPerRun ?? null,
      printMinutes: this.shown?.minutes ?? null,
    });
  }
}
