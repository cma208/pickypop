import type { PlanItemPosition, PlanRecipe } from '@pickypop/domain';
import {
  isWalkInName,
  lineTotal,
  oneMore,
  owesWithoutName,
  sameCustomer,
  saleDone,
  saleKey,
  saleProblem,
  saleTotals,
  sameTotals,
  shelfOffers,
  toQuickSale,
  wholeUnits,
  type CustomerChoice,
  type QuickSalePayload,
  type SaleCustomer,
  type SaleLineValue,
  type SalePayment,
  type ShelfOffer,
  type VariantInfo,
} from './quick-sale';

function recipe(variantId: string, overrides: Partial<PlanRecipe> = {}): PlanRecipe {
  return {
    variantId,
    name: variantId,
    assembled: true,
    finishedItemId: `item-${variantId}`,
    components: [],
    setupMinutes: 0,
    minutesPerUnit: 0,
    ...overrides,
  };
}

function position(itemId: string, onHand: number, free: number): PlanItemPosition {
  return { itemId, onHand, forOrders: onHand - free, held: 0, free, missing: 0, missingForOrders: 0 };
}

const pink: VariantInfo = { id: 'pink', productName: 'Canastita', variantName: 'Rosada', imagePath: 'pink.jpg', listPrice: 15 };
const blue: VariantInfo = { id: 'blue', productName: 'Canastita', variantName: 'Azul', imagePath: null, listPrice: 18 };
const skull: VariantInfo = { id: 'skull', productName: 'Calavera dulcera', variantName: 'Con dulces', imagePath: null, listPrice: 25 };

function offer(variant: VariantInfo, free: number, unitCost: number | null = null): ShelfOffer {
  return { ...variant, label: `${variant.productName} — ${variant.variantName}`, free, onHand: free, unitCost };
}

const offers = new Map([
  ['pink', offer(pink, 3)],
  ['blue', offer(blue, 1)],
]);

function line(overrides: Partial<SaleLineValue> = {}): SaleLineValue {
  return { variantId: 'pink', quantity: 2, unitPrice: 15, shelfUnitCost: 6.123456, priceStatus: 'ready', ...overrides };
}

const nobody: SaleCustomer = { customerId: '', name: '', phone: '' };
const rosa: SaleCustomer = { customerId: '', name: 'Rosa', phone: '' };
const cash: SalePayment = { amount: 30, accountId: 'cash', method: '', reference: '', soldAt: null };

describe('shelfOffers', () => {
  it('offers what the plan says is free, in whole units, by name', () => {
    const view = {
      input: { recipes: [recipe('pink'), recipe('blue'), recipe('skull')] },
      result: {
        items: [
          position('item-pink', 5, 2.9999999),
          // All five separated for orders: nothing to sell.
          position('item-blue', 5, 0),
          position('item-skull', 1, 1),
        ],
      },
    };

    const result = shelfOffers(view, [pink, blue, skull], new Map([['pink', 6.123456]]));

    expect(result.map((row) => [row.label, row.free, row.onHand, row.unitCost])).toEqual([
      ['Calavera dulcera — Con dulces', 1, 1, null],
      ['Canastita — Rosada', 3, 5, 6.123456],
    ]);
    expect(result[1]!.imagePath).toBe('pink.jpg');
  });

  it('leaves out what is not assembled, what nobody assembled and what the plan does not know', () => {
    const view = {
      input: {
        recipes: [
          recipe('pink', { assembled: false }),
          recipe('blue', { finishedItemId: null }),
          recipe('skull', { finishedItemId: 'inactive-item' }),
        ],
      },
      result: { items: [position('item-pink', 4, 4), position('item-blue', 4, 4)] },
    };

    expect(shelfOffers(view, [pink, blue, skull])).toEqual([]);
  });

  it('leaves out a variant it has no name for', () => {
    const view = { input: { recipes: [recipe('ghost')] }, result: { items: [position('item-ghost', 2, 2)] } };
    expect(shelfOffers(view, [pink])).toEqual([]);
  });
});

describe('wholeUnits and oneMore', () => {
  it('reads the plan as whole units, never negative', () => {
    expect(wholeUnits(2.9999999)).toBe(3);
    expect(wholeUnits(2.5)).toBe(2);
    expect(wholeUnits(-1)).toBe(0);
  });

  it('adds one, up to what is free', () => {
    expect(oneMore(1, 3)).toBe(2);
    expect(oneMore(3, 3)).toBe(3);
    expect(oneMore(Number.NaN, 3)).toBe(1);
  });
});

describe('saleTotals', () => {
  it('adds the lines with the price as it will be stored, to the cent', () => {
    // 15.555 is stored as 15.56: two of them are 31.12, not 31.11.
    expect(lineTotal({ quantity: 2, unitPrice: 15.555 })).toBe(31.12);
    const totals = saleTotals([line(), line({ variantId: 'blue', quantity: 1, unitPrice: 18, shelfUnitCost: 7 })], 20);
    expect(totals).toEqual({ total: 48, cost: 19.25, collected: 20, owed: 28 });
  });

  it('rounds what each line takes off the shelf like Resultados does', () => {
    // 6.123456 × 2 = 12.246912, which the income statement rounds to 12.25.
    expect(saleTotals([line()], 0).cost).toBe(12.25);
  });

  it('tells equal totals from new ones by their figures, not by the object', () => {
    const totals = saleTotals([line()], 30);
    expect(sameTotals(totals, saleTotals([line()], 30))).toBe(true);
    expect(sameTotals(totals, saleTotals([line()], 20))).toBe(false);
  });

  it('counts nothing for a line that is not ready to count', () => {
    // Half a unit counts for nothing; a line without a price still has its cost.
    const totals = saleTotals([line({ quantity: 1.5 }), line({ unitPrice: null })], null);
    expect(totals).toEqual({ total: 0, cost: 12.25, collected: 0, owed: 0 });
    expect(saleTotals([line({ shelfUnitCost: null })], 0).cost).toBe(0);
  });
});

describe('saleProblem', () => {
  const check = (overrides: Partial<Parameters<typeof saleProblem>[0]> = {}) =>
    saleProblem({ lines: [line()], offers, customer: nobody, payment: cash, ...overrides });

  it('lets a complete sale go', () => {
    expect(check()).toBeNull();
    expect(check({ customer: rosa, payment: { ...cash, amount: 0, accountId: '' } })).toBeNull();
  });

  it('asks for something to sell', () => {
    expect(check({ lines: [] })).toBe('Toca un producto del estante para agregarlo a la venta.');
  });

  it('stops at more than is free, and at what is no longer on the shelf', () => {
    expect(check({ lines: [line({ quantity: 4 })] })).toBe(
      'De «Canastita — Rosada» hay 3 libres en el estante: no alcanza para 4.',
    );
    expect(check({ lines: [line({ variantId: 'blue', quantity: 2 })] })).toBe(
      'De «Canastita — Azul» hay 1 libre en el estante: no alcanza para 2.',
    );
    expect(check({ lines: [line({ variantId: 'skull' })] })).toBe(
      'Uno de los productos ya no está libre en el estante: quítalo de la venta.',
    );
  });

  it('asks for a whole quantity and a price', () => {
    expect(check({ lines: [line({ quantity: 0 })] })).toBe(
      'La cantidad de «Canastita — Rosada» tiene que ser un número entero mayor que cero.',
    );
    expect(check({ lines: [line({ unitPrice: null })] })).toBe('Escribe el precio de «Canastita — Rosada».');
    expect(check({ lines: [line({ unitPrice: -1 })] })).toBe('Escribe el precio de «Canastita — Rosada».');
  });

  it('waits for the ladder’s price for that quantity, not for a cost', () => {
    expect(check({ lines: [line({ priceStatus: 'pending' })] })).toBe(
      'Un momento: estamos leyendo el precio de «Canastita — Rosada» para esa cantidad.',
    );
    // Nothing on the shelf says what it cost: the sale goes, and the line says so.
    expect(check({ lines: [line({ shelfUnitCost: null })] })).toBeNull();
  });

  it('refuses a sale of nothing: that is a gift', () => {
    expect(check({ lines: [line({ unitPrice: 0 })], payment: { ...cash, amount: 0 } })).toBe(
      'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.',
    );
  });

  it('checks the money like the database does', () => {
    expect(check({ payment: { ...cash, amount: null } })).toBe('Escribe cuánto te pagaron ahora, o 0 si te paga después.');
    expect(check({ payment: { ...cash, amount: -5 } })).toBe('Lo cobrado no puede ser negativo.');
    // Soles as the screen writes them, with a non-breaking space.
    expect(check({ payment: { ...cash, amount: 30.01 } })).toBe(
      'Lo cobrado (S/ 30.01) pasa del total de la venta (S/ 30.00).',
    );
    expect(check({ payment: { ...cash, accountId: '' } })).toBe(
      'Elige la cuenta donde entró el dinero, o deja lo cobrado en cero si te paga después.',
    );
  });

  it('asks for the method when the account has none of its own', () => {
    const accounts = [
      { id: 'cash', name: 'Efectivo', defaultMethod: 'cash' as const },
      { id: 'yape', name: 'Yape', defaultMethod: null },
    ];
    expect(check({ accounts })).toBeNull();
    expect(check({ accounts, payment: { ...cash, accountId: 'yape' } })).toBe(
      'Falta el medio de pago: la cuenta Yape no tiene uno por defecto.',
    );
    expect(check({ accounts, payment: { ...cash, accountId: 'yape', method: 'yape' } })).toBeNull();
    // Nothing collected: no account, no method.
    expect(check({ accounts, customer: rosa, payment: { ...cash, amount: 0, accountId: 'yape' } })).toBeNull();
  });

  it('wants somebody to owe what is not collected', () => {
    const owed = 'Quedan S/\u00a030.00 por cobrar. Escribe el nombre de quien te debe, o elige al cliente: una deuda sin nombre no hay a quién cobrársela.';
    // «Me paga después» from nobody, or part of it.
    expect(check({ payment: { ...cash, amount: 0, accountId: '' } })).toBe(owed);
    expect(check({ payment: { ...cash, amount: 10 } })).toBe(owed.replace('30.00', '20.00'));
    expect(check({ customer: { ...nobody, name: '   ' }, payment: { ...cash, amount: 0 } })).toBe(owed);
    // A name to create, or somebody from the list, owes it.
    expect(check({ customer: rosa, payment: { ...cash, amount: 10 } })).toBeNull();
    expect(check({ customer: { customerId: 'maria', name: '', phone: '' }, payment: { ...cash, amount: 0 } })).toBeNull();
    // Paid in full, nobody needs to owe anything.
    expect(check({ customer: nobody })).toBeNull();
  });

  it('takes the walk-in customer\'s name typed by hand for nobody: it cannot owe', () => {
    const owed = 'Quedan S/\u00a030.00 por cobrar. Escribe el nombre de quien te debe, o elige al cliente: una deuda sin nombre no hay a quién cobrársela.';
    const typed = { customerId: '', name: ' clientes  VARIOS ', phone: '' };

    expect(check({ customer: typed, payment: { ...cash, amount: 0, accountId: '' } })).toBe(owed);
    // Renamed in the workshop, its own name and the default one both name nobody.
    const renamed = { customerId: '', name: 'Público General', phone: '' };
    expect(check({ customer: renamed, walkInName: 'Público general', payment: { ...cash, amount: 0 } })).toBe(owed);
    expect(check({ customer: typed, walkInName: 'Público general', payment: { ...cash, amount: 0 } })).toBe(owed);
    // Paid in full, the sale goes to the walk-in customer as if no name was typed.
    expect(check({ customer: typed })).toBeNull();
  });

  it('keeps no phone for the walk-in customer', () => {
    expect(check({ customer: { customerId: '', name: 'Clientes varios', phone: '987654321' } })).toBe(
      '«Clientes varios» es el cliente de las ventas sin nombre: para guardar un teléfono, escribe el nombre de la persona.',
    );
  });

  it('wants a name to keep a phone, and no sale in the future', () => {
    expect(check({ customer: { ...nobody, phone: '987654321' } })).toBe('Escribe el nombre del cliente para guardar su teléfono.');
    expect(check({ customer: { customerId: 'maria', name: '', phone: '987' } })).toBeNull();
    expect(
      check({ payment: { ...cash, soldAt: '2026-10-08T15:00:00.000Z' }, now: new Date('2026-10-07T15:00:00.000Z') }),
    ).toBe('La venta no puede tener fecha futura.');
    expect(
      check({ payment: { ...cash, soldAt: '2026-10-05T15:00:00.000Z' }, now: new Date('2026-10-07T15:00:00.000Z') }),
    ).toBeNull();
  });
});

describe('toQuickSale', () => {
  it('sends the lines with their price to the cent and no cost: the database puts what left the shelf', () => {
    const payload = toQuickSale({ lines: [line({ unitPrice: 14.999 })], customer: nobody, payment: cash, note: '  ' });
    expect(payload.lines).toEqual([{ variant_id: 'pink', quantity: 2, unit_price: 15 }]);
    expect(payload.note).toBeNull();
  });

  it('sends the chosen channel, or none for the workshop’s default', () => {
    const base = { lines: [line()], customer: nobody, payment: cash, note: '' };
    expect(toQuickSale({ ...base, channelId: 'instagram' }).channelId).toBe('instagram');
    expect(toQuickSale({ ...base, channelId: '' }).channelId).toBeNull();
    expect(toQuickSale(base).channelId).toBeNull();
  });

  it('sends nobody for the walk-in customer, a name to create, or only the chosen one', () => {
    const walkIn = toQuickSale({ lines: [line()], customer: nobody, payment: cash, note: '' });
    expect([walkIn.customerId, walkIn.customerName, walkIn.customerPhone]).toEqual([null, null, null]);

    const typed = toQuickSale({ lines: [line()], customer: { customerId: '', name: ' Rosa ', phone: ' 912 ' }, payment: cash, note: '' });
    expect([typed.customerId, typed.customerName, typed.customerPhone]).toEqual([null, 'Rosa', '912']);

    const chosen = toQuickSale({ lines: [line()], customer: { customerId: 'maria', name: 'Rosa', phone: '912' }, payment: cash, note: '' });
    expect([chosen.customerId, chosen.customerName, chosen.customerPhone]).toEqual(['maria', null, null]);
  });

  it('sends nobody when the name typed is the walk-in customer\'s', () => {
    const typed = toQuickSale({ lines: [line()], customer: { customerId: '', name: 'CLIENTES VARIOS', phone: '' }, payment: cash, note: '' });
    expect([typed.customerId, typed.customerName]).toEqual([null, null]);

    const renamed = toQuickSale({
      lines: [line()],
      customer: { customerId: '', name: 'público general', phone: '' },
      payment: cash,
      note: '',
      walkInName: 'Público general',
    });
    expect(renamed.customerName).toBeNull();
  });

  it('sends no account, method nor reference when nothing is collected', () => {
    const later = toQuickSale({
      lines: [line()],
      customer: nobody,
      payment: { amount: 0, accountId: 'yape', method: 'yape', reference: 'OP-1', soldAt: null },
      note: '',
    });
    expect([later.amount, later.accountId, later.method, later.reference]).toEqual([0, null, null, null]);

    const now = toQuickSale({
      lines: [line()],
      customer: nobody,
      payment: { amount: 10.004, accountId: 'yape', method: 'yape', reference: ' OP-1 ', soldAt: '2026-10-05T15:00:00.000Z' },
      note: 'Feria',
    });
    expect([now.amount, now.accountId, now.method, now.reference, now.soldAt, now.note]).toEqual([
      10,
      'yape',
      'yape',
      'OP-1',
      '2026-10-05T15:00:00.000Z',
      'Feria',
    ]);
  });

  it('leaves the method to the account when none is chosen', () => {
    expect(toQuickSale({ lines: [line()], customer: nobody, payment: cash, note: '' }).method).toBeNull();
  });
});

describe('sameCustomer', () => {
  const customers: CustomerChoice[] = [
    { id: 'walk-in', name: 'Clientes varios', phone: null, walkIn: true },
    { id: 'maria', name: 'María Torres', phone: '987 654 321', walkIn: false },
    { id: 'rosa', name: 'Rosa Díaz', phone: null, walkIn: false },
  ];

  it('recognises a phone written another way', () => {
    expect(sameCustomer(customers, '', '+51 987654321')?.id).toBe('maria');
    expect(sameCustomer(customers, 'Otra', '987-654-321')?.id).toBe('maria');
  });

  it('recognises a name without its accents or capitals', () => {
    expect(sameCustomer(customers, '  rosa   diaz ', '')?.id).toBe('rosa');
  });

  it('never offers the walk-in customer, and needs enough to go on', () => {
    expect(sameCustomer(customers, 'clientes varios', '')).toBeNull();
    expect(sameCustomer(customers, '', '987')).toBeNull();
    expect(sameCustomer(customers, '', '')).toBeNull();
    expect(sameCustomer(customers, 'Pedro', '912345678')).toBeNull();
  });
});

describe('owesWithoutName', () => {
  it('is a balance with nobody named', () => {
    expect(owesWithoutName({ owed: 5 }, nobody)).toBe(true);
    expect(owesWithoutName({ owed: 5 }, rosa)).toBe(false);
    expect(owesWithoutName({ owed: 5 }, { customerId: 'maria', name: '', phone: '' })).toBe(false);
    expect(owesWithoutName({ owed: 0 }, nobody)).toBe(false);
  });

  it('is a balance in the walk-in customer\'s name, too', () => {
    expect(owesWithoutName({ owed: 5 }, { customerId: '', name: 'Clientes Varios', phone: '' })).toBe(true);
    expect(owesWithoutName({ owed: 5 }, { customerId: '', name: 'Feria', phone: '' }, 'Feria')).toBe(true);
    expect(owesWithoutName({ owed: 0 }, { customerId: '', name: 'Clientes varios', phone: '' })).toBe(false);
  });
});

describe('isWalkInName', () => {
  it('is the default name, or the workshop\'s, in any case, spacing or accent', () => {
    expect(isWalkInName('  clientes   VARIOS ')).toBe(true);
    expect(isWalkInName('Clientes vários')).toBe(true);
    expect(isWalkInName('público general', 'Público General')).toBe(true);
    expect(isWalkInName('Clientes varios', 'Público General')).toBe(true);
  });

  it('is not a person, nor an empty field', () => {
    expect(isWalkInName('Rosa Díaz')).toBe(false);
    expect(isWalkInName('Clientes')).toBe(false);
    expect(isWalkInName('   ')).toBe(false);
  });
});

describe('saleKey', () => {
  const payload = (overrides: Partial<QuickSalePayload> = {}): QuickSalePayload => ({
    ...toQuickSale({ lines: [line()], customer: nobody, payment: cash, note: '' }),
    ...overrides,
  });
  let issued = 0;
  const fresh = () => `key-${++issued}`;

  it('gives a new sale a key of its own', () => {
    issued = 0;
    expect(saleKey(null, payload(), fresh)).toEqual({ key: 'key-1', reused: false });
  });

  it('keeps the key of the same sale sent again, so the database does not make it twice', () => {
    issued = 0;
    const last = { key: 'key-0', payload: payload() };
    expect(saleKey(last, payload(), fresh)).toEqual({ key: 'key-0', reused: true });
    expect(issued).toBe(0);
  });

  it('gives a changed sale a new key: it is another sale', () => {
    issued = 0;
    const last = { key: 'key-0', payload: payload() };
    expect(saleKey(last, payload({ amount: 20 }), fresh)).toEqual({ key: 'key-1', reused: false });
    expect(saleKey(last, payload({ customerName: 'Rosa' }), fresh).reused).toBe(false);
    expect(
      saleKey(last, payload({ lines: [{ variant_id: 'pink', quantity: 3, unit_price: 15 }] }), fresh).reused,
    ).toBe(false);
    // Through another channel it is another sale too.
    expect(saleKey(last, payload({ channelId: 'instagram' }), fresh).reused).toBe(false);
  });
});

describe('saleDone', () => {
  it('says what was sold, collected and owed with what the database answered', () => {
    const payload = toQuickSale({
      lines: [line(), line({ variantId: 'blue', quantity: 1, unitPrice: 18 })],
      customer: nobody,
      payment: { ...cash, amount: 20 },
      note: '',
    });
    expect(saleDone({ id: 'order', number: 'ORD-2026-0012', total: 48 }, payload, 'Clientes varios')).toEqual({
      orderId: 'order',
      number: 'ORD-2026-0012',
      customerName: 'Clientes varios',
      units: 3,
      total: 48,
      collected: 20,
      owed: 28,
    });
  });
});
