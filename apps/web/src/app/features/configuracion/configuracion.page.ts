import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Page } from '../../ui';
import { AppearanceSection } from './appearance-section';
import { BrandsSection } from './brands-section';
import { ChannelsSection } from './channels-section';
import { CostProfileSection } from './cost-profile-section';
import { GiftCategoriesSection } from './gift-categories-section';
import { CategoriesSection } from './categories-section';
import { PaymentCategoriesSection } from './payment-categories-section';
import { FinishesSection } from './finishes-section';
import { MaterialsSection } from './materials-section';
import { ScheduleSection } from './schedule-section';
import { MembersSection } from './members-section';
import { WorkshopSection } from './workshop-section';

type TabId = 'costs' | 'workshop' | 'members' | 'sales' | 'brands' | 'materials' | 'finishes' | 'categories' | 'appearance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'costs', label: 'Parámetros de costo' },
  { id: 'workshop', label: 'Taller' },
  { id: 'members', label: 'Miembros' },
  { id: 'sales', label: 'Ventas y regalos' },
  { id: 'brands', label: 'Marcas' },
  { id: 'materials', label: 'Materiales' },
  { id: 'finishes', label: 'Acabados' },
  { id: 'categories', label: 'Categorías de dinero' },
  { id: 'appearance', label: 'Apariencia' },
];

@Component({
  selector: 'app-configuracion.page',
  imports: [
    Page, CostProfileSection, WorkshopSection, MembersSection, ChannelsSection,
    GiftCategoriesSection, BrandsSection, MaterialsSection, FinishesSection, CategoriesSection, AppearanceSection,
    ScheduleSection, PaymentCategoriesSection,
  ],
  styles: `
    .tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 1.25rem; border-bottom: 1px solid var(--line); }
    .tabs button { border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
    .tabs button[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
    .stack { display: grid; gap: 1rem; }
  `,
  template: `
    <pp-page title="Configuración" subtitle="Parámetros de costo, datos del taller, miembros, canales, regalos, marcas, materiales, acabados y apariencia">
      <div class="tabs" role="tablist" aria-label="Secciones de configuración">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            class="ghost"
            role="tab"
            [attr.aria-selected]="active() === tab.id"
            (click)="choose(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      @switch (active()) {
        @case ('costs') { <app-cost-profile-section /> }
        @case ('workshop') {
          <app-workshop-section />
          <app-schedule-section />
        }
        @case ('members') { <app-members-section /> }
        @case ('sales') {
          <div class="stack">
            <app-channels-section />
            <app-gift-categories-section />
          </div>
        }
        @case ('brands') { <app-brands-section /> }
        @case ('materials') { <app-materials-section /> }
        @case ('finishes') { <app-finishes-section /> }
        @case ('categories') {
          <div class="stack">
            <app-payment-categories-section #defaults (defaultsSaved)="list.reload()" />
            <app-categories-section #list (changed)="defaults.reload()" />
          </div>
        }
        @case ('appearance') { <app-appearance-section /> }
      }
    </pp-page>
  `,
})
export class ConfiguracionPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly tabs = TABS;

  /**
   * `?tab=categories`, bound by the router: another screen can send the
   * person to the setting it mentions. It is followed, not read once: the
   * «Colores» button floats over this page too, and its link to Apariencia
   * reuses the page instead of building a new one.
   */
  readonly tab = input<string>();
  protected readonly active = computed<TabId>(() => TABS.find((tab) => tab.id === this.tab())?.id ?? 'costs');

  /**
   * The tab goes in the address, so a link to the tab already open is never
   * a navigation to the same URL (which the router ignores), and a reload
   * stays on it.
   */
  protected choose(tab: TabId): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, replaceUrl: true });
  }
}
