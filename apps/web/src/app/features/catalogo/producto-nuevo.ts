import { Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { Card, Field } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { ProductStatus } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf, parseTags, repeatedProductMessage, SLUG_PATTERN, slugify } from './catalogo.util';
import { requiredText, wholeNumber } from '../../core/form-errors';
import { fieldError, LIMITS } from './catalogo.validators';

const LEAD_MESSAGES: Record<string, string> = {
  min: 'No puede ser negativo.',
  integer: 'Escribe días enteros.',
  max: `Hasta ${LIMITS.leadTimeDays} días.`,
};

/** Form that creates a draft product and jumps to its sheet. */
@Component({
  selector: 'app-producto-nuevo',
  imports: [ReactiveFormsModule, Card, Field],
  styles: SHARED_STYLES,
  template: `
    <pp-card heading="Nuevo producto">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="fields wide">
          <pp-field label="Nombre" [required]="true" [error]="nameError()">
            <input formControlName="name" autocomplete="off" />
          </pp-field>
          <pp-field
            label="Identificador (slug)"
            hint="Se arma solo con el nombre; puedes cambiarlo."
            [required]="true"
            [error]="slugError()"
          >
            <input formControlName="slug" autocomplete="off" (input)="slugEdited = true" />
          </pp-field>
        </div>
        <pp-field label="Descripción">
          <textarea formControlName="description" rows="2"></textarea>
        </pp-field>
        <div class="fields">
          <pp-field label="Categoría">
            <input formControlName="category" />
          </pp-field>
          <pp-field label="Etiquetas" hint="Separadas por comas.">
            <input formControlName="tags" />
          </pp-field>
          <pp-field label="Plazo de entrega (días)" [error]="leadError()">
            <input type="number" min="0" step="1" inputmode="numeric" formControlName="leadTimeDays" />
          </pp-field>
        </div>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <div class="bar">
          <button type="submit" [disabled]="busy()">{{ busy() ? 'Creando…' : 'Crear producto' }}</button>
          <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        </div>
      </form>
    </pp-card>
  `,
})
export class ProductoNuevo {
  private readonly data = inject(CatalogoData);
  private readonly router = inject(Router);

  readonly cancelled = output<void>();

  protected slugEdited = false;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The workshop's products, archived ones too, to say a name is taken before saving. */
  private products: { id: string; name: string; status: ProductStatus }[] = [];

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, (control: AbstractControl) => this.repeated(control)],
    }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(SLUG_PATTERN)],
    }),
    description: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
    leadTimeDays: new FormControl<number | null>(null, [Validators.min(0), wholeNumber, Validators.max(LIMITS.leadTimeDays)]),
  });

  constructor() {
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.slugEdited) this.form.controls.slug.setValue(slugify(name));
    });
    void this.loadNames();
  }

  protected nameError(): string | null {
    const control = this.form.controls.name;
    if (!control.touched && !control.dirty) return null;
    if (control.hasError('required')) return 'Escribe el nombre del producto.';
    return (control.getError('repeated') as string | null) ?? null;
  }

  protected slugError(): string | null {
    const control = this.form.controls.slug;
    if (!control.touched || control.valid) return null;
    return 'Usa solo minúsculas, números y guiones (por ejemplo: botella-de-pocion).';
  }

  protected leadError(): string | null {
    return fieldError(this.form.controls.leadTimeDays, LEAD_MESSAGES);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    // A refusal from before goes first: next to a new validation message it
    // read as a second problem (T2-20).
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    try {
      const id = await this.data.createProduct({
        name: value.name,
        slug: value.slug,
        description: value.description,
        category: value.category,
        tags: parseTags(value.tags),
        leadTimeDays: value.leadTimeDays,
      });
      await this.router.navigate(['/catalogo', id]);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos crear el producto.'));
    } finally {
      this.busy.set(false);
    }
  }

  private repeated(control: AbstractControl): ValidationErrors | null {
    const message = repeatedProductMessage(String(control.value ?? ''), this.products);
    return message ? { repeated: message } : null;
  }

  /** Only a warning that comes early: without the list the database still refuses a repeated name. */
  private async loadNames(): Promise<void> {
    try {
      this.products = await this.data.productNames();
      this.form.controls.name.updateValueAndValidity({ emitEvent: false });
    } catch {
      this.products = [];
    }
  }
}
