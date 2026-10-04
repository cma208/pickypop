import { Component, input } from '@angular/core';

@Component({
  selector: 'pp-card',
  template: `
    @if (heading(); as text) {
      <header>
        <h2>{{ text }}</h2>
        <ng-content select="[card-actions]" />
      </header>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
      padding: 1.25rem;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
    }
    header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    h2 { flex: 1; margin: 0; font-size: 1rem; }
  `,
})
export class Card {
  readonly heading = input<string>();
}
