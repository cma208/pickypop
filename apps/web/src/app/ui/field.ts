import { booleanAttribute, Component, input } from '@angular/core';

/** Label + control + hint, so forms look the same everywhere. */
@Component({
  selector: 'pp-field',
  template: `
    <label>
      <span class="label">
        {{ label() }}
        @if (required()) { <span class="req" aria-hidden="true">*</span> }
      </span>
      <ng-content />
      @if (hint(); as text) { <small class="muted">{{ text }}</small> }
      @if (error(); as text) { <small class="error">{{ text }}</small> }
    </label>
  `,
  styles: `
    label { display: grid; gap: 0.3rem; margin-bottom: 0.9rem; }
    .label { font-size: var(--fs-sm); font-weight: 500; }
    .req { color: var(--danger); }
    small { font-size: var(--fs-xs); }
    .error { color: var(--danger); }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>(null);
  /** Accepts the bare attribute too: <pp-field required>. */
  readonly required = input(false, { transform: booleanAttribute });
}
