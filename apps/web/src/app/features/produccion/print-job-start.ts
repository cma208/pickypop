import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, FORMAT_PIPES } from '../../ui';
import { explainError } from '../pedidos/pedidos.errors';
import { ProduccionData, type JobItem, type SpoolOption } from './produccion.data';
import { rowsForPlate, suggestSpool, type SpoolStatus } from './produccion.spools';

const STATUS_LABEL: Record<SpoolStatus, string> = { in_use: 'en uso', open: 'abierto', sealed: 'sellado' };

function createRollRow(spoolId = '', estimatedG = 0, slot: number | null = null) {
  return new FormGroup({
    spoolId: new FormControl(spoolId, { nonNullable: true, validators: [Validators.required] }),
    estimatedG: new FormControl(estimatedG, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    slot: new FormControl<number | null>(slot),
  });
}

/**
 * «Iniciar» for a job queued from «Por lanzar», which has no rolls yet: the
 * rolls are confirmed now, when it is clear which ones are on the printer
 * (decision of the owner). Without them the close would discount no filament.
 */
@Component({
  selector: 'app-print-job-start',
  imports: [ReactiveFormsModule, Field, ...FORMAT_PIPES],
  template: `
    @if (loading()) {
      <p class="muted">Buscando los rollos…</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="start()" novalidate>
        <p class="lead">Confirma los rollos que va a usar. Se proponen el que está en la impresora, luego uno abierto y al final uno sellado.</p>
        @for (row of rows.controls; track row; let i = $index) {
          <div class="roll" [formGroup]="row">
            <pp-field [label]="'Rollo ' + (i + 1)" [required]="true" [error]="spoolError(i)">
              <select formControlName="spoolId">
                <option value="">Elige un rollo…</option>
                @for (spool of spools(); track spool.id) {
                  <option [value]="spool.id">{{ spool.code }} · {{ spool.colorName }} · {{ spool.onHandG | grams }} · {{ statusLabel[spool.status] }}</option>
                }
              </select>
            </pp-field>
            <pp-field label="Gramos estimados">
              <input type="number" inputmode="decimal" min="0" step="0.01" formControlName="estimatedG" />
            </pp-field>
            <button type="button" class="ghost" (click)="rows.removeAt(i)" [attr.aria-label]="'Quitar el rollo ' + (i + 1)">Quitar</button>
          </div>
          @if (shortage(i); as text) { <p class="warn-text">{{ text }}</p> }
        }
        <button type="button" class="secondary" (click)="rows.push(newRow())">+ Agregar rollo</button>
        @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
        <div class="row actions">
          <button type="submit" [disabled]="busy()">{{ busy() ? 'Iniciando…' : 'Iniciar con estos rollos' }}</button>
          <button type="button" class="secondary" (click)="cancelled.emit()" [disabled]="busy()">Cancelar</button>
        </div>
      </form>
    }
  `,
  styles: `
    :host { display: block; margin-top: 0.6rem; padding-top: 0.75rem; border-top: 1px solid var(--line); }
    .lead { margin: 0 0 0.75rem; font-size: var(--fs-sm); }
    .roll { display: grid; grid-template-columns: 1fr 8rem auto; gap: 0.5rem; align-items: start; }
    .roll button { margin-top: 1.55rem; }
    .warn-text { margin: -0.5rem 0 0.75rem; font-size: var(--fs-xs); color: var(--warn); }
    .actions { margin-top: 0.75rem; }
    @media (max-width: 30rem) { .roll { grid-template-columns: 1fr; } .roll button { margin-top: 0; justify-self: start; } }
  `,
})
export class PrintJobStart implements OnInit {
  private readonly data = inject(ProduccionData);

  readonly job = input.required<JobItem>();
  readonly started = output<void>();
  readonly cancelled = output<void>();

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly rows = new FormArray<ReturnType<typeof createRollRow>>([]);
  protected readonly form = new FormGroup({ rolls: this.rows });
  protected readonly spools = signal<SpoolOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  protected newRow() {
    return createRollRow();
  }

  protected spoolError(index: number): string | null {
    const control = this.rows.at(index).controls.spoolId;
    return control.invalid && (control.touched || this.submitted()) ? 'Elige el rollo.' : null;
  }

  /** A warning, never a block: the scale knows better than the estimate. */
  protected shortage(index: number): string | null {
    const { spoolId, estimatedG } = this.rows.at(index).getRawValue();
    const spool = this.spools().find((candidate) => candidate.id === spoolId);
    if (!spool || estimatedG <= spool.onHandG) return null;
    return `El rollo ${spool.code} tiene ${spool.onHandG} g y esta corrida espera usar ${estimatedG} g.`;
  }

  protected async start(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();
    const rolls = this.rows.getRawValue();
    if (rolls.length === 0) {
      this.error.set('Agrega al menos un rollo: sin él, al cerrar no se descuenta el filamento.');
      return;
    }
    if (new Set(rolls.map((roll) => roll.spoolId)).size !== rolls.length) {
      this.error.set('Repetiste un rollo. Usa una sola fila por rollo.');
      return;
    }
    if (this.form.invalid) return;

    this.busy.set(true);
    try {
      await this.data.startWithRolls(this.job().id, rolls);
      this.started.emit();
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos iniciar la impresión. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Proposes one roll per filament of the plate; a job without a plate starts with one empty row. */
  private async load(): Promise<void> {
    try {
      const plateId = this.job().plateId;
      const [spools, uses] = await Promise.all([
        this.data.spools(),
        plateId ? this.data.plateFilaments(plateId) : Promise.resolve([]),
      ]);
      this.spools.set(spools);
      const taken = new Set<string>();
      for (const use of rowsForPlate(uses)) {
        const spoolId = suggestSpool(spools, use.skuId, use.grams, taken);
        if (spoolId) taken.add(spoolId);
        this.rows.push(createRollRow(spoolId, use.grams, use.slot));
      }
      if (this.rows.length === 0) this.rows.push(createRollRow());
    } catch (error) {
      this.error.set(explainError(error, 'No pudimos leer los rollos. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
