import { Component, computed, inject, signal } from '@angular/core';
import { Badge, Card, Empty, AsyncState, FORMAT_PIPES } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { CostProfileRecord } from './configuracion.models';
import { pickCurrent, profileState, type ProfileState } from './cost-profile-lines';
import { CostProfileForm } from './cost-profile-form';
import { ProfileSummary } from './profile-summary';
import { friendlyError } from '../../core/friendly-error';
import { todayLocal } from '../../core/dates';
import { date as fecha } from '../../core/format';
import { SECTION_STYLES } from '../../core/styles';
import { isOwnerRole } from '../../core/workspace';

const STATE_LABELS: Record<ProfileState, string> = { current: 'Vigente', scheduled: 'Programada', past: 'Anterior' };
const STATE_TONES: Record<ProfileState, 'good' | 'info' | 'neutral'> = {
  current: 'good',
  scheduled: 'info',
  past: 'neutral',
};

/**
 * The profile in force, how to version it, and the full history. Only the
 * owner changes it (ADR-025). A version that has not started yet can be
 * corrected or taken back; the one in force and the old ones are history
 * (T1-14). The database holds the same rules.
 */
@Component({
  selector: 'app-cost-profile-section',
  imports: [Badge, Card, Empty, AsyncState, FORMAT_PIPES, ProfileSummary, CostProfileForm],
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
        su fecha de vigencia. Una versión programada (que todavía no empezó) se puede corregir o quitar. Las
        cotizaciones ya emitidas conservan el perfil con el que se calcularon y no cambian.
      </p>
      @if (!canEdit()) {
        <p class="notice warn">Solo el dueño del taller puede cambiar los parámetros de costo. Aquí los ves en modo lectura.</p>
      }
      @if (notice(); as text) {
        <p class="notice" role="status">{{ text }}</p>
      }
      @if (actionError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      @if (formOpen()) {
        <!-- Keyed by what is being edited, so switching versions never shows the previous values. -->
        @for (target of formTargets(); track target?.id ?? 'new') {
          <app-cost-profile-form
            [base]="target ?? current()"
            [editing]="target"
            [takenDates]="takenDates(target)"
            (saved)="afterSave(target)"
            (cancelled)="closeForm()"
          />
        }
      }

      @if (current(); as profile) {
        <pp-card heading="Parámetros vigentes">
          @if (canEdit() && !formOpen()) {
            <button card-actions type="button" (click)="openForm(null)">Crear nueva versión</button>
          }
          <p class="muted">Vigentes desde el {{ profile.validFrom | fecha }}.</p>
          <app-profile-summary [profile]="profile" />
          @if (profile.note) {
            <p class="muted">Nota: {{ profile.note }}</p>
          }
        </pp-card>
      } @else if (canEdit()) {
        <pp-empty message="Aún no hay parámetros de costo vigentes. Sin ellos no se puede cotizar.">
          <button type="button" (click)="openForm(null)">Crear los primeros parámetros</button>
        </pp-empty>
      } @else {
        <pp-empty message="Aún no hay parámetros de costo vigentes, y sin ellos no se puede cotizar. Los crea el dueño del taller." />
      }

      @if (profiles().length > 0) {
        <pp-card heading="Historial de versiones">
          @for (profile of profiles(); track profile.id) {
            <details>
              <summary>
                <span class="when">Desde el {{ profile.validFrom | fecha }}</span>
                <pp-badge [tone]="tones[stateOf(profile)]">{{ labels[stateOf(profile)] }}</pp-badge>
              </summary>
              <app-profile-summary [profile]="profile" />
              @if (profile.note) {
                <p class="muted">Nota: {{ profile.note }}</p>
              }
              @if (canEdit() && stateOf(profile) === 'scheduled') {
                <div class="actions">
                  <button type="button" class="secondary" [disabled]="busy()" (click)="openForm(profile)">Corregir</button>
                  <button type="button" class="ghost" [disabled]="busy()" (click)="remove(profile)">Quitar</button>
                </div>
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

  protected readonly labels = STATE_LABELS;
  protected readonly tones = STATE_TONES;

  protected readonly profiles = signal<CostProfileRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  /** Null inside the list means "a new version"; a record means correcting it. */
  private readonly editing = signal<CostProfileRecord | null>(null);
  protected readonly formTargets = computed(() => [this.editing()]);

  private readonly today = todayLocal();
  protected readonly current = computed(() => pickCurrent(this.profiles(), this.today));

  constructor() {
    void this.reload();
  }

  protected stateOf(profile: CostProfileRecord): ProfileState {
    return profileState(profile, this.current(), this.today);
  }

  /** Dates other versions use; a version being corrected may keep its own. */
  protected takenDates(editing: CostProfileRecord | null): string[] {
    return this.profiles()
      .filter((profile) => profile.id !== editing?.id)
      .map((profile) => profile.validFrom);
  }

  protected openForm(profile: CostProfileRecord | null): void {
    this.editing.set(profile);
    this.notice.set(null);
    this.actionError.set(null);
    this.formOpen.set(true);
  }

  /** Read again on the way out: a refused correction may mean the version started or is gone. */
  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    void this.reload();
  }

  protected afterSave(corrected: CostProfileRecord | null): void {
    this.closeForm();
    this.notice.set(
      corrected
        ? `Versión del ${fecha(corrected.validFrom)} corregida.`
        : 'Versión guardada. Rige desde su fecha; las cotizaciones de antes no cambian.',
    );
  }

  protected async remove(profile: CostProfileRecord): Promise<void> {
    if (this.busy()) return;
    const when = fecha(profile.validFrom);
    if (!confirm(`¿Quitar la versión programada para el ${when}? Todavía no se usó: se borra, y siguen rigiendo los parámetros de antes.`)) {
      return;
    }

    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      await this.data.deleteCostProfile(profile.id);
      this.notice.set(`Se quitó la versión programada para el ${when}.`);
    } catch (error) {
      this.actionError.set(friendlyError(error, 'No pudimos quitar la versión.'));
      await this.data.afterRefusal(error);
    } finally {
      this.busy.set(false);
      // Also after a refusal: the version may have started, or be gone.
      await this.reload();
    }
  }

  private async reload(): Promise<void> {
    try {
      const [profiles, role] = await Promise.all([this.data.costProfiles(), this.data.currentRole()]);
      this.profiles.set(profiles);
      this.canEdit.set(isOwnerRole(role));
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los parámetros de costo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
