import { plan, type PlanDemandPlan, type PlanInput, type PlanResult } from '@pickypop/domain';
import {
  clampRuns,
  dayName,
  filamentRows,
  holdEndText,
  holdLead,
  holdsBehind,
  lateNotices,
  orderNumberIn,
  proposalKey,
  proposalsFor,
  runsText,
  runsToQueue,
  startText,
  yieldText,
} from './por-lanzar';

const LIMA = 'America/Lima';
// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';

/**
 * A proforma that holds the two bottles on the shelf, and two confirmed
 * orders behind it that now need bottles printed: the case «Por lanzar» has
 * to explain with "por el separo de…".
 */
function workshop(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    settings: {
      timeZone: LIMA,
      window: { firstStart: 360, lastStart: 1380, endBy: 1440 },
      changeoverMinutes: 15,
      failureRate: 0,
    },
    printers: [{ id: 'p1', name: 'A1 mini' }],
    jobs: [],
    items: [
      { id: 'bottle', name: 'Botella impresa', kind: 'part', unit: 'unidad', onHand: 2 },
      { id: 'cap', name: 'Tapa', kind: 'part', unit: 'unidad', onHand: 0 },
    ],
    filaments: [
      { skuId: 'pink', label: 'PLA Rosado', onHandGrams: 100 },
      { skuId: 'black', label: 'PLA Negro', onHandGrams: 500 },
    ],
    recipes: [
      {
        variantId: 'potion',
        name: 'Botella de poción · Con dulces',
        assembled: false,
        finishedItemId: null,
        components: [
          { itemId: 'bottle', perUnit: 1 },
          { itemId: 'cap', perUnit: 1 },
        ],
        setupMinutes: 0,
        minutesPerUnit: 0,
      },
    ],
    plates: [
      {
        id: 'plate-bottle',
        label: 'Botella',
        printSeconds: 2580,
        outputs: [{ itemId: 'bottle', units: 1 }],
        filaments: [{ skuId: 'pink', label: 'PLA Rosado', grams: 5 }],
      },
      {
        id: 'plate-caps',
        label: 'Tapas',
        printSeconds: 1200,
        outputs: [{ itemId: 'cap', units: 9 }],
        filaments: [{ skuId: 'black', label: 'PLA Negro', grams: 15 }],
      },
    ],
    demands: [
      {
        kind: 'quote',
        id: 'q1',
        number: 'COT-2026-0012',
        customerName: 'María Pérez',
        priorityAt: '2026-10-06T13:00:00.000Z',
        holdUntil: '2026-10-08T04:00:00.000Z',
        dueDate: null,
        lines: [{ id: 'ql1', description: 'Poción', quantity: 2, variantId: 'potion', custom: null }],
      },
      {
        kind: 'order',
        id: 'o1',
        number: 'PED-0003',
        customerName: 'Ana Quispe',
        priorityAt: '2026-10-06T14:00:00.000Z',
        holdUntil: null,
        dueDate: '2026-10-05',
        lines: [{ id: 'l1', description: 'Poción', quantity: 3, variantId: 'potion', custom: null }],
      },
      {
        kind: 'order',
        id: 'o2',
        number: 'PED-0005',
        customerName: 'Diego Flores',
        priorityAt: '2026-10-06T15:00:00.000Z',
        holdUntil: null,
        dueDate: '2026-10-08',
        lines: [{ id: 'l2', description: 'Poción', quantity: 2, variantId: 'potion', custom: null }],
      },
    ],
    ...overrides,
  };
}

function proposalOf(result: PlanResult, plateId: string) {
  const found = result.proposals.find((proposal) => proposal.plateId === plateId);
  if (!found) throw new Error(`no proposal for ${plateId}`);
  return found;
}

describe('«Por lanzar»', () => {
  const input = workshop();
  const result = plan(input);
  const bottles = proposalOf(result, 'plate-bottle');
  const caps = proposalOf(result, 'plate-caps');

  it('reads the runs and their time from the plan, never recounting them', () => {
    expect(bottles.runs).toBe(5);
    expect(runsText(bottles, result.runs)).toBe('5 corridas × 43 min · 3 h 35 min en total');
    expect(runsText(caps, result.runs)).toBe('1 corrida de 20 min');
    expect(yieldText(caps, input)).toBe('Cada corrida deja 9 Tapa');
    expect(proposalKey(bottles)).toBe('plate:plate-bottle');
  });

  it('says when the first run would start, in the hours of the workshop', () => {
    expect(startText(bottles, result.now, LIMA)).toBe('La primera corrida empezaría hoy 18:35');
    expect(startText(caps, result.now, LIMA)).toBe('La primera corrida puede empezar ya');
  });

  it('names the hold that made runs necessary, and only on the plate it took from', () => {
    expect(bottles.becauseOfHolds).toBe(2);
    const holds = holdsBehind(bottles, result, input);
    expect(holds.map((hold) => hold.number)).toEqual(['COT-2026-0012']);
    expect(holds[0]!.customerName).toBe('María Pérez');
    expect(holdLead(bottles.becauseOfHolds, holds.length)).toBe('2 de estas corridas son por el separo de');
    expect(holdLead(1, 2)).toBe('1 de estas corridas es por los separos de');
    expect(holdEndText(holds[0]!.holdUntil, result.now, LIMA)).toBe('vence mañana 23:00');
    expect(holdsBehind(caps, result, input)).toEqual([]);
  });

  it('marks the filament that does not reach, and only that one', () => {
    const short = workshop({
      filaments: [
        { skuId: 'pink', label: 'PLA Rosado', onHandGrams: 12 },
        { skuId: 'black', label: 'PLA Negro', onHandGrams: 500 },
      ],
    });
    const shortResult = plan(short);
    const rows = filamentRows(proposalOf(shortResult, 'plate-bottle'), shortResult);
    expect(rows).toEqual([{ skuId: 'pink', label: 'PLA Rosado', grams: 25, short: true }]);
    expect(filamentRows(proposalOf(shortResult, 'plate-caps'), shortResult)[0]!.short).toBe(false);
  });

  it('queues catalogue runs without an order, one job per run, with the time of the plate', () => {
    expect(runsToQueue(bottles, { input, result }, 2)).toEqual([
      { plateId: 'plate-bottle', orderLineId: null, label: null, estimatedTimeS: 2580 },
      { plateId: 'plate-bottle', orderLineId: null, label: null, estimatedTimeS: 2580 },
    ]);
  });

  it('never queues zero runs nor more than proposed', () => {
    expect(clampRuns(0, bottles)).toBe(1);
    expect(clampRuns(99, bottles)).toBe(5);
    expect(clampRuns(2.7, bottles)).toBe(2);
    expect(clampRuns(Number.NaN, bottles)).toBe(5);
  });

  it('ties made-to-order runs to their line, plate by plate, in the order the plan placed them', () => {
    const custom = workshop({
      demands: [
        {
          kind: 'order',
          id: 'o3',
          number: 'PED-0009',
          customerName: 'Lucía Ramos',
          priorityAt: '2026-10-06T14:00:00.000Z',
          holdUntil: null,
          dueDate: null,
          lines: [
            {
              id: 'line-keychain',
              description: 'Llavero con nombre',
              quantity: 1,
              variantId: null,
              custom: {
                plates: [
                  { label: 'Placa A', printSeconds: 1800, unitsPerRun: 1, filaments: [] },
                  { label: 'Placa B', printSeconds: 900, unitsPerRun: 1, filaments: [] },
                ],
                supplies: [],
                setupMinutes: 0,
                minutesPerUnit: 0,
                printedUnits: 0,
              },
            },
          ],
        },
      ],
    });
    const customResult = plan(custom);
    const keychain = customResult.proposals.find((proposal) => proposal.lineId === 'line-keychain')!;
    expect(proposalKey(keychain)).toBe('line:line-keychain');
    expect(runsText(keychain, customResult.runs)).toBe('2 corridas · 45 min en total');
    expect(runsToQueue(keychain, { input: custom, result: customResult }, 1)).toEqual([
      { plateId: null, orderLineId: 'line-keychain', label: 'Llavero con nombre · Placa A', estimatedTimeS: 1800 },
    ]);
  });
});

describe('lo que llega tarde', () => {
  const demand = (overrides: Partial<PlanDemandPlan>): PlanDemandPlan => ({
    kind: 'order',
    id: 'o',
    number: 'PED-0005',
    customerName: 'Diego Flores',
    priorityAt: NOW,
    holdUntil: null,
    dueDate: '2026-10-08',
    lines: [],
    readyAt: '2026-10-09T15:00:00.000Z',
    readyAtIfFailure: '2026-10-09T15:00:00.000Z',
    needsPurchase: false,
    unknown: false,
    late: true,
    ...overrides,
  });
  const resultWith = (demands: PlanDemandPlan[]): PlanResult => ({
    now: NOW,
    demands,
    items: [],
    filaments: [],
    runs: [],
    jobs: [],
    proposals: [],
    warnings: [],
  });

  it('says the promised day and the day it would come out, as the owner reads them', () => {
    expect(lateNotices(resultWith([demand({})]), LIMA)).toEqual([
      {
        orderId: 'o',
        number: 'PED-0005',
        customerName: 'Diego Flores',
        text: 'vence el jueves 8 y con este orden sale el viernes 9',
      },
    ]);
  });

  it('says it plainly when the day already passed or is today', () => {
    const [yesterday, today] = lateNotices(
      resultWith([
        demand({ id: 'a', dueDate: '2026-10-05', readyAt: '2026-10-07T12:20:00.000Z' }),
        demand({ id: 'b', dueDate: '2026-10-06', readyAt: '2026-10-07T17:20:00.000Z' }),
      ]),
      LIMA,
    );
    expect(yesterday!.text).toBe('venció ayer y con este orden sale mañana');
    expect(today!.text).toBe('vence hoy y con este orden sale mañana');
  });

  it('leaves out holds, orders on time and orders without a promised day', () => {
    const notices = lateNotices(
      resultWith([
        demand({ id: 'hold', holdUntil: '2026-10-08T04:00:00.000Z' }),
        demand({ id: 'quote', kind: 'quote' }),
        demand({ id: 'fine', late: false }),
        demand({ id: 'undated', dueDate: null }),
      ]),
      LIMA,
    );
    expect(notices).toEqual([]);
  });

  it('names a day in the workshop calendar, with the month only when it changes', () => {
    expect(dayName('2026-10-08', '2026-10-06')).toBe('jueves 8');
    expect(dayName('2026-11-02', '2026-10-06')).toBe('lunes 2 de noviembre');
  });
});

describe('«Por lanzar» for one order', () => {
  // Five caps on the shelf: the hold takes 2 and PED-0003 the other 3, so
  // only PED-0005 is still waiting for the plate of caps.
  const result = plan(
    workshop({
      items: [
        { id: 'bottle', name: 'Botella impresa', kind: 'part', unit: 'unidad', onHand: 2 },
        { id: 'cap', name: 'Tapa', kind: 'part', unit: 'unidad', onHand: 5 },
      ],
    }),
  );

  it('shows only the plates that print something the order is waiting for', () => {
    expect(proposalsFor(result.proposals, 'o1').map((proposal) => proposal.plateId)).toEqual(['plate-bottle']);
    expect(proposalsFor(result.proposals, 'o2').map((proposal) => proposal.plateId).sort()).toEqual([
      'plate-bottle',
      'plate-caps',
    ]);
  });

  it('shows everything without an order, and nothing for one that waits for nothing', () => {
    expect(proposalsFor(result.proposals, null)).toHaveLength(result.proposals.length);
    expect(proposalsFor(result.proposals, 'delivered-long-ago')).toEqual([]);
  });

  it('names the order by its number when the plan knows it', () => {
    expect(orderNumberIn(result, 'o2')).toBe('PED-0005');
    expect(orderNumberIn(result, 'delivered-long-ago')).toBeNull();
  });
});
