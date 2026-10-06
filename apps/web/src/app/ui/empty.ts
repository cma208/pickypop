import { Component, input } from '@angular/core';

@Component({
  selector: 'pp-empty',
  template: `
    <p>{{ message() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
      padding: 2rem 1rem;
      border: 1px dashed var(--line);
      border-radius: var(--radius);
      text-align: center;
      color: var(--muted);
    }
    p { margin: 0 0 0.75rem; }
  `,
})
export class Empty {
  readonly message = input.required<string>();
}
