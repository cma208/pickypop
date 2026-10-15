import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { workspaceAs } from '../../core/workspace.testing';
import type { MemberRole } from '../../core/workspace';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { InsumosPage } from './insumos.page';
import { InventoryPlan } from './inventory-plan';

const BOUGHT: InventoryItemSummary = {
  id: 'bag-bought',
  kind: 'packaging',
  name: 'Bolsa kraft',
  unit: 'unidad',
  imagePath: 'articulos/bolsa.webp',
  minStock: 0,
  perishable: false,
  note: null,
  active: true,
  onHand: 40,
  belowMinimum: false,
  costPerUnit: 0.8,
  costSource: 'purchase',
  lastPurchaseCost: 0.8,
  standardCost: null,
};

const TYPED: InventoryItemSummary = {
  ...BOUGHT,
  id: 'ribbon',
  name: 'Cinta satinada',
  unit: 'm',
  costPerUnit: 0.25,
  costSource: 'standard',
  lastPurchaseCost: null,
  standardCost: 0.25,
};

const FREE: InventoryItemSummary = {
  ...BOUGHT,
  id: 'box',
  name: 'Caja chica',
  costPerUnit: null,
  costSource: 'unknown',
  lastPurchaseCost: null,
};

/** Switched off and without a cost: shown as such, but not counted among those to fix. */
const RETIRED: InventoryItemSummary = { ...FREE, id: 'old-box', name: 'Caja vieja', active: false };

async function open(role: MemberRole = 'operator'): Promise<ComponentFixture<InsumosPage>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      workspaceAs(role),
      { provide: Media, useValue: { url: async () => null, version: signal(0), remove: async () => undefined } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'packaging' }) } },
      { provide: InventarioData, useValue: { items: async () => [BOUGHT, TYPED, FREE, RETIRED] } },
      {
        provide: InventoryPlan,
        useValue: {
          read: async () => ({ items: new Map(), filaments: new Map(), finishedItemOf: new Map(), timeZone: 'America/Lima' }),
          problem: () => 'sin plan',
          changed: () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(InsumosPage);
  fixture.componentRef.setInput('scope', ['packaging']);
  fixture.componentRef.setInput('heading', 'Empaque');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<InsumosPage>) => fixture.nativeElement as HTMLElement;
/** What a person reads: the currency's non-breaking space read as a space. */
const text = (fixture: ComponentFixture<InsumosPage>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
const read = (node: Element | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ');
const rowOf = (fixture: ComponentFixture<InsumosPage>, name: string) =>
  [...el(fixture).querySelectorAll<HTMLTableRowElement>('tbody tr')].find((row) => row.textContent?.includes(name));

describe('InsumosPage', () => {
  it('shows what each article costs per unit and where that came from, with its photo', async () => {
    const fixture = await open();

    const bought = rowOf(fixture, 'Bolsa kraft')!;
    expect(read(bought)).toContain('S/ 0.80');
    expect(read(bought)).toContain('por unidad · De la última compra');
    expect(bought.querySelector('pp-thumb')).not.toBeNull();
    expect(read(rowOf(fixture, 'Cinta satinada'))).toContain('por m · Costo estándar');
    expect(read(rowOf(fixture, 'Caja chica'))).toContain('Sin costo');
    expect(read(bought)).not.toContain('Sin costo');
  });

  it('says the cost under the name too, for where the cost column folds away (review)', async () => {
    const fixture = await open();

    const under = rowOf(fixture, 'Bolsa kraft')!.querySelector('td:first-child .narrow-only');
    expect(read(under ?? undefined)).toContain('S/ 0.80 por unidad · De la última compra');
  });

  it('does not flag a switched-off article it does not count (review)', async () => {
    const fixture = await open();

    expect(read(rowOf(fixture, 'Caja vieja'))).not.toContain('Sin costo');
    expect(text(fixture)).toContain('Solo sin costo (1)');
  });

  it('filters the active articles without a cost, and counts them', async () => {
    const fixture = await open();
    expect(text(fixture)).toContain('Solo sin costo (1)');

    const filter = [...el(fixture).querySelectorAll<HTMLLabelElement>('label.check')].find((label) =>
      label.textContent?.includes('Solo sin costo'),
    )!;
    filter.querySelector('input')!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const names = [...el(fixture).querySelectorAll('tbody tr')].map((row) => row.querySelector('.name')?.textContent?.trim());
    expect(names).toEqual(['Caja chica']);
    expect(text(fixture)).toContain('Si los compraste, regístralos con «Comprar»');
  });

  it('takes «Comprar» to Compras with the article already chosen', async () => {
    const fixture = await open();

    const link = rowOf(fixture, 'Caja chica')!.querySelector<HTMLAnchorElement>('a.button')!;
    expect(link.textContent?.trim()).toBe('Comprar');
    expect(link.getAttribute('href')).toBe('/inventario/compras?articulo=box');
    // A switched-off article is not offered when buying.
    expect(rowOf(fixture, 'Caja vieja')?.querySelector('a.button')).toBeNull();
  });

  it('offers no «Comprar» to someone who only reads', async () => {
    const fixture = await open('viewer');

    expect(el(fixture).querySelector('tbody a.button')).toBeNull();
    expect(text(fixture)).toContain('Sin costo');
    // Nor tells them to use the buttons they do not have (review).
    const badge = rowOf(fixture, 'Caja chica')!.querySelector('pp-badge[title]');
    expect(badge?.getAttribute('title')).toBe('Sin costo cuenta como S/ 0 al armar, entregar y cotizar.');
  });

  it('tells whoever operates how to fix an article without a cost', async () => {
    const fixture = await open();

    const badge = rowOf(fixture, 'Caja chica')!.querySelector('pp-badge[title]');
    expect(badge?.getAttribute('title')).toContain('Ponle su costo en «Editar», o regístralo con «Comprar».');
  });
});
