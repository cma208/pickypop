import { Component, inject, input, output, signal } from '@angular/core';
import { Badge, Empty, FORMAT_PIPES } from '../../ui';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { IncidentForm } from './incident-form';
import type { IncidentRecord } from './impresoras.models';

/** Incidents of one printer: what failed, why, how it was fixed and what it cost. */
@Component({
  selector: 'app-incidents-tab',
  imports: [Badge, Empty, IncidentForm, FORMAT_PIPES],
  styles: SECTION_STYLES,
  template: `
    <div class="toolbar">
      <span class="grow muted">Fallas de la máquina: síntoma, causa, solución, parada y costo.</span>
      @if (canOperate() && !formOpen()) {
        <button type="button" (click)="open(null, false)">Registrar incidente</button>
      }
    </div>

    @if (formOpen()) {
      <app-incident-form
        [printerId]="printerId()"
        [incident]="editing()"
        [closing]="closing()"
        (saved)="afterSave()"
        (cancelled)="close()"
      />
    }

    @if (incidents().length === 0) {
      <pp-empty message="Sin incidentes registrados. Buena señal." />
    } @else {
      <ul class="items">
        @for (incident of incidents(); track incident.id) {
          <li class="item">
            <header>
              <span class="title">{{ incident.symptom }}</span>
              <pp-badge [tone]="incident.resolvedAt ? 'good' : 'bad'">
                {{ incident.resolvedAt ? 'Resuelto' : 'Abierto' }}
              </pp-badge>
            </header>
            <p class="muted">
              {{ incident.occurredAt | fecha }}
              @if (incident.downtimeMin !== null) { · {{ (incident.downtimeMin ?? 0) * 60 | duration }} fuera de servicio }
              @if (incident.cost > 0) { · {{ incident.cost | money }} }
            </p>
            @if (incident.cause) { <p><strong>Causa:</strong> {{ incident.cause }}</p> }
            @if (incident.fix) { <p><strong>Solución:</strong> {{ incident.fix }}</p> }
            @if (canOperate()) {
              <div class="actions">
                @if (!incident.resolvedAt) {
                  <button type="button" (click)="open(incident, true)">Cerrar incidente</button>
                }
                <button type="button" class="secondary" (click)="open(incident, false)">Editar</button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class IncidentsTab {
  readonly printerId = input.required<string>();
  readonly incidents = input.required<IncidentRecord[]>();
  readonly changed = output<void>();

  /** Recording what failed is the day to day: owner and operator. */
  protected readonly canOperate = inject(CurrentWorkspace).canOperate;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<IncidentRecord | null>(null);
  protected readonly closing = signal(false);

  protected open(incident: IncidentRecord | null, closing: boolean): void {
    this.formOpen.set(false);
    this.editing.set(incident);
    this.closing.set(closing);
    // Re-create the form so it starts from the selected incident.
    queueMicrotask(() => this.formOpen.set(true));
  }

  protected close(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.closing.set(false);
  }

  protected afterSave(): void {
    this.close();
    this.changed.emit();
  }
}
