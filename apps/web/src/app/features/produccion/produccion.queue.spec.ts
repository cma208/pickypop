import { queueLanes } from './produccion.queue';

const job = (id: string, printerId: string, createdAt: string) => ({
  id,
  printerId,
  printerName: printerId === 'p1' ? 'A1 mini' : 'P1S',
  createdAt,
});

describe('queueLanes', () => {
  it('orders each printer by when the job was queued, as the plan runs it', () => {
    const lanes = queueLanes([
      job('c', 'p1', '2026-10-06T22:00:00Z'),
      job('a', 'p1', '2026-10-06T20:00:00Z'),
      job('x', 'p2', '2026-10-06T21:00:00Z'),
    ]);
    expect(lanes.map((lane) => lane.printerName)).toEqual(['A1 mini', 'P1S']);
    expect(lanes[0]!.jobs.map((queued) => queued.id)).toEqual(['a', 'c']);
  });

  it('breaks a tie of one "Poner en cola" by id, the same way the plan does', () => {
    const lanes = queueLanes([
      job('b', 'p1', '2026-10-06T20:00:00Z'),
      job('B', 'p1', '2026-10-06T20:00:00Z'),
      job('a', 'p1', '2026-10-06T20:00:00Z'),
    ]);
    // Code-unit order: upper case sorts before lower case.
    expect(lanes[0]!.jobs.map((queued) => queued.id)).toEqual(['B', 'a', 'b']);
  });
});
