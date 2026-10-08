import { Component, inject, input, output, signal } from '@angular/core';
import { Badge, Empty } from '../../ui';
import { friendlyError, isPermissionError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';
import { ImpresorasData } from './impresoras.data';
import type { PlanRecord } from './impresoras.models';
import { PlanForm } from './plan-form';

/**
 * The maintenance plans of one printer: create, edit, activate or pause. What
 * is checked and how often is part of the printer's configuration, so only
 * the owner changes it (ADR-025); anyone who operates logs the work.
 */
@Component({
  selector: 'app-plans-tab',
  imports: [Badge, Empty, PlanForm],
  styles: SECTION_STYLES,
  template: `
    <div class="toolbar">
      <span class="grow muted">Cada plan define una tarea y cada cuánto toca.</span>
      @if (isOwner() && !formOpen()) {
        <button type="button" (click)="openForm(null)">Nuevo plan</button>
      }
    </div>

    @if (formOpen()) {
      <app-plan-form
        [printerId]="printerId()"
        [plan]="editing()"
        (saved)="afterSave()"
        (cancelled)="closeForm()"
      />
    }

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (plans().length === 0) {
      <pp-empty
        message="Esta impresora aún no tiene planes de mantenimiento. Un plan avisa por horas de uso o por calendario, lo que llegue primero."
      />
    } @else {
      <ul class="items">
        @for (plan of plans(); track plan.id) {
          <li class="item">
            <header>
              <span class="title">{{ plan.task }}</span>
              <pp-badge [tone]="plan.active ? 'good' : 'neutral'">{{ plan.active ? 'Activo' : 'En pausa' }}</pp-badge>
            </header>
            <p class="muted">{{ schedule(plan) }}</p>
            @if (plan.checklist.length > 0) {
              <p class="muted">Lista de verificación: {{ plan.checklist.length }} pasos.</p>
            }
            @if (isOwner()) {
              <div class="actions">
                <button type="button" class="secondary" (click)="openForm(plan)">Editar</button>
                <button type="button" class="ghost" [disabled]="busy()" (click)="toggleActive(plan)">
                  {{ plan.active ? 'Pausar' : 'Activar' }}
                </button>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class PlansTab {
  private readonly data = inject(ImpresorasData);
  private readonly workspace = inject(CurrentWorkspace);
  protected readonly isOwner = this.workspace.isOwner;

  readonly printerId = input.required<string>();
  readonly plans = input.required<PlanRecord[]>();
  readonly changed = output<void>();

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<PlanRecord | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected openForm(plan: PlanRecord | null): void {
    this.editing.set(plan);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected afterSave(): void {
    this.closeForm();
    this.changed.emit();
  }

  protected schedule(plan: PlanRecord): string {
    const parts: string[] = [];
    if (plan.everyHours !== null) parts.push(`cada ${plan.everyHours} h de impresión`);
    if (plan.everyDays !== null) parts.push(`cada ${plan.everyDays} ${plan.everyDays === 1 ? 'día' : 'días'}`);

    const sentence = `Toca ${parts.join(' o ')}`;
    return parts.length > 1 ? `${sentence}, lo que ocurra primero.` : `${sentence}.`;
  }

  protected async toggleActive(plan: PlanRecord): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.setPlanActive(plan.id, !plan.active);
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cambiar el estado del plan.'));
      if (isPermissionError(error)) await this.workspace.refresh().catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }
}
