import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { fakeWorkspace } from '../../core/workspace.testing';
import { CurrentWorkspace } from '../../core/workspace';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Recipe, RecipeSupply, Variant } from './catalogo.models';
import { CatalogoPage } from './catalogo.page';
import { EscaleraPrecios } from './escalera-precios';
import { RecetaEditor } from './receta-editor';
import { SuministroFila } from './suministro-fila';
import { VarianteForm } from './variante-form';
import { VariantCostModel } from './variant-cost.model';

/**
 * «Solo lectura» sees the catalogue as it is and is offered nothing to write
 * (ADR-025). The database refuses it all the same; this is about not offering
 * a Guardar, an Agregar, a Crear receta, a Duplicar or an Importar that would
 * be refused.
 */

const VARIANT: Variant = {
  id: 'variant-1',
  productId: 'product-1',
  name: 'Roja',
  options: [{ name: 'Color', value: 'rojo' }],
  skuCode: null,
  listPrice: 5,
  minOrderUnits: null,
  active: true,
  imagePath: null,
};

const RECIPE: Recipe = {
  id: 'recipe-1',
  variantId: 'variant-1',
  version: 1,
  setupMinutes: 10,
  minutesPerUnit: 5,
  note: null,
  assembled: true,
  plates: [],
  supplies: [],
};

const CAP: RecipeSupply = {
  id: 'row-1',
  inventoryItemId: 'cap',
  quantityPerUnit: 1,
  item: { kind: 'part', name: 'Tapa de calavera', unit: 'unidad', imagePath: null },
};

function configure(role: 'viewer' | 'operator', data: object = {}) {
  const workspace = fakeWorkspace(role);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      VariantCostModel,
      { provide: CatalogoData, useValue: data },
      { provide: CurrentWorkspace, useValue: workspace },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'product' }) } },
    ],
  });
  return workspace;
}

const labels = (fixture: ComponentFixture<unknown>) =>
  ([...(fixture.nativeElement as HTMLElement).querySelectorAll('button')] as HTMLButtonElement[]).map((button) =>
    (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

describe('The catalogue for a member who only reads', () => {
  it('lists the products without «Nuevo producto» nor «Archivar», and says why', async () => {
    configure('viewer', {
      listProducts: async () => [
        { id: 'p1', name: 'Calavera', slug: 'calavera', status: 'published', category: null, botVisible: false, imagePath: null, variants: [] },
      ],
    });
    const fixture = TestBed.createComponent(CatalogoPage);
    await settle(fixture);

    expect(labels(fixture)).not.toContain('Nuevo producto');
    expect(labels(fixture)).not.toContain('Archivar');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('solo lectura');
  });

  it('shows a variant with its data, every field locked, and no Guardar, Duplicar, Sugerir or photo upload', async () => {
    configure('viewer', { variantUsage: vi.fn(async () => ({ quotes: 0, orders: 0, shelf: 0, openQuotes: 0, openOrders: 0, onHand: 0 })) });
    const fixture = TestBed.createComponent(VarianteForm);
    fixture.componentRef.setInput('productId', 'product-1');
    fixture.componentRef.setInput('variant', VARIANT);
    await settle(fixture);

    const buttons = labels(fixture);
    for (const label of ['Guardar variante', 'Duplicar', 'Sugerir', 'Desactivar variante', 'Eliminar variante', 'Agregar opción', '✕']) {
      expect(buttons).not.toContain(label);
    }
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Subir foto');
    const name = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[formcontrolname="name"]');
    expect(name?.value).toBe('Roja');
    expect(name?.disabled).toBe(true);
    const option = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('app-pairs-editor input');
    expect(option?.disabled).toBe(true);
  });

  it('offers no «Crear receta» for a variant without one', async () => {
    configure('viewer');
    TestBed.overrideComponent(RecetaEditor, {
      set: { imports: [ReactiveFormsModule, Card, Field, ...FORMAT_PIPES], schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(RecetaEditor);
    fixture.componentRef.setInput('variantId', 'variant-1');
    fixture.componentRef.setInput('lookups', { materials: [], skus: [], supplies: [], printedBy: new Map() });
    await settle(fixture);

    expect(labels(fixture)).not.toContain('Crear receta');
  });

  it('shows the recipe locked, without Guardar, without loading a file, without rows to add', async () => {
    configure('viewer');
    TestBed.overrideComponent(RecetaEditor, {
      set: { imports: [ReactiveFormsModule, Card, Field, ...FORMAT_PIPES], schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(RecetaEditor);
    fixture.componentRef.setInput('variantId', 'variant-1');
    fixture.componentRef.setInput('recipe', RECIPE);
    fixture.componentRef.setInput('lookups', { materials: [], skus: [], supplies: [], printedBy: new Map() });
    await settle(fixture);

    const element = fixture.nativeElement as HTMLElement;
    expect(labels(fixture)).not.toContain('Guardar');
    expect(element.querySelector('input[type="file"]')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('input[formcontrolname="setupMinutes"]')?.disabled).toBe(true);
  });

  it('shows the ladder without the form that adds a step', async () => {
    configure('viewer');
    TestBed.inject(VariantCostModel).tiers.set([{ id: 't5', minQuantity: 5, unitPrice: 15, validFrom: '2026-10-01', note: null }]);
    const fixture = TestBed.createComponent(EscaleraPrecios);
    fixture.componentRef.setInput('variantId', 'variant-1');
    await settle(fixture);

    expect(labels(fixture)).not.toContain('Agregar escalón');
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Desde 5 unidades');
  });

  it('shows a part of the recipe, but not the empty row that adds one', async () => {
    configure('viewer');
    const saved = TestBed.createComponent(SuministroFila);
    saved.componentRef.setInput('recipeId', 'recipe-1');
    saved.componentRef.setInput('mode', 'part');
    saved.componentRef.setInput('supplies', []);
    saved.componentRef.setInput('supply', CAP);
    await settle(saved);
    const empty = TestBed.createComponent(SuministroFila);
    empty.componentRef.setInput('recipeId', 'recipe-1');
    empty.componentRef.setInput('mode', 'part');
    empty.componentRef.setInput('supplies', []);
    await settle(empty);

    expect((saved.nativeElement as HTMLElement).textContent).toContain('Tapa de calavera');
    expect(labels(saved)).not.toContain('Guardar');
    expect((empty.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });
});

describe('The catalogue for an operator', () => {
  it('still offers everything but removing', async () => {
    configure('operator', { variantUsage: vi.fn(async () => ({ quotes: 0, orders: 0, shelf: 0, openQuotes: 0, openOrders: 0, onHand: 0 })) });
    const fixture = TestBed.createComponent(VarianteForm);
    fixture.componentRef.setInput('productId', 'product-1');
    fixture.componentRef.setInput('variant', VARIANT);
    await settle(fixture);

    expect(labels(fixture)).toContain('Guardar variante');
    expect(labels(fixture)).toContain('Duplicar');
    expect(labels(fixture)).not.toContain('Eliminar variante');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[formcontrolname="name"]')?.disabled).toBe(false);
  });
});
