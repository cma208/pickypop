import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { BrandRecord } from './configuracion.models';
import { errorOf } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';

/** Filament brands. They are deactivated, never deleted: a SKU may still point at one. */
@Component({
  selector: 'app-brands-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Marcas de filamento">
        <p class="muted">
          Las marcas que compras. Una marca con rollos registrados no se puede borrar: se desactiva, y deja de ofrecerse
          sin perder su historial.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar las marcas. Aquí las ves en modo lectura.</p>
        }
        <div class="toolbar">
          @if (canEdit() && !formOpen()) {
            <button type="button" (click)="open(null)">Nueva marca</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Renombrar marca' : 'Nueva marca' }}</h3>
            <pp-field label="Nombre" [required]="true" [error]="nameError()">
              <input formControlName="name" placeholder="Ej.: Bambu Lab, Krear3D, eSun" />
            </pp-field>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar marca' }}</button>
              <button type="button" class="secondary" (click)="formOpen.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (brands().length === 0) {
          <pp-empty message="Aún no hay marcas de filamento." />
        } @else {
          <ul class="items">
            @for (brand of brands(); track brand.id) {
              <li class="item">
                <header>
                  <span class="title">{{ brand.name }}</span>
                  <pp-badge [tone]="brand.active ? 'good' : 'neutral'">{{ brand.active ? 'Activa' : 'Inactiva' }}</pp-badge>
                </header>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="open(brand)">Renombrar</button>
                    <button type="button" class="secondary" [disabled]="saving()" (click)="toggle(brand)">
                      {{ brand.active ? 'Desactivar' : 'Activar' }}
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
export class BrandsSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly brands = signal<BrandRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<BrandRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    void this.reload();
  }

  protected open(brand: BrandRecord | null): void {
    this.form.reset({ name: brand?.name ?? '' });
    this.error.set(null);
    this.editing.set(brand);
    this.formOpen.set(true);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre de la marca.' });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const editing = this.editing();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveBrand(editing?.id ?? null, {
        name: this.form.getRawValue().name,
        active: editing?.active ?? true,
      });
      this.formOpen.set(false);
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar la marca.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(brand: BrandRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);

    try {
      await this.data.saveBrand(brand.id, { name: brand.name, active: !brand.active });
      await this.reload();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el estado de la marca.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [brands, role] = await Promise.all([this.data.brands(), this.data.currentRole()]);
      this.brands.set(brands);
      this.canEdit.set(role === 'owner');
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar las marcas.'));
    } finally {
      this.loading.set(false);
    }
  }
}
