import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import {
  TREATMENTS,
  TREATMENT_HELP,
  TREATMENT_LABELS,
  type GiftCategoryRecord,
  type GiftTreatment,
} from './configuracion.models';
import { errorOf, requiredText } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * Gift categories and how the money of each one is treated. The treatment
 * decides where a gift's cost lands in the results (marketing, an owner's
 * draw), so it is configuration: only the owner changes it (ADR-025).
 */
@Component({
  selector: 'app-gift-categories-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Categorías de regalo">
        <p class="muted">
          Cuando un pedido es un regalo se elige una categoría; el tratamiento define cómo se cuenta ese costo.
        </p>
        @if (canEdit()) {
          <div class="toolbar">
            <button type="button" [class.secondary]="formOpen()" (click)="open(null)">+ Nueva categoría</button>
          </div>
        } @else {
          <p class="notice warn">Solo el dueño del taller puede cambiar las categorías de regalo. Aquí las ves en modo lectura.</p>
        }

        @if (notice(); as text) {
          <p class="notice" role="status">{{ text }}</p>
        }
        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar «' + editing()?.name + '»' : 'Datos de la categoría nueva' }}</h3>
            <pp-field label="Nombre" [required]="true" [error]="nameError()">
              <input formControlName="name" placeholder="Ej.: Clientes, Familia, Sorteo" />
            </pp-field>
            <pp-field label="Tratamiento" [hint]="help[form.controls.treatment.value]">
              <select formControlName="treatment">
                @for (treatment of treatments; track treatment) {
                  <option [value]="treatment">{{ labels[treatment] }}</option>
                }
              </select>
            </pp-field>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar categoría' }}</button>
              <button type="button" class="secondary" (click)="formOpen.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (categories().length === 0) {
          <pp-empty message="Aún no hay categorías de regalo." />
        } @else {
          <ul class="items">
            @for (category of categories(); track category.id) {
              <li class="item">
                <header>
                  <span class="title">{{ category.name }}</span>
                  <pp-badge tone="info">{{ labels[category.treatment] }}</pp-badge>
                </header>
                <p class="muted">{{ help[category.treatment] }}</p>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="open(category)">Editar</button>
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
export class GiftCategoriesSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly treatments = TREATMENTS;
  protected readonly labels = TREATMENT_LABELS;
  protected readonly help = TREATMENT_HELP;

  protected readonly categories = signal<GiftCategoryRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  private readonly workspace = inject(CurrentWorkspace);
  /** Configuration is the owner's (ADR-025); anyone else reads it. Read from `CurrentWorkspace`, the one place that reads the role. */
  protected readonly canEdit = this.workspace.isOwner;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<GiftCategoryRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    treatment: new FormControl<GiftTreatment>('other', { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  protected open(category: GiftCategoryRecord | null): void {
    this.form.reset({ name: category?.name ?? '', treatment: category?.treatment ?? 'other' });
    this.error.set(null);
    this.notice.set(null);
    this.listError.set(null);
    this.editing.set(category);
    this.formOpen.set(true);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre de la categoría.' });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveGiftCategory(this.editing()?.id ?? null, this.form.getRawValue());
      this.formOpen.set(false);
      this.notice.set(`Categoría «${this.form.controls.name.value.trim()}» guardada.`);
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar la categoría.'));
      if (await this.workspace.afterRefusal(error)) {
        this.formOpen.set(false);
        this.listError.set(this.error());
        await this.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [categories] = await Promise.all([this.data.giftCategories(), this.workspace.info()]);
      this.categories.set(categories);
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar las categorías de regalo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
