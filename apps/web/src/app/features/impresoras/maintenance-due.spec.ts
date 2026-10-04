import type { LogRecord, PlanRecord } from './impresoras.models';
import { dueStatuses, evaluatePlan, needsAttention } from './maintenance-due';
import { composeLogNote } from './log-form';

const TODAY = '2026-10-04';

function plan(overrides: Partial<PlanRecord>): PlanRecord {
  return {
    id: 'p1',
    printerId: 'printer',
    task: 'Limpiar ejes',
    everyHours: null,
    everyDays: null,
    checklist: [],
    active: true,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides,
  };
}

function log(overrides: Partial<LogRecord>): LogRecord {
  return {
    id: 'l1',
    printerId: 'printer',
    planId: 'p1',
    performedAt: '2026-10-01T15:00:00Z',
    printerHours: 100,
    durationMin: null,
    cost: 0,
    note: null,
    ...overrides,
  };
}

describe('evaluatePlan', () => {
  it('is overdue when the day interval has passed', () => {
    const status = evaluatePlan(plan({ everyDays: 2 }), log({}), 100, TODAY);
    expect(status.state).toBe('overdue');
    expect(status.summary).toContain('hace 1 día');
  });

  it('is due today when exactly the interval has passed', () => {
    const status = evaluatePlan(plan({ everyDays: 3 }), log({}), 100, TODAY);
    expect(status.state).toBe('soon');
    expect(status.summary).toContain('hoy');
  });

  it('is up to date right after the maintenance', () => {
    const status = evaluatePlan(plan({ everyDays: 30 }), log({ performedAt: '2026-10-04T15:00:00Z' }), 100, TODAY);
    expect(status.state).toBe('ok');
  });

  it('counts printer hours since the last log', () => {
    const overdue = evaluatePlan(plan({ everyHours: 150 }), log({ printerHours: 10 }), 175, TODAY);
    expect(overdue.state).toBe('overdue');

    const soon = evaluatePlan(plan({ everyHours: 150 }), log({ printerHours: 100 }), 225, TODAY);
    expect(soon.state).toBe('soon');

    const fine = evaluatePlan(plan({ everyHours: 150 }), log({ printerHours: 100 }), 130, TODAY);
    expect(fine.state).toBe('ok');
  });

  it('lets whichever trigger comes first decide', () => {
    const status = evaluatePlan(plan({ everyHours: 150, everyDays: 2 }), log({ printerHours: 100 }), 110, TODAY);
    expect(status.state).toBe('overdue');
  });

  it('starts counting days from the plan creation when never logged', () => {
    const status = evaluatePlan(plan({ everyDays: 7 }), null, 100, TODAY);
    expect(status.neverLogged).toBe(true);
    expect(status.state).toBe('overdue');
  });

  it('reports hours-only plans without a log as never logged', () => {
    const status = evaluatePlan(plan({ everyHours: 150 }), null, 175, TODAY);
    expect(status.state).toBe('never');
    expect(status.summary).toContain('Sin registros');
  });
});

describe('dueStatuses', () => {
  it('ignores paused plans and sorts the most urgent first', () => {
    const plans = [
      plan({ id: 'a', everyDays: 30 }),
      plan({ id: 'b', everyDays: 1 }),
      plan({ id: 'c', everyDays: 1, active: false }),
    ];
    const logs = [
      log({ planId: 'a', performedAt: '2026-10-03T15:00:00Z' }),
      log({ id: 'l2', planId: 'b', performedAt: '2026-09-20T15:00:00Z' }),
    ];

    const statuses = dueStatuses(plans, logs, 100, TODAY);
    expect(statuses.map((status) => status.plan.id)).toEqual(['b', 'a']);
    expect(needsAttention(statuses).map((status) => status.plan.id)).toEqual(['b']);
  });

  it('uses the newest log of each plan', () => {
    const logs = [
      log({ performedAt: '2026-10-04T15:00:00Z' }),
      log({ id: 'old', performedAt: '2026-08-01T15:00:00Z' }),
    ];
    const [status] = dueStatuses([plan({ everyDays: 10 })], logs, 100, TODAY);
    expect(status?.state).toBe('ok');
  });
});

describe('composeLogNote', () => {
  it('returns null when there is nothing to say', () => {
    expect(composeLogNote('', [], new Set())).toBeNull();
  });

  it('keeps the free note and marks the checklist', () => {
    const note = composeLogNote(' Todo bien ', ['Limpiar guías', 'Lubricar'], new Set([0]));
    expect(note).toContain('Todo bien');
    expect(note).toContain('✔ Limpiar guías');
    expect(note).toContain('✘ Lubricar');
  });
});
