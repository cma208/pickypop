import { Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { pairGroup, type PairGroup } from './catalogo.util';

/** Edits a list of name/value pairs: add a row, remove a row, no JSON in sight. */
@Component({
  selector: 'app-pairs-editor',
  imports: [ReactiveFormsModule],
  template: `
    @for (group of array().controls; track group; let i = $index) {
      <div class="pair" [formGroup]="group">
        <input
          formControlName="name"
          [placeholder]="namePlaceholder()"
          [attr.aria-label]="nameLabel() + ' ' + (i + 1)"
        />
        <input
          formControlName="value"
          [placeholder]="valuePlaceholder()"
          [attr.aria-label]="valueLabel() + ' ' + (i + 1)"
        />
        @if (!readOnly()) {
          <button
            type="button"
            class="ghost"
            (click)="remove(i)"
            [attr.aria-label]="'Quitar ' + nameLabel().toLowerCase() + ' ' + (i + 1)"
          >
            ✕
          </button>
        }
      </div>
    } @empty {
      <p class="muted empty">{{ emptyText() }}</p>
    }
    @if (array().hasError('duplicateNames')) {
      <p class="error">Hay nombres repetidos. Cada uno debe aparecer una sola vez.</p>
    }
    @if (!readOnly()) {
      <button type="button" class="secondary" (click)="add()">{{ addLabel() }}</button>
    }
  `,
  styles: `
    :host { display: block; }
    .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 0.5rem; margin-bottom: 0.5rem; }
    .empty { margin: 0 0 0.6rem; font-size: 0.85rem; }
    .error { margin: 0 0 0.6rem; font-size: 0.8rem; }
  `,
})
export class PairsEditor {
  readonly array = input.required<FormArray<PairGroup>>();
  readonly nameLabel = input('Nombre');
  readonly valueLabel = input('Valor');
  readonly namePlaceholder = input('Nombre');
  readonly valuePlaceholder = input('Valor');
  readonly addLabel = input('Agregar');
  readonly emptyText = input('Todavía no hay nada.');
  /** Only the pairs, for someone who may not change them (ADR-025). */
  readonly readOnly = input(false);

  protected add(): void {
    this.array().push(pairGroup());
    this.array().markAsDirty();
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }
}
