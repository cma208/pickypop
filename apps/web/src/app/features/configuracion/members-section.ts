import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field, FORMAT_PIPES } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import {
  ROLES,
  ROLE_HELP,
  ROLE_LABELS,
  ROLE_TONES,
  type MemberRecord,
  type MemberRole,
} from './configuracion.models';
import { errorOf, maxDecimals, requiredText, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { isOwnerRole } from '../../core/workspace';

/** numeric(12, 2), the column of the rate. */
const MAX_RATE = 9_999_999_999.99;

/**
 * Who works in the workshop, their role and what their hour costs. Only the
 * owner changes it, and the database keeps at least one owner.
 */
@Component({
  selector: 'app-members-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState, FORMAT_PIPES],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Miembros del taller">
        <p class="notice">
          La <strong>tarifa por hora</strong> de cada persona distingue cuánto cuesta el trabajo según quién lo
          hace. Las cotizaciones usan la tarifa del taller (en los parámetros de costo); al cerrar un trabajo
          se puede costear con la tarifa de quien lo hizo.
        </p>

        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar los miembros.</p>
        }
        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (editing(); as member) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit(member)">
            <h3>Editar miembro</h3>
            <div class="grid two">
              <pp-field label="Nombre" [required]="true" [error]="nameError()">
                <input formControlName="displayName" />
              </pp-field>
              <pp-field label="Rol" [hint]="roleHelp[form.controls.role.value]">
                <select formControlName="role">
                  @for (role of roles; track role) {
                    <option [value]="role">{{ roleLabels[role] }}</option>
                  }
                </select>
              </pp-field>
              <pp-field label="Tarifa por hora (S/)" hint="Lo que cuesta una hora de esta persona. Vacío si no se define." [error]="rateError()">
                <input type="number" step="0.01" min="0" formControlName="rate" inputmode="decimal" />
              </pp-field>
            </div>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
              <button type="button" class="secondary" (click)="editing.set(null)">Cancelar</button>
            </div>
          </form>
        }

        @if (members().length === 0) {
          <pp-empty message="No hay miembros registrados en este taller." />
        } @else {
          <ul class="items">
            @for (member of members(); track member.id) {
              <li class="item">
                <header>
                  <span class="title">{{ member.displayName ?? 'Sin nombre' }}</span>
                  <pp-badge [tone]="tones[member.role]">{{ roleLabels[member.role] }}</pp-badge>
                </header>
                <p>
                  @if (member.laborRatePerHour !== null) {
                    Tarifa: <strong>{{ member.laborRatePerHour | money }}</strong> por hora
                  } @else {
                    <span class="muted">Sin tarifa por hora definida</span>
                  }
                </p>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="edit(member)">Editar</button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </pp-card>
    </pp-async>
  `,
})
export class MembersSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleHelp = ROLE_HELP;
  protected readonly tones = ROLE_TONES;

  protected readonly members = signal<MemberRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly editing = signal<MemberRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly owners = computed(() => this.members().filter((member) => member.role === 'owner').length);

  protected readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    role: new FormControl<MemberRole>('operator', { nonNullable: true }),
    rate: new FormControl<number | null>(null, [Validators.min(0), Validators.max(MAX_RATE), maxDecimals(2)]),
  });

  constructor() {
    void this.load();
  }

  protected edit(member: MemberRecord): void {
    this.form.reset({
      displayName: member.displayName ?? '',
      role: member.role,
      rate: member.laborRatePerHour,
    });
    this.error.set(null);
    this.listError.set(null);
    this.editing.set(member);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.displayName, { required: 'Escribe cómo se llama esta persona.' });
  }

  protected rateError(): string | null {
    return errorOf(this.form.controls.rate, {
      min: 'La tarifa no puede ser negativa.',
      max: 'La tarifa no puede pasar de S/ 9,999,999,999.99 por hora.',
      decimals: 'Usa como mucho 2 decimales.',
    });
  }

  protected async submit(member: MemberRecord): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    if (member.role === 'owner' && value.role !== 'owner' && this.owners() <= 1) {
      this.error.set('El taller necesita al menos un dueño. Nombra a otro dueño antes de cambiar este rol.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.updateMember(member.id, {
        displayName: textOrNull(value.displayName),
        role: value.role,
        laborRatePerHour: value.rate,
      });
      this.editing.set(null);
      await this.load();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar los cambios del miembro.'));
      if (await this.data.afterRefusal(error)) {
        this.listError.set(this.error());
        this.editing.set(null);
        await this.load();
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [members, role] = await Promise.all([this.data.members(), this.data.currentRole()]);
      this.members.set(members);
      this.canEdit.set(isOwnerRole(role));
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los miembros.'));
    } finally {
      this.loading.set(false);
    }
  }
}
