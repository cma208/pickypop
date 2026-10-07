import { Component, input } from '@angular/core';
import { FormArray, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Thumb } from '../../ui';
import type { PlatePart } from './produccion.outputs';

/** How many of one part came out: none to all the plate makes, already full. */
export function createOutputControl(planned: number) {
  return new FormControl<number | null>(planned, [Validators.required, Validators.min(0), Validators.max(planned)]);
}

export type OutputControls = FormArray<ReturnType<typeof createOutputControl>>;

/**
 * "¿Cuántas salieron?", part by part, each with its photo and "de N".
 *
 * On a plate of seven caps and seven bodies one number cannot say that a body
 * came loose. A plate of one part shows a single row, as simple as before.
 */
@Component({
  selector: 'app-print-job-outputs',
  imports: [ReactiveFormsModule, Thumb],
  template: `
    <fieldset>
      <legend>{{ parts().length > 1 ? 'Piezas que salieron, una por una' : 'Piezas que salieron' }}</legend>
      @for (control of controls().controls; track $index; let i = $index) {
        <div class="part">
          <pp-thumb [path]="parts()[i]!.imagePath" [name]="parts()[i]!.name" />
          <label class="name" [for]="idPrefix() + i">{{ parts()[i]!.name }}</label>
          <span class="count">
            <input type="number" inputmode="numeric" min="0" step="1" [max]="parts()[i]!.unitsPerRun"
              [id]="idPrefix() + i" [formControl]="control" />
            <span class="muted">de {{ parts()[i]!.unitsPerRun }}</span>
          </span>
        </div>
        @if (control.invalid && (control.touched || submitted())) {
          <p class="error">Escribe cuántas salieron, de 0 a {{ parts()[i]!.unitsPerRun }}.</p>
        }
      }
    </fieldset>
  `,
  styles: `
    fieldset { border: 1px solid var(--line); border-radius: var(--radius); padding: 0.8rem; margin: 0 0 1rem; }
    legend { font-size: 0.85rem; font-weight: 500; padding: 0 0.4rem; }
    .part { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.6rem; align-items: center; padding: 0.3rem 0; }
    .part + .part { border-top: 1px solid var(--line); }
    .name { font-weight: 500; overflow-wrap: anywhere; }
    .count { display: flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
    .count input { width: 5rem; }
    .error { font-size: 0.8rem; margin: 0 0 0.4rem; }
  `,
})
export class PrintJobOutputs {
  readonly parts = input.required<readonly PlatePart[]>();
  readonly controls = input.required<OutputControls>();
  readonly submitted = input(false);
  /** Unique per job, so two open close forms do not share label targets. */
  readonly idPrefix = input('out-');
}
