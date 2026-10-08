import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Field } from '../../ui';
import { sameCustomer, type CustomerChoice, type SaleCustomer } from './quick-sale';

/**
 * The name the walk-in customer has until the workshop creates or renames
 * it: the people who buy on the way past (the owner's decision). The
 * database names it the same in `app.walk_in_customer`.
 */
export const WALK_IN_NAME = 'Clientes varios';

export type QuickCustomerForm = FormGroup<{
  customerId: FormControl<string>;
  name: FormControl<string>;
  phone: FormControl<string>;
}>;

export function createQuickCustomer(): QuickCustomerForm {
  return new FormGroup({
    customerId: new FormControl('', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
  });
}

/**
 * Who the sale is for, and only if it matters: left alone it goes to the
 * walk-in customer. A name and a phone keep the contact (the customer is
 * created with the sale), and somebody already in the list is recognised
 * before a second copy of them is made.
 */
@Component({
  selector: 'app-venta-rapida-cliente',
  imports: [ReactiveFormsModule, Field],
  template: `
    <div [formGroup]="group()">
      <pp-field label="Cliente" [hint]="customerHint()">
        <select formControlName="customerId">
          <option value="">{{ walkInName() }}</option>
          @for (customer of people(); track customer.id) {
            <option [value]="customer.id">{{ customer.name }}{{ customer.phone ? ' · ' + customer.phone : '' }}</option>
          }
        </select>
      </pp-field>

      @if (!values().customerId) {
        <div class="contact">
          <pp-field label="Nombre" [required]="owes()" [hint]="owes() ? 'Queda saldo por cobrar: di quién te debe' : 'Opcional: para no perder el contacto'">
            <input type="text" formControlName="name" autocomplete="off" />
          </pp-field>
          <pp-field label="Teléfono" hint="Opcional">
            <input type="tel" formControlName="phone" autocomplete="off" inputmode="tel" />
          </pp-field>
        </div>
        @if (match(); as found) {
          <p class="match" role="status">
            Ya tienes a <strong>{{ found.name }}</strong>{{ found.phone ? ' (' + found.phone + ')' : '' }}.
            <button type="button" class="inline-link" (click)="choose(found)">Es esa persona: elegirla</button>
          </p>
        } @else if (values().name.trim()) {
          <p class="muted small">Se crea como cliente nuevo al vender.</p>
        }
      }
    </div>
  `,
  styles: `
    .contact { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 0.75rem; }
    .match { margin: -0.4rem 0 0.9rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); background: var(--info-soft); font-size: var(--fs-sm); }
    .small { margin: -0.4rem 0 0.9rem; font-size: var(--fs-xs); }
  `,
})
export class VentaRapidaCliente implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly group = input.required<QuickCustomerForm>();
  readonly customers = input.required<CustomerChoice[]>();
  /** Something stays in «Por cobrar»: then somebody has to owe it, and the name stops being optional. */
  readonly owes = input(false);

  protected readonly values = signal<SaleCustomer>({ customerId: '', name: '', phone: '' });

  /** The walk-in customer is the empty choice, not one more name in the list. */
  protected readonly people = computed(() => this.customers().filter((customer) => !customer.walkIn));
  protected readonly walkInName = computed(
    () => this.customers().find((customer) => customer.walkIn)?.name ?? WALK_IN_NAME,
  );
  protected readonly customerHint = computed(() =>
    this.owes()
      ? `Queda saldo por cobrar: elige quién te debe, o escribe su nombre. A nombre de «${this.walkInName()}» no habría a quién cobrárselo.`
      : `Opcional. Sin cliente, la venta queda a nombre de «${this.walkInName()}».`,
  );
  protected readonly match = computed(() => {
    const { name, phone } = this.values();
    return sameCustomer(this.customers(), name, phone);
  });

  ngOnInit(): void {
    const group = this.group();
    this.values.set(group.getRawValue());
    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.values.set(group.getRawValue()));
    // Somebody from the list is the customer: what was typed for a new one would be misleading next to it.
    group.controls.customerId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      if (id) group.patchValue({ name: '', phone: '' });
    });
  }

  protected choose(customer: CustomerChoice): void {
    this.group().patchValue({ customerId: customer.id, name: '', phone: '' });
  }
}
