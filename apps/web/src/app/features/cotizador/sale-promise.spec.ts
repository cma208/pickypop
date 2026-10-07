import { plan, promiseFor, type PlanCandidateLine, type PlanDemand, type PlanInput } from '@pickypop/domain';
import { demandPromise, salePromise, SALE_ID, withSale, type WhatIf } from './sale-promise';

// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';
// Wednesday 7 October, 18:00 in Lima.
const WEDNESDAY_18 = '2026-10-07T23:00:00.000Z';

const maria: PlanDemand = {
  kind: 'quote',
  id: 'q-maria',
  number: 'COT-0004',
  customerName: 'María Pérez',
  priorityAt: '2026-10-06T20:00:00.000Z',
  holdUntil: WEDNESDAY_18,
  dueDate: null,
  lines: [{ id: 'ql-maria', description: 'Botella de poción', quantity: 4, variantId: 'v-pocion', custom: null }],
};

const ana: PlanDemand = {
  kind: 'order',
  id: 'o-ana',
  number: 'PED-0003',
  customerName: 'Ana Quispe',
  priorityAt: '2026-10-05T15:00:00.000Z',
  holdUntil: null,
  dueDate: null,
  lines: [{ id: 'ol-ana', description: 'Botella de poción', quantity: 4, variantId: 'v-pocion', custom: null }],
};

const snapshot = (demands: PlanDemand[], finished = 4): PlanInput => ({
  now: NOW,
  settings: {
    timeZone: 'America/Lima',
    window: { firstStart: 360, lastStart: 1380, endBy: 1440 },
    changeoverMinutes: 15,
    failureRate: 0,
  },
  printers: [{ id: 'p1', name: 'A1 mini' }],
  jobs: [],
  items: [
    { id: 'pocion', name: 'Botella de poción armada', kind: 'finished_good', unit: 'unidad', onHand: finished },
    { id: 'botella', name: 'Botella impresa', kind: 'part', unit: 'unidad', onHand: 0 },
    { id: 'tapa', name: 'Tapa impresa', kind: 'part', unit: 'unidad', onHand: 0 },
    { id: 'dulces', name: 'Dulces surtidos', kind: 'supply', unit: 'g', onHand: 0 },
    { id: 'bolsa', name: 'Bolsa con etiqueta', kind: 'packaging', unit: 'unidad', onHand: 50 },
  ],
  filaments: [{ skuId: 'rosado', label: 'PLA Rosado', onHandGrams: 1000 }],
  recipes: [
    {
      variantId: 'v-pocion',
      name: 'Botella de poción',
      assembled: true,
      finishedItemId: 'pocion',
      components: [
        { itemId: 'botella', perUnit: 1 },
        { itemId: 'tapa', perUnit: 1 },
        { itemId: 'dulces', perUnit: 66 },
        { itemId: 'bolsa', perUnit: 1 },
      ],
      setupMinutes: 10,
      minutesPerUnit: 5,
    },
  ],
  plates: [
    {
      id: 'plate-botella',
      label: 'Botella',
      printSeconds: 3600,
      outputs: [{ itemId: 'botella', units: 1 }],
      filaments: [{ skuId: 'rosado', label: 'PLA Rosado', grams: 11 }],
    },
    {
      id: 'plate-tapas',
      label: 'Tapas',
      printSeconds: 1200,
      outputs: [{ itemId: 'tapa', units: 9 }],
      filaments: [{ skuId: 'rosado', label: 'PLA Rosado', grams: 15 }],
    },
  ],
  demands,
});

const pociones = (quantity: number): PlanCandidateLine => ({
  description: 'Botella de poción',
  quantity,
  variantId: 'v-pocion',
  custom: null,
});

const whatIfOver =
  (input: PlanInput): WhatIf =>
  (change) =>
    plan(change(structuredClone(input)));

describe('¿para cuándo? for a sale nobody saved yet', () => {
  it('answers one line exactly as promiseFor does', () => {
    const input = snapshot([maria]);
    const answer = salePromise(input, [pociones(6)], whatIfOver(input)).lines[0]!.plan;
    const promised = promiseFor(input, pociones(6));

    expect({ ...answer, lineId: '' }).toEqual({ ...promised, lineId: '' });
  });

  it('says whose hold keeps what is on the shelf, and until when', () => {
    const input = snapshot([maria]);
    const line = salePromise(input, [pociones(6)], whatIfOver(input)).lines[0]!;

    expect(line.plan.onShelf).toBe(0);
    expect(line.plan.toMake).toBe(6);
    expect(line.holds).toEqual([
      {
        kind: 'quote',
        number: 'COT-0004',
        customerName: 'María Pérez',
        holdUntil: WEDNESDAY_18,
        amounts: [{ itemId: 'pocion', label: 'Botella de poción armada', amount: 4, unit: 'unidad' }],
        filaments: [],
        printing: false,
      },
    ]);
    expect(line.forOrders).toEqual([]);
  });

  it('gives the other date: if the hold ends unconfirmed, its four are this sale\'s', () => {
    const input = snapshot([maria]);
    const line = salePromise(input, [pociones(6)], whatIfOver(input)).lines[0]!;
    const without = promiseFor(snapshot([]), pociones(6));

    expect(without.onShelf).toBe(4);
    expect(line.readyWithoutHolds).toBe(without.readyAt);
    expect(Date.parse(line.readyWithoutHolds!)).toBeLessThan(Date.parse(line.plan.readyAt));
  });

  it('names a hold whose plates go first on the printer and use the filament this sale lacks', () => {
    const skulls: PlanDemand = {
      ...maria,
      id: 'q-skulls',
      number: 'COT-0006',
      customerName: 'Lucía Ramos',
      lines: [
        {
          id: 'ql-skulls',
          description: 'Calavera',
          quantity: 2,
          variantId: null,
          custom: {
            plates: [{ label: 'Calavera', printSeconds: 7200, unitsPerRun: 1, filaments: [{ skuId: 'rosado', label: 'PLA Rosado', grams: 495 }] }],
            supplies: [],
            setupMinutes: 0,
            minutesPerUnit: 0,
            printedUnits: 0,
          },
        },
      ],
    };
    const input = snapshot([skulls], 0);
    const line = salePromise(input, [pociones(2)], whatIfOver(input)).lines[0]!;

    expect(line.plan.shortages.some((shortage) => shortage.kind === 'filament' && shortage.id === 'rosado')).toBe(true);
    expect(line.holds).toEqual([
      {
        kind: 'quote',
        number: 'COT-0006',
        customerName: 'Lucía Ramos',
        holdUntil: WEDNESDAY_18,
        amounts: [],
        filaments: [{ itemId: 'rosado', label: 'PLA Rosado', amount: 990, unit: 'g' }],
        printing: true,
      },
    ]);
  });

  it('says nothing of a hold on what the line still got: the bags left are enough', () => {
    const input = snapshot([maria], 10);
    const line = salePromise(input, [pociones(6)], whatIfOver(input)).lines[0]!;

    expect(line.plan.onShelf).toBe(6);
    expect(line.holds).toEqual([]);
    expect(line.readyWithoutHolds).toBeNull();
  });

  it('tells a confirmed order apart from a hold: it is already sold', () => {
    const input = snapshot([ana]);
    const line = salePromise(input, [pociones(2)], whatIfOver(input)).lines[0]!;

    expect(line.holds).toEqual([]);
    expect(line.forOrders).toEqual([{ itemId: 'pocion', label: 'Botella de poción armada', amount: 4, unit: 'unidad' }]);
  });

  it('places the lines of one sale together, so two lines cannot take the same units', () => {
    const input = snapshot([]);
    const sale = salePromise(input, [pociones(3), pociones(3)], whatIfOver(input));

    expect(sale.lines.map((line) => line?.plan.onShelf)).toEqual([3, 1]);
    expect(sale.lines[1]?.plan.toMake).toBe(2);
    expect(sale.readyAt).toBe(sale.lines[1]?.plan.readyAt);
    expect(sale.needsPurchase).toBe(true);
  });

  it('keeps a line with nothing to ask in its place, and asks nothing when no line can be asked', () => {
    const input = snapshot([]);
    const sale = salePromise(input, [null, pociones(2)], whatIfOver(input));
    expect(sale.lines[0]).toBeNull();
    expect(sale.lines[1]?.plan.onShelf).toBe(2);

    const never: WhatIf = () => {
      throw new Error('nothing to ask');
    };
    expect(salePromise(input, [null], never)).toEqual({ now: NOW, lines: [null], readyAt: null, needsPurchase: false, unknown: false });
  });

  it('goes after everybody, even after a demand that took its place a second ago', () => {
    const late = { ...ana, id: 'o-late', number: 'PED-0009', priorityAt: NOW };
    const changed = withSale(snapshot([late]), [pociones(1)]);
    const sale = changed.demands.find((demand) => demand.id === SALE_ID)!;

    expect(Date.parse(sale.priorityAt)).toBeGreaterThan(Date.parse(NOW));
    expect(plan(changed).demands.map((demand) => demand.id)).toEqual(['o-late', SALE_ID]);
  });

  it('reads a quote already holding from its own place in the line', () => {
    const input = snapshot([maria]);
    const result = plan(input);
    const own = demandPromise(input, result, result.demands[0]!);

    expect(own.lines[0]?.plan.onShelf).toBe(4);
    expect(own.lines[0]?.holds).toEqual([]);
    expect(own.readyAt).toBe(result.demands[0]!.readyAt);
  });
});
