import { Component, computed, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { CategoryRecord, MovementDirection } from './configuracion.models';
import { errorOf } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';

const DIRECTION_LABEL: Record<MovementDirection, string> = {
  income: 'Ingreso',
  expense: 'Egreso',
};

/**
 * Las categorías con las que se clasifica cada movimiento de dinero.
 *
 * Existían solo en la semilla: las que trae el sistema eran las únicas que
 * iban a existir nunca, y la única forma de agregar una era entrar a la base.
 * Un taller inventa categorías a medida que gasta —publicidad, ferias, un
 * repuesto raro—, así que esto tenía que poder cambiarse desde aquí.
 *
 * Se desactivan, no se borran: una categoría usada por un movimiento viejo
 * tiene que seguir explicándolo.
 */
@Component({
  selector: 'app-categories-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Categorías de movimiento">
        <p class="muted">
          Con qué se clasifica cada ingreso y cada egreso en la caja. Una categoría ya usada no se borra: se
          desactiva, deja de ofrecerse y sigue explicando los movimientos viejos.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar las categorías. Aquí las ves en modo lectura.</p>
        }
        <div class="toolbar">
          @if (canEdit() && !formOpen()) {
            <button type="button" (click)="open(null)">Nueva categoría</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar categoría' : 'Nueva categoría' }}</h3>
            <pp-field label="Nombre" [required]="true" [error]="nameError()">
              <input formControlName="name" placeholder="Ej.: Publicidad, Ferias, Envíos" />
            </pp-field>
            <pp-field label="Tipo" [required]="true" hint="Si entra plata o si sale. No se puede cambiar después.">
              <select formControlName="direction" [attr.disabled]="editing() ? '' : null">
                @for (direction of directions; track direction) {
                  <option [value]="direction">{{ labels[direction] }}</option>
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

        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (categories().length === 0) {
          <pp-empty message="Aún no hay categorías." />
        } @else {
          @for (direction of directions; track direction) {
            @if (byDirection()[direction].length > 0) {
              <h3 class="group">{{ labels[direction] }}s</h3>
              <ul class="items">
                @for (category of byDirection()[direction]; track category.id) {
                  <li class="item">
                    <header>
                      <span class="title">{{ category.name }}</span>
                      <pp-badge [tone]="category.active ? 'good' : 'neutral'">
                        {{ category.active ? 'Activa' : 'Inactiva' }}
                      </pp-badge>
                    </header>
                    @if (canEdit()) {
                      <div class="actions">
                        <button type="button" class="secondary" (click)="open(category)">Renombrar</button>
                        <button type="button" class="secondary" [disabled]="saving()" (click)="toggle(category)">
                          {{ category.active ? 'Desactivar' : 'Activar' }}
                        </button>
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          }
        }
      </pp-card>
    </pp-async>
  `,
})
export class CategoriesSection {
  private readonly data = inject(ConfiguracionData);

  /** The list changed: what depends on it (the default categories) offers the new options. */
  readonly changed = output<void>();

  protected readonly directions: MovementDirection[] = ['income', 'expense'];
  protected readonly labels = DIRECTION_LABEL;

  protected readonly categories = signal<CategoryRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CategoryRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly byDirection = computed(() => ({
    income: this.categories().filter((category) => category.direction === 'income'),
    expense: this.categories().filter((category) => category.direction === 'expense'),
  }));

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    direction: new FormControl<MovementDirection>('expense', { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  protected open(category: CategoryRecord | null): void {
    this.form.reset({ name: category?.name ?? '', direction: category?.direction ?? 'expense' });
    this.error.set(null);
    this.editing.set(category);
    this.formOpen.set(true);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre de la categoría.' });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const editing = this.editing();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveCategory(editing?.id ?? null, {
        name: this.form.getRawValue().name,
        // Cambiar el tipo movería de lado todos los movimientos que ya la usan.
        direction: editing?.direction ?? this.form.getRawValue().direction,
        active: editing?.active ?? true,
      });
      this.formOpen.set(false);
      await this.reload();
      this.changed.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar la categoría.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(category: CategoryRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);

    try {
      await this.data.saveCategory(category.id, {
        name: category.name,
        direction: category.direction,
        active: !category.active,
      });
      await this.reload();
      this.changed.emit();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el estado de la categoría.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [categories, role] = await Promise.all([this.data.categories(), this.data.currentRole()]);
      this.categories.set(categories);
      this.canEdit.set(role === 'owner');
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar las categorías.'));
    } finally {
      this.loading.set(false);
    }
  }
}
