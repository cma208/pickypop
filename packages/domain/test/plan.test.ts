import { describe, expect, it } from 'vitest';
import { plan, promiseFor } from '../src/plan.ts';
import type { PlanInput, PlanPlate, PlanRecipe } from '../src/plan-types.ts';
import {
  BODY,
  BOTTLE,
  BOTTLE_PLATE,
  CANDY,
  CAP,
  CAP_PLATE,
  POTION,
  POTION_RECIPE,
  POTION_VARIANT,
  SKU_BLACK,
  SKU_PINK,
  TUESDAY_1800,
  catalogueLine,
  customLine,
  heldQuote,
  item,
  job,
  lima,
  order,
  potionShelf,
  runTimes,
  wallClock,
  workshop,
} from './plan-fixtures.ts';

/** Ten potions for one confirmed order, as in the owner's example. */
function tenPotions(now: string, caps = 2): PlanInput {
  return workshop({
    now,
    items: potionShelf(4, 2, caps),
    demands: [
      order('o1', 'PED-0001', lima('2026-10-06 17:00'), [catalogueLine('l1', POTION_VARIANT, 10)]),
    ],
  });
}

describe('plan: ten potions asked at 18:00', () => {
  const result = plan(tenPotions(TUESDAY_1800));
  const line = result.demands[0]!.lines[0]!;

  it('takes four from the shelf, assembles two from parts and makes four', () => {
    expect(line.onShelf).toBe(4);
    expect(line.toAssemble).toBe(2);
    expect(line.toMake).toBe(4);
  });

  it('prints four bottles and one cap plate, back to back from 18:00 to 22:12', () => {
    expect(result.runs.map((run) => run.label)).toEqual([
      'Botella',
      'Botella',
      'Botella',
      'Botella',
      'Tapas',
    ]);
    expect(runTimes(result.runs)).toEqual([
      'mar 18:00–mar 18:43',
      'mar 18:58–mar 19:41',
      'mar 19:56–mar 20:39',
      'mar 20:54–mar 21:37',
      'mar 21:52–mar 22:12',
    ]);
  });

  it('says where each component comes from and when the last one is there', () => {
    expect(line.components).toEqual([
      {
        itemId: BOTTLE,
        needed: 6,
        fromStock: 2,
        fromQueue: 0,
        toPrint: 4,
        missing: 0,
        readyAt: lima('2026-10-06 21:37'),
      },
      {
        itemId: CAP,
        needed: 6,
        fromStock: 2,
        fromQueue: 0,
        toPrint: 4,
        missing: 0,
        readyAt: lima('2026-10-06 22:12'),
      },
    ]);
  });

  it('assembles the six at the end: 10 min of setup plus 5 per potion after the caps', () => {
    expect(wallClock(line.readyAt)).toBe('mar 22:52');
    expect(line.readyAtIfFailure).toBe(line.readyAt);
    expect(result.demands[0]!.readyAt).toBe(line.readyAt);
    expect(result.demands[0]!.late).toBe(false);
  });

  it('keeps the shelf for the order and counts what has to print', () => {
    expect(result.items).toEqual([
      { itemId: POTION, onHand: 4, forOrders: 4, held: 0, free: 0, missing: 0, missingForOrders: 0 },
      { itemId: BOTTLE, onHand: 2, forOrders: 2, held: 0, free: 0, missing: 4, missingForOrders: 4 },
      { itemId: CAP, onHand: 2, forOrders: 2, held: 0, free: 0, missing: 4, missingForOrders: 4 },
    ]);
  });

  it('proposes one row per plate for the order', () => {
    expect(result.proposals).toEqual([
      {
        plateId: 'plate-botella',
        lineId: null,
        label: 'Botella',
        runs: 4,
        printSeconds: 4 * 43 * 60,
        filaments: [{ skuId: SKU_PINK, label: 'PLA rosado', grams: 22.76 }],
        enoughFilament: true,
        covers: [{ id: 'o1', number: 'PED-0001', customerName: 'Cliente PED-0001' }],
        becauseOfHolds: 0,
        firstStart: TUESDAY_1800,
      },
      {
        plateId: 'plate-tapas',
        lineId: null,
        label: 'Tapas',
        runs: 1,
        printSeconds: 20 * 60,
        filaments: [{ skuId: SKU_BLACK, label: 'PLA negro', grams: 9 }],
        enoughFilament: true,
        covers: [{ id: 'o1', number: 'PED-0001', customerName: 'Cliente PED-0001' }],
        becauseOfHolds: 0,
        firstStart: lima('2026-10-06 21:52'),
      },
    ]);
  });

  it('subtracts the planned grams from the spools', () => {
    expect(result.filaments).toEqual([
      {
        skuId: SKU_PINK,
        onHandGrams: 1000,
        queuedGrams: 0,
        plannedGrams: 22.76,
        freeGrams: 977.24,
        missingGrams: 0,
      },
      {
        skuId: SKU_BLACK,
        onHandGrams: 1000,
        queuedGrams: 0,
        plannedGrams: 9,
        freeGrams: 991,
        missingGrams: 0,
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('with no caps on the shelf assembles nothing yet, and still needs one cap plate', () => {
    const noCaps = plan(tenPotions(TUESDAY_1800, 0));
    const noCapsLine = noCaps.demands[0]!.lines[0]!;

    expect(noCapsLine.onShelf).toBe(4);
    expect(noCapsLine.toAssemble).toBe(0);
    expect(noCapsLine.toMake).toBe(6);
    expect(noCaps.runs.map((run) => run.label)).toEqual([
      'Botella',
      'Botella',
      'Botella',
      'Botella',
      'Tapas',
    ]);
    expect(wallClock(noCapsLine.readyAt)).toBe('mar 22:52');
  });
});

describe('plan: the same ten potions asked at 21:00', () => {
  const result = plan(tenPotions(lima('2026-10-06 21:00')));
  const line = result.demands[0]!.lines[0]!;

  it('fits three bottles tonight and moves the fourth to Wednesday 6:00', () => {
    // The fourth would start 23:54, past min(23:00, 24:00 − 43 min) = 23:00.
    expect(runTimes(result.runs)).toEqual([
      'mar 21:00–mar 21:43',
      'mar 21:58–mar 22:41',
      'mar 22:56–mar 23:39',
      'mié 06:00–mié 06:43',
      'mié 06:58–mié 07:18',
    ]);
  });

  it('is ready Wednesday close to 8:00', () => {
    expect(wallClock(line.readyAt)).toBe('mié 07:58');
  });
});

describe('plan: a made-to-order piece of one 3-hour plate', () => {
  const threeHours = (now: string) =>
    plan(
      workshop({
        now,
        demands: [
          order('o1', 'PED-0001', lima('2026-10-06 12:00'), [
            customLine('l1', 1, {
              plates: [
                { label: 'Pieza a medida', printSeconds: 3 * 3600, unitsPerRun: 1, filaments: [] },
              ],
            }),
          ]),
        ],
      }),
    );

  it('asked at 20:30 is ready tonight at 23:30', () => {
    const result = threeHours(lima('2026-10-06 20:30'));
    expect(runTimes(result.runs)).toEqual(['mar 20:30–mar 23:30']);
    expect(wallClock(result.demands[0]!.readyAt)).toBe('mar 23:30');
  });

  it('may still start at 21:00 sharp, its last start', () => {
    const result = threeHours(lima('2026-10-06 21:00'));
    expect(runTimes(result.runs)).toEqual(['mar 21:00–mié 00:00']);
  });

  it('asked at 21:15 waits for 6:00 and is ready at 9:00', () => {
    const result = threeHours(lima('2026-10-06 21:15'));
    expect(runTimes(result.runs)).toEqual(['mié 06:00–mié 09:00']);
    expect(wallClock(result.demands[0]!.readyAt)).toBe('mié 09:00');
  });

  it('runs on its own line, with no plate id, and is proposed by line', () => {
    const result = threeHours(lima('2026-10-06 20:30'));
    expect(result.runs[0]).toMatchObject({
      plateId: null,
      lineId: 'l1',
      demandId: 'o1',
      outputs: [],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      plateId: null,
      lineId: 'l1',
      label: 'Encargo l1',
      runs: 1,
    });
  });
});

describe('plan: priority decides who gets the shelf', () => {
  const twoOrders = (firstAt: string, secondAt: string) =>
    workshop({
      items: potionShelf(4, 0, 0),
      demands: [
        order('b', 'PED-0002', secondAt, [catalogueLine('lb', POTION_VARIANT, 4)]),
        order('a', 'PED-0001', firstAt, [catalogueLine('la', POTION_VARIANT, 4)]),
      ],
    });

  it('the earlier one takes the shelf and the other one prints', () => {
    const result = plan(twoOrders(lima('2026-10-06 10:00'), lima('2026-10-06 12:00')));
    expect(result.demands.map((d) => [d.number, d.lines[0]!.onShelf])).toEqual([
      ['PED-0001', 4],
      ['PED-0002', 0],
    ]);
    expect(new Set(result.runs.map((run) => run.demandId))).toEqual(new Set(['b']));
  });

  it('swapping the priorities swaps the shelf', () => {
    const result = plan(twoOrders(lima('2026-10-06 12:00'), lima('2026-10-06 10:00')));
    expect(result.demands.map((d) => [d.number, d.lines[0]!.onShelf])).toEqual([
      ['PED-0002', 4],
      ['PED-0001', 0],
    ]);
    expect(new Set(result.runs.map((run) => run.demandId))).toEqual(new Set(['a']));
  });

  it('a tie is broken by number', () => {
    const at = lima('2026-10-06 10:00');
    const result = plan(twoOrders(at, at));
    expect(result.demands.map((d) => [d.number, d.lines[0]!.onShelf])).toEqual([
      ['PED-0001', 4],
      ['PED-0002', 0],
    ]);
  });
});

describe('plan: a quote held with a hold', () => {
  const monday = lima('2026-10-05 18:00');
  const wednesday = lima('2026-10-07 18:00');
  const withHold = (holdUntil: string) =>
    workshop({
      items: potionShelf(4, 0, 0),
      demands: [
        order('o5', 'PED-0005', lima('2026-10-06 12:00'), [catalogueLine('lo', POTION_VARIANT, 4)]),
        heldQuote('q12', 'COT-2026-0012', monday, holdUntil, [
          catalogueLine('lq', POTION_VARIANT, 4),
        ]),
      ],
    });

  it('takes the shelf before a later confirmed order, which goes to print', () => {
    const result = plan(withHold(wednesday));
    expect(result.demands.map((d) => [d.number, d.lines[0]!.onShelf, d.lines[0]!.toMake])).toEqual([
      ['COT-2026-0012', 4, 0],
      ['PED-0005', 0, 4],
    ]);
    expect(result.runs).toHaveLength(5);
    expect(result.runs.every((run) => run.demandKind === 'order' && run.demandId === 'o5')).toBe(
      true,
    );
  });

  it('shows the shelf as held for the quote, not for orders', () => {
    const result = plan(withHold(wednesday));
    expect(result.items.find((row) => row.itemId === POTION)).toEqual({
      itemId: POTION,
      onHand: 4,
      forOrders: 0,
      held: 4,
      free: 0,
      missing: 0,
      missingForOrders: 0,
    });
  });

  it('marks the runs the order needs only because of the hold', () => {
    const result = plan(withHold(wednesday));
    expect(
      result.proposals.map((p) => [
        p.label,
        p.runs,
        p.becauseOfHolds,
        p.covers.map((c) => c.number),
      ]),
    ).toEqual([
      ['Botella', 4, 4, ['PED-0005']],
      ['Tapas', 1, 1, ['PED-0005']],
    ]);
  });

  it('expired, claims nothing: the quote leaves the plan and the order takes the shelf', () => {
    const result = plan(withHold(TUESDAY_1800));
    expect(result.demands.map((d) => d.number)).toEqual(['PED-0005']);
    expect(result.demands[0]!.lines[0]!.onShelf).toBe(4);
    expect(result.runs).toEqual([]);
    expect(result.proposals).toEqual([]);
    expect(result.items.find((row) => row.itemId === POTION)).toMatchObject({
      forOrders: 4,
      held: 0,
      free: 0,
    });
  });

  it('keeps its own runs in the queue but never proposes them', () => {
    const result = plan(
      workshop({
        items: potionShelf(4, 0, 2),
        demands: [
          heldQuote('q12', 'COT-2026-0012', monday, wednesday, [
            catalogueLine('lq', POTION_VARIANT, 6),
          ]),
          order('o5', 'PED-0005', lima('2026-10-06 12:00'), [
            catalogueLine('lo', POTION_VARIANT, 4),
          ]),
        ],
      }),
    );
    expect(result.runs.map((run) => `${run.demandKind} ${run.label}`)).toEqual([
      'quote Botella',
      'quote Botella',
      'order Botella',
      'order Botella',
      'order Botella',
      'order Botella',
      'order Tapas',
    ]);
    // The hold's place in the queue pushes the order's runs back two plates.
    expect(wallClock(result.runs[2]!.start)).toBe('mar 19:56');
    expect(result.proposals.map((p) => [p.label, p.runs, p.becauseOfHolds])).toEqual([
      ['Botella', 4, 4],
      ['Tapas', 1, 1],
    ]);
    expect(result.items.find((row) => row.itemId === CAP)).toMatchObject({ held: 2, forOrders: 0 });
  });

  it('proposes a run the hold asked for when a confirmed order lives off its by-products', () => {
    // The hold prints a cap plate for one cap; the order takes four of the
    // other eight. Without proposing it, the order would wait for a run
    // nobody launches.
    const result = plan(
      workshop({
        items: potionShelf(0, 1, 0),
        demands: [
          heldQuote('q12', 'COT-2026-0012', monday, wednesday, [
            catalogueLine('lq', POTION_VARIANT, 1),
          ]),
          order('o5', 'PED-0005', lima('2026-10-06 12:00'), [
            catalogueLine('lo', POTION_VARIANT, 4),
          ]),
        ],
      }),
    );
    const caps = result.proposals.find((p) => p.label === 'Tapas')!;
    expect(caps.runs).toBe(1);
    expect(caps.covers.map((c) => c.number)).toEqual(['PED-0005']);
    expect(caps.becauseOfHolds).toBe(0);
    expect(result.demands[1]!.lines[0]!.components[1]).toMatchObject({ itemId: CAP, toPrint: 4 });
  });

  it('an order on hold is a hold too: it holds the shelf and production proposes nothing for it', () => {
    const onHold = (holdUntil: string) =>
      plan(
        workshop({
          items: potionShelf(2, 0, 0),
          demands: [
            order('o7', 'PED-0007', monday, [catalogueLine('l7', POTION_VARIANT, 4)], {
              holdUntil,
            }),
          ],
        }),
      );

    const active = onHold(wednesday);
    expect(active.demands[0]!.lines[0]!.onShelf).toBe(2);
    expect(active.items.find((row) => row.itemId === POTION)).toMatchObject({
      held: 2,
      forOrders: 0,
    });
    expect(active.runs.length).toBeGreaterThan(0);
    expect(active.proposals).toEqual([]);

    const lapsed = onHold(lima('2026-10-06 17:59'));
    expect(lapsed.demands).toEqual([]);
    expect(lapsed.items.find((row) => row.itemId === POTION)).toMatchObject({ held: 0, free: 2 });
  });
});

describe('plan: what is missing for orders and for holds', () => {
  it('says apart what a hold would add to what is missing', () => {
    const result = plan(
      workshop({
        recipes: [POTION_RECIPE],
        plates: [BOTTLE_PLATE, CAP_PLATE],
        items: potionShelf(0, 0, 0),
        demands: [
          heldQuote('q1', 'COT-0012', lima('2026-10-06 09:00'), lima('2026-10-07 23:00'), [
            catalogueLine('ql', POTION_VARIANT, 3),
          ]),
          order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 2)]),
        ],
      }),
    );
    const bottles = result.items.find((row) => row.itemId === BOTTLE)!;

    expect(bottles.missing).toBe(5);
    expect(bottles.missingForOrders).toBe(2);
    expect(result.proposals.find((proposal) => proposal.plateId === BOTTLE_PLATE.id)?.runs).toBe(2);
  });
});

describe('plan: a variant without recipe', () => {
  it('warns instead of pretending it is ready', () => {
    const result = plan(
      workshop({
        demands: [
          order('o1', 'PED-0001', TUESDAY_1800, [
            {
              id: 'l1',
              description: 'Llavero',
              quantity: 2,
              variantId: 'v-sin-receta',
              custom: null,
            },
          ]),
        ],
      }),
    );
    expect(result.demands[0]!.lines[0]).toMatchObject({
      onShelf: 0,
      toMake: 2,
      unknown: 'No tiene receta: no se sabe cómo hacerla.',
    });
    expect(result.demands[0]!.unknown).toBe(true);
    expect(result.warnings).toEqual(['"Llavero" no tiene receta: el plan no sabe cómo hacerla.']);
  });
});

describe('plan: an empty recipe', () => {
  const EMPTY: PlanRecipe = {
    variantId: 'v-vacia',
    name: 'Botella de poción · Con chocolates premium',
    assembled: true,
    finishedItemId: 'item-chocolates',
    components: [],
    setupMinutes: 0,
    minutesPerUnit: 0,
  };

  it('does not call anything ready to assemble, and still hands over what was counted', () => {
    const result = plan(
      workshop({
        recipes: [EMPTY],
        items: [item('item-chocolates', 3, 'finished_good', 'Poción de chocolates')],
        demands: [order('o1', 'PED-0008', TUESDAY_1800, [catalogueLine('l1', 'v-vacia', 8)])],
      }),
    );

    expect(result.demands[0]!.lines[0]).toMatchObject({ onShelf: 3, toAssemble: 0, toMake: 5 });
    expect(result.demands[0]!.lines[0]!.unknown).toContain('no tiene piezas ni insumos');
    expect(result.runs).toEqual([]);
    expect(result.warnings).toEqual([
      'La receta de "Botella de poción · Con chocolates premium" no tiene piezas ni insumos: el plan no sabe cómo hacer lo que falta.',
    ]);
  });
});

describe('plan: a mixed plate gives caps and bodies at once', () => {
  const MIXED: PlanPlate = {
    id: 'plate-mixta',
    label: 'Tapas y cuerpos',
    printSeconds: 30 * 60,
    outputs: [
      { itemId: CAP, units: 7 },
      { itemId: BODY, units: 7 },
    ],
    filaments: [],
  };
  const JAR: PlanRecipe = {
    variantId: 'v-frasco',
    name: 'Frasco',
    assembled: true,
    finishedItemId: 'item-frasco',
    components: [
      { itemId: CAP, perUnit: 1 },
      { itemId: BODY, perUnit: 1 },
    ],
    setupMinutes: 0,
    minutesPerUnit: 0,
  };
  const loose = (variantId: string, itemId: string): PlanRecipe => ({
    variantId,
    name: variantId,
    assembled: false,
    finishedItemId: null,
    components: [{ itemId, perUnit: 1 }],
    setupMinutes: 0,
    minutesPerUnit: 0,
  });
  const shelf = [item('item-frasco', 0, 'finished_good'), item(CAP, 0), item(BODY, 0)];

  it('seven jars take one run, not two', () => {
    const result = plan(
      workshop({
        items: shelf,
        recipes: [JAR],
        plates: [MIXED],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', 'v-frasco', 7)])],
      }),
    );
    expect(result.runs).toHaveLength(1);
    expect(result.demands[0]!.lines[0]!.components.map((c) => [c.itemId, c.toPrint])).toEqual([
      [CAP, 7],
      [BODY, 7],
    ]);
    expect(wallClock(result.demands[0]!.readyAt)).toBe('mar 18:30');
  });

  it('the bodies left over from the first order go to the second without a new run', () => {
    const result = plan(
      workshop({
        items: shelf,
        recipes: [loose('v-tapas', CAP), loose('v-cuerpos', BODY)],
        plates: [MIXED],
        demands: [
          order('o1', 'PED-0001', lima('2026-10-06 10:00'), [catalogueLine('l1', 'v-tapas', 3)]),
          order('o2', 'PED-0002', lima('2026-10-06 11:00'), [catalogueLine('l2', 'v-cuerpos', 7)]),
        ],
      }),
    );
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]!.demandId).toBe('o1');
    const bodies = result.demands[1]!.lines[0]!.components[0]!;
    expect(bodies).toMatchObject({ itemId: BODY, fromStock: 0, toPrint: 7, missing: 0 });
    expect(bodies.readyAt).toBe(result.runs[0]!.end);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.covers.map((c) => c.number)).toEqual(['PED-0001', 'PED-0002']);
    expect(result.items.find((row) => row.itemId === BODY)!.missing).toBe(7);
  });
});

describe('plan: what has to be bought does not block', () => {
  it('short of filament: a shortage in grams, the date still computed, the proposal says so', () => {
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        filaments: [
          { skuId: SKU_PINK, label: 'PLA rosado', onHandGrams: 10 },
          { skuId: SKU_BLACK, label: 'PLA negro', onHandGrams: 1000 },
        ],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 4)])],
      }),
    );
    const demand = result.demands[0]!;
    const line = demand.lines[0]!;

    // Four bottles of 5.69 g are 22.76 g against 10 g on the spool.
    expect(line.shortages).toEqual([
      { kind: 'filament', id: SKU_PINK, label: 'PLA rosado', missing: 12.76, unit: 'g' },
    ]);
    expect(line.needsPurchase).toBe(true);
    expect(demand.needsPurchase).toBe(true);
    expect(wallClock(line.readyAt)).toBe('mar 22:07');
    expect(result.proposals[0]).toMatchObject({ label: 'Botella', enoughFilament: false });
    expect(result.filaments[0]).toEqual({
      skuId: SKU_PINK,
      onHandGrams: 10,
      queuedGrams: 0,
      plannedGrams: 22.76,
      freeGrams: 0,
      missingGrams: 12.76,
    });
  });

  it('short of candy: missing on the component, on the line and on the article', () => {
    const withCandy: PlanRecipe = {
      ...POTION_RECIPE,
      variantId: 'v-pocion-dulces',
      components: [...POTION_RECIPE.components, { itemId: CANDY, perUnit: 1 }],
    };
    const result = plan(
      workshop({
        items: [...potionShelf(0, 6, 6), item(CANDY, 3, 'supply', 'Dulces surtidos', 'bolsa')],
        recipes: [withCandy],
        demands: [
          order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', 'v-pocion-dulces', 6)]),
        ],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(line.components[2]).toEqual({
      itemId: CANDY,
      needed: 6,
      fromStock: 3,
      fromQueue: 0,
      toPrint: 0,
      missing: 3,
      readyAt: null,
    });
    expect(line.shortages).toEqual([
      { kind: 'item', id: CANDY, label: 'Dulces surtidos', missing: 3, unit: 'bolsa' },
    ]);
    expect(line.needsPurchase).toBe(true);
    expect(line.toAssemble).toBe(3);
    expect(line.toMake).toBe(3);
    expect(result.runs).toEqual([]);
    // As if the candy arrived now: 10 min + 5 per potion from 18:00.
    expect(wallClock(line.readyAt)).toBe('mar 18:40');
    expect(result.items.find((row) => row.itemId === CANDY)).toEqual({
      itemId: CANDY,
      onHand: 3,
      forOrders: 3,
      held: 0,
      free: 0,
      missing: 3,
      missingForOrders: 3,
    });
  });
});

describe('plan: jobs already on the printer', () => {
  const printing = (startedAt: string) =>
    job('j1', {
      status: 'printing',
      startedAt,
      outputs: [{ itemId: BOTTLE, units: 1 }],
      filaments: [{ skuId: SKU_PINK, label: 'PLA rosado', grams: 5.69 }],
    });
  const twoOrders = [
    order('o1', 'PED-0001', lima('2026-10-06 10:00'), [catalogueLine('l1', POTION_VARIANT, 1)]),
    order('o2', 'PED-0002', lima('2026-10-06 11:00'), [catalogueLine('l2', POTION_VARIANT, 1)]),
  ];

  it('a plate started ten minutes ago frees the printer in 33 and its bottle goes to the first order', () => {
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        jobs: [printing(lima('2026-10-06 17:50'))],
        demands: twoOrders,
      }),
    );
    const first = result.demands[0]!.lines[0]!.components[0]!;
    expect(first).toMatchObject({
      itemId: BOTTLE,
      fromQueue: 1,
      toPrint: 0,
      readyAt: lima('2026-10-06 18:33'),
    });
    expect(result.demands[1]!.lines[0]!.components[0]).toMatchObject({ fromQueue: 0, toPrint: 1 });
    expect(runTimes(result.runs)).toEqual(['mar 18:48–mar 19:31']);
    expect(result.filaments[0]).toMatchObject({ queuedGrams: 5.69, plannedGrams: 5.69 });
    expect(result.warnings).toEqual([]);
  });

  it('a plate past its estimate frees the printer now, and asks whether it finished', () => {
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        jobs: [printing(lima('2026-10-06 16:00'))],
        demands: twoOrders,
      }),
    );
    expect(result.warnings).toEqual([
      '"Botella impresa" pasó su tiempo estimado: ¿terminó? Ciérrala para que el plan lo sepa.',
    ]);
    expect(result.demands[0]!.lines[0]!.components[0]).toMatchObject({
      fromQueue: 1,
      readyAt: TUESDAY_1800,
    });
    expect(runTimes(result.runs)).toEqual(['mar 18:15–mar 18:58']);
  });

  it('planned jobs keep their queue order, and new runs go after them', () => {
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        jobs: [
          job('j3', {
            queuedAt: lima('2026-10-06 17:00'),
            outputs: [{ itemId: BOTTLE, units: 1 }],
          }),
          printing(lima('2026-10-06 17:50')),
        ],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 3)])],
      }),
    );
    // Printing until 18:33, the queued one 18:48–19:31, the new one after it.
    expect(result.demands[0]!.lines[0]!.components[0]).toMatchObject({ fromQueue: 2, toPrint: 1 });
    expect(runTimes(result.runs)).toEqual(['mar 19:46–mar 20:29']);
  });

  it('spreads new runs over the printers, each to the one that can start first', () => {
    const result = plan(
      workshop({
        printers: [
          { id: 'a1', name: 'A1 mini' },
          { id: 'p1', name: 'P1S' },
        ],
        items: potionShelf(0, 0, 9),
        jobs: [printing(lima('2026-10-06 17:50'))],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 3)])],
      }),
    );
    expect(result.runs.map((run) => `${run.printerId} ${wallClock(run.start)}`)).toEqual([
      'p1 mar 18:00',
      'a1 mar 18:48',
    ]);
  });

  it('a job tied to a catalogue line still brings its bottle to the shelf, as closing it does', () => {
    // Before ADR-020 every job was tied to the order line it was for.
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        jobs: [{ ...printing(lima('2026-10-06 17:50')), orderLineId: 'l1', lineUnits: 1 }],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 1)])],
      }),
    );
    expect(result.demands[0]!.lines[0]!.components[0]).toMatchObject({ fromQueue: 1, toPrint: 0 });
    expect(result.runs).toEqual([]);
  });
});

describe('plan: what is not assembled', () => {
  it('a kit leaves the shelf piece by piece; on the shelf are only complete kits', () => {
    const KIT: PlanRecipe = {
      variantId: 'v-kit',
      name: 'Kit para armar',
      assembled: false,
      finishedItemId: null,
      components: [
        { itemId: BOTTLE, perUnit: 1 },
        { itemId: CAP, perUnit: 2 },
      ],
      setupMinutes: 99,
      minutesPerUnit: 3,
    };
    const result = plan(
      workshop({
        items: [item(BOTTLE, 3), item(CAP, 5)],
        recipes: [KIT],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', 'v-kit', 4)])],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(line.components.map((c) => [c.itemId, c.needed, c.fromStock, c.toPrint])).toEqual([
      [BOTTLE, 4, 3, 1],
      [CAP, 8, 5, 3],
    ]);
    expect(line.onShelf).toBe(2);
    expect(line.toAssemble).toBe(0);
    expect(line.toMake).toBe(2);
    expect(runTimes(result.runs)).toEqual(['mar 18:00–mar 18:43', 'mar 18:58–mar 19:18']);
    // No setup: only 3 minutes per kit still to make.
    expect(wallClock(line.readyAt)).toBe('mar 19:24');
  });
});

describe('plan: late', () => {
  it('an order due today and ready tomorrow is late; due tomorrow it is not', () => {
    const due = (dueDate: string) => {
      const input = tenPotions(lima('2026-10-06 21:00'));
      input.demands[0]!.dueDate = dueDate;
      return plan(input).demands[0]!;
    };
    expect(due('2026-10-06').late).toBe(true);
    expect(due('2026-10-07').late).toBe(false);
  });

  it('ready tonight before midnight is on time for today', () => {
    const input = tenPotions(TUESDAY_1800);
    input.demands[0]!.dueDate = '2026-10-06';
    expect(plan(input).demands[0]!.late).toBe(false);
  });
});

describe('promiseFor', () => {
  const busyWorkshop = () =>
    workshop({
      items: potionShelf(4, 0, 9),
      demands: [
        heldQuote('q1', 'COT-2026-0001', lima('2026-10-05 09:00'), lima('2026-10-08 09:00'), [
          catalogueLine('lq', POTION_VARIANT, 1),
        ]),
        order('o1', 'PED-0001', lima('2026-10-06 09:00'), [catalogueLine('l1', POTION_VARIANT, 1)]),
        order('o2', 'PED-0002', lima('2026-10-06 10:00'), [catalogueLine('l2', POTION_VARIANT, 3)]),
      ],
    });
  const candidate = {
    description: 'Venta nueva',
    quantity: 3,
    variantId: POTION_VARIANT,
    custom: null,
  };

  it('gives the candidate only what nobody else claims', () => {
    const promise = promiseFor(busyWorkshop(), candidate);
    expect(promise.onShelf).toBe(0);
    expect(promise.toMake).toBe(3);
    expect(promise.components[0]).toMatchObject({ itemId: BOTTLE, toPrint: 3 });
  });

  it('does not change what the others get', () => {
    const input = busyWorkshop();
    const before = plan(input);
    const withCandidate = plan({
      ...input,
      demands: [
        ...input.demands,
        heldQuote('candidate', '', lima('2027-01-01 00:00'), '9999-12-31T23:59:59.999Z', [
          { id: 'candidate', ...candidate },
        ]),
      ],
    });

    expect(withCandidate.demands.slice(0, 3)).toEqual(before.demands);
    expect(withCandidate.runs.slice(0, before.runs.length)).toEqual(before.runs);
    expect(withCandidate.proposals).toEqual(before.proposals);
    expect(promiseFor(input, candidate)).toEqual(withCandidate.demands[3]!.lines[0]);
  });

  it('answers for made-to-order work too', () => {
    const promise = promiseFor(workshop({ now: lima('2026-10-06 21:15') }), {
      description: 'Llavero con logo',
      quantity: 1,
      variantId: null,
      custom: {
        plates: [{ label: 'Llavero', printSeconds: 3 * 3600, unitsPerRun: 1, filaments: [] }],
        supplies: [],
        setupMinutes: 0,
        minutesPerUnit: 0,
        printedUnits: 0,
      },
    });
    expect(wallClock(promise.readyAt)).toBe('mié 09:00');
  });
});

describe('plan: a plate that never fits the window', () => {
  it('warns and is scheduled at 6:00 anyway', () => {
    const result = plan(
      workshop({
        demands: [
          order('o1', 'PED-0001', TUESDAY_1800, [
            customLine('l1', 1, {
              plates: [{ label: 'Jarrón', printSeconds: 19 * 3600, unitsPerRun: 1, filaments: [] }],
            }),
          ]),
        ],
      }),
    );
    expect(result.warnings).toEqual([
      'La placa "Jarrón" dura 19 h y no cabe en el horario (06:00 a 24:00): se programa igual a las 06:00.',
    ]);
    expect(runTimes(result.runs)).toEqual(['mié 06:00–jue 01:00']);
  });
});

describe('plan: if a plate fails', () => {
  const fourBottles = (failureRate: number) =>
    workshop({
      settings: { ...workshop().settings, failureRate },
      items: potionShelf(0, 0, 9),
      demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 4)])],
    });

  it('adds one spare run per ten, or fraction, after the last run of the line', () => {
    const line = plan(fourBottles(0.1)).demands[0]!.lines[0]!;
    // Bottles until 21:37 and 30 min of assembly; the spare bottle runs 21:52–22:35.
    expect(wallClock(line.readyAt)).toBe('mar 22:07');
    expect(wallClock(line.readyAtIfFailure)).toBe('mar 23:05');
  });

  it('moves nobody: the spare is not a run of the plan', () => {
    expect(plan(fourBottles(0.1)).runs).toHaveLength(4);
  });

  it('the owner example: the spare after the caps ends 23:10, assembly follows', () => {
    const input = tenPotions(TUESDAY_1800);
    input.settings.failureRate = 0.1;
    const line = plan(input).demands[0]!.lines[0]!;
    expect(wallClock(line.readyAt)).toBe('mar 22:52');
    // Spare bottle 22:27–23:10, then 40 min of assembly.
    expect(wallClock(line.readyAtIfFailure)).toBe('mar 23:50');
    expect(wallClock(plan(input).demands[0]!.readyAtIfFailure)).toBe('mar 23:50');
  });

  it('without new runs is the same date', () => {
    const input = workshop({
      settings: { ...workshop().settings, failureRate: 0.1 },
      items: potionShelf(4, 0, 0),
      demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 4)])],
    });
    const line = plan(input).demands[0]!.lines[0]!;
    expect(line.readyAt).toBe(TUESDAY_1800);
    expect(line.readyAtIfFailure).toBe(TUESDAY_1800);
  });
});

describe('plan: made-to-order lines', () => {
  it('counts what is printed, then its own jobs, then new runs of every plate, and its supplies', () => {
    const ribbon = item('item-cinta', 4, 'supply', 'Cinta', 'm');
    const box = item('item-caja', 0, 'packaging', 'Caja');
    const result = plan(
      workshop({
        items: [ribbon, box],
        jobs: [job('j1', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600 })],
        demands: [
          order('o1', 'PED-0001', TUESDAY_1800, [
            customLine('l1', 5, {
              printedUnits: 2,
              plates: [
                { label: 'Cuerpo', printSeconds: 1800, unitsPerRun: 2, filaments: [] },
                { label: 'Base', printSeconds: 600, unitsPerRun: 4, filaments: [] },
              ],
              supplies: [
                { itemId: 'item-cinta', label: 'Cinta', scope: 'unit', quantity: 2 },
                { itemId: 'item-caja', label: 'Caja', scope: 'batch', quantity: 1 },
                { itemId: null, label: 'Algo a mano', scope: 'batch', quantity: 1 },
              ],
              setupMinutes: 5,
              minutesPerUnit: 2,
            }),
          ]),
        ],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(line.onShelf).toBe(2);
    expect(line.toAssemble).toBe(0);
    expect(line.toMake).toBe(3);
    // The queued job (18:00–19:00) is one plate of two, so half a unit: 2.5
    // are left, two runs of the body and one of the base.
    expect(runTimes(result.runs)).toEqual([
      'mar 19:15–mar 19:45',
      'mar 20:00–mar 20:30',
      'mar 20:45–mar 20:55',
    ]);
    expect(line.components).toEqual([
      {
        itemId: 'item-cinta',
        needed: 6,
        fromStock: 4,
        fromQueue: 0,
        toPrint: 0,
        missing: 2,
        readyAt: null,
      },
      {
        itemId: 'item-caja',
        needed: 1,
        fromStock: 0,
        fromQueue: 0,
        toPrint: 0,
        missing: 1,
        readyAt: null,
      },
    ]);
    expect(line.shortages.map((s) => [s.label, s.missing, s.unit])).toEqual([
      ['Cinta', 2, 'm'],
      ['Caja', 1, 'unidad'],
    ]);
    // 5 min of setup plus 2 per unit still to make, after the last plate.
    expect(wallClock(line.readyAt)).toBe('mar 21:06');
  });

  it('a service takes nothing and is ready now', () => {
    const result = plan(
      workshop({
        demands: [
          order('o1', 'PED-0001', TUESDAY_1800, [
            { id: 'l1', description: 'Diseño', quantity: 1, variantId: null, custom: null },
          ]),
        ],
      }),
    );
    expect(result.demands[0]!.lines[0]).toMatchObject({
      onShelf: 1,
      toMake: 0,
      readyAt: TUESDAY_1800,
    });
    expect(result.runs).toEqual([]);
  });
});

describe('plan: filament already promised to the queue', () => {
  it('jobs on the printer take their grams before any new run', () => {
    const result = plan(
      workshop({
        items: potionShelf(0, 0, 9),
        filaments: [{ skuId: SKU_PINK, label: 'PLA rosado', onHandGrams: 10 }],
        jobs: [job('j1', { filaments: [{ skuId: SKU_PINK, label: 'PLA rosado', grams: 8 }] })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [catalogueLine('l1', POTION_VARIANT, 1)])],
      }),
    );
    expect(result.demands[0]!.lines[0]!.shortages).toEqual([
      { kind: 'filament', id: SKU_PINK, label: 'PLA rosado', missing: 3.69, unit: 'g' },
    ]);
    expect(result.filaments[0]).toMatchObject({
      queuedGrams: 8,
      plannedGrams: 5.69,
      missingGrams: 3.69,
    });
  });
});

describe('plan: the jobs already launched, with their time', () => {
  it('gives each queued job the start and end the plan places it at', () => {
    const result = plan(
      workshop({
        jobs: [
          job('j1', { status: 'printing', startedAt: lima('2026-10-06 17:50') }),
          job('j2', { queuedAt: lima('2026-10-06 17:55') }),
        ],
      }),
    );

    expect(result.jobs.map((timing) => [timing.id, wallClock(timing.start), wallClock(timing.end)])).toEqual([
      ['j1', 'mar 17:50', 'mar 18:33'],
      ['j2', 'mar 18:48', 'mar 19:31'],
    ]);
  });
});

describe('plan: a made-to-order line of two plates', () => {
  const twoPlates = {
    plates: [
      { label: 'Frente', printSeconds: 3600, unitsPerRun: 1, filaments: [] },
      { label: 'Espalda', printSeconds: 3600, unitsPerRun: 1, filaments: [] },
    ],
  };

  it('does not take the line as done when only one of its plates is queued', () => {
    const result = plan(
      workshop({
        jobs: [job('front', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600 })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, twoPlates)])],
      }),
    );

    expect(result.proposals.map((proposal) => proposal.runs)).toEqual([2]);
    expect(result.demands[0]!.lines[0]!.toMake).toBe(1);
  });

  it('takes the line as covered when both plates are queued', () => {
    const result = plan(
      workshop({
        jobs: [
          job('front', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600 }),
          job('back', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600, queuedAt: lima('2026-10-06 18:01') }),
        ],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, twoPlates)])],
      }),
    );

    expect(result.proposals).toEqual([]);
  });

  // The front printed and closed «Exitosa», the back still in the queue: the
  // snapshot counts the closed job as half a unit, as the queue did. Floored
  // to nothing, «Por lanzar» proposed both plates again.
  it('keeps the line covered when one plate is printed and the other queued', () => {
    const result = plan(
      workshop({
        jobs: [job('back', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600 })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, { ...twoPlates, printedUnits: 0.5 })])],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(result.proposals).toEqual([]);
    expect(line).toMatchObject({ onShelf: 0, toMake: 1 });
    expect(wallClock(line.readyAt)).toBe('mar 19:00');
  });

  it('hands over only whole units of what is printed', () => {
    const result = plan(
      workshop({
        jobs: [job('back', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 3600 })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 2, { ...twoPlates, printedUnits: 1.5 })])],
      }),
    );

    expect(result.demands[0]!.lines[0]).toMatchObject({ onShelf: 1, toMake: 1 });
    expect(result.proposals).toEqual([]);
  });

  it('still asks for the plate that is neither printed nor queued', () => {
    const result = plan(
      workshop({
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, { ...twoPlates, printedUnits: 0.5 })])],
      }),
    );

    expect(result.proposals.map((proposal) => proposal.runs)).toEqual([2]);
    expect(result.demands[0]!.lines[0]).toMatchObject({ onShelf: 0, toMake: 1 });
  });
});

describe('plan: a made-to-order line typed by hand', () => {
  it('is not ready, and says the plan does not know how long it takes', () => {
    const result = plan(
      workshop({
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 2, {})])],
      }),
    );

    expect(result.demands[0]!.lines[0]).toMatchObject({ onShelf: 0, toMake: 2 });
    expect(result.demands[0]!.lines[0]!.unknown).toContain('no tiene placas');
    expect(result.warnings).toEqual([
      '"Encargo l1" es a medida y no tiene placas: el plan no sabe cuánto tarda en imprimirse.',
    ]);
  });

  // ORD-2026-0002 in the second walk-through: «Imprimir para este pedido»
  // with 20 minutes, and the queue still said the plan did not know how long
  // it takes, right above that very job.
  it('takes the time of its own job once it is queued, without the warning', () => {
    const result = plan(
      workshop({
        jobs: [job('keychain', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 20 * 60 })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, {})])],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(line.unknown).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(wallClock(line.readyAt)).toBe('mar 18:20');
  });

  // The same job closed «Exitosa»: the snapshot now counts it as the queue
  // did, one unit of the line, and the warning does not come back.
  it('stays dated and quiet once its job is closed as printed', () => {
    const result = plan(
      workshop({
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 1, { printedUnits: 1 })])],
      }),
    );
    const line = result.demands[0]!.lines[0]!;

    expect(line).toMatchObject({ onShelf: 1, toMake: 0, unknown: null });
    expect(result.warnings).toEqual([]);
    expect(result.proposals).toEqual([]);
  });

  it('still warns about what its jobs do not cover', () => {
    const result = plan(
      workshop({
        jobs: [job('first', { orderLineId: 'l1', lineUnits: 1, estimatedSeconds: 20 * 60 })],
        demands: [order('o1', 'PED-0001', TUESDAY_1800, [customLine('l1', 2, {})])],
      }),
    );

    expect(result.demands[0]!.lines[0]!.unknown).toContain('no tiene placas');
    expect(result.warnings).toEqual([
      '"Encargo l1" es a medida y no tiene placas: el plan no sabe cuánto tarda en imprimirse.',
    ]);
  });
});
