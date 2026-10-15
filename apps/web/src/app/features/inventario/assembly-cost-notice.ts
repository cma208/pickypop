import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Thumb } from '../../ui';
import type { UncostedComponent } from './assembly';

/**
 * Before assembling: which bought components would leave the shelf at zero.
 * It warns and does not block (the owner's decision), so it sits next to the
 * button and never disables it. Each name comes with its photo, the only
 * reliable way to tell «la bolsa chica» from the other bolsa chica.
 */
@Component({
  selector: 'app-assembly-cost-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Thumb],
  styles: `
    :host { display: block; }
    .alert-warn { display: grid; gap: 0.4rem; margin: 0 0 0.9rem; }
    p { margin: 0; display: flex; align-items: center; gap: 0.5rem; }
    a { color: inherit; font-weight: 600; }
  `,
  template: `
    @if (missing().length > 0 || problem()) {
      <div class="alert-warn" role="status">
        @for (row of missing(); track row.component.inventoryItemId) {
          <p>
            <pp-thumb size="inline" [kind]="row.component.kind" [path]="row.component.imagePath" />
            <span>
              <strong>{{ row.component.name }}</strong> no tiene costo: el producto entraría al estante sin su
              valor. Ponle costo en <a [routerLink]="row.page.route">{{ row.page.label }}</a>.
            </span>
          </p>
        }
        @if (problem(); as text) {
          <p>{{ text }}</p>
        }
      </div>
    }
  `,
})
export class AssemblyCostNotice {
  readonly missing = input.required<readonly UncostedComponent[]>();
  /** The costs could not be read: said, because silence would read as «all have a cost». */
  readonly problem = input<string | null>(null);
}
