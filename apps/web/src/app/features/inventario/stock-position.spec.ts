import { plan, type PlanDemand, type PlanInput } from '@pickypop/domain';
import type { PlanView } from '../../core/plan';
import {
  amount,
  assembledText,
  claimsByItem,
  claimsSummary,
  claimsTitle,
  filamentCells,
  freeText,
  itemCells,
  itemPositions,
  missingText,
  separatedText,
  type ItemClaim,
} from './stock-position';

// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';
const lima = (local: string): string => new Date(`${local}:00-05:00`).toISOString();

const POTION = 'potion';
const BOTTLE = 'bottle';
const CAP = 'cap';
const CANDY = 'candy';
const BAG = 'bag';
const PINK = 'pink';

const potionLine = (id: string, quantity: number) => ({
  id,
  description: 'Botella de poción',
  quantity,
  variantId: 'v-potion',
  custom: null,
});

const demand = (overrides: Partial<PlanDemand> & Pick<PlanDemand, 'id' | 'number'>): PlanDemand => ({
  kind: 'order',
  customerName: null,
  priorityAt: lima('2026-10-06 12:00'),
  holdUntil: null,
  dueDate: null,
  lines: [],
  ...overrides,
});

/** The seed's potion in small: a held quote that came first, and a confirmed order after it. */
function workshop(): PlanInput {
  return {
    now: NOW,
    settings: {
      timeZone: 'America/Lima',
      window: { firstStart: 360, lastStart: 1380, endBy: 1440 },
      changeoverMinutes: 15,
      failureRate: 0,
    },
    printers: [{ id: 'a1', name: 'A1 mini' }],
    jobs: [
      {
        id: 'job',
        printerId: 'a1',
        status: 'printing',
        startedAt: lima('2026-10-06 17:50'),
        queuedAt: lima('2026-10-06 17:00'),
        estimatedSeconds: 43 * 60,
        outputs: [{ itemId: BOTTLE, units: 1 }],
        orderLineId: null,
        lineUnits: 0,
        filaments: [{ skuId: PINK, label: 'PLA Rosado', grams: 5.69 }],
      },
    ],
    items: [
      { id: POTION, name: 'Botella de poción', kind: 'finished_good', unit: 'unidad', onHand: 3 },
      { id: BOTTLE, name: 'Botella impresa', kind: 'part', unit: 'unidad', onHand: 8 },
      { id: CAP, name: 'Tapa impresa', kind: 'part', unit: 'unidad', onHand: 5 },
      { id: CANDY, name: 'Dulces surtidos', kind: 'supply', unit: 'g', onHand: 520 },
      { id: BAG, name: 'Bolsa con etiqueta', kind: 'packaging', unit: 'unidad', onHand: 70 },
    ],
    filaments: [{ skuId: PINK, label: 'PLA Rosado', onHandGrams: 624.5 }],
    recipes: [
      {
        variantId: 'v-potion',
        name: 'Botella de poción · Con dulces surtidos',
        assembled: true,
        finishedItemId: POTION,
        components: [
          { itemId: BOTTLE, perUnit: 1 },
          { itemId: CAP, perUnit: 1 },
          { itemId: CANDY, perUnit: 66 },
          { itemId: BAG, perUnit: 1 },
        ],
        setupMinutes: 10,
        minutesPerUnit: 5,
      },
    ],
    plates: [
      {
        id: 'plate-bottle',
        label: 'Botella',
        printSeconds: 43 * 60,
        outputs: [{ itemId: BOTTLE, units: 1 }],
        filaments: [{ skuId: PINK, label: 'PLA Rosado', grams: 5.69 }],
      },
      {
        id: 'plate-caps',
        label: 'Tapas',
        printSeconds: 20 * 60,
        outputs: [{ itemId: CAP, units: 9 }],
        filaments: [],
      },
    ],
    demands: [
      demand({
        id: 'q1',
        number: 'COT-0012',
        kind: 'quote',
        customerName: 'María Pérez',
        priorityAt: lima('2026-10-06 11:00'),
        holdUntil: lima('2026-10-07 23:00'),
        lines: [potionLine('ql1', 2)],
      }),
      demand({ id: 'o1', number: 'PED-0003', customerName: 'Ana Quispe', lines: [potionLine('ol1', 15)] }),
    ],
  };
}

function view(input = workshop()): PlanView {
  return { input, result: plan(input) };
}

const total = (claims: readonly ItemClaim[], hold: boolean): number =>
  claims.filter((claim) => claim.hold === hold).reduce((sum, claim) => sum + claim.units, 0);

describe('claimsByItem', () => {
  it('adds up, article by article, to what the plan says is separated', () => {
    const current = view();
    const claims = claimsByItem(current);
    for (const position of current.result.items) {
      const mine = claims.get(position.itemId) ?? [];
      expect(total(mine, false)).toBeCloseTo(position.forOrders, 6);
      expect(total(mine, true)).toBeCloseTo(position.held, 6);
    }
  });

  it('names who has the finished product, the hold that came first included', () => {
    const potion = itemPositions(view()).get(POTION)!;
    expect(potion.held).toBe(2);
    expect(potion.forOrders).toBe(1);
    expect(potion.claims.map((claim) => [claim.number, claim.hold, claim.units])).toEqual([
      ['COT-0012', true, 2],
      ['PED-0003', false, 1],
    ]);
  });

  it('leaves out an article the plan does not know', () => {
    expect(itemPositions(view()).get('inactive')).toBeUndefined();
  });
});

describe('the words of a position', () => {
  it('weighs grams as a person does and counts the rest', () => {
    expect(amount(520, 'g')).toBe('520 g');
    expect(amount(2384, 'g')).toBe('2.38 kg');
    expect(amount(8, 'unidad')).toBe('8 unidades');
    expect(amount(1, 'unidad')).toBe('1 unidad');
  });

  it('says what is separated with its detail, leaving out what is zero', () => {
    expect(separatedText({ forOrders: 4, held: 2 }, 'unidad')).toBe('4 para pedidos, 2 en separos');
    expect(separatedText({ forOrders: 520, held: 0 }, 'g')).toBe('520 g para pedidos');
    expect(separatedText({ forOrders: 0, held: 0 }, 'unidad')).toBeNull();
  });

  it('agrees "libre" with the number', () => {
    expect(freeText(1, 'unidad')).toBe('1 libre');
    expect(freeText(0, 'unidad')).toBe('0 libres');
    expect(freeText(0, 'g')).toBe('0 g libres');
  });

  it('a missing part has to print, anything else has to be bought', () => {
    expect(missingText('part', 35, 'unidad')).toBe('Falta imprimir 35');
    expect(missingText('supply', 2384, 'g')).toBe('Falta comprar 2.38 kg');
    expect(missingText('packaging', 2, 'unidad')).toBe('Falta comprar 2');
    expect(missingText('supply', 0, 'g')).toBeNull();
  });

  it('builds the four cells of a row from the plan', () => {
    const positions = itemPositions(view());
    const bottle = itemCells('part', 'unidad', positions.get(BOTTLE))!;
    expect(bottle.onHand).toBe('8 unidades');
    expect(bottle.free).toBe('0');
    expect(bottle.missing).toMatch(/^Falta imprimir \d+$/);

    const candy = itemCells('supply', 'g', positions.get(CANDY))!;
    expect(candy.onHand).toBe('520 g');
    expect(candy.missing).toMatch(/^Falta comprar /);

    expect(itemCells('part', 'unidad', undefined)).toBeNull();
  });

  it('puts the row in one line for a phone', () => {
    const cells = itemCells('packaging', 'unidad', {
      itemId: BAG,
      onHand: 70,
      forOrders: 49,
      held: 0,
      free: 21,
      missing: 0,
      claims: [],
    })!;
    expect(cells.compact).toBe('49 para pedidos · 21 libres');
    expect(cells.missing).toBeNull();
  });
});

describe('who it is for', () => {
  const order: ItemClaim = {
    demandId: 'o3',
    number: 'PED-0003',
    customerName: 'Ana Quispe',
    hold: false,
    holdUntil: null,
    units: 3,
  };
  const hold: ItemClaim = {
    demandId: 'q12',
    number: 'COT-0012',
    customerName: 'María Pérez',
    hold: true,
    holdUntil: lima('2026-10-07 23:00'),
    units: 2,
  };

  it('says what «Armar» has on the shelf and whose it already is', () => {
    expect(assembledText(3, [order])).toBe('3 armadas · 3 para PED-0003');
    expect(assembledText(5, [order])).toBe('5 armadas · 3 para PED-0003 · 2 libres');
    expect(assembledText(1, [])).toBe('1 armada en el estante');
    expect(assembledText(5, [order, hold])).toBe('5 armadas · 3 para PED-0003, 2 en el separo de COT-0012');
  });

  it('names the kinds instead of every document when there are many', () => {
    const third = { ...order, demandId: 'o4', number: 'PED-0004', units: 1 };
    expect(claimsSummary([order, hold, third], 'unidad')).toBe('4 para pedidos, 2 en separos');
  });

  it('lists every claim for the pointer, with the end of each hold', () => {
    expect(claimsTitle([order, hold], 'unidad')).toBe(
      'PED-0003 · Ana Quispe: 3 unidades\nCOT-0012 · María Pérez, separo hasta el miércoles 7 de octubre, 23:00: 2 unidades',
    );
  });
});

describe('filamentCells', () => {
  it('separates what is already in the queue and what is still to launch', () => {
    const position = view().result.filaments[0];
    const cells = filamentCells(position)!;
    expect(cells.onHand).toBe('624.5 g');
    expect(cells.separated).toMatch(/^5\.69 g en cola, [\d.]+ g por lanzar$/);
    expect(cells.missing).toBeNull();
  });

  it('says how much filament to buy', () => {
    const cells = filamentCells({
      skuId: PINK,
      onHandGrams: 10,
      queuedGrams: 5.69,
      plannedGrams: 17.07,
      freeGrams: 0,
      missingGrams: 12.76,
    })!;
    expect(cells.missing).toBe('Falta comprar 12.76 g');
    expect(cells.compact).toBe('5.69 g en cola · 17.07 g por lanzar · 0 g libres');
  });
});
