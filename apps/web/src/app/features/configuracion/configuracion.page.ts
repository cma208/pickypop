import { Component, signal } from '@angular/core';
import { Page } from '../../ui';
import { ChannelsSection } from './channels-section';
import { CostProfileSection } from './cost-profile-section';
import { GiftCategoriesSection } from './gift-categories-section';
import { MembersSection } from './members-section';
import { WorkshopSection } from './workshop-section';

type TabId = 'costs' | 'workshop' | 'members' | 'sales';

const TABS: { id: TabId; label: string }[] = [
  { id: 'costs', label: 'Parámetros de costo' },
  { id: 'workshop', label: 'Taller' },
  { id: 'members', label: 'Miembros' },
  { id: 'sales', label: 'Ventas y regalos' },
];

@Component({
  selector: 'app-configuracion.page',
  imports: [Page, CostProfileSection, WorkshopSection, MembersSection, ChannelsSection, GiftCategoriesSection],
  styles: `
    .tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 1.25rem; border-bottom: 1px solid var(--line); }
    .tabs button { border-radius: 8px 8px 0 0; }
    .tabs button[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
    .stack { display: grid; gap: 1rem; }
  `,
  template: `
    <pp-page title="Configuración" subtitle="Parámetros de costo, datos del taller, miembros, canales y regalos">
      <div class="tabs" role="tablist" aria-label="Secciones de configuración">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            class="ghost"
            role="tab"
            [attr.aria-selected]="active() === tab.id"
            (click)="active.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      @switch (active()) {
        @case ('costs') { <app-cost-profile-section /> }
        @case ('workshop') { <app-workshop-section /> }
        @case ('members') { <app-members-section /> }
        @case ('sales') {
          <div class="stack">
            <app-channels-section />
            <app-gift-categories-section />
          </div>
        }
      }
    </pp-page>
  `,
})
export class ConfiguracionPage {
  protected readonly tabs = TABS;
  protected readonly active = signal<TabId>('costs');
}
