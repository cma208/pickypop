import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Card, Field, ImageField } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Variant } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { blankToNull, messageOf, pairArray, readPairs } from './catalogo.util';
import { PairsEditor } from './pairs-editor';

/** Creates a variant, or edits the one it receives. */
@Component({
  selector: 'app-variante-form',
  imports: [ReactiveFormsModule, Card, Field, ImageField, PairsEditor],
  styles: SHARED_STYLES,
  template: `
    <pp-card [heading]="variant() ? 'Datos de la variante' : 'Nueva variante'">
      <form [formGroup]="form" (ngSubmit)="save()" (input)="justSaved.set(false)" novalidate>
        <pp-field
          label="Foto"
          hint="Del producto terminado tal como sale esta variante. Si no pones una, se usa la del producto."
        >
          <pp-image-field
            folder="variantes"
            [path]="imagePath()"
            [name]="form.controls.name.value"
            (changed)="setImage($event)"
          />
        </pp-field>
        <div class="fields wide">
          <pp-field label="Nombre" [required]="true" [error]="invalid('name') ? 'Escribe el nombre.' : null">
            <input formControlName="name" autocomplete="off" placeholder="Ej. Con dulces surtidos" />
          </pp-field>
          <pp-field
            label="Código interno (SKU)"
            hint="Opcional. Para etiquetar la caja del estante y encontrarla sin leer el nombre entero."
          >
            <div class="row">
              <input formControlName="skuCode" autocomplete="off" placeholder="Ej. BOT-POC-ROJ" />
              <button type="button" class="secondary" (click)="suggestSku()">Sugerir</button>
            </div>
          </pp-field>
        </div>
        <div class="fields">
          <pp-field
            label="Precio de lista (S/)"
            hint="Precio de una unidad. Los descuentos por cantidad van en la escalera."
            [error]="invalid('listPrice') ? 'No puede ser negativo.' : null"
          >
            <input type="number" min="0" step="0.01" inputmode="decimal" formControlName="listPrice" />
          </pp-field>
          <pp-field
            label="Mínimo de unidades"
            hint="Pedido mínimo aceptado, si lo hay."
            [error]="invalid('minOrderUnits') ? 'Debe ser un entero desde 1.' : null"
          >
            <input type="number" min="1" step="1" inputmode="numeric" formControlName="minOrderUnits" />
          </pp-field>
        </div>
        <label class="check">
          <input type="checkbox" formControlName="active" />
          Variante activa (se puede vender)
        </label>

        <p class="muted hint">Opciones que distinguen a esta variante: color, tamaño, relleno…</p>
        <app-pairs-editor
          [array]="form.controls.options"
          nameLabel="Opción"
          valueLabel="Valor"
          namePlaceholder="Ej. Relleno"
          valuePlaceholder="Ej. dulces surtidos"
          addLabel="Agregar opción"
          emptyText="Sin opciones."
        />

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <div class="bar">
          <button type="submit" [disabled]="busy() || (variant() !== null && form.pristine)">
            {{ busy() ? 'Guardando…' : variant() ? 'Guardar variante' : 'Crear variante' }}
          </button>
          @if (!variant()) {
            <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
          }
          @if (justSaved() && form.pristine) {
            <span class="ok" role="status">Guardado</span>
          }
          @if (variant()) {
            <button type="button" class="secondary" [disabled]="busy()" (click)="duplicate()">Duplicar</button>
          }
          <span class="grow"></span>
          @if (variant()) {
            <button type="button" class="danger" [disabled]="busy()" (click)="remove()">Eliminar variante</button>
          }
        </div>
      </form>
    </pp-card>
  `,
})
export class VarianteForm {
  private readonly data = inject(CatalogoData);

  readonly productId = input.required<string>();
  /** Only to suggest a code; the form works without it. */
  readonly productSlug = input<string>('');
  readonly variant = input<Variant | null>(null);
  /** Emits the id of the variant that was created or saved. */
  readonly saved = output<string>();
  readonly removed = output<void>();
  /** Emits the id of the copy. */
  readonly duplicated = output<string>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly justSaved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly imagePath = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    skuCode: new FormControl('', { nonNullable: true }),
    listPrice: new FormControl<number | null>(null, [Validators.min(0)]),
    minOrderUnits: new FormControl<number | null>(null, [Validators.min(1), Validators.pattern(/^\d+$/)]),
    active: new FormControl(true, { nonNullable: true }),
    options: pairArray([]),
  });

  constructor() {
    effect(() => {
      const variant = this.variant();
      untracked(() => {
        this.imagePath.set(variant?.imagePath ?? null);
        if (!this.form.dirty) this.fill(variant);
      });
    });
  }

  /**
   * A new variant has no id yet, so its picture can only travel with the save.
   * An existing one saves it on the spot, like the product does.
   */
  protected async setImage(path: string | null): Promise<void> {
    this.imagePath.set(path);
    const current = this.variant();
    if (!current) {
      this.form.markAsDirty();
      return;
    }
    try {
      await this.data.setVariantImage(current.id, path);
      this.saved.emit(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la foto.'));
    }
  }

  /** The code nobody wants to invent: product and variant, shortened. */
  protected suggestSku(): void {
    const parts = [this.productSlug(), this.form.controls.name.value]
      .map((part) => code(part))
      .filter(Boolean);
    if (parts.length === 0) return;
    this.form.controls.skuCode.setValue(parts.join('-'));
    this.form.markAsDirty();
  }

  protected invalid(name: 'name' | 'listPrice' | 'minOrderUnits'): boolean {
    const control = this.form.controls[name];
    return control.touched && control.invalid;
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    const input = {
      name: value.name,
      skuCode: blankToNull(value.skuCode),
      listPrice: value.listPrice,
      minOrderUnits: value.minOrderUnits,
      active: value.active,
      options: readPairs(this.form.controls.options),
      imagePath: this.imagePath(),
    };

    this.busy.set(true);
    this.error.set(null);
    try {
      const current = this.variant();
      const id = current
        ? (await this.data.updateVariant(current.id, input), current.id)
        : await this.data.createVariant(this.productId(), input);
      this.form.markAsPristine();
      this.justSaved.set(true);
      this.saved.emit(id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar la variante.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Two variants of the same bottle differ in the colour and little else, so
   * loading the second one from scratch is the most repeated work in the
   * catalogue — and the easiest to get subtly wrong.
   */
  protected async duplicate(): Promise<void> {
    const current = this.variant();
    if (!current || this.busy()) return;

    const name = prompt('Nombre de la copia:', `${current.name} (copia)`);
    if (name === null || name.trim() === '') return;

    this.busy.set(true);
    this.error.set(null);
    try {
      this.duplicated.emit(await this.data.duplicateVariant(current.id, name.trim()));
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos duplicar la variante.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.variant();
    if (!current) return;
    const sure = confirm(
      `¿Eliminar la variante "${current.name}"? También se borrarán su receta y su escalera de precios. No se puede deshacer.`,
    );
    if (!sure) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteVariant(current.id);
      this.removed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos eliminar la variante.'));
    } finally {
      this.busy.set(false);
    }
  }

  private fill(variant: Variant | null): void {
    const options = this.form.controls.options;
    options.clear();
    pairArray(variant?.options ?? []).controls.forEach((group) => options.push(group));

    this.form.patchValue({
      name: variant?.name ?? '',
      skuCode: variant?.skuCode ?? '',
      listPrice: variant?.listPrice ?? null,
      minOrderUnits: variant?.minOrderUnits ?? null,
      active: variant?.active ?? true,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}

/** Letters and digits only, upper case, cut short enough to fit on a label. */
function code(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase();
}
