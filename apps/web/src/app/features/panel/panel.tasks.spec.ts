import { describe, expect, it } from 'vitest';
import {
  byUrgency,
  dueWording,
  openPrintWording,
  owedTask,
  owingWording,
  urgencyForDueDate,
  type TodayTask,
} from './panel.tasks';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string) => text.replace(/ /g, ' ');

describe('owedTask (T4-12)', () => {
  const today = '2026-10-08';

  it('is on time when it has no due date, as Por cobrar says «Al día»', () => {
    const task = owedTask({ balance: 57.34, daysOverdue: 0, dueDate: null }, today);
    expect(task.urgency).toBe('soon');
    expect(plain(task.detail)).toBe('Entregado y debe S/ 57.34. Sin fecha de vencimiento.');
  });

  it('is due today on the day itself, not late', () => {
    expect(owedTask({ balance: 8, daysOverdue: 0, dueDate: today }, today)).toMatchObject({ urgency: 'today' });
    expect(owedTask({ balance: 8, daysOverdue: 0, dueDate: today }, today).detail).toContain('Vence hoy.');
  });

  it('is late only once the database counts days overdue', () => {
    expect(owedTask({ balance: 8, daysOverdue: 1, dueDate: '2026-10-07' }, today)).toMatchObject({
      urgency: 'late',
    });
    expect(owedTask({ balance: 8, daysOverdue: 1, dueDate: '2026-10-07' }, today).detail).toContain('Venció ayer.');
    expect(owedTask({ balance: 8, daysOverdue: 5, dueDate: '2026-10-03' }, today).detail).toContain('hace 5 días');
  });

  it('is on time when it falls due later', () => {
    expect(owedTask({ balance: 8, daysOverdue: 0, dueDate: '2026-10-20' }, today)).toMatchObject({ urgency: 'soon' });
  });
});

describe('urgencyForDueDate', () => {
  it('yesterday is late and today is not', () => {
    expect(urgencyForDueDate(-1)).toBe('late');
    expect(urgencyForDueDate(0)).toBe('today');
  });

  it('anything still ahead can wait', () => {
    expect(urgencyForDueDate(1)).toBe('soon');
    expect(urgencyForDueDate(3)).toBe('soon');
  });
});

describe('dueWording', () => {
  it('names the three days around today instead of counting them', () => {
    expect(dueWording(-1)).toBe('Se entregaba ayer.');
    expect(dueWording(0)).toBe('Se entrega hoy.');
    expect(dueWording(1)).toBe('Se entrega mañana.');
  });

  it('counts the rest, in the right direction', () => {
    expect(dueWording(-4)).toBe('Se entregaba hace 4 días.');
    expect(dueWording(5)).toBe('Se entrega en 5 días.');
  });
});

describe('openPrintWording', () => {
  it('a job open since today is just running', () => {
    expect(openPrintWording(0)).toContain('En la máquina');
  });

  it('one past its estimated time asks whether it finished, once', () => {
    expect(openPrintWording(0, true)).toBe(
      'Pasó su tiempo estimado: ¿terminó? Ciérrala para que su costo entre y el plan lo sepa.',
    );
    // A day later "sigue abierta" already says more than the estimate.
    expect(openPrintWording(2, true)).toBe('Empezó hace 2 días y sigue abierta: su costo no entró todavía.');
  });

  it('one left open is reported with its cost still missing', () => {
    expect(openPrintWording(1)).toBe('Empezó hace 1 día y sigue abierta: su costo no entró todavía.');
    expect(openPrintWording(3)).toContain('hace 3 días');
  });
});

describe('owingWording', () => {
  it('writes the balance in soles', () => {
    expect(owingWording(120)).toBe('Entregado y debe S/ 120.00.');
  });
});

describe('byUrgency', () => {
  it('puts what is late first and what is merely coming last', () => {
    const task = (urgency: TodayTask['urgency']): TodayTask => ({
      key: urgency,
      urgency,
      title: '',
      detail: '',
      route: '',
      photo: null,
      kind: 'product',
    });
    const sorted = [task('soon'), task('late'), task('today')].sort(byUrgency);
    expect(sorted.map((item) => item.urgency)).toEqual(['late', 'today', 'soon']);
  });
});
