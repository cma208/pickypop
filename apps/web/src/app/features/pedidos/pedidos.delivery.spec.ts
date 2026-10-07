import {
  costDifference,
  deliverableToday,
  deliverButtonLabel,
  deliveredEstimate,
  deliveryConfirmation,
  readyByLine,
  deliveredAtFor,
  deliversEverything,
  deliveryPayload,
  partialDeliveries,
  unitsLeaving,
  type DeliveryQuantity,
} from './pedidos.delivery';
import type { PlanDemandPlan } from '@pickypop/domain';

const potions: DeliveryQuantity = { orderLineId: 'potions', pending: 6, quantity: 6 };
const caps: DeliveryQuantity = { orderLineId: 'caps', pending: 2, quantity: 2 };

describe('deliveryPayload', () => {
  it('sends every line with what goes out today, as deliver_order reads it', () => {
    expect(deliveryPayload([potions, caps])).toEqual([
      { order_line_id: 'potions', quantity: 6 },
      { order_line_id: 'caps', quantity: 2 },
    ]);
  });

  it('leaves out a line set to zero or left empty: it does not go out today', () => {
    expect(deliveryPayload([{ ...potions, quantity: 4 }, { ...caps, quantity: 0 }])).toEqual([
      { order_line_id: 'potions', quantity: 4 },
    ]);
    expect(deliveryPayload([{ ...potions, quantity: null }])).toEqual([]);
  });

  it('does not judge the quantity: more than pending goes to the database, which answers', () => {
    expect(deliveryPayload([{ ...caps, quantity: 5 }])).toEqual([{ order_line_id: 'caps', quantity: 5 }]);
  });
});

describe('deliversEverything and the button', () => {
  it('reads "everything" while the form still holds all that is missing', () => {
    expect(deliversEverything([potions, caps])).toBe(true);
    expect(deliverButtonLabel([potions, caps])).toBe('Entregar todo (8 unidades)');
    expect(deliverButtonLabel([{ ...caps, pending: 1, quantity: 1 }])).toBe('Entregar todo (1 unidad)');
  });

  it('says how much of the total goes when it is only a part', () => {
    const partial = [{ ...potions, quantity: 3 }, { ...caps, quantity: 0 }];
    expect(deliversEverything(partial)).toBe(false);
    expect(unitsLeaving(partial)).toBe(3);
    expect(deliverButtonLabel(partial)).toBe('Entregar 3 de 8');
  });

  it('does not promise "5 de 2" when the form asks for more than is missing', () => {
    expect(deliverButtonLabel([{ ...caps, pending: 1, quantity: 5 }])).toBe('Entregar 5');
  });

  it('asks for a choice when nothing would go out', () => {
    expect(deliverButtonLabel([{ ...potions, quantity: 0 }, { ...caps, quantity: null }])).toBe('Elige qué se entrega');
  });
});

describe('deliveredAtFor', () => {
  it('leaves today to the database, which stamps the real time', () => {
    expect(deliveredAtFor('2026-10-06', '2026-10-06')).toBeNull();
  });

  it('records another day at noon in Lima, so it never slides to the day before', () => {
    expect(deliveredAtFor('2026-10-04', '2026-10-06')).toBe('2026-10-04T17:00:00.000Z');
  });
});

describe('partialDeliveries', () => {
  it('marks an order with something out and something still pending', () => {
    const partial = partialDeliveries([
      // Line one went out whole, line two not yet: the order is half delivered
      // even though no single line is.
      { orderId: 'a', quantity: 2, delivered: 2, pending: 0 },
      { orderId: 'a', quantity: 3, delivered: 0, pending: 3 },
      { orderId: 'b', quantity: 4, delivered: 0, pending: 4 },
      { orderId: 'c', quantity: 1, delivered: 1, pending: 0 },
    ]);

    expect(partial.get('a')).toEqual({ delivered: 2, ordered: 5 });
    expect(partial.has('b')).toBe(false);
    expect(partial.has('c')).toBe(false);
  });
});

describe('what the delivered units cost', () => {
  it('adds the estimate line by line, rounded to cents', () => {
    expect(
      deliveredEstimate([
        { estimatedUnitCost: 4.22, delivered: 3 },
        { estimatedUnitCost: 0.333, delivered: 1 },
        { estimatedUnitCost: 9, delivered: 0 },
      ]),
    ).toBe(12.99);
  });

  it('says the difference like every other amount', () => {
    expect(costDifference(7.21, 12.66)).toBe(-5.45);
    expect(costDifference(0.1 + 0.2, 0.3)).toBe(0);
  });
});

describe('what the delivery proposes', () => {
  const line = (lineId: string, onShelf: number) => ({ lineId, onShelf }) as PlanDemandPlan['lines'][number];
  const plan = {
    demands: [
      { kind: 'quote' as const, id: 'ord-1', lines: [line('q-line', 9)] },
      { kind: 'order' as const, id: 'ord-1', lines: [line('skulls', 1), line('keychain', 0)] },
    ],
  };

  it('reads what is ready for this order from the plan, and nothing from a quote with the same id', () => {
    expect(readyByLine(plan, 'ord-1')).toEqual(new Map([['skulls', 1], ['keychain', 0]]));
  });

  it('cannot say anything for an order the plan does not have', () => {
    expect(readyByLine(plan, 'ord-2')).toBeNull();
    expect(readyByLine(null, 'ord-1')).toBeNull();
  });

  it('starts with what is ready, not with everything pending', () => {
    // One assembled skull of the two ordered: «Entregar todo (2 unidades)» was a lie.
    const ready = new Map([['skulls', 1]]);
    expect(deliverableToday([{ id: 'skulls', pending: 2 }], ready)).toEqual([1]);
  });

  it('never proposes more than is pending, nor anything the plan did not mention', () => {
    const ready = new Map([['skulls', 5]]);
    expect(deliverableToday([{ id: 'skulls', pending: 2 }, { id: 'caps', pending: 3 }], ready)).toEqual([2, 0]);
    expect(deliverableToday([{ id: 'skulls', pending: 2 }], null)).toEqual([0]);
  });
});

describe('deliveryConfirmation', () => {
  it('says how many units leave the shelf before anything moves', () => {
    expect(deliveryConfirmation([{ quantity: 2, kind: 'catalog' }])).toBe(
      'Van a salir 2 unidades del estante. Esto no se puede deshacer.',
    );
    expect(deliveryConfirmation([{ quantity: 1, kind: 'catalog' }, { quantity: 0, kind: 'catalog' }])).toBe(
      'Va a salir 1 unidad del estante. Esto no se puede deshacer.',
    );
  });

  it('does not say made-to-order work leaves the shelf: it never was there', () => {
    expect(deliveryConfirmation([{ quantity: 2, kind: 'catalog' }, { quantity: 1, kind: 'custom' }])).toBe(
      'Van a salir 2 unidades del estante. Se entrega 1 unidad hecha para este pedido. Esto no se puede deshacer.',
    );
  });
});
