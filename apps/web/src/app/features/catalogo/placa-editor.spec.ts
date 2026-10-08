import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Lookups, RecipePlate } from './catalogo.models';
import { CatalogoPermissions } from './catalogo.permissions';
import { PlacaEditor } from './placa-editor';

const LOOKUPS: Lookups = { materials: [], skus: [], supplies: [], printedBy: new Map() };

/** Plate 1 prints caps for this recipe and hooks for another product. */
const CAPS_AND_HOOKS: RecipePlate = {
  id: 'plate-1',
  label: 'Tapas',
  plateIndex: 1,
  unitsPerRun: 9,
  printTimeS: 2666,
  filaments: [],
  outputs: [
    { id: 'out-cap', inventoryItemId: 'cap', unitsPerRun: 9, part: { name: 'Tapa', imagePath: null, active: true } },
    { id: 'out-hook', inventoryItemId: 'hook', unitsPerRun: 9, part: { name: 'Gancho', imagePath: null, active: true } },
  ],
  thumbnailPath: null,
  sourceFileName: null,
  fileRecord: null,
};

function open(askedIds: string[] = ['cap']) {
  const data = {
    updatePlate: vi.fn(async () => undefined),
    addPlate: vi.fn(async () => undefined),
    deletePlate: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: data },
      { provide: CatalogoPermissions, useValue: { isOwner: signal(true) } },
    ],
  });
  // Filament and output rows have their own tests; the plate's own form is what matters here.
  TestBed.overrideComponent(PlacaEditor, {
    set: { imports: [ReactiveFormsModule, ...FORMAT_PIPES], schemas: [NO_ERRORS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(PlacaEditor);
  fixture.componentRef.setInput('recipeId', 'recipe-1');
  fixture.componentRef.setInput('plate', CAPS_AND_HOOKS);
  fixture.componentRef.setInput('plates', [CAPS_AND_HOOKS]);
  fixture.componentRef.setInput('askedIds', askedIds);
  fixture.componentRef.setInput('lookups', LOOKUPS);
  fixture.detectChanges();
  return { fixture, data };
}

describe('PlacaEditor, removing the only plate that prints a part (T2-07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells the part the recipe takes from the one it prints for another product', async () => {
    const { fixture, data } = open(['cap']);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);

    fixture.nativeElement.querySelector('button[aria-label="Quitar placa"]').click();
    await fixture.whenStable();

    const question = ask.mock.calls[0]?.[0] ?? '';
    expect(question).toContain('Es la única placa de la receta que imprime «Tapa». La receta la sigue pidiendo');
    expect(question).toContain('También es la única que imprime «Gancho», que la receta no pide');
    expect(data.deletePlate).not.toHaveBeenCalled();
  });
});
