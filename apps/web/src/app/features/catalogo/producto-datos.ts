import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, ImageField } from '../../ui';
import { CatalogoData } from './catalogo.data';
import { STATUS_LABELS, type ProductDetail, type ProductStatus } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf, pairArray, parseTags, readPairs, SLUG_PATTERN } from './catalogo.util';
import { PairsEditor } from './pairs-editor';

const STATUSES: ProductStatus[] = ['draft', 'published', 'archived'];

/** The product's own data and its technical sheet, saved together. */
@Component({
  selector: 'app-producto-datos',
  imports: [ReactiveFormsModule, Card, Field, ImageField, PairsEditor],
  styles: SHARED_STYLES,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" (input)="justSaved.set(false)" novalidate class="stack">
      <pp-card heading="Datos del producto">
        <pp-field label="Foto" hint="La que identifica al producto en todas las listas.">
          <pp-image-field
            folder="productos"
            [path]="imagePath()"
            [name]="form.controls.name.value"
            (changed)="setImage($event)"
          />
        </pp-field>
        <div class="fields wide">
          <pp-field label="Nombre" [required]="true" [error]="invalid('name') ? 'Escribe el nombre.' : null">
            <input formControlName="name" autocomplete="off" />
          </pp-field>
          <pp-field
            label="Identificador (slug)"
            hint="Cambiarlo rompe los enlaces que ya compartiste."
            [required]="true"
            [error]="invalid('slug') ? 'Solo minúsculas, números y guiones.' : null"
          >
            <input formControlName="slug" autocomplete="off" />
          </pp-field>
        </div>
        <pp-field label="Descripción">
          <textarea formControlName="description" rows="3"></textarea>
        </pp-field>
        <div class="fields">
          <pp-field label="Categoría">
            <input formControlName="category" />
          </pp-field>
          <pp-field label="Etiquetas" hint="Separadas por comas.">
            <input formControlName="tags" />
          </pp-field>
          <pp-field label="Plazo de entrega (días)" [error]="invalid('leadTimeDays') ? 'No puede ser negativo.' : null">
            <input type="number" min="0" step="1" inputmode="numeric" formControlName="leadTimeDays" />
          </pp-field>
          <pp-field label="Estado">
            <select formControlName="status">
              @for (status of statuses; track status) {
                <option [value]="status">{{ labels[status] }}</option>
              }
            </select>
          </pp-field>
        </div>
        <label class="check">
          <input type="checkbox" formControlName="botVisible" />
          Visible para el bot del catálogo
        </label>
      </pp-card>

      <pp-card heading="Ficha técnica">
        <p class="muted hint">
          Atributos libres del producto: dimensiones, acabado, cuidados, si es personalizable…
        </p>
        <app-pairs-editor
          [array]="form.controls.specs"
          nameLabel="Atributo"
          valueLabel="Valor"
          namePlaceholder="Ej. Dimensiones"
          valuePlaceholder="Ej. 12 × 6 cm"
          addLabel="Agregar atributo"
          emptyText="Todavía no hay atributos en la ficha."
        />
      </pp-card>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="bar">
        <button type="submit" [disabled]="busy() || form.pristine">
          {{ busy() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
        @if (form.dirty) {
          <button type="button" class="secondary" (click)="discard()">Descartar</button>
        }
        @if (justSaved() && form.pristine) {
          <span class="ok" role="status">Guardado</span>
        }
      </div>
    </form>
  `,
})
export class ProductoDatos {
  private readonly data = inject(CatalogoData);

  readonly product = input.required<ProductDetail>();
  readonly saved = output<void>();

  protected readonly statuses = STATUSES;
  protected readonly labels = STATUS_LABELS;
  protected readonly busy = signal(false);
  protected readonly justSaved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly imagePath = signal<string | null>(null);

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
    status: new FormControl<ProductStatus>('draft', { nonNullable: true }),
    botVisible: new FormControl(false, { nonNullable: true }),
    specs: pairArray([]),
  });

  constructor() {
    // Follow the product after a reload, but never overwrite what is being typed.
    effect(() => {
      const product = this.product();
      untracked(() => {
        this.imagePath.set(product.imagePath);
        if (!this.form.dirty) this.fill(product);
      });
    });
  }

  protected async setImage(path: string | null): Promise<void> {
    this.imagePath.set(path);
    try {
      await this.data.setProductImage(this.product().id, path);
      this.saved.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la foto.'));
    }
  }

  protected invalid(name: 'name' | 'slug' | 'leadTimeDays'): boolean {
    const control = this.form.controls[name];
    return control.touched && control.invalid;
  }

  protected discard(): void {
    this.fill(this.product());
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.updateProduct(this.product().id, {
        name: value.name,
        slug: value.slug,
        description: value.description,
        category: value.category,
        tags: parseTags(value.tags),
        leadTimeDays: value.leadTimeDays,
        status: value.status,
        botVisible: value.botVisible,
        specs: readPairs(this.form.controls.specs),
      });
      this.form.markAsPristine();
      this.justSaved.set(true);
      this.saved.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar el producto.'));
    } finally {
      this.busy.set(false);
    }
  }

  private fill(product: ProductDetail): void {
    const specs = this.form.controls.specs;
    specs.clear();
    pairArray(product.specs).controls.forEach((group) => specs.push(group));

    this.form.patchValue({
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: product.category,
      tags: product.tags.join(', '),
      leadTimeDays: product.leadTimeDays,
      status: product.status,
      botVisible: product.botVisible,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}
