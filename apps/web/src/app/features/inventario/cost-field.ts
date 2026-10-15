import { Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { switchMap } from 'rxjs';
import { Field } from '../../ui';
import { costLabel, costMessage } from './item-cost';

/**
 * «Costo por {unidad} (S/)»: what one unit of a bought article is worth, as
 * the article form and the movement dialog ask for it. One field, so both
 * name it and word its errors the same way. The validators are the control's
 * own (`COST_VALIDATORS`), set where the form is built.
 */
@Component({
  selector: 'app-cost-field',
  imports: [ReactiveFormsModule, Field],
  // The field belongs to the form around it: in a grid, it is the grid's item.
  host: { style: 'display: contents' },
  template: `
    <pp-field [label]="label()" [required]="required()" [hint]="hint()" [error]="error()">
      <input type="number" step="any" min="0" inputmode="decimal" [formControl]="control()" />
    </pp-field>
  `,
})
export class CostField {
  readonly control = input.required<FormControl<number | null>>();
  /** What the article is counted in: «Costo por m (S/)». */
  readonly unit = input.required<string>();
  readonly hint = input<string>();
  readonly required = input(false);

  /**
   * Every change of the control, its touch included: the form's submit marks
   * it touched from outside this component, and the error has to show then
   * too, not only once something is typed here.
   */
  private readonly changes = toSignal(toObservable(this.control).pipe(switchMap((control) => control.events)));

  protected readonly label = computed(() => costLabel(this.unit()));
  protected readonly error = computed(() => {
    this.changes();
    return costMessage(this.control(), this.unit(), this.required());
  });
}
