import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
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

function open(options: AssemblyOption[][], components: AssemblyComponent[][]) {
  const assemblyOptions = vi.fn(async () => options.shift() ?? []);
  const assemblyComponents = vi.fn(async () => components.shift() ?? []);
  const assemble = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: InventarioData, useValue: { assemblyOptions, assemblyComponents, assemble } },
      { provide: InventoryPlan, useValue: { read: async () => null, changed: () => undefined, problem: () => 'sin plan' } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(ArmarPage);
  fixture.detectChanges();
  return { fixture, assemble, assemblyOptions };
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
