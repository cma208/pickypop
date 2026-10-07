import type { PlanDemand, PlanDemandPlan, PlanInput, PlanResult } from '@pickypop/domain';
import { demandLabel, dueText, passWarning, placeOf, readyChanges, withOrderAhead } from './pedido-fila';

const demandPlan = (overrides: Partial<PlanDemandPlan>): PlanDemandPlan => ({
  kind: 'order',
  id: 'o1',
  number: 'PED-0001',
  customerName: 'Ana Quispe',
  priorityAt: '2026-10-05T13:00:00.000Z',
  holdUntil: null,
  dueDate: null,
  lines: [],
  readyAt: '2026-10-07T12:20:00.000Z',
  readyAtIfFailure: '2026-10-07T12:20:00.000Z',
  needsPurchase: false,
  unknown: false,
  late: false,
  ...overrides,
});

const result = (demands: PlanDemandPlan[], now = '2026-10-06T23:00:00.000Z'): PlanResult => ({
  now,
  demands,
  items: [],
  filaments: [],
  runs: [],
  jobs: [],
  proposals: [],
  warnings: [],
});

const demand = (id: string, number: string, priorityAt: string, kind: 'order' | 'quote' = 'order'): PlanDemand => ({
  kind,
  id,
  number,
  customerName: null,
  priorityAt,
  holdUntil: null,
  dueDate: null,
  lines: [],
});

describe('the line an order waits in', () => {
  it('says where an order stands and who goes before it', () => {
    const plan = result([
      demandPlan({ id: 'o1', number: 'PED-0003' }),
      demandPlan({ id: 'q1', kind: 'quote', number: 'COT-0012' }),
      demandPlan({ id: 'o2', number: 'PED-0005' }),
    ]);

    const place = placeOf(plan, 'o2');
    expect(place?.position).toBe(3);
    expect(place?.ahead.map((ahead) => ahead.number)).toEqual(['PED-0003', 'COT-0012']);
    expect(placeOf(plan, 'missing')).toBeNull();
    expect(placeOf(plan, 'q1')).toBeNull();
  });

  it('warns who was there first, and until when a hold lasts', () => {
    expect(passWarning(demandPlan({ number: 'PED-0003', priorityAt: '2026-10-05T13:07:00.000Z' }))).toBe(
      'Ana Quispe confirmó antes (PED-0003, lunes 5 de octubre, 08:07).',
    );
    expect(
      passWarning(
        demandPlan({
          kind: 'quote',
          number: 'COT-0012',
          customerName: 'María Pérez',
          priorityAt: '2026-10-05T23:00:00.000Z',
          holdUntil: '2026-10-08T04:00:00.000Z',
        }),
      ),
    ).toBe('María Pérez hizo un separo antes (COT-0012, lunes 5 de octubre, 18:00), vigente hasta el miércoles 7 de octubre, 23:00.');
    expect(demandLabel(demandPlan({ customerName: null, number: 'PED-0009' }))).toBe('PED-0009');
  });

  it('places the order just before the one it passes, and nobody else moves', () => {
    const input = {
      demands: [
        demand('o1', 'PED-0003', '2026-10-06T13:07:50.902Z'),
        demand('o2', 'PED-0004', '2026-10-06T13:07:50.903Z'),
        demand('o3', 'PED-0006', '2026-10-06T13:07:50.905Z'),
      ],
    } as PlanInput;

    const moved = withOrderAhead(input, 'o3', 'o2');
    const order = [...moved.demands].sort((a, b) => Date.parse(a.priorityAt) - Date.parse(b.priorityAt));
    expect(order.map((d) => d.number)).toEqual(['PED-0003', 'PED-0006', 'PED-0004']);
    expect(withOrderAhead(input, 'o3', 'missing')).toBe(input);
  });

  it('lists whose date moves, and who would become late', () => {
    const before = result([
      demandPlan({ id: 'o1', number: 'PED-0003', readyAt: '2026-10-07T12:20:00.000Z' }),
      demandPlan({ id: 'o2', number: 'PED-0005', customerName: 'Diego', readyAt: '2026-10-08T15:18:00.000Z' }),
    ]);
    const after = result([
      demandPlan({ id: 'o2', number: 'PED-0005', customerName: 'Diego', readyAt: '2026-10-07T12:20:00.000Z' }),
      demandPlan({ id: 'o1', number: 'PED-0003', readyAt: '2026-10-08T15:18:00.000Z', late: true }),
    ]);

    expect(readyChanges(before, after)).toEqual([
      { label: 'PED-0005 · Diego', from: 'jueves 8 de octubre, 10:18', to: 'mañana 07:20', becomesLate: false },
      { label: 'PED-0003 · Ana Quispe', from: 'mañana 07:20', to: 'jueves 8 de octubre, 10:18', becomesLate: true },
    ]);
  });

  it('says whether it arrives in time', () => {
    expect(dueText({ dueDate: '2026-10-08', late: false })).toBe('Llega a tiempo: vence el jueves 8 de octubre.');
    expect(dueText({ dueDate: '2026-10-06', late: true })).toBe('Llega tarde: vence el martes 6 de octubre.');
    expect(dueText({ dueDate: null, late: false })).toBeNull();
  });
});
