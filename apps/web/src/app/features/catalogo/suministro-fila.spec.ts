import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { CatalogoData } from './catalogo.data';
import type { RecipeSupply, SupplyOption } from './catalogo.models';
import { CatalogoPermissions } from './catalogo.permissions';
import { SuministroFila } from './suministro-fila';

const CAP: RecipeSupply = {
  id: 'row-1',
  inventoryItemId: 'cap',
  quantityPerUnit: 1,
  item: { kind: 'part', name: 'Tapa de calavera', unit: 'unidad', imagePath: null },
};

const HOOK: SupplyOption = { id: 'hook', name: 'Gancho', unit: 'unidad', costPerUnit: null, kind: 'part' };

interface Inputs {
  supply?: RecipeSupply;
  supplies: SupplyOption[];
  usedIds?: string[];
  madeHere?: Set<string>;
  printedElsewhere?: Set<string>;
  mode?: 'part' | 'supply';
  owner?: boolean;
  data?: object;
}

function open(inputs: Inputs) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: inputs.data ?? {} },
      { provide: CatalogoPermissions, useValue: { isOwner: signal(inputs.owner ?? true) } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(SuministroFila);
  fixture.componentRef.setInput('recipeId', 'recipe-1');
  fixture.componentRef.setInput('mode', inputs.mode ?? 'part');
  fixture.componentRef.setInput('supplies', inputs.supplies);
  if (inputs.supply) fixture.componentRef.setInput('supply', inputs.supply);
  if (inputs.usedIds) fixture.componentRef.setInput('usedIds', inputs.usedIds);
  if (inputs.madeHere) fixture.componentRef.setInput('madeHere', inputs.madeHere);
  if (inputs.printedElsewhere) fixture.componentRef.setInput('printedElsewhere', inputs.printedElsewhere);
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

/** Types a quantity and presses the row's button. */
function submit(fixture: ReturnType<typeof open>, quantity: string): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]');
  input.value = quantity;
  input.dispatchEvent(new Event('input'));
  fixture.nativeElement.querySelector('button[type="submit"]').click();
  fixture.detectChanges();
}

const BAG: RecipeSupply = {
  id: 'row-2',
  inventoryItemId: 'bag',
  quantityPerUnit: 1,
  item: { kind: 'packaging', name: 'Bolsa', unit: 'unidad', imagePath: null },
};

const SWEETS: RecipeSupply = {
  id: 'row-3',
  inventoryItemId: 'sweets',
  quantityPerUnit: 50,
  item: { kind: 'supply', name: 'Dulces', unit: 'g', imagePath: null },
};

describe('SuministroFila, a quantity that cannot be saved (T2-12, T2-09)', () => {
  it('says that a supply needs more than zero instead of doing nothing', () => {
    const updateSupply = vi.fn();
    const fixture = open({ supply: BAG, supplies: [], mode: 'supply', data: { updateSupply } });

    submit(fixture, '0');

    expect(text(fixture.nativeElement.querySelector('.note.error'))).toBe('La cantidad tiene que ser mayor que cero.');
    expect(updateSupply).not.toHaveBeenCalled();
  });

  it('says a part goes whole, and a negative is at least one', () => {
    const updateSupply = vi.fn();
    const fixture = open({ supply: CAP, supplies: [], usedIds: ['cap'], data: { updateSupply } });

    submit(fixture, '1.5');
    expect(text(fixture.nativeElement.querySelector('.note.error'))).toBe(
      'Las piezas van enteras: un producto no lleva media pieza.',
    );

    submit(fixture, '-2');
    expect(text(fixture.nativeElement.querySelector('.note.error'))).toBe('Cada producto lleva al menos 1.');
    expect(updateSupply).not.toHaveBeenCalled();
  });

  it('refuses more decimals than are kept, instead of rounding them away (T2-17)', () => {
    const updateSupply = vi.fn();
    const fixture = open({ supply: SWEETS, supplies: [], mode: 'supply', data: { updateSupply } });

    submit(fixture, '50.0004');

    expect(text(fixture.nativeElement.querySelector('.note.error'))).toBe('La cantidad va con hasta 3 decimales.');
    expect(updateSupply).not.toHaveBeenCalled();
  });
});

describe('SuministroFila, a part no plate prints (T2-07)', () => {
  const BACK: RecipeSupply = {
    id: 'row-4',
    inventoryItemId: 'back',
    quantityPerUnit: 1,
    item: { kind: 'part', name: 'Trasera de calavera', unit: 'unidad', imagePath: null },
  };
  const BACK_OPTION: SupplyOption = { id: 'back', name: 'Trasera de calavera', unit: 'unidad', costPerUnit: null, kind: 'part' };

  it('says no plate prints it, not that another recipe does', () => {
    const fixture = open({ supply: BACK, supplies: [BACK_OPTION], usedIds: ['back'] });

    expect(text(fixture.nativeElement)).toContain('Ninguna placa la imprime');
    expect(text(fixture.nativeElement)).not.toContain('otra receta');
  });

  it('says another recipe prints it when one really does', () => {
    const fixture = open({ supply: BACK, supplies: [BACK_OPTION], usedIds: ['back'], printedElsewhere: new Set(['back']) });

    expect(text(fixture.nativeElement)).toContain('La imprime otra receta');
  });
});

describe('SuministroFila, a part switched off in Inventory (T2-13)', () => {
  it('keeps its name, marks it switched off and says where to bring it back', () => {
    const off: RecipeSupply = { ...CAP, item: { ...CAP.item, active: false } };
    const fixture = open({ supply: off, supplies: [HOOK], usedIds: ['cap'] });

    expect(text(fixture.nativeElement.querySelector('button.chosen'))).toContain('Tapa de calavera (desactivada)');
    expect(text(fixture.nativeElement)).toContain('Está desactivada en Inventario');
  });
});

describe('SuministroFila, for the operator (T2-10)', () => {
  it('does not offer to remove what only the owner may remove', () => {
    const fixture = open({ supply: CAP, supplies: [HOOK], usedIds: ['cap'], owner: false });

    expect(fixture.nativeElement.querySelector('button[aria-label="Quitar pieza"]')).toBeNull();
  });

  it('offers it to the owner', () => {
    const fixture = open({ supply: CAP, supplies: [HOOK], usedIds: ['cap'] });

    expect(fixture.nativeElement.querySelector('button[aria-label="Quitar pieza"]')).not.toBeNull();
  });
});
