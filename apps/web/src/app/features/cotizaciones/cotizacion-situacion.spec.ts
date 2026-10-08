import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { plan, type PlanDemand, type PlanInput } from '@pickypop/domain';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import type { QuoteDetail, StoredLine } from '../cotizador/cotizador.data';
import { CotizacionSituacion } from './cotizacion-situacion';

const MINUTE = 60_000;
/** The page reads the plan again this long after the hold ends, so the database already sees it ended. */
const MARGIN = 2_000;

const line: StoredLine = {
  id: 'ql1',
  position: 1,
  kind: 'catalog',
  variantId: 'v-pocion',
  description: 'Botella de poción',
  quantity: 3,
  setupMinutes: 0,
  minutesPerUnit: 0,
  unitCost: 5,
  unitPrice: 10,
  lineTotal: 30,
  plates: [],
  supplies: [],
  filamentLabels: {},
  filamentCostPerKg: {},
};

function snapshot(now: string, holdUntil: string): PlanInput {
  const demand: PlanDemand = {
    kind: 'quote',
    id: 'q1',
    number: 'COT-0005',
    customerName: 'María Pérez',
    priorityAt: now,
    holdUntil,
    dueDate: null,
    lines: [{ id: 'ql1', description: 'Botella de poción', quantity: 3, variantId: 'v-pocion', custom: null }],
  };
  return {
    now,
    settings: {
      timeZone: 'America/Lima',
      window: { firstStart: 360, lastStart: 1380, endBy: 1440 },
      changeoverMinutes: 15,
      failureRate: 0,
    },
    printers: [{ id: 'p1', name: 'A1 mini' }],
    jobs: [],
    items: [
      { id: 'pocion', name: 'Botella de poción armada', kind: 'finished_good', unit: 'unidad', onHand: 5 },
      { id: 'bolsa', name: 'Bolsa con etiqueta', kind: 'packaging', unit: 'unidad', onHand: 100 },
    ],
    filaments: [],
    recipes: [
      {
        variantId: 'v-pocion',
        name: 'Botella de poción',
        assembled: true,
        finishedItemId: 'pocion',
        components: [{ itemId: 'bolsa', perUnit: 1 }],
        setupMinutes: 0,
        minutesPerUnit: 1,
      },
    ],
    plates: [],
    demands: [demand],
  };
}

/** Timers of a second or more are kept to run by hand; Angular's own short ones run as usual. */
function captureLongTimers(): { delay: number; run: () => void }[] {
  const captured: { delay: number; run: () => void }[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void, delay?: number, ...rest: unknown[]) => {
    if ((delay ?? 0) >= 1_000) {
      captured.push({ delay: delay!, run });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return real(run, delay, ...rest);
  }) as typeof setTimeout);
  return captured;
}

async function open(holdUntil: string) {
  const now = new Date().toISOString();
  const input = snapshot(now, holdUntil);
  const invalidate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PlanService,
        useValue: {
          version: signal(0),
          current: async () => ({ input, result: plan(input) }),
          whatIf: (base: PlanInput, change: (value: PlanInput) => PlanInput) => plan(change(structuredClone(base))),
          invalidate,
        },
      },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'variant' }) } },
    ],
  });
  const fixture = TestBed.createComponent(CotizacionSituacion);
  fixture.componentRef.setInput('quote', {
    id: 'q1',
    status: 'sent',
    holdUntil,
    storedLines: [line],
  } as Partial<QuoteDetail> as QuoteDetail);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, invalidate };
}

describe('CotizacionSituacion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the plan again when the hold ends, so «Situación» does not outlive it (T4-18)', async () => {
    const timers = captureLongTimers();
    const { fixture, invalidate } = await open(new Date(Date.now() + MINUTE).toISOString());
    expect(fixture.nativeElement.textContent).toContain('Situación');

    const expiry = timers.find((timer) => timer.delay > MINUTE && timer.delay <= MINUTE + MARGIN);
    expect(expiry).toBeDefined();
    expiry!.run();

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('waits for nothing when the quote does not hold', async () => {
    const timers = captureLongTimers();
    const { fixture, invalidate } = await open(new Date(Date.now() - MINUTE).toISOString());

    expect(fixture.nativeElement.textContent).toContain('¿Para cuándo?');
    expect(timers.filter((timer) => timer.delay > MINUTE / 2)).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
