import { Component, computed, inject, signal } from '@angular/core';
import { Badge, Card, Empty, AsyncState } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { CostProfileRecord } from './configuracion.models';
import { pickCurrent } from './cost-profile-lines';
import { CostProfileForm } from './cost-profile-form';
import { ProfileSummary } from './profile-summary';
import { friendlyError } from './shared/friendly-error';
import { todayLocal } from './shared/dates';
import { PlainDatePipe } from './shared/plain-date.pipe';
import { SECTION_STYLES } from './shared/styles';

/** The profile in force, how to version it, and the full history. */
@Component({
  selector: 'app-cost-profile-section',
  imports: [Badge, Card, Empty, AsyncState, PlainDatePipe, ProfileSummary, CostProfileForm],
  styles: [
    SECTION_STYLES,
    `
      pp-card + pp-card { margin-top: 1rem; }
      details { border-top: 1px solid var(--line); padding: 0.6rem 0; }
      summary { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; cursor: pointer; }
      summary .when { flex: 1; min-width: 8rem; font-weight: 600; }
      details > :not(summary) { margin-top: 0.75rem; }
    `,
  ],
  template: `
    <pp-async [loading]="loading()" [error]="error()">
      <p class="notice">
        <strong>El perfil vigente nunca se edita.</strong> Para cambiar un valor se crea una versión nueva con
        su fecha de vigencia. Las cotizaciones ya emitidas conservan el perfil con el que se calcularon y no
        cambian.
      </p>

      @if (formOpen()) {
        <app-cost-profile-form
          [base]="current()"
          [takenDates]="takenDates()"
          (saved)="afterSave()"
          (cancelled)="formOpen.set(false)"
        />
      }

      @if (current(); as profile) {
        <pp-card heading="Parámetros vigentes">
          @if (!formOpen()) {
            <button card-actions type="button" (click)="formOpen.set(true)">Crear nueva versión</button>
          }
          <p class="muted">Vigentes desde el {{ profile.validFrom | fechaDia }}.</p>
          <app-profile-summary [profile]="profile" />
          @if (profile.note) {
            <p class="muted">Nota: {{ profile.note }}</p>
          }
        </pp-card>
      } @else {
        <pp-empty message="Aún no hay parámetros de costo vigentes. Sin ellos no se puede cotizar.">
          <button type="button" (click)="formOpen.set(true)">Crear los primeros parámetros</button>
        </pp-empty>
      }

      @if (profiles().length > 0) {
        <pp-card heading="Historial de versiones">
          @for (profile of profiles(); track profile.id) {
            <details>
              <summary>
                <span class="when">Desde el {{ profile.validFrom | fechaDia }}</span>
                <pp-badge [tone]="tone(profile)">{{ stateOf(profile) }}</pp-badge>
              </summary>
              <app-profile-summary [profile]="profile" />
              @if (profile.note) {
                <p class="muted">Nota: {{ profile.note }}</p>
              }
            </details>
          }
        </pp-card>
      }
    </pp-async>
  `,
})
export class CostProfileSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly profiles = signal<CostProfileRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);

  private readonly today = todayLocal();
  protected readonly current = computed(() => pickCurrent(this.profiles(), this.today));
  protected readonly takenDates = computed(() => this.profiles().map((profile) => profile.validFrom));

  constructor() {
    void this.reload();
  }

  protected stateOf(profile: CostProfileRecord): string {
    if (profile.id === this.current()?.id) return 'Vigente';
    return profile.validFrom > this.today ? 'Programada' : 'Anterior';
  }

  protected tone(profile: CostProfileRecord): 'good' | 'info' | 'neutral' {
    const state = this.stateOf(profile);
    return state === 'Vigente' ? 'good' : state === 'Programada' ? 'info' : 'neutral';
  }

  protected afterSave(): void {
    this.formOpen.set(false);
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.profiles.set(await this.data.costProfiles());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los parámetros de costo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
