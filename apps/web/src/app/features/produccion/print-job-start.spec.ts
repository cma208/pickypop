import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PrintJobStart } from './print-job-start';
import { ProduccionData, type JobItem, type JobRoll, type SpoolOption } from './produccion.data';

/** A run queued from «Por lanzar»: a plate of one filament, no rolls yet. */
const QUEUED: JobItem = {
  id: 'job-1',
  status: 'planned',
  printerId: 'a1',
  printerName: 'A1 mini',
  plateId: 'plate-1',
  plateLabel: 'Frente',
  plateThumbnailPath: null,
  plateOutputs: [],
  produced: [],
  label: null,
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
  createdAt: '2026-10-07T15:00:00Z',
  filaments: [],
};

const SPOOL: SpoolOption = {
  id: 'pla-blanco',
  code: 'BLANCO-01',
  skuId: 'sku-blanco',
  status: 'in_use',
  materialCode: 'PLA',
  colorName: 'Blanco',
  colorHex: '#ffffff',
  onHandG: 1000,
};

function open() {
  const startJob = vi.fn(async (_id: string, _rolls?: readonly JobRoll[]) => undefined);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProduccionData,
        useValue: {
          startJob,
          spools: async () => [SPOOL],
          plateFilaments: async () => [{ slot: 1, skuId: 'sku-blanco', grams: 8.63 }],
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PrintJobStart);
  fixture.componentRef.setInput('job', QUEUED);
  fixture.detectChanges();
  return { fixture, startJob };
}

async function settle(fixture: ComponentFixture<PrintJobStart>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
}

function startButton(fixture: ComponentFixture<PrintJobStart>): HTMLButtonElement {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Iniciar con estos rollos'),
  )!;
}

describe('PrintJobStart (T3-01)', () => {
  it('starts once, with its rolls, however fast it is pressed twice', async () => {
    const { fixture, startJob } = open();
    await settle(fixture);

    startButton(fixture).click();
    startButton(fixture).click();
    await settle(fixture);

    expect(startJob).toHaveBeenCalledOnce();
    expect(startJob).toHaveBeenCalledWith('job-1', [{ spoolId: 'pla-blanco', estimatedG: 8.63, slot: 1 }]);
  });

  it('from an old tab, says what the database said and asks the page to reload', async () => {
    const message = 'Este trabajo ya se inició, en otra pestaña o desde otro equipo. Recarga la cola para verlo imprimiendo.';
    const { fixture, startJob } = open();
    startJob.mockRejectedValueOnce({ code: 'P0001', message });
    const refused = vi.fn();
    fixture.componentInstance.refused.subscribe(refused);
    await settle(fixture);

    startButton(fixture).click();
    await settle(fixture);

    expect(refused).toHaveBeenCalledWith(message);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ya se inició');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('mismo rollo');
  });
});
