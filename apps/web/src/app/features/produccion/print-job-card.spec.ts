import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { PrintJobCard } from './print-job-card';
import { ProduccionData, type JobItem } from './produccion.data';
import { workspaceAs } from '../../core/workspace.testing';

/** Queued with its roll, ready for «Iniciar». */
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
  label: 'Llaveros',
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
  filaments: [
    {
      id: 'f-1',
      spoolId: 'pla-negro',
      spoolCode: 'NEGRO-01',
      materialCode: 'PLA',
      colorName: 'Negro',
      colorHex: '#000000',
      slot: 1,
      estimatedG: 10,
      actualG: null,
    },
  ],
};

function open(job: JobItem, canOperate: boolean) {
  const startJob = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProduccionData, useValue: { startJob } },
      { provide: PlanService, useValue: { invalidate: () => undefined } },
      workspaceAs(canOperate ? 'operator' : 'viewer'),
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(PrintJobCard);
  fixture.componentRef.setInput('job', job);
  fixture.detectChanges();
  return { fixture, startJob };
}

const text = (fixture: ComponentFixture<PrintJobCard>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
const buttons = (fixture: ComponentFixture<PrintJobCard>) =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) => b.textContent?.trim());

describe('PrintJobCard, who may start and close', () => {
  it('offers «Iniciar» and «Cerrar…» to the owner and the operator', () => {
    const { fixture } = open(PLANNED, true);
    expect(buttons(fixture)).toEqual(['Iniciar', 'Cerrar…']);
  });

  it('offers neither to a member who only reads, and says who can', () => {
    const { fixture, startJob } = open(PLANNED, false);
    expect(buttons(fixture)).toEqual([]);
    expect(text(fixture)).toContain('Solo el dueño y los operadores pueden iniciar y cerrar impresiones.');
    expect(startJob).not.toHaveBeenCalled();
  });

  it('says nothing of the kind on a closed job, which has no actions for anyone', () => {
    const { fixture } = open({ ...PLANNED, status: 'success', finishedAt: '2026-10-07T16:00:00Z' }, false);
    expect(buttons(fixture)).toEqual([]);
    expect(text(fixture)).not.toContain('Solo el dueño');
  });
});
