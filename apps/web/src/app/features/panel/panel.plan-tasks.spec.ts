import { describe, expect, it } from 'vitest';
import { plan, type PlanDemand, type PlanInput, type PlanJob } from '@pickypop/domain';
import type { PlanView } from '../../core/plan';
import type { TodayTask } from './panel.tasks';
import {
  confirmedShortages,
  dayWords,
  holdTasks,
  lateOrderTasks,
  lateWording,
  orderTitle,
  pastEstimateJobs,
  planTasks,
  purchaseTask,
  shoppingList,
  uniqueTasks,
  warningTasks,
} from './panel.plan-tasks';

const lima = (local: string): string => new Date(`${local}:00-05:00`).toISOString();
const TZ = 'America/Lima';
// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = lima('2026-10-06 18:00');

const potions = (id: string, quantity: number) => ({
  id,
  description: 'Botella de poción',
  quantity,
  variantId: 'v-potion',
  custom: null,
});

const demand = (overrides: Partial<PlanDemand> & Pick<PlanDemand, 'id' | 'number'>): PlanDemand => ({
  kind: 'order',
  customerName: null,
  priorityAt: lima('2026-10-06 09:00'),
  holdUntil: null,
  dueDate: null,
  lines: [],
  ...overrides,
});

const printing = (overrides: Partial<PlanJob> = {}): PlanJob => ({
  id: 'job',
  printerId: 'a1',
  status: 'printing',
  startedAt: lima('2026-10-06 17:30'),
  queuedAt: lima('2026-10-06 17:00'),
  estimatedSeconds: 43 * 60,
  outputs: [],
  orderLineId: null,
  lineUnits: 0,
  filaments: [],
  ...overrides,
});

/** Two confirmed orders short of candy and bags, a held quote and an order on hold. */
function workshop(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    settings: {
      timeZone: TZ,
      window: { firstStart: 360, lastStart: 1380, endBy: 1440 },
      changeoverMinutes: 15,
      failureRate: 0,
    },
    printers: [{ id: 'a1', name: 'A1 mini' }],
    jobs: [],
    items: [
      { id: 'potion', name: 'Botella de poción', kind: 'finished_good', unit: 'unidad', onHand: 0 },
      { id: 'bottle', name: 'Botella impresa', kind: 'part', unit: 'unidad', onHand: 0 },
      { id: 'cap', name: 'Tapa impresa', kind: 'part', unit: 'unidad', onHand: 0 },
      { id: 'candy', name: 'Dulces surtidos', kind: 'supply', unit: 'g', onHand: 100 },
      { id: 'bag', name: 'Bolsa con etiqueta', kind: 'packaging', unit: 'unidad', onHand: 10 },
    ],
    filaments: [{ skuId: 'pink', label: 'PLA Rosado', onHandGrams: 1000 }],
    recipes: [
      {
        variantId: 'v-potion',
        name: 'Botella de poción · Con dulces surtidos',
        assembled: true,
        finishedItemId: 'potion',
        components: [
          { itemId: 'bottle', perUnit: 1 },
          { itemId: 'cap', perUnit: 1 },
          { itemId: 'candy', perUnit: 66 },
          { itemId: 'bag', perUnit: 1 },
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
        outputs: [{ itemId: 'bottle', units: 1 }],
        filaments: [{ skuId: 'pink', label: 'PLA Rosado', grams: 5.69 }],
      },
      { id: 'plate-caps', label: 'Tapas', printSeconds: 20 * 60, outputs: [{ itemId: 'cap', units: 9 }], filaments: [] },
    ],
    demands: [
      demand({
        id: 'o1',
        number: 'PED-0003',
        customerName: 'Ana Quispe',
        priorityAt: lima('2026-10-06 10:00'),
        dueDate: '2026-10-05',
        lines: [potions('o1-l1', 2)],
      }),
      demand({
        id: 'o2',
        number: 'PED-0005',
        customerName: 'Diego Flores',
        priorityAt: lima('2026-10-06 11:00'),
        dueDate: '2026-10-07',
        lines: [potions('o2-l1', 30)],
      }),
      demand({
        id: 'q1',
        number: 'COT-0012',
        kind: 'quote',
        customerName: 'María Pérez',
        priorityAt: lima('2026-10-06 12:00'),
        holdUntil: lima('2026-10-07 23:00'),
        lines: [potions('q1-l1', 2)],
      }),
      demand({
        id: 'o3',
        number: 'PED-0008',
        customerName: 'Café Lima',
        priorityAt: lima('2026-10-06 13:00'),
        holdUntil: lima('2026-10-06 23:00'),
        dueDate: '2026-10-16',
        lines: [potions('o3-l1', 1)],
      }),
      demand({
        id: 'q2',
        number: 'COT-0013',
        kind: 'quote',
        customerName: 'Luis Rojas',
        priorityAt: lima('2026-10-06 14:00'),
        holdUntil: lima('2026-10-09 23:00'),
        lines: [potions('q2-l1', 1)],
      }),
    ],
    ...overrides,
  };
}

function view(input: PlanInput = workshop()): PlanView {
  return { input, result: plan(input) };
}

describe('dayWords', () => {
  it('names the three days around today', () => {
    expect(dayWords('2026-10-06', '2026-10-06')).toBe('hoy');
    expect(dayWords('2026-10-07', '2026-10-06')).toBe('mañana');
    expect(dayWords('2026-10-05', '2026-10-06')).toBe('ayer');
  });

  it('says any other day by its name and number, and the month only when it changes', () => {
    expect(dayWords('2026-10-08', '2026-10-06')).toBe('el jueves 8');
    expect(dayWords('2026-10-01', '2026-10-06')).toBe('el jueves 1');
    expect(dayWords('2026-11-02', '2026-10-06')).toBe('el lunes 2 de noviembre');
  });
});

describe('lateWording', () => {
  it('says the day promised and the day it would be ready', () => {
    expect(lateWording('2026-10-08', lima('2026-10-09 10:30'), NOW, TZ)).toBe('Vence el jueves 8 y sale el viernes 9.');
    expect(lateWording('2026-10-05', lima('2026-10-07 07:20'), NOW, TZ)).toBe('Venció ayer y sale mañana.');
  });

  it('gives the hour only when it is ready today', () => {
    expect(lateWording('2026-10-05', lima('2026-10-06 22:52'), NOW, TZ)).toBe('Venció ayer y sale hoy 22:52.');
  });

  it('says the date holds only if what is missing is bought today', () => {
    expect(lateWording('2026-10-06', lima('2026-10-07 07:20'), NOW, TZ, true)).toBe(
      'Vence hoy y sale mañana, si hoy se compra lo que falta.',
    );
  });
});

describe('lateOrderTasks', () => {
  const tasks = lateOrderTasks(view());

  it('lists the confirmed orders the plan says arrive late, with the customer first', () => {
    expect(tasks.map((task) => task.title)).toEqual(['Ana Quispe · PED-0003', 'Diego Flores · PED-0005']);
    expect(tasks.every((task) => task.urgency === 'late')).toBe(true);
  });

  it('links to the order and takes the key of its due-date task', () => {
    expect(tasks[0]).toMatchObject({ key: 'order:o1', route: '/pedidos/o1', photo: { kind: 'order', id: 'o1' } });
  });

  it('reads the dates from the plan', () => {
    // Two bottles and a cap plate from 18:00, then twenty minutes of hands.
    expect(tasks[0]!.detail).toBe('Venció ayer y sale hoy 20:36, si hoy se compra lo que falta.');
    // Thirty bottles of 43 minutes do not fit in tonight and tomorrow's window.
    expect(tasks[1]!.detail).toBe('Vence mañana y sale el jueves 8, si hoy se compra lo que falta.');
  });

  it('leaves out an order on hold: its separo has its own task', () => {
    const input = workshop();
    input.demands = input.demands.map((d) => (d.id === 'o3' ? { ...d, dueDate: '2026-10-01' } : d));
    expect(lateOrderTasks(view(input)).map((task) => task.key)).not.toContain('order:o3');
  });

  it('writes "Pedido" when there is no customer', () => {
    expect(orderTitle('PED-0001', null)).toBe('Pedido PED-0001');
  });
});

describe('holdTasks', () => {
  const tasks = holdTasks(view());

  it('warns of the holds that end today or tomorrow, and not of later ones', () => {
    expect(tasks.map((task) => task.key)).toEqual(['hold:quote:q1', 'hold:order:o3']);
  });

  it('names who and what, and when it ends', () => {
    expect(tasks[0]).toMatchObject({
      urgency: 'soon',
      title: 'Vence el separo de María Pérez',
      detail: 'COT-0012, 2 × Botella de poción · mañana 23:00',
      route: '/cotizaciones/q1',
      photo: { kind: 'variant', id: 'v-potion' },
    });
    expect(tasks[1]).toMatchObject({
      urgency: 'today',
      title: 'Vence el separo de Café Lima',
      detail: 'PED-0008, 1 × Botella de poción · hoy 23:00',
      route: '/pedidos/o3',
      photo: { kind: 'order', id: 'o3' },
    });
  });

  it('forgets a hold that already lapsed: the plan no longer counts it', () => {
    const input = workshop({ now: lima('2026-10-07 00:30') });
    expect(holdTasks(view(input)).map((task) => task.key)).toEqual(['hold:quote:q1']);
  });

  it('counts the units of a hold with several lines', () => {
    const input = workshop();
    input.demands = input.demands.map((d) =>
      d.id === 'q1' ? { ...d, lines: [potions('a', 2), potions('b', 3)] } : d,
    );
    expect(holdTasks(view(input))[0]!.detail).toBe('COT-0012, 5 unidades · mañana 23:00');
  });
});

describe('purchaseTask', () => {
  it('adds up what the confirmed orders lack, and nothing a hold lacks', () => {
    const { shortages, orders } = confirmedShortages(view());
    expect(orders).toEqual(['PED-0003', 'PED-0005']);
    expect(shortages.map((s) => [s.label, s.missing])).toEqual([
      ['Dulces surtidos', 2012],
      ['Bolsa con etiqueta', 22],
    ]);
  });

  it('says it in one sentence and sends to «Compras»', () => {
    expect(purchaseTask(view())).toMatchObject({
      key: 'purchase',
      title: 'Falta comprar',
      detail: '2.01 kg de Dulces surtidos y 22 unidades de Bolsa con etiqueta, para 2 pedidos.',
      route: '/inventario/compras',
      photo: { kind: 'item', id: 'candy' },
    });
  });

  it('is not there when nothing has to be bought', () => {
    const input = workshop();
    input.items = input.items.map((item) => (item.id === 'candy' || item.id === 'bag' ? { ...item, onHand: 5000 } : item));
    expect(purchaseTask(view(input))).toBeNull();
  });

  it('lists grams of filament as well', () => {
    expect(
      shoppingList([
        { kind: 'item', id: 'candy', label: 'Dulces surtidos', missing: 2384, unit: 'g' },
        { kind: 'filament', id: 'pink', label: 'PLA Rosado', missing: 12.76, unit: 'g' },
      ]),
    ).toBe('2.38 kg de Dulces surtidos y 12.76 g de PLA Rosado');
  });
});

describe('warningTasks, against the real plan', () => {
  it('drops "pasó su tiempo estimado": «Impresión sin cerrar» already asks to close it', () => {
    const input = workshop({ jobs: [printing({ startedAt: lima('2026-10-06 09:00') })] });
    const current = view(input);
    expect(current.result.warnings.some((warning) => warning.includes('pasó su tiempo estimado'))).toBe(true);
    expect(warningTasks(current.result.warnings)).toEqual([]);
    expect(pastEstimateJobs(input)).toEqual(new Set(['job']));
  });

  it('asks to fill an empty recipe and to load a missing one', () => {
    const input = workshop({
      recipes: [{ ...workshop().recipes[0]!, components: [] }],
      demands: [
        demand({ id: 'o1', number: 'PED-0003', lines: [potions('l1', 1)] }),
        demand({
          id: 'o2',
          number: 'PED-0004',
          lines: [{ id: 'l2', description: 'Llavero', quantity: 1, variantId: 'v-none', custom: null }],
        }),
      ],
    });
    const tasks = warningTasks(view(input).result.warnings);
    expect(tasks.map((task) => [task.title, task.route])).toEqual([
      ['Botella de poción · Con dulces surtidos', '/catalogo'],
      ['Llavero', '/catalogo'],
    ]);
    expect(tasks[0]!.detail).toMatch(/^Su receta no tiene piezas ni insumos/);
    expect(tasks[1]!.detail).toMatch(/^No tiene receta/);
  });

  it('says when there is no printer to plan with', () => {
    const tasks = warningTasks(view(workshop({ printers: [] })).result.warnings);
    expect(tasks.map((task) => [task.title, task.route])).toEqual([['Ninguna impresora disponible', '/impresoras']]);
  });

  it('says a printer has to be registered when the workshop has none at all', () => {
    // An empty workshop is not waiting for a printer to come back.
    const tasks = warningTasks(view(workshop({ printers: [] })).result.warnings, false);
    expect(tasks.map((task) => [task.title, task.route])).toEqual([['Falta registrar la impresora', '/impresoras']]);
    expect(tasks[0]!.detail).not.toMatch(/vuelve/);
  });

  it('leaves out a plate longer than the window: a condition, not something to do today', () => {
    const input = workshop();
    input.plates = input.plates.map((plate) => ({ ...plate, printSeconds: 20 * 3600 }));
    const current = view(input);
    expect(current.result.warnings.some((warning) => warning.includes('no cabe en el horario'))).toBe(true);
    expect(warningTasks(current.result.warnings)).toEqual([]);
  });
});

describe('planTasks', () => {
  it('puts the late orders first, then holds, purchase and warnings', () => {
    expect(planTasks(view()).map((task) => task.key)).toEqual([
      'order:o1',
      'order:o2',
      'hold:quote:q1',
      'hold:order:o3',
      'purchase',
    ]);
  });
});

describe('pastEstimateJobs', () => {
  it('knows a job still within its estimate is just running', () => {
    expect(pastEstimateJobs(workshop({ jobs: [printing()] }))).toEqual(new Set());
  });
});

describe('uniqueTasks', () => {
  it('keeps the first task of each key', () => {
    const task = (key: string, title: string): TodayTask => ({
      key,
      urgency: 'late',
      title,
      detail: '',
      route: '',
      photo: null,
      kind: 'product',
    });
    expect(uniqueTasks([task('order:1', 'del plan'), task('order:1', 'de la fecha'), task('x', 'otra')]).map((t) => t.title)).toEqual([
      'del plan',
      'otra',
    ]);
  });
});
