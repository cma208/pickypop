import { Component, computed, inject, input, OnDestroy, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { Field, ImageField, Thumb } from '../../ui';
import { ARTICLE_DECIMALS, ARTICLE_LIMITS, OUT_OF_RANGE, rangeMessage } from './article-ranges';
import { blankToNull, invalidMessage, maxDecimals, photosToDelete, requiredText } from './form-helpers';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { describeError } from './inventario.errors';
import { countedWhole, ITEM_KINDS, ITEM_KIND_LABELS, type ItemKind } from './inventario.format';
import { INVENTORY_STYLES } from './inventario.styles';

const DEFAULT_UNIT = 'unidad';
const UNIT_SUGGESTIONS = ['unidad', 'g', 'ml', 'm', 'par', 'caja'];

/** A minimum of 2.5 bags: what is counted whole has a whole minimum too. */
function wholeMinimumForWholeUnits(group: AbstractControl): ValidationErrors | null {
  const unit = group.get('unit')?.value as string | null | undefined;
  const minimum = group.get('minStock')?.value as number | null | undefined;
  return countedWhole(unit) && typeof minimum === 'number' && !Number.isInteger(minimum) ? { wholeMinimum: true } : null;
}

/**
 * A piece is printed, never bought, so «deja de ofrecerse al comprar» said
 * nothing true about it: switching it off takes it out of the recipes, the
 * shelf count and the pieces table (the `part_stock` view keeps only active
 * ones). It waits under «Desactivadas», where it can be switched back on.
 */
const ACTIVE_LABELS: Record<ItemKind, string> = {
  supply: 'Activo (si lo desactivas, deja de ofrecerse al comprar y en las recetas)',
  packaging: 'Activo (si lo desactivas, deja de ofrecerse al comprar y en las recetas)',
  spare_part: 'Activo (si lo desactivas, deja de ofrecerse al comprar y en las recetas)',
  part: 'Activa (si la desactivas, deja de ofrecerse en las recetas y sale del conteo del estante; queda al final de Piezas impresas, en «Desactivadas», para volver a activarla)',
  finished_good: 'Activo (si lo desactivas, deja de ofrecerse para elegir)',
};

/**
 * Create or edit a supply, packaging, spare part, printed part or finished good.
 *
 * Each screen says which kinds it holds. It used to offer all five and start
 * on "Insumo", so a bag created from Empaque landed in Insumos and vanished
 * from the list where it was created; and a printed part had no screen at all
 * where it could get its photo.
 */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, Field, ImageField, Thumb],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <pp-field label="Foto" hint="Para reconocerlo en la lista sin leer el nombre.">
        <pp-image-field
          folder="articulos"
          removesPrevious="false"
          [path]="imagePath()"
          [name]="form.controls.name.value"
          [kind]="kind()"
          (changed)="onPhoto($event)"
        />
      </pp-field>
      @if (platePhoto(); as path) {
        @if (!imagePath()) {
          <p class="borrowed muted">
            <pp-thumb size="option" kind="plate" [path]="path" [name]="form.controls.name.value" />
            Mientras no tenga la suya, en las listas se ve la foto de la placa que la imprime.
          </p>
        }
      }

      <div class="form-grid">
        @if (kinds().length > 1) {
          <pp-field label="Tipo" [required]="true">
            <select formControlName="kind">
              @for (kind of kinds(); track kind) {
                <option [value]="kind">{{ labels[kind] }}</option>
              }
            </select>
          </pp-field>
        }
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
        <pp-field label="Mínimo" hint="Avisa cuando baje de aquí" [error]="minStockError()">
          <input type="number" step="any" formControlName="minStock" inputmode="decimal" />
        </pp-field>
      </div>

      @if (kind() !== 'part') {
        <label class="check">
          <input type="checkbox" formControlName="perishable" />
          Es perecible (dulces, pegamentos, pinturas…)
        </label>
      }

      <pp-field label="Nota">
        <textarea formControlName="note" rows="2"></textarea>
      </pp-field>

      @if (item()) {
        <label class="check">
          <input type="checkbox" formControlName="active" />
          {{ activeLabel() }}
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
      textarea { resize: vertical; }
      .borrowed { display: flex; align-items: center; gap: 0.6rem; margin: -0.4rem 0 0.9rem; font-size: 0.85rem; }
    `,
  ],
})
export class ItemForm implements OnDestroy {
  private readonly data = inject(InventarioData);
  private readonly media = inject(Media);
  private readonly photos = inject(ArticlePhotos);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly item = input<InventoryItemSummary | null>(null);
  /** The kinds this screen holds. The first one is where a new article starts. */
  readonly kinds = input<readonly ItemKind[]>(ITEM_KINDS);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly labels = ITEM_KIND_LABELS;
  protected readonly units = UNIT_SUGGESTIONS;
  protected readonly msg = invalidMessage;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly imagePath = signal<string | null>(null);

  /**
   * Every picture uploaded while this form is open. Until Save, the article
   * still points at the one it had, so nothing can be deleted yet: on Save the
   * old one and the discarded tries go, on Cancel the tries go and the old one
   * stays. Without this, cancelling after changing the photo left the article
   * pointing at a file that no longer existed.
   */
  private readonly uploaded = new Set<string>();
  private settled = false;

  protected readonly form = this.fb.group(
    {
      kind: ['supply' as ItemKind, Validators.required],
      name: ['', [requiredText, Validators.maxLength(100)]],
      unit: [DEFAULT_UNIT, [requiredText, Validators.maxLength(20)]],
      minStock: [
        0,
        [
          Validators.required,
          Validators.min(0),
          Validators.max(ARTICLE_LIMITS.itemMinStock.max),
          maxDecimals(ARTICLE_DECIMALS.itemQuantity),
        ],
      ],
      perishable: [false],
      note: [''],
      active: [true],
    },
    { validators: wholeMinimumForWholeUnits },
  );

  protected minStockError(): string | null {
    const control = this.form.controls.minStock;
    const own = rangeMessage(control, OUT_OF_RANGE.itemMinStock);
    if (own || !control.touched || !this.form.hasError('wholeMinimum')) return own;
    return `Se cuenta por ${this.form.controls.unit.value.trim()}: el mínimo va entero.`;
  }

  private readonly kindValue = toSignal(this.form.controls.kind.valueChanges);
  protected readonly kind = computed(() => this.kindValue() ?? this.form.controls.kind.value);

  /** What switching it off really does, which depends on the kind (E5-08). */
  protected readonly activeLabel = computed(() => ACTIVE_LABELS[this.kind()]);

  /**
   * The plate thumbnail the lists show for a piece with no photo of its own.
   * The field above edits the piece's own photo, so without this the form
   * drew a generic icon while every list showed the plate.
   */
  protected readonly platePhoto = signal<string | null>(null);

  ngOnInit(): void {
    const item = this.item();
    if (!item) {
      this.form.controls.kind.setValue(this.kinds()[0] ?? 'supply');
      return;
    }
    if (item.kind === 'part' && !item.imagePath) void this.findPlatePhoto(item.id);
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

  /** Closing the dialog any way but Save throws away what was uploaded here. */
  ngOnDestroy(): void {
    if (this.settled) return;
    const original = this.item()?.imagePath ?? null;
    for (const path of photosToDelete(this.uploaded, original, this.imagePath(), false)) void this.media.remove(path);
  }

  protected onPhoto(path: string | null): void {
    if (path) this.uploaded.add(path);
    this.imagePath.set(path);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.saveItem(this.item()?.id ?? null, {
        ...value,
        perishable: value.kind === 'part' ? false : value.perishable,
        note: blankToNull(value.note),
        imagePath: this.imagePath(),
      });
      this.settled = true;
      await this.forgetReplacedPhotos();
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

  private async findPlatePhoto(itemId: string): Promise<void> {
    try {
      const photo = await this.photos.resolve({ kind: 'item', id: itemId });
      this.platePhoto.set(photo.fromPlate ? photo.path : null);
    } catch {
      // Only a reference picture: the form works the same without it.
    }
  }

  /** Once saved, only the picture in use is worth keeping. */
  private async forgetReplacedPhotos(): Promise<void> {
    const original = this.item()?.imagePath ?? null;
    const unused = photosToDelete(this.uploaded, original, this.imagePath(), true);
    await Promise.all(unused.map((path) => this.media.remove(path)));
  }
}
