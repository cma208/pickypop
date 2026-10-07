import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { borrowedPhoto } from '../../core/article-photos';
import { FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { ImportedFilament, MaterialOption, PlateOutputInput, SkuOption } from './catalogo.models';
import { messageOf } from './catalogo.util';
import { SHARED_STYLES } from './catalogo.styles';
import { describeObjects, mergeOutputs, productsPerRun, type PlateDraft } from './importacion';
import type { PartOption } from './salida-fila';

function objectRow(itemId: string | null, units: number) {
  return new FormGroup({
    inventoryItemId: new FormControl(itemId ?? '', { nonNullable: true }),
    units: new FormControl<number | null>(units, [Validators.required, Validators.min(1)]),
  });
}

type ObjectRow = ReturnType<typeof objectRow>;

/** What the person confirmed comes out of the plate, two objects of one part added up. */
export function confirmedOutputs(objects: FormArray<ObjectRow>): PlateOutputInput[] {
  return mergeOutputs(
    objects.getRawValue().map((row) => ({ inventoryItemId: row.inventoryItemId || null, units: Number(row.units ?? 0) })),
  );
}

/** The editable side of a plate draft: whether it goes in, its label, its parts and its rolls. */
export function plateDraftGroup(draft: PlateDraft, perProduct: ReadonlyMap<string, number>) {
  const objects = new FormArray(draft.objects.map((object) => objectRow(object.proposedItemId, object.count)));
  return new FormGroup({
    include: new FormControl(true, { nonNullable: true }),
    label: new FormControl(draft.label, { nonNullable: true }),
    unitsPerRun: new FormControl<number | null>(productsPerRun(confirmedOutputs(objects), perProduct), [
      Validators.required,
      Validators.min(0.001),
    ]),
    objects,
    // The roll proposed for each slot, which the person can change before
    // saving: the file says red PETG for a mould the workshop prints in black.
    filaments: new FormArray(draft.filaments.map((filament) => new FormControl(filament.skuId ?? '', { nonNullable: true }))),
  });
}

/**
 * The plate's filaments with the roll the person chose. The material follows
 * the roll: choosing an ABS roll for a slot the file called PETG makes it ABS.
 */
export function confirmedFilaments(draft: PlateDraft, group: PlateDraftGroup, skus: readonly SkuOption[]): ImportedFilament[] {
  const chosen = group.controls.filaments.getRawValue();
  return draft.filaments.map((filament, index) => {
    const sku = skus.find((candidate) => candidate.id === chosen[index]);
    return { ...filament, skuId: sku?.id ?? null, materialId: sku?.materialId ?? filament.materialId };
  });
}

export type PlateDraftGroup = ReturnType<typeof plateDraftGroup>;

/**
 * One plate of a file being imported: its picture, what the file says is on
 * it, and which part of the inventory each object is.
 *
 * "Productos por corrida" follows the parts while the person has not typed in
 * it: confirming that "Cap" is the skull cap is what tells it the plate makes
 * seven products. Once they type a number, it is theirs.
 */
@Component({
  selector: 'app-importar-placa',
  imports: [ReactiveFormsModule, ItemPicker, ...FORMAT_PIPES],
  styles: [
    SHARED_STYLES,
    `
      article { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 0.9rem; padding: 0.9rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
      article.off { opacity: 0.6; }
      .picture { width: 7.5rem; height: 7.5rem; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); display: grid; place-items: center; overflow: hidden; }
      .picture img { width: 100%; height: 100%; object-fit: contain; }
      .picture span { font-size: 0.75rem; }
      header { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: baseline; }
      header .check { margin: 0; }
      .body { display: grid; gap: 0.6rem; min-width: 0; }
      label.field { display: grid; gap: 0.15rem; font-size: 0.72rem; color: var(--muted); }
      .said { margin: 0; font-size: 0.85rem; }
      .objects { display: grid; gap: 0.4rem; }
      .object { display: grid; grid-template-columns: minmax(5rem, 0.7fr) minmax(0, 1.6fr) 5.5rem auto; gap: 0.4rem; align-items: center; }
      .object .name { font-size: 0.85rem; overflow-wrap: anywhere; }
      .object input { min-width: 0; }
      .two { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0.6rem; align-items: start; }
      .new-part { font-size: 0.8rem; white-space: nowrap; }
      .create { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; padding: 0.4rem 0 0.2rem; }
      .create label { flex: 1 1 12rem; }
      .create .error { flex-basis: 100%; margin: 0; }
      .rolls { display: grid; gap: 0.3rem; }
      .roll { display: grid; grid-template-columns: 1rem minmax(0, 1fr) minmax(0, 1.4fr); gap: 0.4rem; align-items: center; font-size: 0.85rem; }
      .swatch { width: 1rem; height: 1rem; border-radius: 50%; border: 1px solid var(--line-strong); }
      p.hint { margin: 0; }
      @media (max-width: 40rem) {
        article { grid-template-columns: 1fr; }
        .object { grid-template-columns: minmax(0, 1fr) 5rem auto; }
        .object .name { grid-column: 1 / -1; }
        .two { grid-template-columns: 1fr; }
      }
    `,
  ],
  template: `
    <article [class.off]="!included()" [formGroup]="group()">
      <div class="picture">
        @if (thumbnailUrl(); as url) {
          <img [src]="url" [alt]="'Vista de la placa ' + draft().filePlate + ' del archivo'" />
        } @else {
          <span class="muted">Sin vista</span>
        }
      </div>
      <div class="body">
        <header>
          <label class="check">
            <input type="checkbox" formControlName="include" />
            <strong>Placa {{ draft().filePlate }} del archivo</strong>
          </label>
          <span class="muted hint">{{ draft().printTimeS | duration }} · {{ draft().grams | grams }}</span>
        </header>

        @if (included()) {
          <p class="said">
            @if (draft().objects.length > 0) {
              El archivo dice: <strong>{{ said() }}</strong>
            } @else {
              <span class="muted">El archivo no dice qué objetos lleva esta placa.</span>
            }
          </p>

          @if (draft().objects.length > 0) {
            <div class="objects" formArrayName="objects">
              @for (row of objects().controls; track row; let i = $index) {
                <div class="object" [formGroup]="row">
                  <span class="name">{{ draft().objects[i]!.name }} <span class="muted">×{{ draft().objects[i]!.count }}</span></span>
                  <pp-item-picker
                    placeholder="No va al estante"
                    [options]="options()"
                    [value]="row.controls.inventoryItemId.value"
                    (chosen)="choose(row, $event)"
                  />
                  <input type="number" min="1" step="1" inputmode="numeric" formControlName="units"
                    [attr.aria-label]="'Cuántas ' + draft().objects[i]!.name + ' salen por corrida'" />
                  @if (row.controls.inventoryItemId.value) {
                    <button type="button" class="ghost" (click)="choose(row, '')"
                      [attr.aria-label]="'No va al estante: ' + draft().objects[i]!.name">✕</button>
                  } @else if (creatingFor() !== i) {
                    <button type="button" class="ghost new-part" (click)="startPart(i)"
                      [attr.aria-label]="'Crear una pieza nueva para ' + draft().objects[i]!.name">+ Pieza nueva</button>
                  }
                </div>
                @if (creatingFor() === i) {
                  <div class="create">
                    <label class="field">Nombre de la pieza nueva
                      <input [formControl]="newPartName" autocomplete="off" placeholder="Ej.: Tapa de calavera"
                        (keydown.enter)="$event.preventDefault(); createPart(row)" />
                    </label>
                    <button type="button" (click)="createPart(row)" [disabled]="creating()">{{ creating() ? 'Creando…' : 'Crear y usar' }}</button>
                    <button type="button" class="ghost" (click)="creatingFor.set(null)" [disabled]="creating()">Cancelar</button>
                    @if (createError(); as message) { <p class="error hint">{{ message }}</p> }
                  </div>
                }
              }
            </div>
          }

          @if (draft().filaments.length > 0) {
            <div class="rolls" formArrayName="filaments">
              <span class="muted hint">Rollo de cada ranura (gramos de una corrida)</span>
              @for (control of filamentControls().controls; track $index; let i = $index) {
                <div class="roll">
                  <span class="swatch" [style.background]="draft().filaments[i]!.colorHex ?? 'transparent'" aria-hidden="true"></span>
                  <span class="said-roll">Ranura {{ draft().filaments[i]!.slot }} · {{ materialOf(draft().filaments[i]!.materialId) }}{{ draft().filaments[i]!.grams | grams }}</span>
                  <select [formControlName]="i" [attr.aria-label]="'Rollo de la ranura ' + draft().filaments[i]!.slot">
                    <option value="">Sin asignar</option>
                    @for (sku of skuChoices(draft().filaments[i]!.materialId); track sku.id) {
                      <option [value]="sku.id">{{ sku.label }}</option>
                    }
                  </select>
                </div>
              }
            </div>
          }

          <div class="two">
            <label class="field">Etiqueta
              <input formControlName="label" autocomplete="off" />
            </label>
            <label class="field" title="Para el costo: cuántos productos terminados alcanza a hacer una corrida">Productos por corrida
              <input type="number" min="0.001" step="any" inputmode="decimal" formControlName="unitsPerRun" />
            </label>
          </div>
          <p class="muted hint">{{ productsHint() }}</p>
          @if (group().touched && group().invalid) {
            <p class="error hint">Cada pieza necesita cuántas salen por corrida, y la placa sus productos por corrida.</p>
          }
        }
      </div>
    </article>
  `,
})
export class ImportarPlaca implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  private readonly data = inject(CatalogoData);

  readonly group = input.required<PlateDraftGroup>();
  readonly draft = input.required<PlateDraft>();
  readonly parts = input.required<PartOption[]>();
  readonly perProduct = input.required<ReadonlyMap<string, number>>();
  readonly skus = input<SkuOption[]>([]);
  readonly materials = input<MaterialOption[]>([]);
  /** A local link to the cropped picture: nothing is uploaded until saving. */
  readonly thumbnailUrl = input<string | null>(null);
  /** A part made here, so every other plate of the file can choose it too. */
  readonly partCreated = output<PartOption>();

  /** The object row whose new part is being named, if any. */
  protected readonly creatingFor = signal<number | null>(null);
  protected readonly newPartName = new FormControl('', { nonNullable: true });
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly filamentControls = computed(() => this.group().controls.filaments);

  /** Bumped on every change of the form, so the computeds below follow it. */
  private readonly revision = signal(0);

  protected readonly objects = computed(() => this.group().controls.objects);
  protected readonly included = computed(() => {
    this.revision();
    return this.group().controls.include.value;
  });
  protected readonly said = computed(() => describeObjects(this.draft().objects));

  protected readonly options = computed<PickerOption[]>(() =>
    this.parts().map((part) => ({
      value: part.id,
      label: part.name,
      imagePath: part.imagePath,
      // A part with no photo of its own shows the plate that prints it.
      photo: borrowedPhoto(part.id, 'part'),
      kind: 'part' as const,
    })),
  );

  protected readonly productsHint = computed(() => {
    this.revision();
    const outputs = confirmedOutputs(this.objects());
    if (outputs.length === 0) {
      return 'Ningún objeto va al estante, así que no hay de dónde sacar los productos por corrida: escríbelos tú.';
    }
    const names = new Map(this.parts().map((part) => [part.id, part.name]));
    const list = outputs.map((output) => `${output.unitsPerRun} ${names.get(output.inventoryItemId) ?? 'pieza'}`);
    const fromRecipe = outputs.some((output) => this.perProduct().has(output.inventoryItemId));
    const products = productsPerRun(outputs, this.perProduct());
    return (
      `Con ${joinWithAnd(list)} alcanza para ${products} producto(s): manda la pieza que primero se acaba, ` +
      (fromRecipe ? 'con lo que la receta pide de cada una.' : 'contando una de cada pieza por producto.') +
      ' Corrígelo si tu producto lleva otra cosa.'
    );
  });

  ngOnInit(): void {
    const group = this.group();
    const { objects, unitsPerRun } = group.controls;

    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.revision.update((n) => n + 1));
    objects.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!unitsPerRun.dirty) unitsPerRun.setValue(productsPerRun(confirmedOutputs(objects), this.perProduct()));
    });
  }

  protected choose(row: ObjectRow, itemId: string): void {
    row.controls.inventoryItemId.setValue(itemId);
    row.controls.inventoryItemId.markAsDirty();
  }

  /** The file's name for the object is the starting point; it is rarely the workshop's. */
  protected startPart(index: number): void {
    this.newPartName.setValue(this.draft().objects[index]?.name ?? '');
    this.createError.set(null);
    this.creatingFor.set(index);
  }

  protected async createPart(row: ObjectRow): Promise<void> {
    const name = this.newPartName.value.trim();
    if (!name || this.creating()) {
      this.createError.set(name ? null : 'Escribe cómo se llama la pieza.');
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    try {
      const part = await this.data.createPart(name);
      this.partCreated.emit(part);
      this.choose(row, part.id);
      this.creatingFor.set(null);
    } catch (error) {
      this.createError.set(messageOf(error, 'No pudimos crear la pieza.'));
    } finally {
      this.creating.set(false);
    }
  }

  protected materialOf(materialId: string | null): string {
    const code = this.materials().find((material) => material.id === materialId)?.code;
    return code ? `${code} · ` : '';
  }

  /** The rolls of the same material first: they are the usual answer, but any roll can print the slot. */
  protected skuChoices(materialId: string | null): SkuOption[] {
    const active = this.skus().filter((sku) => sku.active);
    return [...active.filter((sku) => sku.materialId === materialId), ...active.filter((sku) => sku.materialId !== materialId)];
  }
}

/** "7 Tapa y 7 Cuerpo", como se dice. */
function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
