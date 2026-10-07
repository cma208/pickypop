import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { todayLocal } from '../../core/dates';
import { Card, Field, FORMAT_PIPES, Item } from '../../ui';
import { CotizadorData, DataError, type CustomerOption, type QuoteDetail } from '../cotizador/cotizador.data';
import { acceptPlace } from './quote-hold';
import { PlanService } from '../../core/plan';

/**
 * "El cliente aceptó": shows the order that is about to be created, line by
 * line with its photo, its total and where it goes in the line, asks for the
 * promised date and a note, and creates it. The database does the work in one
 * transaction; this only says it beforehand and takes the person to the order.
 */
@Component({
  selector: 'app-cotizacion-aceptar',
  imports: [ReactiveFormsModule, Card, Field, Item, ...FORMAT_PIPES],
  template: `
    <pp-card heading="El cliente aceptó: se crea este pedido">
      <ul class="lines">
        @for (line of quote().storedLines; track line.id) {
          <li>
            <pp-item
              size="lead"
              kind="product"
              [photo]="{ kind: 'variant', id: line.kind === 'catalog' ? line.variantId : null }"
              [name]="line.description"
              [sub]="line.quantity + ' × ' + (line.unitPrice | money) + (line.kind === 'catalog' ? '' : ' · a medida')"
            >
              <strong end class="num">{{ line.lineTotal | money }}</strong>
            </pp-item>
          </li>
        }
      </ul>
      <p class="total"><span>Total del pedido</span><strong class="num">{{ quote().total | money }}</strong></p>

      <p class="place" [class.keeps]="place().keeps">{{ place().text }}</p>

      <form [formGroup]="form" (ngSubmit)="accept()" novalidate>
        @if (needsCustomer()) {
          <pp-field
            label="¿Quién la aceptó?"
            [required]="true"
            hint="La cotización se hizo sin cliente, y un pedido de venta lo necesita."
            [error]="customerError()"
          >
            <select formControlName="customerId">
              <option value="">Elige un cliente…</option>
              @for (customer of customers(); track customer.id) {
                <option [value]="customer.id">{{ customer.name }}</option>
              }
            </select>
          </pp-field>
        }
        <div class="grid two">
          <pp-field label="Fecha de entrega" hint="Opcional">
            <input type="date" formControlName="dueDate" [min]="today" />
          </pp-field>
          <pp-field label="Nota del pedido" hint="Opcional">
            <input type="text" formControlName="note" autocomplete="off" />
          </pp-field>
        </div>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <div class="row">
          <button type="submit" [disabled]="busy()">{{ busy() ? 'Creando el pedido…' : 'Crear el pedido' }}</button>
          <button type="button" class="ghost" [disabled]="busy()" (click)="cancelled.emit()">Cancelar</button>
        </div>
      </form>
    </pp-card>
  `,
  styles: `
    .lines { list-style: none; margin: 0 0 0.75rem; padding: 0; display: grid; gap: 0.6rem; }
    .total { display: flex; justify-content: space-between; gap: 1rem; margin: 0 0 1rem; padding-top: 0.6rem; border-top: 1px solid var(--line); font-size: var(--fs-lg); }
    .place { margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn); }
    .place.keeps { background: var(--good-soft); color: var(--good); }
  `,
})
export class CotizacionAceptar implements OnInit {
  private readonly data = inject(CotizadorData);
  private readonly planner = inject(PlanService);
  private readonly router = inject(Router);

  readonly quote = input.required<QuoteDetail>();
  readonly cancelled = output<void>();

  protected readonly today = todayLocal();
  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });

  protected readonly needsCustomer = computed(() => this.quote().customerId === null);
  protected readonly place = computed(() => acceptPlace(this.quote().heldAt, this.quote().holdUntil));

  ngOnInit(): void {
    if (!this.needsCustomer()) return;

    this.form.controls.customerId.addValidators(Validators.required);
    this.form.controls.customerId.updateValueAndValidity();
    this.data
      .customers()
      .then((list) => this.customers.set(list))
      .catch(() => this.error.set('No pudimos leer los clientes. Vuelve a abrir este panel.'));
  }

  protected customerError(): string | null {
    const control = this.form.controls.customerId;
    return control.invalid && (control.touched || this.submitted()) ? 'Elige quién aceptó la cotización.' : null;
  }

  protected async accept(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const { customerId, dueDate, note } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);

    try {
      const order = await this.data.acceptQuote({
        quoteId: this.quote().id,
        dueDate: dueDate || null,
        note: note.trim() || null,
        customerId: this.needsCustomer() ? customerId : null,
      });
      this.planner.invalidate();
      await this.router.navigate(['/pedidos', order.id]);
    } catch (cause) {
      this.error.set(cause instanceof DataError ? cause.message : 'No pudimos crear el pedido.');
      this.busy.set(false);
    }
  }
}
