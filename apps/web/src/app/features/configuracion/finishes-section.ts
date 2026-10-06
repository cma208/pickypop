import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { FinishRecord } from './configuracion.models';
import { errorOf } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';

/**
 * Filament finishes: Basic, Matte, Silk, Glow…
 *
 * They were part of the master data milestone and stayed half done: the screen
 * said it managed them, the error messages for a repeated name were already
 * written, and there was no way to create one. The only way in was the
 * database.
 *
 * The abrasive flag is the reason this is not just a name. A filament is
 * abrasive if its material **or** its finish is, and that decides whether the
 * hardened nozzle is needed — which is a real expense and a real breakage.
 */
@Component({
  selector: 'app-finishes-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Acabados de filamento">
        <p class="muted">
          Cómo termina un filamento: Básico, Mate, Seda, Brillante… Un acabado con rollos registrados no se borra:
          se desactiva y deja de ofrecerse sin perder su historial.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar los acabados. Aquí los ves en modo lectura.</p>
        }
        <div class="toolbar">
          @if (canEdit() && !formOpen()) {
            <button type="button" (click)="open(null)">Nuevo acabado</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar acabado' : 'Nuevo acabado' }}</h3>
            <pp-field label="Nombre" [required]="true" [error]="nameError()">
              <input formControlName="name" placeholder="Ej.: Básico, Mate, Seda, Glow" />
            </pp-field>
            <label class="check">
              <input type="checkbox" formControlName="abrasive" />
              Abrasivo (desgasta la boquilla: obliga a la endurecida)
            </label>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar acabado' }}</button>
              <button type="button" class="secondary" (click)="formOpen.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (finishes().length === 0) {
          <pp-empty message="Aún no hay acabados de filamento." />
        } @else {
          <ul class="items">
            @for (finish of finishes(); track finish.id) {
              <li class="item">
                <header>
                  <span class="title">{{ finish.name }}</span>
                  @if (finish.abrasive) { <pp-badge tone="warn">Abrasivo</pp-badge> }
                  <pp-badge [tone]="finish.active ? 'good' : 'neutral'">{{ finish.active ? 'Activo' : 'Inactivo' }}</pp-badge>
                </header>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="open(finish)">Editar</button>
                    <button type="button" class="secondary" [disabled]="saving()" (click)="toggle(finish)">
                      {{ finish.active ? 'Desactivar' : 'Activar' }}
                    </button>
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
export class FinishesSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly finishes = signal<FinishRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<FinishRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    abrasive: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  protected open(finish: FinishRecord | null): void {
    this.form.reset({ name: finish?.name ?? '', abrasive: finish?.abrasive ?? false });
    this.error.set(null);
    this.editing.set(finish);
    this.formOpen.set(true);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre del acabado.' });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const editing = this.editing();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveFinish(editing?.id ?? null, {
        name: this.form.getRawValue().name,
        abrasive: this.form.getRawValue().abrasive,
        active: editing?.active ?? true,
      });
      this.formOpen.set(false);
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el acabado.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(finish: FinishRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);

    try {
      await this.data.saveFinish(finish.id, { name: finish.name, abrasive: finish.abrasive, active: !finish.active });
      await this.reload();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el estado del acabado.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [finishes, role] = await Promise.all([this.data.finishes(), this.data.currentRole()]);
      this.finishes.set(finishes);
      this.canEdit.set(role === 'owner');
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los acabados.'));
    } finally {
      this.loading.set(false);
    }
  }
}
