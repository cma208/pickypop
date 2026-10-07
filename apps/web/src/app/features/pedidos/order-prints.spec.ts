import type { JobItem } from '../produccion/produccion.data';
import { cancelNotice, cancelQuestion, plannedCount, queuedPrints } from './order-prints';

function job(id: string, extra: Partial<JobItem> = {}): JobItem {
  return {
    id,
    status: 'planned',
    printerId: 'a1',
    printerName: 'A1 mini',
    plateId: null,
    plateLabel: null,
    plateThumbnailPath: null,
    plateOutputs: [],
    produced: [],
    label: null,
    orderId: 'o1',
    orderNumber: 'ORD-2026-0002',
    lineDescription: 'Llavero con nombre, 5 cm',
    estimatedTimeS: 20 * 60,
    actualTimeS: null,
    startedAt: null,
    finishedAt: null,
    failureCause: null,
    percentComplete: null,
    unitsProduced: 0,
    realCost: null,
    note: null,
    createdAt: '2026-10-07T15:00:00Z',
    filaments: [],
    ...extra,
  };
}

const WHITE_ROLL = {
  id: 'f1',
  spoolId: 's1',
  spoolCode: 'PLA-BLANCO-01',
  materialCode: 'PLA',
  colorName: 'Blanco',
  colorHex: '#ffffff',
  slot: 1,
  estimatedG: 5,
  actualG: null,
};

describe('queuedPrints', () => {
  it('says what it is, how long it takes and which roll, as ORD-2026-0002 had it', () => {
    expect(queuedPrints([job('j1', { filaments: [WHITE_ROLL] })])).toEqual([
      {
        id: 'j1',
        name: 'Llavero con nombre, 5 cm',
        printing: false,
        time: '20 min en A1 mini',
        rolls: 'PLA-BLANCO-01 · PLA Blanco (5 g)',
        plateThumbnailPath: null,
      },
    ]);
  });

  it('leaves out what is already closed: there is nothing left to decide about it', () => {
    const prints = queuedPrints([
      job('done', { status: 'success' }),
      job('failed', { status: 'failed' }),
      job('gone', { status: 'cancelled' }),
      job('on-bed', { status: 'printing', label: 'Llavero grande' }),
      job('next'),
    ]);

    expect(prints.map((print) => [print.id, print.printing])).toEqual([
      ['on-bed', true],
      ['next', false],
    ]);
  });

  it('keeps the queue order and says when the roll is still to be chosen', () => {
    const prints = queuedPrints([
      job('second', { createdAt: '2026-10-07T16:00:00Z', estimatedTimeS: null }),
      job('first', { createdAt: '2026-10-07T15:00:00Z' }),
    ]);

    expect(prints.map((print) => print.id)).toEqual(['first', 'second']);
    expect(prints[1]!.time).toBe('Sin tiempo estimado en A1 mini');
    expect(prints[1]!.rolls).toBe('El rollo se elige al iniciar.');
  });
});

describe('plannedCount', () => {
  it('reads in the singular for one', () => {
    expect(plannedCount(1)).toBe('una impresión planificada');
    expect(plannedCount(3)).toBe('3 impresiones planificadas');
  });
});

describe('cancelQuestion', () => {
  it('asks in the singular for one print and in the plural for more', () => {
    expect(cancelQuestion(1)).toContain('¿Cancelas también la impresión planificada? Nunca se imprimió');
    expect(cancelQuestion(1)).toContain('queda en la cola como trabajo suelto');
    expect(cancelQuestion(2)).toContain('¿Cancelas también las 2 impresiones planificadas? Nunca se imprimieron');
    expect(cancelQuestion(2)).toContain('quedan en la cola como trabajos sueltos');
  });
});

describe('cancelNotice', () => {
  it('says nothing when there was nothing in the queue', () => {
    expect(cancelNotice(0, true)).toBeNull();
  });

  it('says where the prints went', () => {
    expect(cancelNotice(1, true)).toBe('También se canceló una impresión planificada, sin tiempo ni costo.');
    expect(cancelNotice(2, true)).toBe('También se cancelaron 2 impresiones planificadas, sin tiempo ni costo.');
    expect(cancelNotice(1, false)).toBe('Su impresión planificada quedó en la cola como trabajo suelto, sin pedido.');
    expect(cancelNotice(2, false)).toBe('Sus 2 impresiones planificadas quedaron en la cola como trabajos sueltos, sin pedido.');
  });
});
