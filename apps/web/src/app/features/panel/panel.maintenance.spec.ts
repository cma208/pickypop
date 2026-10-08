import { describe, expect, it } from 'vitest';
import { maintenanceNotes, unwatchedPrinters, type MaintenanceCoverage } from './panel.maintenance';

const a1 = { id: 'a1', name: 'A1 mini' };
const x1 = { id: 'x1', name: 'Bambu X1' };
const p1 = { id: 'p1', name: 'P1S' };

describe('unwatchedPrinters', () => {
  it('names the printers without an active plan', () => {
    const plans = [
      { printerId: 'a1', active: true },
      { printerId: 'x1', active: false },
    ];
    expect(unwatchedPrinters([a1, x1, p1], plans)).toEqual(['Bambu X1', 'P1S']);
  });

  it('names none when every printer has a plan', () => {
    expect(unwatchedPrinters([a1], [{ printerId: 'a1', active: true }])).toEqual([]);
  });
});

describe('maintenanceNotes', () => {
  function coverage(overrides: Partial<MaintenanceCoverage>): MaintenanceCoverage {
    return { registered: 1, inUse: 1, unwatched: [], ...overrides };
  }

  it('says there is no printer yet', () => {
    expect(maintenanceNotes(coverage({ registered: 0, inUse: 0 }), 0)).toEqual([
      { text: 'Todavía no hay impresoras registradas.', tone: 'muted', plansLink: false },
    ]);
  });

  it('says every printer is retired instead of calling them up to date', () => {
    const [note] = maintenanceNotes(coverage({ registered: 1, inUse: 0 }), 0);
    expect(note?.text).toContain('retiradas');
  });

  it('does not vouch for a workshop without plans', () => {
    // The walk: one A1 mini and no plan at all.
    expect(maintenanceNotes(coverage({ unwatched: ['A1 mini'] }), 0)).toEqual([
      { text: 'Todavía no hay planes de mantenimiento, así que nada avisa cuándo toca.', tone: 'muted', plansLink: true },
    ]);
  });

  it('names the printer nobody watches and says up to date only of the other', () => {
    const notes = maintenanceNotes(coverage({ registered: 2, inUse: 2, unwatched: ['Bambu X1'] }), 0);
    expect(notes.map((note) => note.text)).toEqual([
      '«Bambu X1» no tiene planes de mantenimiento, así que nada avisa cuándo le toca.',
      'La otra impresora no tiene mantenimientos pendientes.',
    ]);
    expect(notes.map((note) => note.tone)).toEqual(['muted', 'positive']);
  });

  it('names several unwatched printers in one sentence', () => {
    const [note] = maintenanceNotes(coverage({ registered: 3, inUse: 3, unwatched: ['Bambu X1', 'P1S'] }), 0);
    expect(note?.text).toBe('«Bambu X1» y «P1S» no tienen planes de mantenimiento, así que nada avisa cuándo les toca.');
  });

  it('still names the unwatched printer next to the alerts, and says nothing is up to date', () => {
    const notes = maintenanceNotes(coverage({ registered: 2, inUse: 2, unwatched: ['Bambu X1'] }), 1);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.plansLink).toBe(true);
  });

  it('says up to date when every printer is watched and nothing is due', () => {
    expect(maintenanceNotes(coverage({}), 0).map((note) => note.text)).toEqual([
      'Sin mantenimientos pendientes: la impresora está al día.',
    ]);
    expect(maintenanceNotes(coverage({ registered: 2, inUse: 2 }), 0).map((note) => note.text)).toEqual([
      'Sin mantenimientos pendientes: las impresoras están al día.',
    ]);
  });

  it('adds nothing to the alerts of a fully watched workshop', () => {
    expect(maintenanceNotes(coverage({}), 2)).toEqual([]);
  });
});
