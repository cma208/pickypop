import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CatalogoData } from './catalogo.data';
import type { ImportedPlate } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { messageOf } from './catalogo.util';
import type { ImportDraft } from './importacion';
import { confirmedOutputs, ImportarPlaca, plateDraftGroup, type PlateDraftGroup } from './importar-placa';
import type { PartOption } from './salida-fila';

export interface ImportOutcome {
  created: number;
  withoutThumbnail: number;
  /** Filaments no roll of the workshop looked like, left for the person to pick. */
  unmatchedFilaments: number;
}

/**
 * The step between reading a sliced file and saving its plates: the person
 * sees every plate with its picture and the parts it proposes, and confirms or
 * corrects them. Nothing is written until "Guardar", so a file with plates
 * that belong to something else costs nothing to look at.
 */
@Component({
  selector: 'app-importar-placas',
  imports: [ImportarPlaca],
  styles: [
    SHARED_STYLES,
    `
      section { display: grid; gap: 0.75rem; padding: 0.9rem; border: 1px solid var(--accent); border-radius: var(--radius); background: var(--accent-soft); margin-bottom: 1rem; }
      h4 { margin: 0; font-size: 0.95rem; }
      p { margin: 0; }
    `,
  ],
  template: `
    <section aria-labelledby="import-title">
      <h4 id="import-title">Revisa lo que trae «{{ draft().fileName }}»</h4>
      <p class="hint">
        Cada objeto del archivo es una pieza de tu inventario, o algo que no va al estante, como un molde o una prueba.
        Cuando el nombre se parece te proponemos la pieza: confírmala o elige otra. Desmarca las placas que no son de
        este producto. Nada se guarda hasta que lo confirmes.
      </p>
      <div class="stack">
        @for (plate of draft().plates; track plate.filePlate; let i = $index) {
          <app-importar-placa
            [group]="groups()[i]!"
            [draft]="plate"
            [parts]="parts()"
            [perProduct]="perProduct()"
            [thumbnailUrl]="urls()[i] ?? null"
          />
        }
      </div>
      <p class="muted hint">¿Falta una pieza? Créala en Inventario › Piezas impresas y agrégala después en la placa.</p>
      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
      <div class="bar">
        <button type="button" (click)="save()" [disabled]="busy() || includedCount() === 0">
          {{ busy() ? 'Guardando…' : 'Guardar ' + includedCount() + ' placa(s)' }}
        </button>
        <button type="button" class="secondary" (click)="cancelled.emit()" [disabled]="busy()">Descartar</button>
      </div>
    </section>
  `,
})
export class ImportarPlacas {
  private readonly data = inject(CatalogoData);

  readonly recipeId = input.required<string>();
  readonly firstIndex = input.required<number>();
  readonly draft = input.required<ImportDraft>();
  readonly parts = input.required<PartOption[]>();
  /** How many of each part one product takes, from the recipe's supplies. */
  readonly perProduct = input.required<ReadonlyMap<string, number>>();

  readonly saved = output<ImportOutcome>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * Rebuilt only for a new file. The recipe reloads whenever something else
   * on the page is saved, and that must not wipe what the person already
   * confirmed here.
   */
  protected readonly groups = computed<PlateDraftGroup[]>(() => {
    const plates = this.draft().plates;
    const perProduct = untracked(() => this.perProduct());
    return plates.map((plate) => plateDraftGroup(plate, perProduct));
  });
  protected readonly urls = signal<(string | null)[]>([]);

  constructor() {
    // The pictures are shown from memory until they are saved; the links are
    // let go when the draft changes or the panel closes.
    effect((onCleanup) => {
      const urls = this.draft().plates.map((plate) => (plate.thumbnail ? URL.createObjectURL(plate.thumbnail) : null));
      this.urls.set(urls);
      onCleanup(() => urls.forEach((url) => url && URL.revokeObjectURL(url)));
    });
  }

  protected includedCount(): number {
    return this.groups().filter((group) => group.controls.include.value).length;
  }

  protected async save(): Promise<void> {
    const chosen = this.draft()
      .plates.map((plate, index) => ({ plate, group: this.groups()[index]! }))
      .filter(({ group }) => group.controls.include.value);

    chosen.forEach(({ group }) => group.markAllAsTouched());
    if (chosen.some(({ group }) => group.invalid)) {
      this.error.set('Revisa las placas marcadas antes de guardar.');
      return;
    }

    const fileName = this.draft().fileName;
    const plates = chosen.map(({ plate, group }): ImportedPlate => {
      const value = group.getRawValue();
      return {
        label: value.label,
        unitsPerRun: Number(value.unitsPerRun),
        printTimeS: plate.printTimeS,
        sourceFileName: fileName,
        filaments: plate.filaments,
        outputs: confirmedOutputs(group.controls.objects),
        record: {
          filePlate: plate.filePlate,
          objects: plate.objects.map((object, index) => ({
            name: object.name,
            count: object.count,
            inventoryItemId: value.objects[index]?.inventoryItemId || null,
          })),
        },
        thumbnail: plate.thumbnail,
      };
    });

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.data.importPlates(this.recipeId(), this.firstIndex(), plates);
      this.saved.emit({
        ...result,
        unmatchedFilaments: plates.reduce(
          (total, plate) => total + plate.filaments.filter((filament) => filament.skuId === null).length,
          0,
        ),
      });
    } catch (error) {
      this.error.set(messageOf(error, 'No pudimos guardar las placas.'));
    } finally {
      this.busy.set(false);
    }
  }
}
