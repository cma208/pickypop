import { describe, expect, it } from 'vitest';
import {
  byUrgency,
  dueWording,
  openPrintWording,
  owingWording,
  urgencyForDueDate,
  type TodayTask,
} from './panel.tasks';

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
