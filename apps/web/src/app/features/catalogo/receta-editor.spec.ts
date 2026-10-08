import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { CatalogoData } from './catalogo.data';
import type { Lookups, Recipe } from './catalogo.models';
import { RecetaEditor } from './receta-editor';

const RECIPE: Recipe = {
  id: 'recipe-1',
  variantId: 'variant-1',
  version: 1,
  setupMinutes: 10,
  minutesPerUnit: 5,
  note: null,
  assembled: true,
  plates: [],
  supplies: [
    {
      id: 'row-1',
      inventoryItemId: 'cap',
      quantityPerUnit: 1,
      item: { kind: 'part', name: 'Tapa de calavera', unit: 'unidad', imagePath: null },
    },
  ],
};

const LOOKUPS: Lookups = { materials: [], skus: [], supplies: [] };

function open(inputs: { lookupsError?: string; lookupsRefreshError?: string }) {
  TestBed.configureTestingModule({ providers: [{ provide: CatalogoData, useValue: {} }] });
  // Plates, rows and the import review have their own tests; the card is what matters here.
  TestBed.overrideComponent(RecetaEditor, {
    set: { imports: [ReactiveFormsModule, Card, Field, ...FORMAT_PIPES], schemas: [NO_ERRORS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(RecetaEditor);
  fixture.componentRef.setInput('variantId', 'variant-1');
  fixture.componentRef.setInput('recipe', RECIPE);
  fixture.componentRef.setInput('lookups', LOOKUPS);
  if (inputs.lookupsError) fixture.componentRef.setInput('lookupsError', inputs.lookupsError);
  if (inputs.lookupsRefreshError) fixture.componentRef.setInput('lookupsRefreshError', inputs.lookupsRefreshError);
  const refreshes: true[] = [];
  fixture.componentInstance.itemsChanged.subscribe(() => refreshes.push(true));
  fixture.detectChanges();
  return { fixture, refreshes };
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('RecetaEditor, when the options could not be read again', () => {
  it('keeps the whole recipe and only warns', () => {
    const { fixture } = open({ lookupsRefreshError: 'No hay conexión con el servidor. Revisa tu internet.' });

    const card = text(fixture.nativeElement);
    expect(card).toContain('Piezas impresas por unidad');
    expect(card).toContain('Insumos por unidad');
    expect(card).toContain('Cargar desde archivo laminado');
    expect(text(fixture.nativeElement.querySelector('.refresh'))).toContain('No hay conexión con el servidor.');
  });

  it('asks the page to read them again', () => {
    const { fixture, refreshes } = open({ lookupsRefreshError: 'No hay conexión con el servidor. Revisa tu internet.' });

    fixture.nativeElement.querySelector('.refresh button').click();

    expect(refreshes).toHaveLength(1);
  });

  it('shows no warning when the options are fresh', () => {
    const { fixture } = open({});

    expect(fixture.nativeElement.querySelector('.refresh')).toBeNull();
  });

  it('still gives the card to an error of the first load, when there is nothing to show', () => {
    const { fixture } = open({ lookupsError: 'No pudimos cargar los costos del taller.' });

    expect(text(fixture.nativeElement)).not.toContain('Piezas impresas por unidad');
    expect(text(fixture.nativeElement.querySelector('[role="alert"]'))).toBe('No pudimos cargar los costos del taller.');
  });
});
