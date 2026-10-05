import { Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

@Component({
  selector: 'pp-badge',
  template: `<span [class]="tone()"><ng-content /></span>`,
  styles: `
    span {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .neutral { background: var(--line); color: var(--muted); }
    .good { background: var(--good-soft); color: var(--good); }
    .warn { background: var(--warn-soft); color: var(--warn); }
    .bad { background: var(--danger-soft); color: var(--danger); }
    .info { background: var(--accent-soft); color: var(--accent); }
  `,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
}
