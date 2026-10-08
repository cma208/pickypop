import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import { ABRASIVE_HELP, HYGROSCOPIC_HELP, MAX_DENSITY, type MaterialRecord } from './configuracion.models';
import { errorOf, requiredText } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * Filament materials and the two properties that drive the drying and nozzle warnings.
 *
 * Owner and operator keep them, like the rest of the catalogue: buying a new
 * filament needs its brand and material, and the purchase screen creates them
 * on the spot (ADR-025). A viewer only reads.
 */
@Component({
  selector: 'app-materials-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState],
  styles: SECTION_STYLES + '.help { margin: -0.5rem 0 0.9rem 1.5rem; font-size: 0.8rem; }',
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Materiales">
        <p class="muted">
          Los tipos de filamento (PLA, PETG, TPU…). Un material con rollos registrados no se puede borrar: se
          desactiva, y deja de ofrecerse sin perder su historial.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Tu rol es de solo lectura: aquí ves los materiales sin poder cambiarlos.</p>
        }
        <div class="toolbar">
          @if (canEdit()) {
            <!-- Always there: when it vanished while the form was open, the form's own title took its place and looked like the button. -->
            <button type="button" [class.secondary]="formOpen()" (click)="open(null)">+ Nuevo material</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar material' : 'Datos del material nuevo' }}</h3>
            <div class="grid two">
              <pp-field label="Código" [required]="true" [error]="codeError()" hint="Se guarda en mayúsculas.">
                <input formControlName="code" placeholder="Ej.: PLA, PETG, TPU" />
              </pp-field>
              <pp-field label="Densidad (g/cm³)" [error]="densityError()" hint="Opcional. Ej.: 1.24 para PLA.">
                <input type="number" step="0.001" min="0" formControlName="density" inputmode="decimal" />
              </pp-field>
            </div>
            <label class="check">
              <input type="checkbox" formControlName="hygroscopic" /> Higroscópico
            </label>
            <p class="muted help">{{ hygroscopicHelp }}</p>
            <label class="check">
              <input type="checkbox" formControlName="abrasive" /> Abrasivo
            </label>
            <p class="muted help">{{ abrasiveHelp }}</p>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar material' }}</button>
              <button type="button" class="secondary" (click)="formOpen.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (materials().length === 0) {
          <pp-empty message="Aún no hay materiales." />
        } @else {
          <ul class="items">
            @for (material of materials(); track material.id) {
              <li class="item">
                <header>
                  <span class="title">{{ material.code }}</span>
                  @if (material.hygroscopic) { <pp-badge tone="info">Higroscópico</pp-badge> }
                  @if (material.abrasive) { <pp-badge tone="warn">Abrasivo</pp-badge> }
                  <pp-badge [tone]="material.active ? 'good' : 'neutral'">{{ material.active ? 'Activo' : 'Inactivo' }}</pp-badge>
                </header>
                <p class="muted">
                  {{ material.densityGCm3 === null ? 'Sin densidad registrada' : 'Densidad de ' + material.densityGCm3 + ' g/cm³' }}
                </p>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="open(material)">Editar</button>
                    <button type="button" class="secondary" [disabled]="saving()" (click)="toggle(material)">
                      {{ material.active ? 'Desactivar' : 'Activar' }}
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
export class MaterialsSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly hygroscopicHelp = HYGROSCOPIC_HELP;
  protected readonly abrasiveHelp = ABRASIVE_HELP;

  protected readonly materials = signal<MaterialRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  private readonly workspace = inject(CurrentWorkspace);
  /** Owner and operator keep these lists (ADR-025); a viewer reads them. Read from `CurrentWorkspace`, the one place that reads the role. */
  protected readonly canEdit = this.workspace.canOperate;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<MaterialRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    density: new FormControl<number | null>(null, [Validators.min(0.001), Validators.max(MAX_DENSITY)]),
    hygroscopic: new FormControl(false, { nonNullable: true }),
    abrasive: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  protected open(material: MaterialRecord | null): void {
    this.form.reset({
      code: material?.code ?? '',
      density: material?.densityGCm3 ?? null,
      hygroscopic: material?.hygroscopic ?? false,
      abrasive: material?.abrasive ?? false,
    });
    this.error.set(null);
    this.editing.set(material);
    this.formOpen.set(true);
  }

  protected codeError(): string | null {
    return errorOf(this.form.controls.code, { required: 'Escribe el código del material.' });
  }

  protected densityError(): string | null {
    return errorOf(this.form.controls.density, {
      min: 'La densidad debe ser mayor que 0.',
      max: 'La densidad debe ser menor que 100 g/cm³.',
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const editing = this.editing();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveMaterial(editing?.id ?? null, {
        code: value.code.trim().toUpperCase(),
        densityGCm3: value.density,
        hygroscopic: value.hygroscopic,
        abrasive: value.abrasive,
        active: editing?.active ?? true,
      });
      this.formOpen.set(false);
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el material.'));
      if (await this.workspace.afterRefusal(error)) {
        this.formOpen.set(false);
        this.listError.set(this.error());
        await this.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(material: MaterialRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);

    try {
      await this.data.saveMaterial(material.id, {
        code: material.code,
        densityGCm3: material.densityGCm3,
        hygroscopic: material.hygroscopic,
        abrasive: material.abrasive,
        active: !material.active,
      });
      await this.reload();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el estado del material.'));
      if (await this.workspace.afterRefusal(error)) await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [materials] = await Promise.all([this.data.materials(), this.workspace.info()]);
      this.materials.set(materials);
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los materiales.'));
    } finally {
      this.loading.set(false);
    }
  }
}
