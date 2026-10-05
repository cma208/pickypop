import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../ui';
import { blankToNull, invalidMessage } from './form-helpers';
import {
  InventarioData,
  type BrandOption,
  type MaterialOption,
  type SkuInput,
  type SkuSummary,
} from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { QuickAdd } from './quick-add';

const DEFAULT_DIAMETER_MM = 1.75;
const DEFAULT_NET_WEIGHT_G = 1000;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_PICKER_COLOR = '#888888';

/** Create or edit a filament SKU. Brands and materials can be added without leaving the form. */
@Component({
  selector: 'app-sku-form',
  imports: [ReactiveFormsModule, Field, QuickAdd],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form-grid">
        <div>
          <pp-field label="Marca" [required]="true" [error]="msg(form.controls.brandId)">
            <select formControlName="brandId">
              <option value="" disabled>Elige una marca</option>
              @for (brand of brands(); track brand.id) {
                <option [value]="brand.id">{{ brand.name }}</option>
              }
            </select>
          </pp-field>
          <app-quick-add label="Nueva marca" placeholder="Ej. Bambu Lab" [create]="createBrand" />
        </div>

        <div>
          <pp-field label="Material" [required]="true" [error]="msg(form.controls.materialId)">
            <select formControlName="materialId">
              <option value="" disabled>Elige un material</option>
              @for (material of materials(); track material.id) {
                <option [value]="material.id">{{ material.code }}</option>
              }
            </select>
          </pp-field>
          <app-quick-add label="Nuevo material" placeholder="Ej. PETG" [create]="createMaterial" />
        </div>
      </div>

      <div class="form-grid">
        <pp-field label="Acabado" hint="Basic, Matte, Silk, CF…">
          <input formControlName="finish" autocomplete="off" />
        </pp-field>
        <pp-field label="Nombre del color" [required]="true" [error]="msg(form.controls.colorName)">
          <input formControlName="colorName" autocomplete="off" />
        </pp-field>
        <pp-field label="Color (hex)" hint="Ej. #DE4343" [error]="msg(form.controls.colorHex)">
          <div class="row hex">
            <input
              type="color"
              class="picker"
              [value]="pickerColor()"
              (input)="pickColor($event)"
              aria-label="Elegir color"
            />
            <input formControlName="colorHex" maxlength="7" autocomplete="off" placeholder="#RRGGBB" />
          </div>
        </pp-field>
      </div>

      <div class="form-grid">
        <pp-field label="Diámetro (mm)" [required]="true" [error]="msg(form.controls.diameterMm)">
          <input type="number" step="0.01" formControlName="diameterMm" inputmode="decimal" />
        </pp-field>
        <pp-field label="Peso neto (g)" [required]="true" [error]="msg(form.controls.netWeightG)">
          <input type="number" step="1" formControlName="netWeightG" inputmode="decimal" />
        </pp-field>
        <pp-field label="Tara del carrete (g)" hint="Para los pesajes" [error]="msg(form.controls.tareG)">
          <input type="number" step="1" formControlName="tareG" inputmode="decimal" />
        </pp-field>
        <pp-field label="Mínimo (g)" hint="Avisa cuando baje de aquí" [error]="msg(form.controls.minStockG)">
          <input type="number" step="1" formControlName="minStockG" inputmode="decimal" />
        </pp-field>
        <pp-field label="Costo de reposición por kg (S/)" [error]="msg(form.controls.replacementCostPerKg)">
          <input type="number" step="0.01" formControlName="replacementCostPerKg" inputmode="decimal" />
        </pp-field>
      </div>

      @if (sku()) {
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
  styles: [
    INVENTORY_STYLES,
    `
      .hex { flex-wrap: nowrap; }
      .picker { width: 3rem; flex: none; padding: 0.1rem; height: 2.3rem; }
    `,
  ],
})
export class SkuForm {
  private readonly data = inject(InventarioData);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly sku = input<SkuSummary | null>(null);
  readonly brandOptions = input.required<BrandOption[]>();
  readonly materialOptions = input.required<MaterialOption[]>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  /** Entries created from inside the form are added here so they show up at once. */
  private readonly addedBrands = signal<BrandOption[]>([]);
  private readonly addedMaterials = signal<MaterialOption[]>([]);
  protected readonly brands = computed(() => [...this.brandOptions(), ...this.addedBrands()]);
  protected readonly materials = computed(() => [...this.materialOptions(), ...this.addedMaterials()]);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly msg = invalidMessage;

  protected readonly form = this.fb.group({
    brandId: ['', Validators.required],
    materialId: ['', Validators.required],
    finish: [''],
    colorName: ['', [Validators.required, Validators.maxLength(60)]],
    colorHex: ['', Validators.pattern(HEX_PATTERN)],
    diameterMm: [DEFAULT_DIAMETER_MM, [Validators.required, Validators.min(0.01)]],
    netWeightG: [DEFAULT_NET_WEIGHT_G, [Validators.required, Validators.min(1)]],
    tareG: new FormControl<number | null>(null, Validators.min(0)),
    minStockG: [0, [Validators.required, Validators.min(0)]],
    replacementCostPerKg: new FormControl<number | null>(null, Validators.min(0)),
    active: [true],
  });

  protected readonly pickerColor = computed(() => {
    const hex = this.hexValue();
    return HEX_PATTERN.test(hex) ? hex : FALLBACK_PICKER_COLOR;
  });

  private readonly hexValue = signal('');

  ngOnInit(): void {
    const sku = this.sku();
    if (sku) {
      this.form.patchValue({
        brandId: sku.brandId,
        materialId: sku.materialId,
        finish: sku.finish ?? '',
        colorName: sku.colorName,
        colorHex: sku.colorHex ?? '',
        diameterMm: sku.diameterMm,
        netWeightG: sku.netWeightG,
        tareG: sku.tareG,
        minStockG: sku.minStockG,
        replacementCostPerKg: sku.replacementCostPerKg,
        active: sku.active,
      });
    }

    this.hexValue.set(this.form.controls.colorHex.value);
    this.form.controls.colorHex.valueChanges.subscribe((value) => this.hexValue.set(value));
  }

  protected readonly createBrand = async (name: string): Promise<void> => {
    const brand = await this.data.createBrand(name);
    this.addedBrands.update((list) => [...list, brand]);
    this.form.controls.brandId.setValue(brand.id);
  };

  protected readonly createMaterial = async (code: string): Promise<void> => {
    const material = await this.data.createMaterial(code);
    this.addedMaterials.update((list) => [...list, material]);
    this.form.controls.materialId.setValue(material.id);
  };

  protected pickColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toUpperCase();
    this.form.controls.colorHex.setValue(value);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.saveSku(this.sku()?.id ?? null, this.toInput());
      this.saved.emit();
    } catch (error) {
      this.error.set(
        describeError(
          error,
          'No pudimos guardar el filamento. Revisa los datos e inténtalo de nuevo.',
          'Ya existe un filamento con esa marca, material, acabado, color y presentación.',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private toInput(): SkuInput {
    const value = this.form.getRawValue();
    return {
      brandId: value.brandId,
      materialId: value.materialId,
      finish: blankToNull(value.finish),
      colorName: value.colorName,
      colorHex: blankToNull(value.colorHex)?.toUpperCase() ?? null,
      diameterMm: value.diameterMm,
      netWeightG: value.netWeightG,
      tareG: value.tareG,
      minStockG: value.minStockG,
      replacementCostPerKg: value.replacementCostPerKg,
      active: value.active,
    };
  }
}
