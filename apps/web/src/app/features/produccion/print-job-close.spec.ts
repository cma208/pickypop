import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PrintJobClose } from './print-job-close';
import { ProduccionData, type CloseJob, type JobItem } from './produccion.data';

/** The keychain of the walk: queued, never started, 20 minutes estimated. */
const PLANNED: JobItem = {
  id: 'job-1',
  status: 'planned',
  printerId: 'a1',
  printerName: 'A1 mini',
  plateId: null,
  plateLabel: null,
  plateThumbnailPath: null,
  plateOutputs: [],
  produced: [],
  label: 'Llavero',
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

function open(job: JobItem) {
  const closeJob = vi.fn(async (_job: JobItem, _input: CloseJob) => ({ warning: null, effects: [] }));
  TestBed.configureTestingModule({
    providers: [
      { provide: ProduccionData, useValue: { closeJob, stockOf: async () => [] } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(PrintJobClose);
  fixture.componentRef.setInput('job', job);
  fixture.detectChanges();
  return { fixture, closeJob };
}

const el = (fixture: ComponentFixture<PrintJobClose>) => fixture.nativeElement as HTMLElement;
const text = (fixture: ComponentFixture<PrintJobClose>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
const minutesField = (fixture: ComponentFixture<PrintJobClose>) =>
  el(fixture).querySelector<HTMLInputElement>('input[formcontrolname=actualMinutes]');

function choose(fixture: ComponentFixture<PrintJobClose>, result: string): void {
  const option = [...el(fixture).querySelectorAll('.results label')].find((label) => label.textContent?.includes(result));
  option!.querySelector('input')!.click();
  fixture.detectChanges();
}

function write(fixture: ComponentFixture<PrintJobClose>, name: string, value: string): void {
  const input = el(fixture).querySelector<HTMLInputElement>(`input[formcontrolname=${name}]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<PrintJobClose>, label: string): HTMLButtonElement {
  return [...el(fixture).querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;
}

async function reviewAndConfirm(fixture: ComponentFixture<PrintJobClose>): Promise<string> {
  button(fixture, 'Revisar y cerrar').click();
  fixture.detectChanges();
  const summary = (el(fixture).querySelector('.confirm p')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  button(fixture, 'Sí, cerrar impresión').click();
  await fixture.whenStable();
  return summary;
}

describe('PrintJobClose, cancelling a job nobody started', () => {
  it('empties the proposed time and says an empty one means it never ran', () => {
    const { fixture } = open(PLANNED);
    expect(minutesField(fixture)!.value).toBe('20');

    choose(fixture, 'Cancelada');

    expect(minutesField(fixture)!.value).toBe('');
    expect(text(fixture)).toContain('Déjalo vacío si no llegó a empezar');
    expect(el(fixture).querySelector('input[formcontrolname=percentComplete]')).not.toBeNull();
  });

  it('closes it without time or cost when the time is left empty', async () => {
    const { fixture, closeJob } = open(PLANNED);
    choose(fixture, 'Cancelada');

    const summary = await reviewAndConfirm(fixture);

    expect(summary).toContain('sin tiempo ni costo');
    expect(closeJob).toHaveBeenCalledOnce();
    expect(closeJob.mock.calls[0]![1]).toMatchObject({ result: 'cancelled', actualTimeS: null, percentComplete: null });
  });

  it('takes the minutes it ran when it was launched without «Iniciar» and stopped', async () => {
    const { fixture, closeJob } = open(PLANNED);
    choose(fixture, 'Cancelada');
    write(fixture, 'actualMinutes', '10');
    write(fixture, 'percentComplete', '40');

    const summary = await reviewAndConfirm(fixture);

    expect(summary).toContain('10 min de máquina y luz');
    expect(closeJob.mock.calls[0]![1]).toMatchObject({ result: 'cancelled', actualTimeS: 600, percentComplete: 40 });
  });
});
