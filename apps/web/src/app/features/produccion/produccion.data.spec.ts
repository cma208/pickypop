import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../../core/supabase';
import { ProduccionData, type CloseJob, type JobItem } from './produccion.data';

/** A job as a tab shows it: queued, with no rolls yet. */
const QUEUED: JobItem = {
  id: 'job-1',
  status: 'planned',
  printerId: 'a1',
  printerName: 'A1 mini',
  plateId: null,
  plateLabel: null,
  plateThumbnailPath: null,
  plateOutputs: [],
  produced: [],
  label: 'Tapas',
  orderId: null,
  orderNumber: null,
  lineDescription: null,
  estimatedTimeS: 1200,
  actualTimeS: null,
  startedAt: null,
  finishedAt: null,
  failureCause: null,
  percentComplete: null,
  unitsProduced: 0,
  realCost: null,
  note: null,
  createdAt: '2026-10-08T15:00:00Z',
  filaments: [],
};

/** Cancelled before it ran: no rolls, no time, so the close needs nothing but the call. */
const NEVER_RAN: CloseJob = {
  result: 'cancelled',
  actualTimeS: null,
  usage: [],
  failureCause: null,
  percentComplete: null,
  outputs: [],
  note: null,
};

const STARTED_ELSEWHERE =
  'Este trabajo se inició en otra pestaña o desde otro equipo, con sus rollos. Recarga la cola y ciérralo desde ahí, para que descuente lo que gastó.';

function dataWith(rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>): ProduccionData {
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: { rpc } }] });
  return TestBed.inject(ProduccionData);
}

describe('ProduccionData.closeJob', () => {
  it('sends the status the tab saw, so the database can refuse a close from an old tab', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const data = dataWith(async (name, args) => {
      calls.push({ name, args });
      return { error: null };
    });

    await data.closeJob(QUEUED, NEVER_RAN);
    await data.closeJob({ ...QUEUED, status: 'printing' }, NEVER_RAN);

    expect(calls.map((call) => call.name)).toEqual(['complete_print_job', 'complete_print_job']);
    expect(calls.map((call) => call.args['p_expected_status'])).toEqual(['planned', 'printing']);
  });

  it('passes the refusal on, for the card to show it and reload the queue', async () => {
    const data = dataWith(async () => ({ error: { code: 'P0001', message: STARTED_ELSEWHERE } }));

    const failure = await data.closeJob(QUEUED, NEVER_RAN).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'P0001', message: STARTED_ELSEWHERE });
  });
});
