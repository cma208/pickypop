import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { workspaceAs } from '../../core/workspace.testing';
import { InventarioData, type InventoryItemInput, type InventoryItemSummary } from './inventario.data';
import type { ItemKind } from './inventario.format';
import { ItemForm } from './item-form';

const BAG: InventoryItemSummary = {
  id: 'bag',
  kind: 'packaging',
  name: 'Bolsa kraft',
  unit: 'unidad',
  imagePath: null,
  minStock: 0,
  perishable: false,
  note: null,
  active: true,
  onHand: 10,
  belowMinimum: false,
  costPerUnit: null,
  costSource: 'unknown',
  lastPurchaseCost: null,
  standardCost: null,
};

/** A printed cap whose standard cost is a zero nobody chose: it must not keep the piece from being renamed. */
const CAP: InventoryItemSummary = { ...BAG, id: 'cap', kind: 'part', name: 'Tapa', standardCost: 0, costPerUnit: 0, costSource: 'standard' };

function open(item: InventoryItemSummary | null, kinds: readonly ItemKind[] = ['packaging']) {
  const saved: [string | null, InventoryItemInput][] = [];
  TestBed.configureTestingModule({
    providers: [
      workspaceAs('operator'),
      { provide: Media, useValue: { url: async () => null, version: signal(0), remove: async () => undefined } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'packaging', fromPlate: false }) } },
      {
        provide: InventarioData,
        useValue: {
          saveItem: async (id: string | null, input: InventoryItemInput) => {
            saved.push([id, input]);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ItemForm);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('kinds', kinds);
  fixture.detectChanges();
  return { fixture, saved };
}

const el = (fixture: ComponentFixture<ItemForm>) => fixture.nativeElement as HTMLElement;
/** What a person reads: the currency's non-breaking space read as a space. */
const text = (fixture: ComponentFixture<ItemForm>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');

/** The cost lives in its own field component, bound to the same control. */
const field = (fixture: ComponentFixture<ItemForm>, control: string) =>
  el(fixture).querySelector<HTMLInputElement>(control === 'standardCost' ? 'app-cost-field input' : `input[formcontrolname=${control}]`);

function type(fixture: ComponentFixture<ItemForm>, control: string, value: number | string): void {
  const input = field(fixture, control)!;
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<ItemForm>): Promise<void> {
  await (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();
  fixture.detectChanges();
}

describe('ItemForm cost', () => {
  it('lets a bag get its cost per unit, and saves it', async () => {
    const { fixture, saved } = open(BAG);

    expect(text(fixture)).toContain('Costo por unidad (S/)');
    expect(text(fixture)).toContain('Lo que vale cada unidad mientras no haya compras');
    type(fixture, 'standardCost', 0.35);
    await submit(fixture);

    expect(saved).toEqual([['bag', expect.objectContaining({ kind: 'packaging', standardCost: 0.35 })]]);
  });

  it('leaves it optional: a new article saves without one', async () => {
    const { fixture, saved } = open(null);
    type(fixture, 'name', 'Caja chica');

    await submit(fixture);

    expect(saved[0]?.[1]).toMatchObject({ name: 'Caja chica', kind: 'packaging' });
    expect(saved[0]?.[1].standardCost).toBeUndefined();
  });

  it('does not send the cost it opened with when only something else changed (review)', async () => {
    // Opened while the bag had no cost; an entry in another tab gave it one since.
    const { fixture, saved } = open(BAG);
    type(fixture, 'name', 'Bolsa kraft grande');

    await submit(fixture);

    expect(saved[0]?.[1]).toMatchObject({ name: 'Bolsa kraft grande' });
    expect(saved[0]?.[1].standardCost).toBeUndefined();
  });

  it('sends a cost cleared by hand, so it can be taken off', async () => {
    const { fixture, saved } = open({ ...BAG, standardCost: 0.35, costPerUnit: 0.35, costSource: 'standard' });
    expect(field(fixture, 'standardCost')?.value).toBe('0.35');
    type(fixture, 'standardCost', '');

    await submit(fixture);

    expect(saved[0]?.[1].standardCost).toBeNull();
  });

  it('shows what is wrong with the cost on save too, not only while typing', async () => {
    const { fixture, saved } = open(BAG);
    (fixture.componentInstance as unknown as { form: { controls: { standardCost: { setValue(v: number): void } } } }).form.controls.standardCost.setValue(0);

    await submit(fixture);

    expect(saved).toEqual([]);
    expect(text(fixture)).toContain('El costo por unidad tiene que ser mayor que cero.');
  });

  it('says the last purchase decides while there is one', () => {
    const { fixture } = open({ ...BAG, costPerUnit: 0.8, costSource: 'purchase', lastPurchaseCost: 0.8 });

    expect(text(fixture)).toContain(
      'Hoy vale la última compra: S/ 0.80 por unidad. Este valor solo se usa mientras no haya compras.',
    );
  });

  it('names the unit the article is counted in', () => {
    const { fixture } = open(BAG);
    type(fixture, 'unit', 'm');

    expect(text(fixture)).toContain('Costo por m (S/)');
  });

  it('will not save a zero as a cost', async () => {
    const { fixture, saved } = open(BAG);
    type(fixture, 'standardCost', 0);

    await submit(fixture);

    expect(saved).toEqual([]);
    expect(text(fixture)).toContain('El costo por unidad tiene que ser mayor que cero.');
  });

  it('has no cost field for a printed part, and its stored cost does not block saving it', async () => {
    const { fixture, saved } = open(CAP, ['part']);

    expect(field(fixture, 'standardCost')).toBeNull();
    type(fixture, 'name', 'Tapa roja');
    await submit(fixture);

    expect(saved[0]?.[1]).toMatchObject({ kind: 'part', name: 'Tapa roja' });
  });
});
