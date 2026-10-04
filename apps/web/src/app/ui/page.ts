import { Component, input } from '@angular/core';

/** Standard page frame: title, optional subtitle, a slot for actions. */
@Component({
  selector: 'pp-page',
  template: `
    <header class="head">
      <div>
        <h1>{{ title() }}</h1>
        @if (subtitle(); as text) {
          <p class="muted">{{ text }}</p>
        }
      </div>
      <div class="actions"><ng-content select="[actions]" /></div>
    </header>
    <ng-content />
  `,
  styles: `
    :host { display: block; max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
    .head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; }
    .head > div:first-child { flex: 1; }
    h1 { margin: 0 0 0.25rem; font-size: 1.4rem; }
    p { margin: 0; font-size: 0.9rem; }
    .actions { display: flex; gap: 0.5rem; }
  `,
})
export class Page {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
