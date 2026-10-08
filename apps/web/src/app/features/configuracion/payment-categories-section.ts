import { Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AsyncState, Card, Field } from '../../ui';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { isOwnerRole } from '../../core/workspace';
import { ConfiguracionData } from './configuracion.data';
import type { CategoryRecord } from './configuracion.models';

const AUTOMATIC = '';

/** What «Categorías por defecto» offers: active, and not of capital. */
export function defaultCategoryOptions(categories: readonly CategoryRecord[]): CategoryRecord[] {
  return categories.filter((category) => category.active && !category.capital);
}

/**
 * En qué categoría de Caja queda un cobro y un pago de compra cuando nadie
 * elige otra. Antes quedaban sin categoría, y las que el taller ya tenía no se
 * usaban solas (recorrido desde cero, H38). La base la aplica al escribir el
 * movimiento; aquí solo se elige cuál.
 */
@Component({
  selector: 'app-payment-categories-section',
  imports: [ReactiveFormsModule, Card, Field, AsyncState],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Categorías por defecto">
        <p class="muted">
          Dónde queda anotado cada cobro de un pedido y cada pago de una compra cuando nadie elige otra categoría al
          registrarlo. En «Automática», si el taller tiene una sola categoría activa de ese tipo se usa esa, y si tiene
          varias queda sin categoría. La de los cobros queda marcada como de ventas: un ingreso suelto de Caja no la
          ofrece. Las de capital no se ofrecen: son de los aportes y retiros del dueño, y la base no deja elegirlas
          aquí.
        </p>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="grid two">
            <pp-field label="Para cobros de pedidos" hint="Una categoría de ingreso.">
              <select formControlName="orderCategoryId">
                <option [value]="automatic">Automática</option>
                @for (category of incomeCategories(); track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </pp-field>
            <pp-field label="Para pagos de compras" hint="Una categoría de egreso.">
              <select formControlName="purchaseCategoryId">
                <option [value]="automatic">Automática</option>
                @for (category of expenseCategories(); track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </pp-field>
          </div>
          @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
          @if (saved()) { <p role="status">Guardado. Los próximos cobros y pagos ya usan estas categorías.</p> }
          @if (canEdit()) {
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar categorías por defecto' }}</button>
            </div>
          } @else {
            <p class="notice warn">Solo el dueño del taller puede cambiarlas.</p>
          }
        </form>
      </pp-card>
    </pp-async>
  `,
})
export class PaymentCategoriesSection {
  private readonly data = inject(ConfiguracionData);

  /** Saved: the category chosen for collections is now one of sales, and the list below shows it. */
  readonly defaultsSaved = output<void>();

  protected readonly automatic = AUTOMATIC;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly incomeCategories = signal<CategoryRecord[]>([]);
  protected readonly expenseCategories = signal<CategoryRecord[]>([]);

  protected readonly form = new FormGroup({
    orderCategoryId: new FormControl(AUTOMATIC, { nonNullable: true }),
    purchaseCategoryId: new FormControl(AUTOMATIC, { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  /** The list of categories above changed: the options are read again, and what was chosen is kept if it still exists. */
  async reload(): Promise<void> {
    try {
      const [categories, choice, role] = await Promise.all([
        this.data.categories(),
        this.data.paymentCategories(),
        this.data.currentRole(),
      ]);
      // A deactivated category is not offered, so a choice that points at one is shown as automatic. Nor one of
      // capital: a collection is a sale and a purchase is an expense, and the database refuses it for either.
      const offered = defaultCategoryOptions(categories);
      this.incomeCategories.set(offered.filter((category) => category.direction === 'income'));
      this.expenseCategories.set(offered.filter((category) => category.direction === 'expense'));
      this.form.setValue({
        orderCategoryId: this.stillOffered(choice.orderCategoryId, this.incomeCategories()),
        purchaseCategoryId: this.stillOffered(choice.purchaseCategoryId, this.expenseCategories()),
      });
      this.canEdit.set(isOwnerRole(role));
      if (isOwnerRole(role)) this.form.enable();
      else this.form.disable();
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar las categorías por defecto.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.canEdit()) return;

    const { orderCategoryId, purchaseCategoryId } = this.form.getRawValue();
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.data.savePaymentCategories({
        orderCategoryId: orderCategoryId || null,
        purchaseCategoryId: purchaseCategoryId || null,
      });
      this.saved.set(true);
      this.defaultsSaved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar las categorías por defecto.'));
      if (await this.data.afterRefusal(error)) await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private stillOffered(id: string | null, offered: CategoryRecord[]): string {
    return id !== null && offered.some((category) => category.id === id) ? id : AUTOMATIC;
  }
}
