import { plan, type PlanDemand, type PlanInput } from '@pickypop/domain';
import type { StoredLine } from '../cotizador/cotizador.data';
import type { WhatIf } from '../cotizador/sale-promise';
import { quoteSituation } from './quote-situation';

// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';

const stored = (overrides: Partial<StoredLine> = {}): StoredLine => ({
  id: 'ql1',
  position: 1,
  kind: 'catalog',
  variantId: 'v-pocion',
  description: 'Botella de poción',
  quantity: 3,
  setupMinutes: 0,
  minutesPerUnit: 0,
  unitCost: 5,
  unitPrice: 10,
  lineTotal: 30,
  plates: [],
  supplies: [],
  filamentLabels: {},
  filamentCostPerKg: {},
  ...overrides,
});

const quoteDemand = (holdUntil: string): PlanDemand => ({
  kind: 'quote',
  id: 'q1',
  number: 'COT-0005',
  customerName: 'María Pérez',
  priorityAt: '2026-10-06T20:00:00.000Z',
  holdUntil,
  dueDate: null,
  lines: [{ id: 'ql1', description: 'Botella de poción', quantity: 3, variantId: 'v-pocion', custom: null }],
});

const order: PlanDemand = {
  kind: 'order',
  id: 'o1',
  number: 'PED-0011',
  customerName: 'Diego Flores',
  priorityAt: '2026-10-06T21:00:00.000Z',
  holdUntil: null,
  dueDate: null,
  lines: [{ id: 'ol1', description: 'Botella de poción', quantity: 2, variantId: 'v-pocion', custom: null }],
};

const snapshot = (demands: PlanDemand[]): PlanInput => ({
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
    { id: 'pocion', name: 'Botella de poción armada', kind: 'finished_good', unit: 'unidad', onHand: 2 },
    { id: 'bolsa', name: 'Bolsa con etiqueta', kind: 'packaging', unit: 'unidad', onHand: 100 },
  ],
  filaments: [],
  recipes: [
    {
      variantId: 'v-pocion',
      name: 'Botella de poción',
      assembled: true,
      finishedItemId: 'pocion',
      components: [{ itemId: 'bolsa', perUnit: 1 }],
      setupMinutes: 0,
      minutesPerUnit: 1,
    },
  ],
  plates: [],
  demands,
});

const whatIfOver =
  (input: PlanInput): WhatIf =>
  (change) =>
    plan(change(structuredClone(input)));

describe('where a quote stands', () => {
  it('reads a quote holding from its own place in the line, ahead of a later order', () => {
    const input = snapshot([quoteDemand('2026-10-07T23:00:00.000Z'), order]);
    const situation = quoteSituation(input, plan(input), { id: 'q1', storedLines: [stored()] }, whatIfOver(input));

    expect(situation.held).toBe(true);
    expect(situation.promise.lines[0]?.plan.onShelf).toBe(2);
    expect(situation.promise.lines[0]?.forOrders).toEqual([]);
  });

  it('puts a quote whose hold is gone at the end of the line, as accepting it today would', () => {
    const input = snapshot([quoteDemand('2026-10-06T22:00:00.000Z'), order]);
    const situation = quoteSituation(input, plan(input), { id: 'q1', storedLines: [stored()] }, whatIfOver(input));

    expect(situation.held).toBe(false);
    expect(situation.promise.lines[0]?.plan.onShelf).toBe(0);
    expect(situation.promise.lines[0]?.forOrders).toEqual([
      { itemId: 'pocion', label: 'Botella de poción armada', amount: 2, unit: 'unidad' },
    ]);
  });

  it('places a made-to-order line by its frozen plates, and names a filament by its frozen label', () => {
    const custom = stored({
      kind: 'custom',
      variantId: null,
      description: 'Calavera',
      quantity: 2,
      plates: [
        {
          label: 'Calavera',
          printTimeSeconds: 3600,
          unitsPerRun: 1,
          source: 'file',
          sourceFileName: null,
          filaments: [{ slot: 1, grams: 20, colorHex: null, type: 'PLA', trayInfoIdx: null, filamentSkuId: 'negro' }],
        },
      ],
      filamentLabels: { negro: 'PLA Negro' },
    });
    const input = snapshot([]);
    const situation = quoteSituation(input, plan(input), { id: 'q-draft', storedLines: [custom] }, whatIfOver(input));
    const line = situation.promise.lines[0]!;

    expect(situation.held).toBe(false);
    expect(line.plan.toMake).toBe(2);
    expect(Date.parse(line.plan.readyAt)).toBeGreaterThan(Date.parse(NOW));
    expect(line.plan.shortages).toEqual([{ kind: 'filament', id: 'negro', label: 'PLA Negro', missing: 40, unit: 'g' }]);
  });
});
