import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { roundMoney } from '../../core/pricing';
import { AsyncState, Card, Field, FORMAT_PIPES, Page } from '../../ui';
import { createOrderLineForm, PedidoLinea } from './pedido-linea';
import {
  PedidosData,
  type CustomerOption,
  type GiftCategoryOption,
  type NewOrder,
  type VariantOption,
} from './pedidos.data';
import { explainError } from './pedidos.errors';
import { PURPOSE_HELP, PURPOSE_LABEL, PURPOSES, type OrderPurpose } from './pedidos.labels';

@Component({
  selector: 'app-pedido-nuevo',
  imports: [ReactiveFormsModule, RouterLink, Page, Card, Field, AsyncState, PedidoLinea, ...FORMAT_PIPES],
  template: `
    <pp-page title="Nuevo pedido" subtitle="El número se asigna al guardar">
      <a actions routerLink="/pedidos"><button type="button" class="secondary">Volver</button></a>

      <pp-async [loading]="loading()" [error]="loadError()">
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <pp-card heading="Propósito">
            <fieldset class="purposes">
              <legend class="muted">¿Para qué es este pedido?</legend>
              @for (option of purposes; track option) {
                <label class="purpose" [class.chosen]="purpose() === option">
                  <input type="radio" formControlName="purpose" [value]="option" />
                  <span>
                    <strong>{{ purposeLabel[option] }}</strong>
                    <small class="muted">{{ purposeHelp[option] }}</small>
                  </span>
                </label>
              }
            </fieldset>

            @if (purpose() === 'sale') {
              <pp-field label="Cliente" [required]="true" [error]="controlError('customerId', 'Elige el cliente de esta venta o crea uno nuevo.')">
                <select formControlName="customerId">
                  <option value="">Elige un cliente…</option>
                  @for (customer of customers(); track customer.id) {
                    <option [value]="customer.id">{{ customer.name }}</option>
                  }
                </select>
              </pp-field>
              @if (quickOpen()) {
                <div class="quick" [formGroup]="quickCustomer">
                  <pp-field label="Nombre del cliente" [required]="true" [error]="quickError()">
                    <input type="text" formControlName="name" autocomplete="off" />
                  </pp-field>
                  <pp-field label="Teléfono" hint="Opcional">
                    <input type="tel" formControlName="phone" autocomplete="off" />
                  </pp-field>
                  <div class="row">
                    <button type="button" (click)="createCustomer()" [disabled]="quickBusy()">
                      {{ quickBusy() ? 'Creando…' : 'Crear y elegir' }}
                    </button>
                    <button type="button" class="secondary" (click)="quickOpen.set(false)">Cancelar</button>
                  </div>
                </div>
              } @else {
                <button type="button" class="secondary" (click)="quickOpen.set(true)">+ Crear cliente rápido</button>
              }
            }

            @if (purpose() === 'gift') {
              <pp-field label="Categoría del regalo" [required]="true" [error]="controlError('giftCategoryId', 'Elige la categoría del regalo: define cómo se cuenta en las finanzas.')">
                <select formControlName="giftCategoryId">
                  <option value="">Elige una categoría…</option>
                  @for (category of categories(); track category.id) {
                    <option [value]="category.id">{{ category.name }}</option>
                  }
                </select>
              </pp-field>
            }

            @if (purpose() !== 'sale') {
              <pp-field [label]="purpose() === 'gift' ? 'Para quién es el regalo' : 'Para qué o para quién'" hint="Opcional">
                <input type="text" formControlName="recipient" autocomplete="off" />
              </pp-field>
            }

            <div class="grid two">
              <pp-field label="Fecha de entrega" hint="Opcional">
                <input type="date" formControlName="dueDate" />
              </pp-field>
              <pp-field label="Nota" hint="Opcional">
                <input type="text" formControlName="note" autocomplete="off" />
              </pp-field>
            </div>
          </pp-card>

          <pp-card heading="Líneas">
            <div class="lines">
              @for (line of lines.controls; track line; let i = $index) {
                <app-pedido-linea
                  [group]="line"
                  [variants]="variants()"
                  [index]="i"
                  [isSale]="purpose() === 'sale'"
                  [removable]="lines.length > 1"
                  [showErrors]="submitted()"
                  (remove)="removeLine(i)"
                />
              }
            </div>
            <button type="button" class="secondary add" (click)="addLine()">+ Agregar línea</button>
          </pp-card>

          <pp-card heading="Resumen">
            @if (purpose() === 'sale') {
              <p class="sum"><span>Total de la venta</span><strong>{{ saleTotal() | money }}</strong></p>
              <p class="sum muted"><span>Costo estimado</span><span>{{ estimatedTotal() | money }}</span></p>
              @if (saleTotal() > 0 && estimatedTotal() > 0) {
                <p class="sum muted"><span>Ganancia estimada</span><span>{{ saleTotal() - estimatedTotal() | money }}</span></p>
              }
            } @else {
              <p class="sum"><span>Total</span><strong>{{ 0 | money }}</strong></p>
              <p class="sum"><span>Costo estimado</span><strong>{{ estimatedTotal() | money }}</strong></p>
              <p class="muted note">
                Este pedido no lleva precio. El costo estimado es lo que te cuesta producirlo, con la receta y los parámetros de hoy.
              </p>
            }
            @if (saveError(); as message) { <p class="error" role="alert">{{ message }}</p> }
            <div class="row">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar pedido' }}</button>
              <a routerLink="/pedidos"><button type="button" class="secondary">Cancelar</button></a>
            </div>
          </pp-card>
        </form>
      </pp-async>
    </pp-page>
  `,
  styles: `
    form { display: grid; gap: 1rem; }
    fieldset { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.5rem; }
    legend { font-size: 0.85rem; margin-bottom: 0.4rem; padding: 0; }
    .purpose {
      display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.7rem 0.8rem;
      border: 1px solid var(--line); border-radius: 10px; cursor: pointer;
    }
    .purpose.chosen { border-color: var(--accent); background: var(--accent-soft); }
    .purpose input { width: auto; margin-top: 0.25rem; }
    .purpose span { display: grid; gap: 0.1rem; }
    .quick { padding: 0.9rem; margin-bottom: 0.9rem; border: 1px dashed var(--line); border-radius: 10px; }
    .lines { display: grid; gap: 0.75rem; margin-bottom: 0.75rem; }
    .sum { display: flex; justify-content: space-between; gap: 1rem; margin: 0 0 0.4rem; }
    .note { font-size: 0.85rem; margin: 0.5rem 0 1rem; }
  `,
})
export class PedidoNuevoPage {
  private readonly data = inject(PedidosData);
  private readonly router = inject(Router);

  protected readonly purposes = PURPOSES;
  protected readonly purposeLabel = PURPOSE_LABEL;
  protected readonly purposeHelp = PURPOSE_HELP;

  protected readonly form = new FormGroup({
    purpose: new FormControl<OrderPurpose>('sale', { nonNullable: true }),
    customerId: new FormControl('', { nonNullable: true }),
    giftCategoryId: new FormControl('', { nonNullable: true }),
    recipient: new FormControl('', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
    lines: new FormArray([createOrderLineForm()]),
  });

  protected readonly quickCustomer = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true }),
  });

  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly categories = signal<GiftCategoryOption[]>([]);
  protected readonly variants = signal<VariantOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly quickOpen = signal(false);
  protected readonly quickBusy = signal(false);
  protected readonly quickFailed = signal<string | null>(null);

  private readonly changes = toSignal(this.form.valueChanges);
  protected readonly purpose = computed(() => {
    this.changes();
    return this.form.controls.purpose.value;
  });
  protected readonly saleTotal = computed(() => this.sum((line) => line.unitPrice * line.quantity));
  protected readonly estimatedTotal = computed(() =>
    this.sum((line) => (line.estimatedUnitCost ?? 0) * line.quantity),
  );

  constructor() {
    this.form.controls.purpose.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((purpose) => this.applyPurposeRules(purpose));
    this.applyPurposeRules('sale');
    void this.load();
  }

  protected get lines(): FormArray<ReturnType<typeof createOrderLineForm>> {
    return this.form.controls.lines;
  }

  protected addLine(): void {
    this.lines.push(createOrderLineForm());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  protected controlError(name: 'customerId' | 'giftCategoryId', message: string): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted()) ? message : null;
  }

  protected quickError(): string | null {
    const name = this.quickCustomer.controls.name;
    return this.quickFailed() ?? (name.invalid && name.touched ? 'Escribe el nombre del cliente.' : null);
  }

  protected async createCustomer(): Promise<void> {
    this.quickCustomer.markAllAsTouched();
    this.quickFailed.set(null);
    if (this.quickCustomer.invalid) return;

    this.quickBusy.set(true);
    try {
      const { name, phone } = this.quickCustomer.getRawValue();
      const customer = await this.data.createCustomer(name, phone.trim() || null);
      this.customers.update((list) => [...list, customer].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      this.form.controls.customerId.setValue(customer.id);
      this.quickCustomer.reset();
      this.quickOpen.set(false);
    } catch (error) {
      this.quickFailed.set(explainError(error, 'No pudimos crear el cliente. Inténtalo de nuevo.'));
    } finally {
      this.quickBusy.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.saveError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.saveError.set('Revisa los campos marcados en rojo antes de guardar.');
      return;
    }

    this.saving.set(true);
    let created: { id: string };
    try {
      created = await this.data.createOrder(this.toNewOrder());
    } catch (error) {
      this.saveError.set(explainError(error, 'No pudimos guardar el pedido. Inténtalo de nuevo.'));
      this.saving.set(false);
      return;
    }

    try {
      await this.router.navigate(['/pedidos', created.id]);
    } catch {
      this.saveError.set('El pedido se guardó, pero no pudimos abrirlo. Búscalo en la lista de pedidos.');
    } finally {
      this.saving.set(false);
    }
  }

  /** The database rules, mirrored here so the form asks for what is needed. */
  private applyPurposeRules(purpose: OrderPurpose): void {
    const { customerId, giftCategoryId } = this.form.controls;
    this.setRequired(customerId, purpose === 'sale');
    this.setRequired(giftCategoryId, purpose === 'gift');
  }

  private setRequired(control: FormControl<string>, required: boolean): void {
    if (required) control.addValidators(Validators.required);
    else control.removeValidators(Validators.required);
    control.updateValueAndValidity({ emitEvent: false });
  }

  private sum(amount: (line: { unitPrice: number; quantity: number; estimatedUnitCost: number | null }) => number): number {
    this.changes();
    const total = this.lines.getRawValue().reduce((sum, line) => sum + amount(line), 0);
    return roundMoney(total);
  }

  private toNewOrder(): NewOrder {
    const value = this.form.getRawValue();
    const names = new Map(this.variants().map((variant) => [variant.id, variant.label]));

    return {
      purpose: value.purpose,
      customerId: value.purpose === 'sale' ? value.customerId : null,
      giftCategoryId: value.purpose === 'gift' ? value.giftCategoryId : null,
      recipient: value.purpose === 'sale' ? null : value.recipient.trim() || null,
      dueDate: value.dueDate || null,
      note: value.note.trim() || null,
      lines: value.lines.map((line) => ({
        variantId: line.variantId,
        description: names.get(line.variantId) ?? 'Producto',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        estimatedUnitCost: line.estimatedUnitCost ?? 0,
      })),
    };
  }

  private async load(): Promise<void> {
    try {
      const [customers, categories, variants] = await Promise.all([
        this.data.customers(),
        this.data.giftCategories(),
        this.data.variants(),
      ]);
      this.customers.set(customers);
      this.categories.set(categories);
      this.variants.set(variants);
    } catch (error) {
      this.loadError.set(explainError(error, 'No pudimos cargar los clientes y el catálogo. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}
