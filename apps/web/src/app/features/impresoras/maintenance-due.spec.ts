import type { LogRecord, PlanRecord } from './impresoras.models';
import { dueStatuses, evaluatePlan, needsAttention } from './maintenance-due';
import { composeLogContent } from './log-form';
import { parseChecklist } from './impresoras.data';

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
    checklistDone: [],
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

describe('composeLogContent', () => {
  it('returns no note and no steps when there is nothing to say', () => {
    expect(composeLogContent('', [], new Set())).toEqual({ note: null, checklistDone: [] });
  });

  it('keeps only the free text in the note and only the ticked steps in the checklist', () => {
    const content = composeLogContent(' Todo bien ', ['Limpiar guías', 'Lubricar', 'Revisar correas'], new Set([0, 2]));
    expect(content.note).toBe('Todo bien');
    expect(content.checklistDone).toEqual(['Limpiar guías', 'Revisar correas']);
  });

  it('does not mention the checklist in the note when the note is empty', () => {
    const content = composeLogContent('   ', ['Limpiar guías'], new Set([0]));
    expect(content.note).toBeNull();
    expect(content.checklistDone).toEqual(['Limpiar guías']);
  });

  it('records no steps when the plan has a checklist but nothing was ticked', () => {
    const content = composeLogContent('Sin tiempo', ['Limpiar guías', 'Lubricar'], new Set());
    expect(content).toEqual({ note: 'Sin tiempo', checklistDone: [] });
  });

  it('follows the step order of the plan, not the order of ticking', () => {
    const content = composeLogContent('', ['A', 'B', 'C'], new Set([2, 0]));
    expect(content.checklistDone).toEqual(['A', 'C']);
  });
});

describe('parseChecklist', () => {
  it('keeps a list of strings as it is', () => {
    expect(parseChecklist(['Limpiar guías', 'Lubricar'])).toEqual(['Limpiar guías', 'Lubricar']);
  });

  it('drops anything that is not a string inside the list', () => {
    expect(parseChecklist(['Lubricar', 3, null, { step: 'x' }, ['y']])).toEqual(['Lubricar']);
  });

  it('treats anything that is not a list as empty', () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist('Lubricar')).toEqual([]);
    expect(parseChecklist(42)).toEqual([]);
    expect(parseChecklist({ 0: 'Lubricar' })).toEqual([]);
  });
});
