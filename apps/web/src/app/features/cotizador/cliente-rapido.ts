import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { errorOf, requiredText, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { Field } from '../../ui';
import { ClientesData } from '../clientes/clientes.data';
import { isWalkInName, sameName, WALK_IN_NAME } from '../clientes/customer-match';
import { CurrentWorkspace } from '../../core/workspace';

/** The customer picker's own option that opens «Nuevo cliente» instead of choosing one. */
export const NEW_CUSTOMER = '__nuevo__';

/** A customer as the pickers list them. */
export interface QuickCustomer {
  id: string;
  name: string;
}

/**
 * «+ Nuevo cliente» is an option of the picker, not a customer: choosing it
 * calls `open` and the picker goes back to what it said before. Call it from
 * a constructor or a field: it stops with the component.
 */
export function watchNewCustomerOption(control: FormControl<string>, open: () => void): void {
  let last = control.value;
  control.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
    if (id !== NEW_CUSTOMER) {
      last = id;
      return;
    }
    control.setValue(last);
    open();
  });
}

/**
 * A customer created without leaving what is being written: name and phone.
 * The rest (document, e-mail) is filled in Clientes when an invoice needs it.
 * The quote calculator, accepting a quote and «Nuevo pedido» all use it.
 *
 * Somebody already in the list with that name (any case, any accent) is
 * offered before a second copy is made (T4-10): two people can share a name,
 * so it warns and still lets a new one be created. The walk-in customer's
 * names are refused here as the database refuses them.
 */
@Component({
  selector: 'app-cliente-rapido',
  imports: [ReactiveFormsModule, Field],
  template: `
    <div class="quick" [formGroup]="form">
      <p class="title">Nuevo cliente</p>
      <div class="grid two">
        <pp-field label="Nombre del cliente" [required]="true" [error]="nameError()">
          <input type="text" formControlName="name" autocomplete="off" (keydown.enter)="onEnter($event)" />
        </pp-field>
        <pp-field label="Teléfono" hint="Opcional">
          <input type="tel" formControlName="phone" autocomplete="off" (keydown.enter)="onEnter($event)" />
        </pp-field>
      </div>
      @if (namesWalkIn()) {
        <p class="match" role="status">
          «{{ typed() }}» es el cliente de las ventas al paso, que se cobran en el acto: no puede haber otro. Escribe el
          nombre de la persona.
        </p>
      } @else if (match(); as found) {
        <p class="match" role="status">
          Ya tienes a <strong>{{ found.name }}</strong>.
          <button type="button" class="inline-link" (click)="chosen.emit(found)">Es esa persona: elegirla</button>
        </p>
      }
      @if (failed(); as message) { <p class="error" role="alert">{{ message }}</p> }
      <div class="row">
        <button type="button" (click)="create()" [disabled]="busy() || namesWalkIn()">
          {{ busy() ? 'Creando…' : match() ? 'Crear otro con ese nombre' : 'Crear y elegir' }}
        </button>
        <button type="button" class="secondary" (click)="cancelled.emit()" [disabled]="busy()">Cancelar</button>
      </div>
    </div>
  `,
  styles: `
    .quick { padding: 0.9rem; border: 1px dashed var(--line); border-radius: var(--radius); }
    .title { margin: 0 0 0.6rem; font-weight: 600; font-size: 0.9rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .error { margin: 0 0 0.6rem; }
    .match { margin: -0.2rem 0 0.75rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); background: var(--info-soft); font-size: var(--fs-sm); }
  `,
})
export class ClienteRapido {
  private readonly data = inject(ClientesData);
  private readonly workspace = inject(CurrentWorkspace);

  /** Who is already in the list, to recognise the name being typed. */
  readonly customers = input<readonly QuickCustomer[]>([]);
  /** What the walk-in customer is called in the workshop. */
  readonly walkInName = input(WALK_IN_NAME);

  /** The customer exists now: the screen chooses it. */
  readonly created = output<QuickCustomer>();
  /** It was somebody already in the list: the screen chooses that one. */
  readonly chosen = output<QuickCustomer>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly failed = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, Validators.maxLength(200)],
    }),
    phone: new FormControl('', { nonNullable: true }),
  });

  private readonly name = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });
  protected readonly typed = computed(() => this.name().trim());
  protected readonly namesWalkIn = computed(() => isWalkInName(this.name(), this.walkInName()));
  protected readonly match = computed(() => sameName(this.customers(), this.name()));

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, {
      required: 'Escribe el nombre del cliente: solo espacios no cuenta.',
      maxlength: 'El nombre es demasiado largo.',
    });
  }

  /** Enter creates the customer instead of submitting the form around it. */
  protected onEnter(event: Event): void {
    event.preventDefault();
    void this.create();
  }

  protected async create(): Promise<void> {
    // First: a second click arrives before the button is drawn disabled (T4-10).
    if (this.busy()) return;
    this.form.markAllAsTouched();
    this.failed.set(null);
    if (this.form.invalid || this.namesWalkIn()) return;

    this.busy.set(true);
    try {
      const { name, phone } = this.form.getRawValue();
      this.created.emit(await this.data.createQuick(name, textOrNull(phone)));
      this.form.reset();
    } catch (cause) {
      this.failed.set(friendlyError(cause, 'No pudimos crear el cliente. Inténtalo de nuevo.'));
      void this.workspace.afterRefusal(cause);
    } finally {
      this.busy.set(false);
    }
  }
}
