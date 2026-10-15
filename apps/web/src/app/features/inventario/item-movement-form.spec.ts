import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { InventarioData, type InventoryItemSummary, type ItemMovementInput, type ItemMovementResult } from './inventario.data';
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
  costPerUnit: 0.016,
  costSource: 'purchase',
  lastPurchaseCost: 0.016,
  standardCost: null,
};

/** Bags that only ever came in by hand: no purchase, no standard cost. */
const BAGS: InventoryItemSummary = {
  ...SWEETS,
  id: 'bags',
  kind: 'packaging',
  name: 'Bolsa kraft',
  unit: 'unidad',
  onHand: 10,
  costPerUnit: null,
  costSource: 'unknown',
  lastPurchaseCost: null,
};

const WROTE: ItemMovementResult = { before: 1000, difference: 500, after: 1500, unitCost: 0.016, costSource: 'purchase' };

function open(
  answers: Array<object | null | Promise<object | null>>,
  item: InventoryItemSummary = SWEETS,
  wrote: ItemMovementResult = WROTE,
) {
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
            return wrote;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ItemMovementForm);
  fixture.componentRef.setInput('item', item);
  const saved: string[] = [];
  const refused = { count: 0 };
  fixture.componentInstance.saved.subscribe((text) => saved.push(text));
  fixture.componentInstance.refused.subscribe(() => refused.count++);
  fixture.detectChanges();
  return { fixture, calls, saved, refused };
}

const el = (fixture: ComponentFixture<ItemMovementForm>) => fixture.nativeElement as HTMLElement;
/** What a person reads: the currency's non-breaking space read as a space. */
const text = (fixture: ComponentFixture<ItemMovementForm>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
const plain = (said: string | undefined) => said?.replace(/\s+/g, ' ');

/** The cost lives in its own field component, bound to the same control. */
const inputFor = (fixture: ComponentFixture<ItemMovementForm>, control: string) =>
  el(fixture).querySelector<HTMLInputElement>(control === 'unitCost' ? 'app-cost-field input' : `input[formcontrolname=${control}]`);

function type(fixture: ComponentFixture<ItemMovementForm>, control: string, value: number | string): void {
  const input = inputFor(fixture, control)!;
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function write(fixture: ComponentFixture<ItemMovementForm>, amount: number): void {
  type(fixture, 'amount', amount);
}

function choose(fixture: ComponentFixture<ItemMovementForm>, mode: 'in' | 'out' | 'count'): void {
  const select = el(fixture).querySelector<HTMLSelectElement>('select[formcontrolname=mode]')!;
  select.value = mode;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

const costField = (fixture: ComponentFixture<ItemMovementForm>) => inputFor(fixture, 'unitCost');
const submitButton = (fixture: ComponentFixture<ItemMovementForm>) =>
  el(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!;

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
    expect(text(fixture)).toContain('No sabemos si el movimiento se registró');
    await submit(fixture);

    expect(calls.length).toBe(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(saved.length).toBe(1);
  });

  it('asks with another key once the form changes', async () => {
    const { fixture, calls } = open([{ code: 'P0001', message: 'No puedes sacar más de lo que hay.' }, null]);
    write(fixture, 500);

    await submit(fixture);
    expect(text(fixture)).toContain('No puedes sacar más de lo que hay.');
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
    expect(text(fixture)).toContain('200 g');
  });

  it('calls an entry here what it is: one that was not bought', () => {
    const { fixture } = open([]);
    expect(el(fixture).querySelector('select[formcontrolname=mode]')?.textContent).toContain(
      'Entrada sin compra (regalo o lo que ya había)',
    );
  });

  it('asks nothing of an article with a cost, says what it enters at, and sends no cost', async () => {
    const { fixture, calls, saved } = open([null]);
    write(fixture, 500);

    expect(costField(fixture)).toBeNull();
    expect(text(fixture)).toContain('Entra a S/ 0.016 por g (de la última compra).');
    await submit(fixture);

    expect(calls[0]?.[0].unitCost).toBeNull();
    expect(plain(saved[0])).toBe('Movimiento registrado: +500 g a S/ 0.016 por g (de la última compra). Ahora hay 1,500 g. Lo ves en el kardex.');
  });

  it('will not let an article without a cost in until its cost is written, and sends it', async () => {
    const wrote = { before: 10, difference: 5, after: 15, unitCost: 0.35, costSource: 'standard' } as const;
    const { fixture, calls, saved } = open([null], BAGS, wrote);
    write(fixture, 5);

    expect(costField(fixture)).not.toBeNull();
    expect(text(fixture)).toContain('Costo por unidad (S/)');
    expect(text(fixture)).toContain('Bolsa kraft todavía no tiene costo: escribe cuánto vale cada unidad.');
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, 'unitCost', 0);
    expect(text(fixture)).toContain('El costo por unidad tiene que ser mayor que cero.');
    expect(submitButton(fixture).disabled).toBe(true);

    type(fixture, 'unitCost', 0.35);
    expect(text(fixture)).toContain('Entra a S/ 0.35 por unidad, que queda como su costo.');
    expect(submitButton(fixture).disabled).toBe(false);
    await submit(fixture);

    expect(calls[0]?.[0]).toEqual({ itemId: 'bags', mode: 'in', quantity: 5, reason: null, note: null, unitCost: 0.35 });
    expect(plain(saved[0])).toContain('+5 unidades a S/ 0.35 por unidad (costo estándar)');
  });

  it('asks for the cost before an exit too, but not for a count that matches', () => {
    const { fixture } = open([], BAGS);
    choose(fixture, 'out');
    write(fixture, 2);
    expect(costField(fixture)).not.toBeNull();

    choose(fixture, 'count');
    write(fixture, 10);
    expect(costField(fixture)).toBeNull();
    write(fixture, 12);
    expect(costField(fixture)).not.toBeNull();
  });

  it('asks for the cost when the database says there is none, and shows its sentence as it came', async () => {
    const refusal = { code: 'P0001', message: 'Dulces todavía no tiene costo: escribe cuánto vale cada g.' };
    const { fixture, refused } = open([refusal]);
    write(fixture, 500);
    expect(costField(fixture)).toBeNull();

    await submit(fixture);

    expect(refused.count).toBe(1);
    expect(text(fixture)).toContain('Dulces todavía no tiene costo: escribe cuánto vale cada g.');
    expect(costField(fixture)).not.toBeNull();
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('takes the refusal back once a cost is written, instead of contradicting the preview (review)', async () => {
    const refusal = { code: 'P0001', message: 'Dulces todavía no tiene costo: escribe cuánto vale cada g.' };
    const { fixture } = open([refusal]);
    write(fixture, 500);
    await submit(fixture);

    type(fixture, 'unitCost', 0.02);

    expect(text(fixture)).not.toContain('todavía no tiene costo');
    expect(text(fixture)).toContain('Entra a S/ 0.02 por g, que queda como su costo.');
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('keeps a refusal that is not about the cost while the cost is typed', async () => {
    const { fixture } = open([{ code: 'P0001', message: 'No puedes sacar más de lo que hay: quedan 3 unidades.' }], BAGS);
    write(fixture, 5);
    type(fixture, 'unitCost', 0.35);
    await submit(fixture);

    type(fixture, 'unitCost', 0.4);

    expect(text(fixture)).toContain('No puedes sacar más de lo que hay: quedan 3 unidades.');
  });
});
