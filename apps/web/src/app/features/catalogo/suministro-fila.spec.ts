import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { CatalogoData } from './catalogo.data';
import type { RecipeSupply, SupplyOption } from './catalogo.models';
import { SuministroFila } from './suministro-fila';

const CAP: RecipeSupply = {
  id: 'row-1',
  inventoryItemId: 'cap',
  quantityPerUnit: 1,
  item: { kind: 'part', name: 'Tapa de calavera', unit: 'unidad', imagePath: null },
};

const HOOK: SupplyOption = { id: 'hook', name: 'Gancho', unit: 'unidad', costPerUnit: null, kind: 'part' };

function open(inputs: { supply?: RecipeSupply; supplies: SupplyOption[]; usedIds?: string[]; madeHere?: Set<string> }) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: {} },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(SuministroFila);
  fixture.componentRef.setInput('recipeId', 'recipe-1');
  fixture.componentRef.setInput('mode', 'part');
  fixture.componentRef.setInput('supplies', inputs.supplies);
  if (inputs.supply) fixture.componentRef.setInput('supply', inputs.supply);
  if (inputs.usedIds) fixture.componentRef.setInput('usedIds', inputs.usedIds);
  if (inputs.madeHere) fixture.componentRef.setInput('madeHere', inputs.madeHere);
  fixture.detectChanges();
  return fixture;
}

const text = (element: HTMLElement | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('SuministroFila, a saved part the options do not know yet', () => {
  it('shows the part it holds instead of an empty row to choose', () => {
    // The import just created the cap; the page's options were read before.
    const fixture = open({ supply: CAP, supplies: [HOOK], usedIds: ['cap'], madeHere: new Set(['cap']) });

    expect(text(fixture.nativeElement.querySelector('button.chosen'))).toContain('Tapa de calavera');
    expect(text(fixture.nativeElement)).toContain('Sale de las placas de esta receta');
  });

  it('does not call it a part without cost before its cost is known', () => {
    const fixture = open({ supply: CAP, supplies: [HOOK], usedIds: ['cap'] });

    expect(text(fixture.nativeElement)).not.toContain('todavía no se cerró ninguna impresión');
  });
});

describe('SuministroFila, the row that adds a part', () => {
  it('says every part is already in the recipe, not that there is nothing', () => {
    const fixture = open({ supplies: [HOOK], usedIds: ['hook'] });
    fixture.nativeElement.querySelector('button.chosen').click();
    fixture.detectChanges();

    expect(text(fixture.nativeElement.querySelector('.empty'))).toContain('Todas tus piezas ya están en la receta');
  });
});
