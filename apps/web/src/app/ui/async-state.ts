import { Component, input } from '@angular/core';

/**
 * Wraps a section that loads data: shows a spinner, an error, or the content.
 * Keeps every screen honest about the three states instead of flashing empty.
 */
@Component({
  selector: 'pp-async',
  template: `
    @if (loading()) {
      <p class="state muted">Cargando…</p>
    } @else if (error(); as message) {
      <p class="state error">{{ message }}</p>
    } @else {
      <ng-content />
    }
  `,
  styles: `
    .state { padding: 1.5rem 0; text-align: center; }
    .error { color: var(--danger); }
  `,
})
export class AsyncState {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
}
