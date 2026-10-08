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

function open(answers: Array<object | null | Promise<object | null>>) {
  const calls: Array<[ItemMovementInput, string]> = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InventarioData,
        useValue: {
          recordItemMovement: async (input: ItemMovementInput, key: string) => {
            calls.push([input, key]);
            const answer = await (answers.shift() ?? null);
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
  const refused = { count: 0 };
  fixture.componentInstance.saved.subscribe((text) => saved.push(text));
  fixture.componentInstance.refused.subscribe(() => refused.count++);
  fixture.detectChanges();
  return { fixture, calls, saved, refused };
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

  it('locks the movement while it is on its way: a quantity changed then does not get a new key (review)', async () => {
    let lose: (error: object) => void = () => undefined;
    const lost = new Promise<object | null>((resolve) => (lose = resolve));
    const { fixture, calls, saved, refused } = open([lost, null]);
    write(fixture, 500);

    const sending = (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();
    fixture.detectChanges();
    expect(el(fixture).querySelector('fieldset')?.disabled).toBe(true);
    // What the locked fieldset stops a person from doing, done anyway.
    (fixture.componentInstance as unknown as { form: { controls: { amount: { setValue(v: number): void } } } }).form.controls.amount.setValue(400);
    lose({ code: '', message: 'TypeError: Failed to fetch' });
    await sending;
    fixture.detectChanges();
    expect(el(fixture).querySelector('fieldset')?.disabled).toBe(true);
    expect(refused.count).toBe(1);

    await submit(fixture);

    expect(calls.length).toBe(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(saved.length).toBe(1);
  });

  it('asks the page to reload after a refusal, and takes the fresh stock it hands back', async () => {
    const { fixture, refused } = open([{ code: 'P0001', message: 'No puedes sacar más de lo que hay (200 g).' }]);
    write(fixture, 500);

    await submit(fixture);
    expect(refused.count).toBe(1);
    expect(el(fixture).querySelector('fieldset')?.disabled).toBe(false);

    fixture.componentRef.setInput('item', { ...SWEETS, onHand: 200 });
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('200 g');
  });
});
