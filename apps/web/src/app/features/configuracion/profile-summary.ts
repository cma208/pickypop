import { Component, computed, input } from '@angular/core';
import type { CostProfileRecord } from './configuracion.models';
import { describeProfile } from './cost-profile-lines';

/** Every value of a cost profile with a one-line explanation under each. */
@Component({
  selector: 'app-profile-summary',
  styles: `
    dl { display: grid; gap: 0.6rem; margin: 0; }
    .line { display: grid; grid-template-columns: minmax(9rem, 12rem) 1fr; gap: 0.1rem 1rem; }
    dt { font-weight: 600; }
    dd { margin: 0; }
    dd small { display: block; color: var(--muted); font-size: 0.8rem; }
    @media (max-width: 30rem) { .line { grid-template-columns: 1fr; } }
  `,
  template: `
    <dl>
      @for (line of lines(); track line.label) {
        <div class="line">
          <dt>{{ line.label }}</dt>
          <dd>
            {{ line.value }}
            <small>{{ line.explanation }}</small>
          </dd>
        </div>
      }
    </dl>
  `,
})
export class ProfileSummary {
  readonly profile = input.required<CostProfileRecord>();
  protected readonly lines = computed(() => describeProfile(this.profile()));
}
