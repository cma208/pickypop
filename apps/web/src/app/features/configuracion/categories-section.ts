import { Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { CategoryRecord, MovementDirection } from './configuracion.models';
import { errorOf, requiredText } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { CurrentWorkspace } from '../../core/workspace';

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
 *
 * Una categoría de ingreso puede ser «de ventas» (decisión del dueño): la usan
 * los cobros de pedidos y la Venta rápida, y un ingreso suelto de Caja no la
 * ofrece, porque una venta anotada ahí no sale del estante ni lleva su costo.
 *
 * Una categoría puede ser «de capital» (decisión 3c del dueño, T5-06): la usan
 * solo los aportes y retiros del dueño, y un ingreso, un egreso o el cobro de
 * un pedido no la ofrecen. Una de ventas no puede serlo. La base la marca sola
 * por el nombre («Aporte del dueño», «Retiro del dueño»); aquí el dueño la
 * marca o la desmarca a mano.
 *
 * La base aplica las reglas; aquí solo se marca.
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
          desactiva, deja de ofrecerse y sigue explicando los movimientos viejos. Las de ventas son para los cobros de
          pedidos y la Venta rápida: un ingreso suelto de Caja no las ofrece. Las de capital son para los aportes y
          retiros del dueño, y solo para ellos.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar las categorías. Aquí las ves en modo lectura.</p>
        }
        <div class="toolbar">
          @if (canEdit()) {
            <!-- Always there: when it vanished while the form was open, the form's own title took its place and looked like the button. -->
            <button type="button" [class.secondary]="formOpen()" (click)="open(null)">+ Nueva categoría</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar categoría' : 'Datos de la categoría nueva' }}</h3>
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
            @if (isIncome()) {
              <label class="check">
                <input type="checkbox" formControlName="sales" />
                Es de ventas: la usan los cobros de pedidos y la Venta rápida, y un ingreso suelto no la ofrece
              </label>
            }
            <label class="check">
              <input type="checkbox" formControlName="capital" />
              Es de capital: {{ isIncome() ? 'la plata que metes al taller (aportes)' : 'la plata que sacas para ti (retiros)' }}
            </label>
            <p class="muted hint">
              Solo la usan los {{ isIncome() ? 'aportes' : 'retiros' }} del dueño, que no suman ni restan a la utilidad:
              un {{ isIncome() ? 'ingreso, el cobro de un pedido o la Venta rápida' : 'egreso o el pago de una compra' }}
              no la ofrecen. Una categoría de ventas no puede ser de capital. Un nombre como
              «{{ isIncome() ? 'Aporte del dueño' : 'Retiro del dueño' }}» la marca solo.
            </p>
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
                      @if (category.sales) {
                        <pp-badge tone="info">De ventas</pp-badge>
                      }
                      @if (category.capital) {
                        <pp-badge tone="warn">De capital</pp-badge>
                      }
                      <pp-badge [tone]="category.active ? 'good' : 'neutral'">
                        {{ category.active ? 'Activa' : 'Inactiva' }}
                      </pp-badge>
                    </header>
                    @if (canEdit()) {
                      <div class="actions">
                        <button type="button" class="secondary" (click)="open(category)">Editar</button>
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
  private readonly workspace = inject(CurrentWorkspace);
  /** Configuration is the owner's (ADR-025); anyone else reads it. Read from `CurrentWorkspace`, the one place that reads the role. */
  protected readonly canEdit = this.workspace.isOwner;
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
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    direction: new FormControl<MovementDirection>('expense', { nonNullable: true }),
    sales: new FormControl(false, { nonNullable: true }),
    capital: new FormControl(false, { nonNullable: true }),
  });

  private readonly direction = toSignal(this.form.controls.direction.valueChanges, {
    initialValue: this.form.controls.direction.value,
  });
  /** Only an income can be a category of sales: the database refuses it on an expense. */
  protected readonly isIncome = computed(() => this.direction() === 'income');

  constructor() {
    // Sales and capital exclude each other: the database refuses both at once.
    this.form.controls.capital.valueChanges.pipe(takeUntilDestroyed()).subscribe((capital) => {
      if (capital) this.form.controls.sales.setValue(false, { emitEvent: false });
    });
    this.form.controls.sales.valueChanges.pipe(takeUntilDestroyed()).subscribe((sales) => {
      if (sales) this.form.controls.capital.setValue(false, { emitEvent: false });
    });
    void this.reload();
  }

  protected open(category: CategoryRecord | null): void {
    this.form.reset({
      name: category?.name ?? '',
      direction: category?.direction ?? 'expense',
      sales: category?.sales ?? false,
      capital: category?.capital ?? false,
    });
    this.error.set(null);
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

    const editing = this.editing();
    // Cambiar el tipo movería de lado todos los movimientos que ya la usan.
    const direction = editing?.direction ?? this.form.getRawValue().direction;
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveCategory(editing?.id ?? null, {
        name: this.form.getRawValue().name,
        direction,
        active: editing?.active ?? true,
        sales: direction === 'income' && this.form.getRawValue().sales,
        capital: this.form.getRawValue().capital,
      });
      this.formOpen.set(false);
      await this.reload();
      this.changed.emit();
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

  protected async toggle(category: CategoryRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);

    try {
      await this.data.saveCategory(category.id, {
        name: category.name,
        direction: category.direction,
        active: !category.active,
        sales: category.sales,
        capital: category.capital,
      });
      await this.reload();
      this.changed.emit();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el estado de la categoría.'));
      if (await this.workspace.afterRefusal(error)) await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  /** Read again: choosing the category of collections marks it as one of sales in the database. */
  async reload(): Promise<void> {
    try {
      const [categories] = await Promise.all([this.data.categories(), this.workspace.info()]);
      this.categories.set(categories);
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar las categorías.'));
    } finally {
      this.loading.set(false);
    }
  }
}
