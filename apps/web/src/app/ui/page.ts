import { Component, input } from '@angular/core';

/**
 * Standard page frame: title, optional subtitle, a slot for actions.
 *
 * A record (an order, a quote) leaves the title out and starts with
 * `pp-resource-header` instead, which knows how to say what the record is
 * and what it asks for next.
 */
@Component({
  selector: 'pp-page',
  template: `
    @if (title(); as heading) {
      <header class="head">
        <div>
          <h1>{{ heading }}</h1>
          @if (subtitle(); as text) {
            <p class="muted">{{ text }}</p>
          }
        </div>
        <div class="actions"><ng-content select="[actions]" /></div>
      </header>
    }
    <ng-content />
  `,
  styles: `
    :host { display: block; max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 5rem; }
    .head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; }
    .head > div:first-child { flex: 1; }
    h1 { margin: 0 0 0.2rem; font-size: var(--fs-xl); font-weight: 650; letter-spacing: -0.02em; }
    p { margin: 0; font-size: var(--fs-sm); max-width: 46rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    @media (max-width: 40rem) { .head { flex-wrap: wrap; } .actions { justify-content: flex-start; } }
  `,
})
export class Page {
  /** Left out by a record page, which brings its own header. */
  readonly title = input<string>();
  readonly subtitle = input<string>();
}
