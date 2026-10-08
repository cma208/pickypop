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

/** The mould of the third pass: started, PETG, 95.91 g estimated, a plate of 7 caps. */
const PRINTING: JobItem = {
  ...PLANNED,
  id: 'job-2',
  status: 'printing',
  label: 'Molde',
  startedAt: '2026-10-07T15:00:00Z',
  plateId: 'plate-1',
  plateLabel: 'Tapas',
  plateOutputs: [{ inventoryItemId: 'cap', name: 'Tapa de calavera', imagePath: null, unitsPerRun: 7 }],
  filaments: [
    {
      id: 'f-1',
      spoolId: 'petg-negro',
      spoolCode: 'NEGRO-01',
      materialCode: 'PETG',
      colorName: 'Negro',
      colorHex: '#000000',
      slot: 1,
      estimatedG: 95.91,
      actualG: null,
    },
  ],
};

const gramsField = (fixture: ComponentFixture<PrintJobClose>) =>
  el(fixture).querySelector<HTMLInputElement>('input[formcontrolname=actualG]');

describe('PrintJobClose, a print that stopped halfway (T3-05, T3-08)', () => {
  it('proposes no time nor grams for a failed print until it says how far it got', () => {
    const { fixture } = open(PRINTING);
    expect(gramsField(fixture)!.value).toBe('95.91');

    choose(fixture, 'Fallida');
    expect(minutesField(fixture)!.value).toBe('');
    expect(gramsField(fixture)!.value).toBe('');

    write(fixture, 'percentComplete', '20');
    expect(minutesField(fixture)!.value).toBe('4');
    expect(gramsField(fixture)!.value).toBe('19.18');
  });

  it('leaves alone what the person typed when the percentage changes', () => {
    const { fixture } = open(PRINTING);
    choose(fixture, 'Fallida');
    write(fixture, 'actualMinutes', '7');
    write(fixture, 'percentComplete', '50');
    expect(minutesField(fixture)!.value).toBe('7');
  });

  it('a cancelled print that ran discounts the filament it spent', async () => {
    const { fixture, closeJob } = open(PRINTING);
    choose(fixture, 'Cancelada');
    write(fixture, 'actualMinutes', '30');
    write(fixture, 'percentComplete', '15');

    const summary = await reviewAndConfirm(fixture);

    expect(summary).toContain('con 30 min de máquina y luz');
    expect(summary).toContain('Se registrarán como merma 14.39 g de 1 rollo');
    expect(closeJob.mock.calls[0]![1]).toMatchObject({
      result: 'cancelled',
      actualTimeS: 1800,
      usage: [{ spoolId: 'petg-negro', actualG: 14.39 }],
    });
  });

  it('a cancelled print without a time spent no filament', () => {
    const { fixture, closeJob } = open(PRINTING);
    choose(fixture, 'Cancelada');
    write(fixture, 'actualG', '15');

    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Sin tiempo no gastó filamento');
    expect(el(fixture).querySelector('.confirm')).toBeNull();
    expect(closeJob).not.toHaveBeenCalled();
  });
});

describe('PrintJobClose, what the database keeps (T3-04, T3-18)', () => {
  it('refuses 6.5 caps', () => {
    const { fixture, closeJob } = open(PRINTING);
    const caps = el(fixture).querySelector<HTMLInputElement>('app-print-job-outputs input')!;
    caps.value = '6.5';
    caps.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('en número entero de 0 a 7');
    expect(closeJob).not.toHaveBeenCalled();
  });

  it('refuses grams with more than two decimals', () => {
    const { fixture } = open(PRINTING);
    write(fixture, 'actualG', '50.126');
    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('con hasta dos decimales');
  });
});

describe('PrintJobClose, double clicks and stale tabs (T3-11, T3-16)', () => {
  it('closes once however fast «Sí, cerrar impresión» is pressed twice', async () => {
    const { fixture, closeJob } = open(PRINTING);
    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();
    const confirm = button(fixture, 'Sí, cerrar impresión');
    confirm.click();
    confirm.click();
    await fixture.whenStable();
    expect(closeJob).toHaveBeenCalledOnce();
  });

  it('says what the database said and asks the page to reload', async () => {
    const message = 'Este trabajo ya se cerró como «Exitoso», en otra pestaña o desde otro equipo. Recarga la cola para ver cómo quedó.';
    const { fixture, closeJob } = open(PRINTING);
    closeJob.mockRejectedValueOnce({ code: 'P0001', message });
    const refused = vi.fn();
    fixture.componentInstance.refused.subscribe(refused);

    await reviewAndConfirm(fixture);
    fixture.detectChanges();

    expect(refused).toHaveBeenCalledWith(message);
    expect(text(fixture)).toContain('ya se cerró como «Exitoso»');
  });
});

describe('PrintJobClose, a job that moves while the form is open', () => {
  /** The order page keeps the card across a reload: the same form gets the job as it is now. */
  const startedElsewhere: JobItem = {
    ...PLANNED,
    status: 'printing',
    startedAt: '2026-10-07T15:05:00Z',
    filaments: PRINTING.filaments,
  };

  it('sends the status the form was opened with, not the one a reload brings', async () => {
    const { fixture, closeJob } = open(PLANNED);
    choose(fixture, 'Cancelada');
    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();

    // Another tab renames it; the form is still about the job it saw.
    fixture.componentRef.setInput('job', { ...PLANNED, label: 'Llavero renombrado' });
    fixture.detectChanges();
    button(fixture, 'Sí, cerrar impresión').click();
    await fixture.whenStable();

    expect(closeJob).toHaveBeenCalledOnce();
    // The job as the form saw it: its status is the one the database is told to expect.
    expect(closeJob.mock.calls[0]![0]).toMatchObject({ status: 'planned', label: 'Llavero' });
  });

  it('will not cancel, without its time, a print another tab started meanwhile', async () => {
    const { fixture, closeJob } = open(PLANNED);
    choose(fixture, 'Cancelada');
    button(fixture, 'Revisar y cerrar').click();
    fixture.detectChanges();

    fixture.componentRef.setInput('job', startedElsewhere);
    fixture.detectChanges();

    expect(text(fixture)).toContain('Este trabajo cambió mientras lo cerrabas: ahora está «Imprimiendo»');
    expect(button(fixture, 'Sí, cerrar impresión').disabled).toBe(true);
    // Even pressed through, nothing is sent.
    (fixture.componentInstance as unknown as { confirm(): Promise<void> }).confirm();
    await fixture.whenStable();
    expect(closeJob).not.toHaveBeenCalled();
  });

  it('asks to open it again before writing the grams of rolls it did not have', () => {
    const { fixture, closeJob } = open(PLANNED);
    fixture.componentRef.setInput('job', { ...PLANNED, filaments: PRINTING.filaments });
    fixture.detectChanges();

    expect(text(fixture)).toContain('Los rollos de este trabajo cambiaron mientras lo cerrabas');
    expect(button(fixture, 'Revisar y cerrar').disabled).toBe(true);
    expect(el(fixture).querySelector('.confirm')).toBeNull();
    expect(closeJob).not.toHaveBeenCalled();
  });
});
