import { Component, inject, input, output, signal } from '@angular/core';
import { Badge, Empty, FORMAT_PIPES } from '../../ui';
import { todayLocal } from '../../core/dates';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { ComponentForm } from './component-form';
import { ImpresorasData } from './impresoras.data';
import { COMPONENT_LABELS, type ComponentRecord } from './impresoras.models';

/** Parts installed on the printer, and how many hours each one has been running. */
@Component({
  selector: 'app-components-tab',
  imports: [Badge, Empty, ComponentForm, FORMAT_PIPES],
  styles: SECTION_STYLES,
  template: `
    <div class="toolbar">
      <span class="grow muted">Boquilla, placa y demás: cuándo entraron y cuánto llevan puestos.</span>
      @if (!formOpen()) {
        <button type="button" (click)="formOpen.set(true)">Instalar componente</button>
      }
    </div>

    @if (formOpen()) {
      <app-component-form
        [printerId]="printerId()"
        [currentHours]="currentHours()"
        (saved)="afterSave()"
        (cancelled)="formOpen.set(false)"
      />
    }

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (components().length === 0) {
      <pp-empty
        message="Aún no hay componentes registrados. Son las piezas que se gastan —boquilla, placa, correas— y registrarlas permite avisar cuándo toca cambiarlas."
      />
    } @else {
      <ul class="items">
        @for (component of components(); track component.id) {
          <li class="item">
            <header>
              <span class="title">
                {{ labels[component.kind] }}
                @if (component.description) {
                  <span class="muted"> · {{ component.description }}</span>
                }
              </span>
              @if (component.retiredOn) {
                <pp-badge>Retirado el {{ component.retiredOn | fecha }}</pp-badge>
              } @else {
                <pp-badge tone="info">{{ hoursWorn(component) }} h puestas</pp-badge>
              }
            </header>
            <p class="muted">
              Instalado el {{ component.installedOn | fecha }}, con {{ component.hoursAtInstall }} h en la máquina.
            </p>
            @if (!component.retiredOn) {
              <div class="actions">
                <button type="button" class="secondary" [disabled]="busy()" (click)="retire(component)">
                  Marcar como retirado
                </button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class ComponentsTab {
  private readonly data = inject(ImpresorasData);

  readonly printerId = input.required<string>();
  readonly currentHours = input.required<number>();
  readonly components = input.required<ComponentRecord[]>();
  readonly changed = output<void>();

  protected readonly labels = COMPONENT_LABELS;
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected hoursWorn(component: ComponentRecord): string {
    const hours = Math.max(0, this.currentHours() - component.hoursAtInstall);
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(hours);
  }

  protected afterSave(): void {
    this.formOpen.set(false);
    this.changed.emit();
  }

  protected async retire(component: ComponentRecord): Promise<void> {
    const name = COMPONENT_LABELS[component.kind].toLowerCase();
    if (!confirm(`¿Marcar ${name} como retirado? Ya no contará horas puestas.`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.retireComponent(component.id, todayLocal());
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos retirar el componente.'));
    } finally {
      this.busy.set(false);
    }
  }
}
