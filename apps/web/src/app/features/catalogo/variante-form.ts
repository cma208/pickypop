import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { Card, Field, ImageField } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Variant, VariantUsage } from './catalogo.models';
import { CatalogoPermissions, OWNER_ONLY } from './catalogo.permissions';
import { SHARED_STYLES } from './catalogo.styles';
import {
  blankToNull,
  deactivationWarning,
  messageOf,
  pairArray,
  readPairs,
  repeatedVariantMessage,
  variantUsageText,
} from './catalogo.util';
import { DECIMALS, decimalsText, fieldError, LIMITS, limitText, maxDecimals, requiredText, wholeNumber } from './catalogo.validators';
import { PairsEditor } from './pairs-editor';

/** The smallest price that is not zero. */
const ONE_CENT = 0.01;

const PRICE_MESSAGES: Record<string, string> = {
  min: 'Tiene que ser mayor que cero. Si todavía no tiene precio, déjalo vacío.',
  max: `Hasta S/ ${limitText(LIMITS.price)}.`,
  decimals: `En soles, con ${decimalsText(DECIMALS.money)}.`,
};

const MINIMUM_MESSAGES: Record<string, string> = {
  min: 'Debe ser un entero desde 1.',
  whole: 'Debe ser un entero desde 1.',
  max: `Hasta ${limitText(LIMITS.units)} unidades.`,
};

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
          <pp-field label="Nombre" [required]="true" [error]="nameError()">
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
            [error]="priceError()"
          >
            <input type="number" min="0" step="0.01" inputmode="decimal" formControlName="listPrice" />
          </pp-field>
          <pp-field
            label="Mínimo de unidades"
            hint="Pedido mínimo aceptado, si lo hay."
            [error]="minimumError()"
          >
            <input type="number" min="1" step="1" inputmode="numeric" formControlName="minOrderUnits" />
          </pp-field>
        </div>
        <label class="check">
          <input type="checkbox" formControlName="active" />
          Variante activa (se puede vender)
        </label>
        @if (variant()?.active && !form.controls.active.value && deactivationNote(); as note) {
          <p class="notice" role="status">{{ note }}</p>
        }

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
          @if (variant(); as current) {
            @if (!permissions.isOwner()) {
              <span class="muted hint">{{ ownerOnly }}</span>
            } @else if (usageText()) {
              @if (current.active) {
                <button type="button" class="secondary" [disabled]="busy()" (click)="deactivate()">Desactivar variante</button>
              }
            } @else if (usage()) {
              <button type="button" class="danger" [disabled]="busy()" (click)="remove()">Eliminar variante</button>
            }
          }
        </div>
        @if (variant() && permissions.isOwner() && usageText(); as where) {
          <p class="muted hint">
            No se puede eliminar: {{ lowerFirst(where) }}
            {{ variant()!.active ? 'Desactívala para que no se ofrezca más:' : 'Ya está desactivada:' }}
            lo que ya se cotizó o se vendió conserva su producto.
          </p>
          @if (variant()!.active && deactivationNote(); as note) {
            <p class="notice">{{ note }}</p>
          }
        }
      </form>
    </pp-card>
  `,
})
export class VarianteForm {
  private readonly data = inject(CatalogoData);
  protected readonly permissions = inject(CatalogoPermissions);
  protected readonly ownerOnly = OWNER_ONLY.variant;

  readonly productId = input.required<string>();
  /** The other variants of the product, to say a name is taken before saving. */
  readonly siblings = input<readonly { id: string; name: string }[]>([]);
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
  /** False until the inputs are there: the name is validated once while the form is built. */
  private siblingsReady = false;
  /** Where the variant is used; null while it is not known, and then «Eliminar» waits. */
  protected readonly usage = signal<VariantUsage | null>(null);
  protected readonly usageText = computed(() => {
    const usage = this.usage();
    return usage ? variantUsageText(usage) : null;
  });
  /** What switching it off leaves stuck: orders still to deliver, units on the shelf. */
  protected readonly deactivationNote = computed(() => {
    const usage = this.usage();
    return usage ? deactivationWarning(usage) : null;
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, (control: AbstractControl) => this.repeated(control)],
    }),
    skuCode: new FormControl('', { nonNullable: true }),
    listPrice: new FormControl<number | null>(null, [
      Validators.min(ONE_CENT),
      Validators.max(LIMITS.price),
      maxDecimals(DECIMALS.money),
    ]),
    minOrderUnits: new FormControl<number | null>(null, [Validators.min(1), wholeNumber, Validators.max(LIMITS.units)]),
    active: new FormControl(true, { nonNullable: true }),
    options: pairArray([]),
  });

  constructor() {
    effect(() => {
      const variant = this.variant();
      untracked(() => {
        this.imagePath.set(variant?.imagePath ?? null);
        if (!this.form.dirty) this.fill(variant);
        if (variant) void this.loadUsage(variant.id);
      });
    });
    // A sibling added or renamed elsewhere on the page changes what is taken.
    effect(() => {
      this.siblings();
      untracked(() => this.form.controls.name.updateValueAndValidity({ emitEvent: false }));
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

  protected nameError(): string | null {
    const control = this.form.controls.name;
    if (!control.touched && !control.dirty) return null;
    if (control.hasError('required')) return 'Escribe el nombre.';
    return (control.getError('repeated') as string | null) ?? null;
  }

  protected priceError(): string | null {
    return fieldError(this.form.controls.listPrice, PRICE_MESSAGES);
  }

  protected minimumError(): string | null {
    return fieldError(this.form.controls.minOrderUnits, MINIMUM_MESSAGES);
  }

  protected lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  private repeated(control: AbstractControl): ValidationErrors | null {
    if (!this.siblingsReady) return null;
    const message = repeatedVariantMessage(String(control.value ?? ''), this.siblings(), this.variant()?.id);
    return message ? { repeated: message } : null;
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    if (this.variant()?.active && !value.active && !this.sureToDeactivate()) return;
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
    const repeated = repeatedVariantMessage(name, this.siblings());
    if (repeated) {
      this.error.set(repeated);
      return;
    }

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

  /**
   * Only offered for a variant nothing uses. The database checks again: a
   * quote saved in another tab a moment ago makes it refuse, and then the
   * screen says where it is used and offers to switch it off (T2-01).
   */
  protected async remove(): Promise<void> {
    const current = this.variant();
    if (!current || this.busy()) return;
    const sure = confirm(
      `¿Eliminar la variante «${current.name}»? También se borrarán su receta y su escalera de precios. No se puede deshacer.`,
    );
    if (!sure) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.deleteVariant(current.id);
      this.removed.emit();
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos eliminar la variante.'));
      await this.loadUsage(current.id);
    } finally {
      this.busy.set(false);
    }
  }

  /** How a variant that was already quoted or sold leaves the catalogue: it stops being offered. */
  protected async deactivate(): Promise<void> {
    const current = this.variant();
    if (!current || this.busy()) return;
    if (!this.sureToDeactivate()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.setVariantActive(current.id, false);
      this.form.controls.active.setValue(false);
      this.saved.emit(current.id);
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos desactivar la variante.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Asks before switching off a variant that still has orders to deliver or
   * units on the shelf; one with nothing pending goes without a question.
   */
  private sureToDeactivate(): boolean {
    const note = this.deactivationNote();
    return !note || confirm(`¿Desactivar la variante «${this.variant()?.name ?? ''}»?\n\n${note}`);
  }

  private async loadUsage(id: string): Promise<void> {
    try {
      this.usage.set(await this.data.variantUsage(id));
    } catch {
      // Without it «Eliminar» is not offered; the database would refuse a used one anyway.
      this.usage.set(null);
    }
  }

  private fill(variant: Variant | null): void {
    this.siblingsReady = true;
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
    // A list price of zero saved before it was refused: said at once, so it gets fixed.
    if (variant && this.form.controls.listPrice.invalid) this.form.controls.listPrice.markAsTouched();
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
