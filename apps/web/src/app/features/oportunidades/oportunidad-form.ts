import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { errorOf, textOrNull } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Field } from '../../ui';
import { OportunidadesData, type CustomerOption, type MemberOption, type OpportunityCard } from './oportunidades.data';

/** Alta y edición de un trato. La etapa no se toca aquí: se mueve en el tablero. */
@Component({
  selector: 'app-oportunidad-form',
  imports: [ReactiveFormsModule, Field],
  styles: SECTION_STYLES,
  template: `
    <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
      <h3>{{ opportunity() ? 'Editar trato' : 'Nuevo trato' }}</h3>

      <pp-field
        label="De qué va el trato"
        [required]="true"
        hint="Lo que diría el cliente. Ej.: souvenirs para la promoción 2026."
        [error]="titleError()"
      >
        <input formControlName="title" autocomplete="off" />
      </pp-field>

      <div class="grid two">
        <pp-field label="Cliente">
          <select formControlName="customerId">
            <option value="">Sin cliente todavía</option>
            @for (customer of customers(); track customer.id) {
              <option [value]="customer.id">{{ customer.name }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Quién lo lleva">
          <select formControlName="owner">
            <option value="">Sin asignar</option>
            @for (member of members(); track member.userId) {
              <option [value]="member.userId">{{ member.name }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Para cuándo se decide" hint="La fecha en la que esperas una respuesta.">
          <input type="date" formControlName="expectedClose" />
        </pp-field>
      </div>

      <pp-field
        label="Esperando algo"
        hint="Si el trato está trabado, escribe por qué. Ej.: esperando el adelanto del 50 %. La marca se ve en la tarjeta esté en la etapa que esté."
      >
        <input formControlName="blockedReason" autocomplete="off" />
      </pp-field>

      <pp-field label="Notas">
        <textarea rows="3" formControlName="note"></textarea>
      </pp-field>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="form-actions">
        <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar trato' }}</button>
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class OportunidadForm {
  private readonly data = inject(OportunidadesData);

  readonly opportunity = input<OpportunityCard | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly members = signal<MemberOption[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    customerId: new FormControl('', { nonNullable: true }),
    owner: new FormControl('', { nonNullable: true }),
    expectedClose: new FormControl('', { nonNullable: true }),
    blockedReason: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    void this.loadOptions();

    const opportunity = this.opportunity();
    if (!opportunity) return;

    this.form.setValue({
      title: opportunity.title,
      customerId: opportunity.customerId ?? '',
      owner: opportunity.owner ?? '',
      expectedClose: opportunity.expectedClose ? isoDay(opportunity.expectedClose) : '',
      blockedReason: opportunity.blockedReason ?? '',
      note: opportunity.note ?? '',
    });
  }

  protected titleError(): string | null {
    return errorOf(this.form.controls.title, { required: 'Escribe de qué va el trato.' });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.save(this.opportunity()?.id ?? null, {
        title: value.title,
        customerId: textOrNull(value.customerId),
        owner: textOrNull(value.owner),
        expectedClose: textOrNull(value.expectedClose),
        note: textOrNull(value.note),
        blockedReason: textOrNull(value.blockedReason),
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el trato. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      const [customers, members] = await Promise.all([this.data.customers(), this.data.members()]);
      this.customers.set(customers);
      this.members.set(members);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los clientes ni los miembros del taller.'));
    }
  }
}

/** "YYYY-MM-DD" para un <input type="date">, en hora local. */
function isoDay(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}
