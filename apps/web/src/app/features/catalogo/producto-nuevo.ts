import { Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Card, Field } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf, parseTags, SLUG_PATTERN, slugify } from './catalogo.util';

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

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(SLUG_PATTERN)],
    }),
    description: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    tags: new FormControl('', { nonNullable: true }),
    leadTimeDays: new FormControl<number | null>(null, [Validators.min(0)]),
  });

  constructor() {
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.slugEdited) this.form.controls.slug.setValue(slugify(name));
    });
  }

  protected nameError(): string | null {
    const control = this.form.controls.name;
    return control.touched && control.invalid ? 'Escribe el nombre del producto.' : null;
  }

  protected slugError(): string | null {
    const control = this.form.controls.slug;
    if (!control.touched || control.valid) return null;
    return 'Usa solo minúsculas, números y guiones (por ejemplo: botella-de-pocion).';
  }

  protected leadError(): string | null {
    return this.form.controls.leadTimeDays.invalid ? 'No puede ser negativo.' : null;
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
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
}
