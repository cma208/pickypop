import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { PrintJobForm } from './print-job-form';
import { ProduccionData, type NewJob, type SpoolOption } from './produccion.data';

const SPOOL: SpoolOption = {
  id: 'pla-blanco',
  code: 'BLANCO-01',
  skuId: 'sku-blanco',
  status: 'open',
  materialCode: 'PLA',
  colorName: 'Blanco',
  colorHex: '#ffffff',
  onHandG: 1000,
};

function open() {
  const createJob = vi.fn(async (_job: NewJob) => 'job-1');
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProduccionData,
        useValue: {
          createJob,
          printers: async () => [{ id: 'a1', name: 'A1 mini' }],
          plates: async () => [],
          spools: async () => [SPOOL],
          openOrderLines: async () => [],
        },
      },
      { provide: PlanService, useValue: { invalidate: () => undefined } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(PrintJobForm);
  fixture.detectChanges();
  return { fixture, createJob };
}

const el = (fixture: ComponentFixture<PrintJobForm>) => fixture.nativeElement as HTMLElement;

/** Lets the form's own promises (loading, saving) settle: zoneless tests do not track them. */
async function settle(fixture: ComponentFixture<PrintJobForm>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function fill(fixture: ComponentFixture<PrintJobForm>, label: string): Promise<void> {
  await settle(fixture);
  const name = el(fixture).querySelector<HTMLInputElement>('input[formcontrolname=label]')!;
  name.value = label;
  name.dispatchEvent(new Event('input'));
  const spool = el(fixture).querySelector<HTMLSelectElement>('select[formcontrolname=spoolId]')!;
  spool.value = SPOOL.id;
  spool.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

function createButton(fixture: ComponentFixture<PrintJobForm>): HTMLButtonElement {
  return [...el(fixture).querySelectorAll('button')].find((b) => b.textContent?.includes('Crear trabajo'))!;
}

describe('PrintJobForm, «Crear trabajo» (T3-11)', () => {
  it('creates one job however fast it is pressed twice', async () => {
    const { fixture, createJob } = open();
    await fill(fixture, 'Molde');

    const button = createButton(fixture);
    button.click();
    button.click();
    await settle(fixture);

    expect(createJob).toHaveBeenCalledOnce();
    expect(createJob.mock.calls[0]![0]).toMatchObject({ label: 'Molde', printerId: 'a1' });
    expect(createJob.mock.calls[0]![0].requestKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a retry of the same job after a failure sends the same key', async () => {
    const { fixture, createJob } = open();
    createJob.mockRejectedValueOnce(new Error('Failed to fetch'));
    await fill(fixture, 'Molde');

    createButton(fixture).click();
    await settle(fixture);
    createButton(fixture).click();
    await settle(fixture);

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(createJob.mock.calls[1]![0].requestKey).toBe(createJob.mock.calls[0]![0].requestKey);
  });

  it('a name longer than 200 characters is refused next to the field (T3-13)', async () => {
    const { fixture, createJob } = open();
    await fill(fixture, 'x'.repeat(201));

    createButton(fixture).click();
    await settle(fixture);

    expect(el(fixture).textContent).toContain('Usa 200 caracteres o menos.');
    expect(createJob).not.toHaveBeenCalled();
  });
});
