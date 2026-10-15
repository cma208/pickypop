import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { workspaceAs } from '../../core/workspace.testing';
import type { SupplyCostSource } from '../cotizador/supply-costs';
import { ArmarData } from './armar.data';
import { ArmarPage } from './armar.page';
import { InventarioData, type AssemblyComponent, type AssemblyOption } from './inventario.data';
import { InventoryPlan } from './inventory-plan';

const SKULL: AssemblyOption = {
  variantId: 'skull',
  productName: 'Calavera dulcera',
  variantName: 'Con dulces',
  imagePath: null,
  assembledOnHand: 1,
  buildableUnits: 3,
  componentCount: 2,
};

const component = (id: string, onHand: number): AssemblyComponent => ({
  inventoryItemId: id,
  name: id,
  unit: 'unidad',
  kind: 'part',
  imagePath: null,
  quantityPerUnit: 1,
  onHand,
});

/** Every bought item has a cost unless the test says otherwise. */
const ALL_COSTED: Record<string, SupplyCostSource> = {};

function open(
  options: AssemblyOption[][],
  components: AssemblyComponent[][],
  canOperate = true,
  sources: Record<string, SupplyCostSource> = ALL_COSTED,
) {
  const assemblyOptions = vi.fn(async () => options.shift() ?? []);
  const assemblyComponents = vi.fn(async () => components.shift() ?? []);
  const assemble = vi.fn(async (_variantId: string, _units: number, _key: string) => undefined);
  const costSources = vi.fn(
    async (ids: readonly string[]) => new Map(ids.map((id) => [id, sources[id] ?? 'purchase'] as const)),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: InventarioData, useValue: { assemblyOptions, assemblyComponents } },
      { provide: ArmarData, useValue: { assemble, costSources } },
      workspaceAs(canOperate ? 'operator' : 'viewer'),
      { provide: InventoryPlan, useValue: { read: async () => null, changed: () => undefined, problem: () => 'sin plan' } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(ArmarPage);
  fixture.detectChanges();
  return { fixture, assemble, assemblyOptions, costSources };
}

const el = (fixture: ComponentFixture<ArmarPage>) => fixture.nativeElement as HTMLElement;
const text = (fixture: ComponentFixture<ArmarPage>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');

async function settle(fixture: ComponentFixture<ArmarPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<ArmarPage>, label: string): HTMLButtonElement | undefined {
  return [...el(fixture).querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
}

async function chooseSkull(fixture: ComponentFixture<ArmarPage>): Promise<void> {
  await settle(fixture);
  el(fixture).querySelector<HTMLButtonElement>('button.option')!.click();
  await settle(fixture);
}

function type(fixture: ComponentFixture<ArmarPage>, value: string): void {
  const input = el(fixture).querySelector<HTMLInputElement>('.qty input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('ArmarPage, «¿Cuántas?» (T3-15)', () => {
  it('the button says the number in the field, and offers none for what cannot be assembled', async () => {
    const { fixture } = open([[SKULL], [SKULL]], [[component('frente', 3), component('tapa', 5)]]);
    await chooseSkull(fixture);

    type(fixture, '2');
    expect(button(fixture, 'Armar')!.textContent!.trim()).toBe('Armar 2');

    for (const typed of ['0', '1.5', '2.9', '1e3']) {
      type(fixture, typed);
      const armar = button(fixture, 'Armar')!;
      expect(armar.textContent!.trim()).toBe('Armar');
      expect(armar.disabled).toBe(true);
      expect(text(fixture)).toContain('Escribe un número entero de 1 a');
    }
  });

  it('says what the table reaches, not what an old card said', async () => {
    // The card was read when the page opened; the table, just now, has the discs at zero.
    const { fixture } = open([[{ ...SKULL, buildableUnits: 2 }], [{ ...SKULL, buildableUnits: 2 }]], [[component('disco', 0)]]);
    await chooseSkull(fixture);
    type(fixture, '2');
    expect(text(fixture)).toContain('Falta stock para 2. Alcanza para 0.');
  });
});

describe('ArmarPage, after the database says no (T3-16)', () => {
  it('reads the cards and the table again, and keeps the message', async () => {
    const stale = { ...SKULL, buildableUnits: 3 };
    const fresh = { ...SKULL, buildableUnits: 1, assembledOnHand: 3 };
    const { fixture, assemble, assemblyOptions } = open(
      [[stale], [stale], [fresh]],
      [[component('frente', 3)], [component('frente', 1)]],
    );
    assemble.mockRejectedValueOnce({ code: 'P0001', message: 'No alcanza para armar 3 unidades. Falta: frente (hacen falta 3 y hay 1)' });
    await chooseSkull(fixture);
    type(fixture, '3');

    button(fixture, 'Armar 3')!.click();
    fixture.detectChanges();
    button(fixture, 'Sí, armar')!.click();
    await settle(fixture);
    await settle(fixture);

    expect(assemblyOptions).toHaveBeenCalledTimes(3);
    expect(text(fixture)).toContain('No alcanza para armar 3 unidades');
    expect(text(fixture)).toContain('Alcanza para 1');
    expect(button(fixture, 'Armar 3')!.disabled).toBe(true);
  });
});

describe('ArmarPage, the same assembly sent twice', () => {
  async function armar(fixture: ComponentFixture<ArmarPage>, units: string): Promise<void> {
    type(fixture, units);
    button(fixture, 'Armar ' + units)!.click();
    fixture.detectChanges();
    button(fixture, 'Sí, armar')!.click();
    await settle(fixture);
    await settle(fixture);
  }

  it('sends the same key again after an answer that never came, so the database does not assemble twice', async () => {
    const { fixture, assemble } = open(
      [[SKULL], [SKULL], [SKULL], [SKULL], [SKULL]],
      [[component('frente', 9)], [component('frente', 9)], [component('frente', 9)], [component('frente', 9)]],
    );
    // The Wi-Fi of the workshop: it went through, but the answer was lost.
    assemble.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await chooseSkull(fixture);

    await armar(fixture, '3');
    expect(text(fixture)).toContain('No hay conexión');
    await armar(fixture, '3');

    expect(assemble).toHaveBeenCalledTimes(2);
    expect(assemble.mock.calls[1]![2]).toBe(assemble.mock.calls[0]![2]);
  });

  it('sends a new key for the next assembly once one went through, and for a different quantity', async () => {
    const { fixture, assemble } = open(
      [[SKULL], [SKULL], [SKULL], [SKULL], [SKULL]],
      [[component('frente', 9)], [component('frente', 9)], [component('frente', 9)], [component('frente', 9)]],
    );
    await chooseSkull(fixture);

    await armar(fixture, '2');
    await armar(fixture, '2');
    assemble.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await armar(fixture, '1');

    const keys = assemble.mock.calls.map((call) => call[2]);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('ArmarPage, a member who only reads', () => {
  it('shows what it takes and what there is, without offering to assemble', async () => {
    const { fixture, assemble } = open([[SKULL], [SKULL]], [[component('frente', 3)]], false);
    await chooseSkull(fixture);

    expect(text(fixture)).toContain('solo el dueño y los operadores pueden armar');
    expect(button(fixture, 'Armar')).toBeUndefined();
    expect(text(fixture)).toContain('frente');
    expect(assemble).not.toHaveBeenCalled();
  });
});

describe('ArmarPage, a bought component without cost', () => {
  const bag: AssemblyComponent = { ...component('Bolsa kraft', 9), kind: 'packaging', imagePath: 'items/bag.webp' };
  const candy: AssemblyComponent = { ...component('Dulces', 900), kind: 'supply', unit: 'g', quantityPerUnit: 66 };
  const front = component('Frente', 9);

  const notice = (fixture: ComponentFixture<ArmarPage>) => el(fixture).querySelector('app-assembly-cost-notice');
  const noticeText = (fixture: ComponentFixture<ArmarPage>) => (notice(fixture)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says which one, with its photo and a link to where its cost is given, and still lets assemble', async () => {
    const { fixture, assemble, costSources } = open(
      [[SKULL], [SKULL], [SKULL]],
      [[front, bag, candy], [front, bag, candy]],
      true,
      { 'Bolsa kraft': 'unknown', Dulces: 'standard' },
    );
    await chooseSkull(fixture);

    // A printed part is not asked about: its cost comes from production, not from this view.
    expect(costSources).toHaveBeenCalledWith(['Bolsa kraft', 'Dulces']);
    expect(noticeText(fixture)).toBe(
      'Bolsa kraft no tiene costo: el producto entraría al estante sin su valor. Ponle costo en Empaque.',
    );
    expect(notice(fixture)!.querySelector('a')!.getAttribute('href')).toBe('/inventario/empaque');
    expect(notice(fixture)!.querySelector('pp-thumb')).not.toBeNull();

    type(fixture, '1');
    button(fixture, 'Armar 1')!.click();
    fixture.detectChanges();

    // Right above «Sí, armar», inside the confirmation, and only there.
    const notices = el(fixture).querySelectorAll('app-assembly-cost-notice');
    expect(notices.length).toBe(1);
    expect(notices[0]!.closest('.confirm')).not.toBeNull();
    expect(button(fixture, 'Sí, armar')!.disabled).toBe(false);

    button(fixture, 'Sí, armar')!.click();
    await settle(fixture);
    await settle(fixture);
    expect(assemble).toHaveBeenCalledTimes(1);
  });

  it('sends a supply or a spare part to Insumos', async () => {
    const screw: AssemblyComponent = { ...component('Tornillo', 9), kind: 'spare_part' };
    const { fixture } = open([[SKULL], [SKULL]], [[candy, screw]], true, { Dulces: 'unknown', Tornillo: 'unknown' });
    await chooseSkull(fixture);

    const links = [...notice(fixture)!.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Insumos', '/inventario/insumos'],
      ['Insumos', '/inventario/insumos'],
    ]);
  });

  it('says nothing when every bought component has a cost', async () => {
    const { fixture } = open([[SKULL], [SKULL]], [[front, bag, candy]], true, { 'Bolsa kraft': 'standard' });
    await chooseSkull(fixture);
    expect(noticeText(fixture)).toBe('');
  });

  it('says it could not check, rather than nothing, when the costs cannot be read', async () => {
    const { fixture, costSources } = open([[SKULL], [SKULL]], [[front, bag]]);
    costSources.mockRejectedValueOnce(new Error('boom'));
    await chooseSkull(fixture);

    expect(noticeText(fixture)).toBe('No pudimos revisar si los componentes tienen costo.');
    type(fixture, '1');
    expect(button(fixture, 'Armar 1')!.disabled).toBe(false);
  });

  it('is gone after the cost is given elsewhere and the product is read again', async () => {
    const sources: Record<string, SupplyCostSource> = { 'Bolsa kraft': 'unknown' };
    const { fixture } = open([[SKULL], [SKULL], [SKULL]], [[bag], [bag]], true, sources);
    await chooseSkull(fixture);
    expect(noticeText(fixture)).toContain('Bolsa kraft no tiene costo');

    sources['Bolsa kraft'] = 'standard';
    el(fixture).querySelector<HTMLButtonElement>('button.option')!.click();
    await settle(fixture);
    expect(noticeText(fixture)).toBe('');
  });

  it('is not shown to a member who only reads, who cannot assemble nor give a cost', async () => {
    const { fixture } = open([[SKULL], [SKULL]], [[bag]], false, { 'Bolsa kraft': 'unknown' });
    await chooseSkull(fixture);
    expect(notice(fixture)).toBeNull();
  });
});
