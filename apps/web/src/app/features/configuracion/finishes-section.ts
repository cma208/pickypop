import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { FinishRecord } from './configuracion.models';
import { errorOf, requiredText } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * Filament finishes: Basic, Matte, Silk, Glow…
 *
 * Owner and operator keep them, like the rest of the catalogue: buying a new
 * filament needs its brand and material, and the purchase screen creates them
 * on the spot (ADR-025). A viewer only reads.
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
          <p class="notice warn">Tu rol es de solo lectura: aquí ves los acabados sin poder cambiarlos.</p>
        }
        <div class="toolbar">
          @if (canEdit()) {
            <!-- Always there: when it vanished while the form was open, the form's own title took its place and looked like the button. -->
            <button type="button" [class.secondary]="formOpen()" (click)="open(null)">+ Nuevo acabado</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar acabado' : 'Datos del acabado nuevo' }}</h3>
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
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator keep these lists (ADR-025); a viewer reads them. Read from `CurrentWorkspace`, the one place that reads the role. */
  protected readonly canEdit = this.workspace.canOperate;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<FinishRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
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
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

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
      if (await this.workspace.afterRefusal(error)) {
        this.formOpen.set(false);
        this.listError.set(this.error());
        await this.reload();
      }
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
      if (await this.workspace.afterRefusal(error)) await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [finishes] = await Promise.all([this.data.finishes(), this.workspace.info()]);
      this.finishes.set(finishes);
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los acabados.'));
    } finally {
      this.loading.set(false);
    }
  }
}
