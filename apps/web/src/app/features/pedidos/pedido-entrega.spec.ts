import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserFacingError } from '../../core/friendly-error';
import { PlanService } from '../../core/plan';
import { PedidoEntrega } from './pedido-entrega';
import { PedidosData, type NewDelivery, type OrderLine } from './pedidos.data';

function line(pending: number): OrderLine {
  return {
    id: 'line-1',
    position: 1,
    variantId: 'variant-1',
    kind: 'catalog',
    description: 'Botella de poción',
    imagePath: null,
    quantity: 3,
    unitPrice: 14,
    estimatedUnitCost: 5,
    lineTotal: 42,
    delivered: 3 - pending,
    pending,
    prints: { planned: 0, printing: 0, printed: 0 },
  };
}

interface Opened {
  fixture: ComponentFixture<PedidoEntrega>;
  calls: [NewDelivery, string][];
  /** The database answers the call in flight. */
  answer: (failure?: unknown) => void;
  events: string[];
}

/** After a lost answer: whether the delivery is in the database, or the question fails too. */
type Recorded = boolean | 'unreachable';

/** The database answers only when `answer` is called: a second click arrives while it is still busy. */
async function open(pending = 3, recorded: Recorded = false): Promise<Opened> {
  const calls: [NewDelivery, string][] = [];
  const events: string[] = [];
  let answer: (failure?: unknown) => void = () => {};
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      // The plan cannot say what is ready: the form starts empty and the person types.
      { provide: PlanService, useValue: { version: signal(0), current: () => Promise.reject(new Error('sin plan')) } },
      {
        provide: PedidosData,
        useValue: {
          deliver: (delivery: NewDelivery, key: string) => {
            calls.push([delivery, key]);
            return new Promise<void>((resolve, reject) => (answer = (failure) => (failure ? reject(failure) : resolve())));
          },
          deliveryRecorded: async () => {
            if (recorded === 'unreachable') throw new Error('Failed to fetch');
            return recorded;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PedidoEntrega);
  fixture.componentRef.setInput('orderId', 'order-7');
  fixture.componentRef.setInput('lines', [line(pending)]);
  fixture.componentInstance.delivered.subscribe(() => events.push('delivered'));
  fixture.componentInstance.stale.subscribe(() => events.push('stale'));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, calls, answer: (failure) => answer(failure), events };
}

const LOST = { code: '', message: 'TypeError: Failed to fetch' };

const text = (fixture: ComponentFixture<PedidoEntrega>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function typedQuantity(fixture: ComponentFixture<PedidoEntrega>): string {
  return (fixture.nativeElement.querySelector('input.qty') as HTMLInputElement).value;
}

function type(fixture: ComponentFixture<PedidoEntrega>, quantity: string): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input.qty');
  input.value = quantity;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/** «Entregar…» and then «Sí, entregar», as a person does. */
function confirm(fixture: ComponentFixture<PedidoEntrega>): HTMLButtonElement {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
  fixture.detectChanges();
  const yes = [...fixture.nativeElement.querySelectorAll('.confirm button')].find((button) =>
    (button as HTMLButtonElement).textContent?.includes('Sí, entregar'),
  ) as HTMLButtonElement;
  return yes;
}

async function settle(fixture: ComponentFixture<PedidoEntrega>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PedidoEntrega', () => {
  it('sends one delivery for a double click, with its key', async () => {
    const { fixture, calls, answer } = await open();
    type(fixture, '1');
    const yes = confirm(fixture);

    yes.click();
    yes.click();
    answer();
    await settle(fixture);

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatchObject({ orderId: 'order-7', lines: [{ order_line_id: 'line-1', quantity: 1 }] });
    expect(calls[0]![1]).toMatch(/[0-9a-f-]{36}/);
  });

  it('sends the same key again after an answer that never arrived and was not recorded', async () => {
    const { fixture, calls, answer } = await open();
    type(fixture, '1');
    confirm(fixture).click();
    answer(LOST);
    await settle(fixture);
    expect(text(fixture)).toContain('Vuelve a entregar sin cambiar nada');

    confirm(fixture).click();
    answer();
    await settle(fixture);

    expect(calls).toHaveLength(2);
    expect(calls[1]![1]).toBe(calls[0]![1]);
  });

  it('asks by its key after a lost answer, and a delivery that went out is said as done', async () => {
    const { fixture, calls, answer, events } = await open(3, true);
    type(fixture, '1');
    confirm(fixture).click();
    answer(LOST);
    await settle(fixture);

    expect(calls).toHaveLength(1);
    expect(events).toEqual(['delivered']);
    expect(text(fixture)).toContain('Entrega registrada: salió 1 unidad.');
  });

  it('gives the next delivery a key of its own once one went out', async () => {
    const { fixture, calls, answer } = await open();
    type(fixture, '1');
    confirm(fixture).click();
    answer();
    await settle(fixture);

    // The page reads the order again: one went out, two are pending.
    fixture.componentRef.setInput('lines', [line(2)]);
    fixture.detectChanges();
    type(fixture, '1');
    confirm(fixture).click();
    answer();
    await settle(fixture);

    expect(calls).toHaveLength(2);
    expect(calls[1]![1]).not.toBe(calls[0]![1]);
  });

  it('keeps the quantity typed and its key when the order read again after a lost answer shows less pending', async () => {
    const { fixture, calls, answer, events } = await open(3, 'unreachable');
    type(fixture, '1');
    confirm(fixture).click();
    answer(LOST);
    await settle(fixture);
    expect(events).toEqual(['stale']);

    // The first one did go out, and the screen could not ask: the reload shows 2 pending.
    fixture.componentRef.setInput('lines', [line(2)]);
    await settle(fixture);
    expect(typedQuantity(fixture)).toBe('1');

    confirm(fixture).click();
    answer();
    await settle(fixture);

    // The same key: the database returns the delivery it made, not a second one.
    expect(calls[1]![1]).toBe(calls[0]![1]);
  });

  it('keeps what was typed after a refusal reads the order again', async () => {
    const { fixture, calls, answer } = await open();
    type(fixture, '2');
    confirm(fixture).click();
    answer(new UserFacingError('No alcanza para entregar. Falta: Botella de poción (hacen falta 2 y hay 1).'));
    await settle(fixture);

    fixture.componentRef.setInput('lines', [line(3)]);
    await settle(fixture);

    expect(text(fixture)).toContain('No alcanza para entregar.');
    expect(typedQuantity(fixture)).toBe('2');
    expect(calls).toHaveLength(1);
  });
});
