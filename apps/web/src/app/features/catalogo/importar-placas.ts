import { Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { CatalogoData } from './catalogo.data';
import type { ImportedPlate, MaterialOption, SkuOption } from './catalogo.models';
import { SHARED_STYLES } from './catalogo.styles';
import { countOf, messageOf } from './catalogo.util';
import { failedSaveMessage, newPartsUsed, withCreatedParts, type ImportDraft, type ImportOutcome } from './importacion';
import { confirmedFilaments, confirmedOutputs, ImportarPlaca, plateDraftGroup, type PlateDraftGroup } from './importar-placa';
import type { PartOption } from './salida-fila';

/**
 * The step between reading a sliced file and saving its plates: the person
 * sees every plate with its picture and the parts it proposes, and confirms or
 * corrects them. Nothing is written until "Guardar", not even a part named
 * here, so a file with plates that belong to something else costs nothing to
 * look at.
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
            [parts]="allParts()"
            [perProduct]="perProduct()"
            [skus]="skus()"
            [materials]="materials()"
            [thumbnailUrl]="urls()[i] ?? null"
            (partAdded)="addPart($event)"
          />
        }
      </div>
      <p class="muted hint">
        ¿Falta una pieza? Ponle nombre con «+ Pieza nueva» en la fila del objeto: se crea al guardar. Las piezas que
        elijas se agregan a la receta, una por unidad; si tu producto lleva otra cantidad, cámbiala en «Piezas
        impresas por unidad».
      </p>
      @if (error(); as message) { <p class="error" role="alert">{{ message }}</p> }
      <div class="bar">
        <button type="button" (click)="save()" [disabled]="busy() || includedCount() === 0">
          {{ busy() ? 'Guardando…' : 'Guardar ' + countOf(includedCount(), 'placa', 'placas') }}
        </button>
        <button type="button" class="secondary" (click)="discard()" [disabled]="busy()">Descartar</button>
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
  readonly skus = input<SkuOption[]>([]);
  readonly materials = input<MaterialOption[]>([]);

  /** The workshop's parts plus the ones named during this review, which do not exist yet. */
  protected readonly allParts = linkedSignal(() => this.parts());

  readonly saved = output<ImportOutcome>();
  /** The review was discarded; carries the names of the parts a failed save left behind, if any. */
  readonly cancelled = output<string[]>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly countOf = countOf;

  /**
   * Parts already created for this review, by their temporary id. Only a save
   * that failed after creating them leaves any here: the ones a plate saved
   * before the failure uses, and, for anyone but the owner, every one, since
   * only the owner may delete an article. A retry reuses them instead of
   * creating them twice.
   */
  private readonly created = new Map<string, string>();

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

  protected addPart(part: PartOption): void {
    this.allParts.update((parts) => [...parts, part].sort((a, b) => a.name.localeCompare(b.name, 'es')));
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
        filaments: confirmedFilaments(plate, group, this.skus()),
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
      for (const id of newPartsUsed(plates)) {
        if (this.created.has(id)) continue;
        const part = await this.data.createPart(this.nameOf(id));
        this.created.set(id, part.id);
      }

      const result = await this.data.importPlates(
        this.recipeId(),
        this.firstIndex(),
        plates.map((plate) => withCreatedParts(plate, this.created)),
      );
      this.saved.emit({
        ...result,
        partsCreated: this.created.size,
        unmatchedFilaments: plates.reduce(
          (total, plate) => total + plate.filaments.filter((filament) => filament.skuId === null).length,
          0,
        ),
      });
    } catch (error) {
      await this.undoParts();
      this.error.set(failedSaveMessage(messageOf(error, 'No pudimos guardar las placas.'), this.keptParts()));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Tries once more to take back what a failed save left, since a dropped
   * connection may have been all that stopped it, and tells the recipe what
   * still stayed: the review closes, and nobody else would say it.
   */
  protected async discard(): Promise<void> {
    if (this.created.size > 0) {
      this.busy.set(true);
      await this.undoParts();
      this.busy.set(false);
    }
    this.cancelled.emit(this.keptParts());
  }

  /**
   * A failed save takes back the parts it created. One a saved plate already
   * uses cannot go (the database refuses), and neither can any for someone
   * who is not the owner: those stay, for the next try and to be named.
   */
  private async undoParts(): Promise<void> {
    for (const [temporaryId, realId] of [...this.created]) {
      if (await this.data.deleteUnusedPart(realId)) this.created.delete(temporaryId);
    }
  }

  private keptParts(): string[] {
    return [...this.created.keys()].map((id) => this.nameOf(id));
  }

  private nameOf(temporaryId: string): string {
    return this.allParts().find((candidate) => candidate.id === temporaryId)?.name ?? '';
  }
}
