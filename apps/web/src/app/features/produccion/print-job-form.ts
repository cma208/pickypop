import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, FORMAT_PIPES, ItemPicker, Thumb, type PickerOption } from '../../ui';
import { duration } from '../../core/format';
import { PlanService } from '../../core/plan';
import { explainError } from '../pedidos/pedidos.errors';
import { ProduccionData, type OrderLineOption, type PlateOption, type SpoolOption } from './produccion.data';
import type { PrinterSummary } from '../../core/workshop';
import { describeCounts } from './produccion.outputs';
import { rowsForPlate, suggestSpool } from './produccion.spools';

const SECONDS_PER_MINUTE = 60;

export interface FixedOrderLine {
  id: string;
  label: string;
  variantId: string | null;
}

function createFilamentRow(spoolId = '', estimatedG = 0, slot: number | null = null) {
  return new FormGroup({
    spoolId: new FormControl(spoolId, { nonNullable: true, validators: [Validators.required] }),
    estimatedG: new FormControl(estimatedG, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    slot: new FormControl<number | null>(slot),
  });
}

/**
 * Creates a print job: tied to an order line or loose (tests, stock), with the
 * printer, the recipe plate and the rolls it will use.
 */
@Component({
  selector: 'app-print-job-form',
  imports: [ReactiveFormsModule, Card, Field, ItemPicker, Thumb, ...FORMAT_PIPES],
  template: `
    <pp-card heading="Nuevo trabajo de impresión">
      @if (loading()) {
        <p class="muted">Cargando impresoras, placas y rollos…</p>
      } @else if (loadError(); as message) {
        <p class="error">{{ message }}</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          @if (fixedLine(); as line) {
            <p class="fixed"><span class="muted">Línea del pedido</span><br /><strong>{{ line.label }}</strong></p>
          } @else {
            <pp-field label="Línea de pedido" hint="Déjalo vacío para una prueba o una impresión para stock.">
              <select formControlName="orderLineId">
                <option value="">Sin pedido (prueba o stock)</option>
                @for (line of lines(); track line.id) {
                  <option [value]="line.id">{{ line.label }}</option>
                }
              </select>
            </pp-field>
          }

          @if (!hasLine()) {
            <pp-field label="Qué se imprime" [required]="true" [error]="labelError()">
              <input type="text" formControlName="label" placeholder="Ej.: prueba de soporte, stock de tapas" autocomplete="off" />
            </pp-field>
          }

          <div class="grid two">
            <pp-field label="Impresora" [required]="true" [error]="fieldError('printerId', 'Elige la impresora.')">
              <select formControlName="printerId">
                <option value="">Elige una impresora…</option>
                @for (printer of printers(); track printer.id) {
                  <option [value]="printer.id">{{ printer.name }}</option>
                }
              </select>
            </pp-field>

            <pp-field label="Placa de la receta" [hint]="plateHint()">
              <span class="plate-pick">
                <pp-item-picker placeholder="Sin placa (a mano)" [options]="plateOptions()" [value]="selectedPlate()" (chosen)="choosePlate($event)" />
                @if (selectedPlate()) {
                  <button type="button" class="ghost" (click)="choosePlate('')" aria-label="Imprimir sin placa de receta">✕</button>
                }
              </span>
            </pp-field>
          </div>

          @if (chosenPlate(); as plate) {
            <div class="plate-preview">
              <pp-thumb size="bed" kind="plate" [path]="plate.thumbnailPath" [name]="plate.label" />
              <div class="plate-text">
                <strong>{{ plate.label }}</strong>
                <span class="muted">{{ plate.variantLabel }} · {{ plate.printTimeS | duration }} por corrida</span>
                @if (plate.outputs.length > 0) {
                  <span class="muted">Una corrida completa deja en el estante:</span>
                  <ul>
                    @for (part of plate.outputs; track part.inventoryItemId) {
                      <li><pp-thumb size="option" kind="part" [path]="part.imagePath" /> {{ part.units }} {{ part.name }}</li>
                    }
                  </ul>
                } @else {
                  <span class="muted">Esta placa no tiene piezas definidas: al cerrarla no entra nada al estante.</span>
                }
              </div>
            </div>
          }

          <pp-field label="Tiempo estimado (minutos)" hint="Se llena con el de la placa; puedes ajustarlo." [error]="fieldError('estimatedMinutes', 'Escribe minutos enteros mayores que cero.')">
            <input type="number" inputmode="numeric" min="1" step="1" formControlName="estimatedMinutes" />
          </pp-field>

          <fieldset>
            <legend>Rollos que va a consumir</legend>
            @for (row of filaments.controls; track row; let i = $index) {
              <div class="spool" [formGroup]="row">
                <pp-field [label]="'Rollo ' + (i + 1)" [required]="true" [error]="spoolError(i)">
                  <select formControlName="spoolId">
                    <option value="">Elige un rollo…</option>
                    @for (spool of spools(); track spool.id) {
                      <option [value]="spool.id">{{ spool.code }} · {{ spool.colorName }} · {{ spool.onHandG | grams }}</option>
                    }
                  </select>
                </pp-field>
                <pp-field label="Gramos estimados" [error]="fieldErrorOn(row, 'estimatedG', 'Los gramos no pueden ser negativos.')">
                  <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="estimatedG" />
                </pp-field>
                <button type="button" class="ghost" (click)="removeFilament(i)" [attr.aria-label]="'Quitar el rollo ' + (i + 1)">Quitar</button>
              </div>
              @if (shortage(i); as text) { <p class="warn-text">{{ text }}</p> }
            }
            @if (filaments.length === 0) {
              <p class="muted">Agrega al menos un rollo: sin él no se puede descontar el stock al cerrar.</p>
            }
            <button type="button" class="secondary" (click)="addFilament()">+ Agregar rollo</button>
            @if (duplicateSpool()) { <p class="error">Repetiste un rollo. Usa una sola fila por rollo.</p> }
          </fieldset>

          <pp-field label="Nota" hint="Opcional">
            <input type="text" formControlName="note" autocomplete="off" />
          </pp-field>

          @if (saveError(); as message) { <p class="error" role="alert">{{ message }}</p> }
          <div class="row">
            <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Crear trabajo' }}</button>
            <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
          </div>
        </form>
      }
    </pp-card>
  `,
  styles: `
    fieldset { border: 1px solid var(--line); border-radius: var(--radius); padding: 0.9rem; margin: 0 0 1rem; }
    legend { font-size: 0.85rem; font-weight: 500; padding: 0 0.4rem; }
    .spool { display: grid; grid-template-columns: 1fr 8rem auto; gap: 0.5rem; align-items: start; }
    .spool button { margin-top: 1.55rem; }
    .fixed { margin: 0 0 1rem; }
    .plate-pick { display: flex; gap: 0.35rem; align-items: center; }
    .plate-pick pp-item-picker { flex: 1; min-width: 0; }
    .plate-preview { display: flex; gap: 0.9rem; align-items: flex-start; margin: -0.25rem 0 1rem; padding: 0.75rem; border: 1px solid var(--line); border-radius: var(--radius); }
    .plate-text { display: grid; gap: 0.25rem; font-size: 0.85rem; min-width: 0; }
    .plate-text ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
    .plate-text li { display: flex; align-items: center; gap: 0.4rem; }
    .warn-text { margin: -0.5rem 0 0.75rem; font-size: 0.8rem; color: var(--warn); }
    @media (max-width: 30rem) { .spool { grid-template-columns: 1fr; } .spool button { margin-top: 0; justify-self: start; } }
  `,
})
export class PrintJobForm implements OnInit {
  private readonly data = inject(ProduccionData);
  private readonly plan = inject(PlanService);

  /** When set, the job is for this order line and the line cannot be changed. */
  readonly fixedLine = input<FixedOrderLine | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    orderLineId: new FormControl('', { nonNullable: true }),
    label: new FormControl('', { nonNullable: true }),
    printerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    plateId: new FormControl('', { nonNullable: true }),
    estimatedMinutes: new FormControl<number | null>(null, [Validators.min(1), Validators.pattern(/^\d+$/)]),
    note: new FormControl('', { nonNullable: true }),
    filaments: new FormArray([createFilamentRow()]),
  });

  protected readonly printers = signal<PrinterSummary[]>([]);
  protected readonly plates = signal<PlateOption[]>([]);
  protected readonly spools = signal<SpoolOption[]>([]);
  protected readonly lines = signal<OrderLineOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly submitted = signal(false);

  private readonly selectedLine = signal('');
  protected readonly selectedPlate = signal('');

  protected readonly hasLine = computed(() => this.fixedLine() !== null || this.selectedLine() !== '');

  protected readonly availablePlates = computed(() => {
    const variantId = this.fixedLine()?.variantId ?? this.lines().find((l) => l.id === this.selectedLine())?.variantId;
    const all = this.plates();
    return variantId ? all.filter((plate) => plate.variantId === variantId) : all;
  });

  protected readonly chosenPlate = computed(() => this.plates().find((p) => p.id === this.selectedPlate()) ?? null);

  /** With its picture: "la placa de las tapas" is recognised, not read. */
  protected readonly plateOptions = computed<PickerOption[]>(() =>
    this.availablePlates().map((plate) => ({
      value: plate.id,
      label: plate.label,
      hint: [plate.outputs.length > 0 ? describeCounts(plate.outputs) : null, duration(plate.printTimeS)]
        .filter(Boolean)
        .join(' · '),
      group: plate.variantLabel,
      imagePath: plate.thumbnailPath,
    })),
  );

  protected readonly plateHint = computed(() =>
    this.chosenPlate() ? undefined : 'Opcional. Al elegirla se llenan el tiempo y los rollos sugeridos.',
  );

  constructor() {
    this.form.controls.orderLineId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selectedLine.set(id);
      this.dropPlateIfNotAvailable();
    });
    this.form.controls.plateId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selectedPlate.set(id);
      this.applyPlate(id);
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected get filaments(): FormArray<ReturnType<typeof createFilamentRow>> {
    return this.form.controls.filaments;
  }

  protected choosePlate(id: string): void {
    this.form.controls.plateId.setValue(id);
    this.form.controls.plateId.markAsDirty();
  }

  protected addFilament(): void {
    this.filaments.push(createFilamentRow());
  }

  protected removeFilament(index: number): void {
    this.filaments.removeAt(index);
  }

  protected labelError(): string | null {
    const empty = this.form.controls.label.value.trim() === '';
    return empty && this.submitted() ? 'Describe qué se imprime: no hay pedido que lo explique.' : null;
  }

  protected fieldError(name: 'printerId' | 'estimatedMinutes', message: string): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted()) ? message : null;
  }

  protected fieldErrorOn(row: ReturnType<typeof createFilamentRow>, name: 'estimatedG', message: string): string | null {
    const control = row.controls[name];
    return control.invalid && (control.touched || this.submitted()) ? message : null;
  }

  protected spoolError(index: number): string | null {
    const control = this.filaments.at(index).controls.spoolId;
    return control.invalid && (control.touched || this.submitted()) ? 'Elige el rollo.' : null;
  }

  protected duplicateSpool(): boolean {
    const ids = this.filaments.getRawValue().map((row) => row.spoolId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }

  /** A soft warning: the roll holds less than the job expects to use. */
  protected shortage(index: number): string | null {
    const { spoolId, estimatedG } = this.filaments.at(index).getRawValue();
    const spool = this.spools().find((s) => s.id === spoolId);
    if (!spool || estimatedG <= spool.onHandG) return null;
    return `El rollo ${spool.code} tiene ${spool.onHandG} g y este trabajo espera usar ${estimatedG} g.`;
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.saveError.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.duplicateSpool() || this.filaments.length === 0 || (!this.hasLine() && !this.form.controls.label.value.trim())) {
      this.saveError.set('Revisa los campos marcados antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    const lineId = this.fixedLine()?.id ?? (value.orderLineId || null);
    this.saving.set(true);
    try {
      await this.data.createJob({
        printerId: value.printerId,
        orderLineId: lineId,
        plateId: value.plateId || null,
        label: value.label.trim() || null,
        estimatedTimeS: value.estimatedMinutes ? value.estimatedMinutes * SECONDS_PER_MINUTE : null,
        note: value.note.trim() || null,
        filaments: value.filaments.map((row) => ({
          spoolId: row.spoolId,
          slot: row.slot,
          estimatedG: row.estimatedG,
        })),
      });
      this.plan.invalidate();
      this.saved.emit();
    } catch (error) {
      this.saveError.set(explainError(error, 'No pudimos crear el trabajo. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  private dropPlateIfNotAvailable(): void {
    const chosen = this.form.controls.plateId.value;
    if (chosen && !this.availablePlates().some((plate) => plate.id === chosen)) {
      this.form.controls.plateId.setValue('');
    }
  }

  /** Fills the time and the suggested rolls from the recipe plate. */
  private applyPlate(plateId: string): void {
    const plate = this.plates().find((p) => p.id === plateId);
    if (!plate) return;

    this.form.controls.estimatedMinutes.setValue(Math.max(1, Math.round(plate.printTimeS / SECONDS_PER_MINUTE)));
    this.filaments.clear();
    // The same proposal as «Iniciar»: the roll on the printer before a sealed kilo.
    const taken = new Set<string>();
    for (const filament of rowsForPlate(plate.filaments)) {
      const spoolId = suggestSpool(this.spools(), filament.skuId, filament.grams, taken);
      if (spoolId) taken.add(spoolId);
      this.filaments.push(createFilamentRow(spoolId, filament.grams, filament.slot));
    }
    if (plate.filaments.length === 0) this.addFilament();
  }

  private async load(): Promise<void> {
    try {
      const [printers, plates, spools, lines] = await Promise.all([
        this.data.printers(),
        this.data.plates(),
        this.data.spools(),
        this.fixedLine() ? Promise.resolve([]) : this.data.openOrderLines(),
      ]);
      this.printers.set(printers);
      this.plates.set(plates);
      this.spools.set(spools);
      this.lines.set(lines);
      if (printers.length === 1) this.form.controls.printerId.setValue(printers[0]!.id);
    } catch (error) {
      this.loadError.set(explainError(error, 'No pudimos cargar los datos del taller. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
