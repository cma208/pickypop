import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { CatalogoData } from './catalogo.data';
import { CatalogoError } from './catalogo.util';
import type { ImportedPlate } from './catalogo.models';
import type { ImportDraft, ImportOutcome } from './importacion';
import { ImportarPlacas } from './importar-placas';

/** The skull's caps plate: two objects, no part of the workshop looks like them. */
const DRAFT: ImportDraft = {
  fileName: 'skull.gcode.3mf',
  plates: [
    {
      filePlate: 1,
      label: 'Cap + Hook',
      printTimeS: 3600,
      grams: 10,
      filaments: [{ slot: 1, grams: 10, colorHex: '#FFFFFF', materialId: 'pla', skuId: null, fileType: 'PLA' }],
      objects: [
        { name: 'Cap', count: 7, proposedItemId: null },
        { name: 'Hook', count: 7, proposedItemId: null },
      ],
      thumbnail: null,
    },
  ],
};

/** The database creates the new parts and the plates in one call, or nothing. */
function fakeData() {
  return {
    importPlates: vi.fn(
      async (_recipe: string, _first: number, plates: ImportedPlate[], newParts: { key: string; name: string }[]) => ({
        created: plates.length,
        partsCreated: newParts.length,
        withoutThumbnail: 0,
      }),
    ),
  };
}

function open(data: ReturnType<typeof fakeData>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: data },
      // The pictures are not what is being tested.
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(ImportarPlacas);
  fixture.componentRef.setInput('recipeId', 'recipe-1');
  fixture.componentRef.setInput('firstIndex', 1);
  fixture.componentRef.setInput('draft', DRAFT);
  fixture.componentRef.setInput('parts', []);
  fixture.componentRef.setInput('perProduct', new Map());
  const saved: ImportOutcome[] = [];
  const cancelled: true[] = [];
  fixture.componentInstance.saved.subscribe((outcome) => saved.push(outcome));
  fixture.componentInstance.cancelled.subscribe(() => cancelled.push(true));
  fixture.detectChanges();
  return { fixture, saved, cancelled };
}

function button(fixture: ComponentFixture<ImportarPlacas>, text: string): HTMLButtonElement {
  const found = [...fixture.nativeElement.querySelectorAll('button')].find(
    (candidate: HTMLButtonElement) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button «${text}»`);
  return found as HTMLButtonElement;
}

/** «+ Pieza nueva» on the object, a name, and «Usar». */
function namePart(fixture: ComponentFixture<ImportarPlacas>, objectName: string, name: string): void {
  fixture.nativeElement.querySelector(`button[aria-label="Crear una pieza nueva para ${objectName}"]`).click();
  fixture.detectChanges();
  const input: HTMLInputElement = fixture.nativeElement.querySelector('.create input');
  input.value = name;
  input.dispatchEvent(new Event('input'));
  button(fixture, 'Usar').click();
  fixture.detectChanges();
}

describe('ImportarPlacas, a part named during the review', () => {
  it('is not created while reviewing, and discarding leaves nothing', () => {
    const data = fakeData();
    const { fixture, cancelled } = open(data);

    namePart(fixture, 'Cap', 'Tapa de calavera');
    expect(fixture.nativeElement.textContent).toContain('Nueva: se crea al guardar');

    button(fixture, 'Descartar').click();

    expect(cancelled).toHaveLength(1);
    expect(data.importPlates).not.toHaveBeenCalled();
  });

  it('travels with the plates, by its provisional id and its name, in the same call', async () => {
    const data = fakeData();
    const { fixture, saved } = open(data);
    namePart(fixture, 'Cap', 'Tapa de calavera');

    button(fixture, 'Guardar 1 placa').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    expect(data.importPlates).toHaveBeenCalledTimes(1);
    const [, , plates, newParts] = data.importPlates.mock.calls[0]!;
    expect(newParts).toEqual([{ key: plates[0]!.outputs[0]!.inventoryItemId, name: 'Tapa de calavera' }]);
    expect(plates[0]!.outputs).toEqual([{ inventoryItemId: newParts[0]!.key, unitsPerRun: 7 }]);
    expect(plates[0]!.record.objects.map((object) => object.inventoryItemId)).toEqual([newParts[0]!.key, null]);
    expect(saved[0]!.partsCreated).toBe(1);
  });

  it('is not sent if no object uses it any more', async () => {
    const data = fakeData();
    const { fixture, saved } = open(data);
    namePart(fixture, 'Cap', 'Tapa de calavera');
    fixture.nativeElement.querySelector('button[aria-label="No va al estante: Cap"]').click();
    fixture.detectChanges();

    button(fixture, 'Guardar 1 placa').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    expect(data.importPlates.mock.calls[0]![3]).toEqual([]);
    expect(saved[0]!.partsCreated).toBe(0);
  });

  it('says what failed and leaves nothing to take back: the database saved nothing (E2-03)', async () => {
    const data = fakeData();
    data.importPlates.mockRejectedValueOnce(
      new CatalogoError('La receta cambió mientras revisabas: ya tiene una placa 1. Recarga la página y vuelve a cargar el archivo.'),
    );
    const { fixture, saved } = open(data);
    namePart(fixture, 'Cap', 'Tapa de calavera');

    button(fixture, 'Guardar 1 placa').click();
    await vi.waitFor(() => expect(button(fixture, 'Guardar 1 placa').disabled).toBe(false));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toBe(
      'La receta cambió mientras revisabas: ya tiene una placa 1. Recarga la página y vuelve a cargar el archivo.',
    );
    expect(saved).toHaveLength(0);

    // Trying again sends the same new part again: the failed try created none.
    button(fixture, 'Guardar 1 placa').click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(data.importPlates.mock.calls[1]![3]).toEqual([expect.objectContaining({ name: 'Tapa de calavera' })]);
  });

  it('sends the plates once, however many times «Guardar» is clicked while saving', async () => {
    const data = fakeData();
    let finish: () => void = () => undefined;
    data.importPlates.mockImplementationOnce(
      (_recipe, _first, plates) =>
        new Promise((resolve) => {
          finish = () => resolve({ created: plates.length, partsCreated: 0, withoutThumbnail: 0 });
        }),
    );
    const { fixture, saved } = open(data);

    const save = button(fixture, 'Guardar 1 placa');
    save.click();
    save.click();
    finish();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    expect(data.importPlates).toHaveBeenCalledTimes(1);
  });

  it('refuses the name of a part that already exists in the review', () => {
    const data = fakeData();
    const { fixture } = open(data);
    namePart(fixture, 'Cap', 'Tapa de calavera');

    namePart(fixture, 'Hook', 'tapa de  calavera');

    expect(fixture.nativeElement.querySelector('.create .error')?.textContent).toContain(
      'Ya hay una pieza «Tapa de calavera»: elígela en la lista.',
    );
  });
});
