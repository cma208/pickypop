import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import type { PlateOutputInput } from './catalogo.models';
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

/** The editable side of a plate draft: whether it goes in, its label, its parts. */
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
      .object { display: grid; grid-template-columns: minmax(5rem, 0.7fr) minmax(0, 1.6fr) 5.5rem 2rem; gap: 0.4rem; align-items: center; }
      .object .name { font-size: 0.85rem; overflow-wrap: anywhere; }
      .object input { min-width: 0; }
      .two { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0.6rem; align-items: start; }
      p.hint { margin: 0; }
      @media (max-width: 40rem) {
        article { grid-template-columns: 1fr; }
        .object { grid-template-columns: minmax(0, 1fr) 5rem 2rem; }
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
                  }
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

  readonly group = input.required<PlateDraftGroup>();
  readonly draft = input.required<PlateDraft>();
  readonly parts = input.required<PartOption[]>();
  readonly perProduct = input.required<ReadonlyMap<string, number>>();
  /** A local link to the cropped picture: nothing is uploaded until saving. */
  readonly thumbnailUrl = input<string | null>(null);

  /** Bumped on every change of the form, so the computeds below follow it. */
  private readonly revision = signal(0);

  protected readonly objects = computed(() => this.group().controls.objects);
  protected readonly included = computed(() => {
    this.revision();
    return this.group().controls.include.value;
  });
  protected readonly said = computed(() => describeObjects(this.draft().objects));

  protected readonly options = computed<PickerOption[]>(() =>
    this.parts().map((part) => ({ value: part.id, label: part.name, imagePath: part.imagePath })),
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
}

/** "7 Tapa y 7 Cuerpo", como se dice. */
function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
