import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { InventarioData, type InventoryItemSummary, type ItemMovementInput } from './inventario.data';
import { ItemMovementForm } from './item-movement-form';

const SWEETS: InventoryItemSummary = {
  id: 'sweets',
  kind: 'supply',
  name: 'Dulces',
  unit: 'g',
  imagePath: null,
  minStock: 0,
  perishable: false,
  note: null,
  active: true,
  onHand: 1000,
  belowMinimum: false,
};

function open(answers: Array<object | null>) {
  const calls: Array<[ItemMovementInput, string]> = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InventarioData,
        useValue: {
          recordItemMovement: async (input: ItemMovementInput, key: string) => {
            calls.push([input, key]);
            const answer = answers.shift() ?? null;
            if (answer) throw answer;
            return { before: 1000, difference: 500, after: 1500 };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ItemMovementForm);
  fixture.componentRef.setInput('item', SWEETS);
  const saved: string[] = [];
  fixture.componentInstance.saved.subscribe((text) => saved.push(text));
  fixture.detectChanges();
  return { fixture, calls, saved };
}

const el = (fixture: ComponentFixture<ItemMovementForm>) => fixture.nativeElement as HTMLElement;

function write(fixture: ComponentFixture<ItemMovementForm>, amount: number): void {
  const input = el(fixture).querySelector<HTMLInputElement>('input[formcontrolname=amount]')!;
  input.value = String(amount);
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<ItemMovementForm>): Promise<void> {
  await (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();
  fixture.detectChanges();
}

describe('ItemMovementForm', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('retries an entry whose answer was lost with the same key, so it goes in once', async () => {
    const { fixture, calls, saved } = open([{ code: '', message: 'TypeError: Failed to fetch' }, null]);
    write(fixture, 500);

    await submit(fixture);
    expect(el(fixture).textContent).toContain('No sabemos si el movimiento se registró');
    await submit(fixture);

    expect(calls.length).toBe(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(saved.length).toBe(1);
  });

  it('asks with another key once the form changes', async () => {
    const { fixture, calls } = open([{ code: 'P0001', message: 'No puedes sacar más de lo que hay.' }, null]);
    write(fixture, 500);

    await submit(fixture);
    expect(el(fixture).textContent).toContain('No puedes sacar más de lo que hay.');
    write(fixture, 400);
    await submit(fixture);

    expect(calls[1]?.[1]).not.toBe(calls[0]?.[1]);
  });
});
