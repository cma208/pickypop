import { Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field, ImageField } from '../../ui';
import { blankToNull, invalidMessage } from './form-helpers';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { ITEM_KINDS, ITEM_KIND_LABELS, type ItemKind } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';

const DEFAULT_UNIT = 'unidad';
const UNIT_SUGGESTIONS = ['unidad', 'g', 'ml', 'm', 'par', 'caja'];

/** Create or edit a supply, packaging, spare part or finished good. */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, Field, ImageField],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form-grid">
        <pp-field label="Tipo" [required]="true">
          <select formControlName="kind">
            @for (kind of kinds; track kind) {
              <option [value]="kind">{{ labels[kind] }}</option>
            }
          </select>
        </pp-field>
        <pp-field label="Foto" hint="Para reconocerlo en la lista sin leer el nombre.">
          <pp-image-field
            folder="articulos"
            [path]="imagePath()"
            [name]="form.controls.name.value"
            (changed)="imagePath.set($event)"
          />
        </pp-field>
        <pp-field label="Nombre" [required]="true" [error]="msg(form.controls.name)">
          <input formControlName="name" autocomplete="off" />
        </pp-field>
        <pp-field label="Unidad" [required]="true" hint="En qué se cuenta: unidad, g, ml…" [error]="msg(form.controls.unit)">
          <input formControlName="unit" list="unit-suggestions" autocomplete="off" />
          <datalist id="unit-suggestions">
            @for (unit of units; track unit) {
              <option [value]="unit"></option>
            }
          </datalist>
        </pp-field>
        <pp-field label="Mínimo" hint="Avisa cuando baje de aquí" [error]="msg(form.controls.minStock)">
          <input type="number" step="any" formControlName="minStock" inputmode="decimal" />
        </pp-field>
      </div>

      <label class="check">
        <input type="checkbox" formControlName="perishable" />
        Es perecible (dulces, pegamentos, pinturas…)
      </label>

      <pp-field label="Nota">
        <textarea formControlName="note" rows="2"></textarea>
      </pp-field>

      @if (item()) {
        <label class="check">
          <input type="checkbox" formControlName="active" />
          Activo (si lo desactivas, deja de ofrecerse al comprar)
        </label>
      }

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="form-actions">
        <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  `,
  styles: [INVENTORY_STYLES, `textarea { resize: vertical; }`],
})
export class ItemForm {
  private readonly data = inject(InventarioData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly item = input<InventoryItemSummary | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly kinds = ITEM_KINDS;
  protected readonly labels = ITEM_KIND_LABELS;
  protected readonly units = UNIT_SUGGESTIONS;
  protected readonly msg = invalidMessage;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly imagePath = signal<string | null>(null);

  protected readonly form = this.fb.group({
    kind: ['supply' as ItemKind, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    unit: [DEFAULT_UNIT, [Validators.required, Validators.maxLength(20)]],
    minStock: [0, [Validators.required, Validators.min(0)]],
    perishable: [false],
    note: [''],
    active: [true],
  });

  ngOnInit(): void {
    const item = this.item();
    if (!item) return;
    this.imagePath.set(item.imagePath);
    this.form.setValue({
      kind: item.kind,
      name: item.name,
      unit: item.unit,
      minStock: item.minStock,
      perishable: item.perishable,
      note: item.note ?? '',
      active: item.active,
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.saveItem(this.item()?.id ?? null, {
        ...value,
        note: blankToNull(value.note),
        imagePath: this.imagePath(),
      });
      this.saved.emit();
    } catch (error) {
      this.error.set(
        describeError(
          error,
          'No pudimos guardar el artículo. Revisa los datos e inténtalo de nuevo.',
          'Ya existe un artículo del mismo tipo con ese nombre.',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
