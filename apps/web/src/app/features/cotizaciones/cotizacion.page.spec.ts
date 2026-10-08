import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { CotizadorData, DataError, type QuoteDetail, type QuoteStatus } from '../cotizador/cotizador.data';
import { CotizacionPage } from './cotizacion.page';
import { workspaceAs } from '../../core/workspace.testing';

const IN_A_DAY = new Date(Date.now() + 24 * 3_600_000).toISOString();
const ORD_4 = { id: 'order-4', number: 'ORD-2026-0004' };

function quote(partial: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 'quote-1',
    number: 'COT-2026-0002',
    version: 1,
    status: 'sent',
    customerName: 'Marisol Quispe',
    issuedOn: '2026-10-04',
    validUntil: null,
    total: 30,
    lines: 0,
    hasNewerVersion: false,
    parentQuoteId: null,
    customerId: 'customer-1',
    channelId: null,
    channelName: null,
    requestId: null,
    note: null,
    subtotal: 30,
    discount: 0,
    igv: 0,
    snapshot: null,
    storedLines: [],
    heldAt: null,
    holdUntil: null,
    order: null,
    documentOrder: null,
    latest: { id: partial.id ?? 'quote-1', version: partial.version ?? 1 },
    supplyUnits: {},
    ...partial,
  };
}

interface Opened {
  fixture: ComponentFixture<CotizacionPage>;
  reads: string[];
  setStatus: ReturnType<typeof vi.fn>;
}

async function open(shown: QuoteDetail, refusal: string | null = null): Promise<Opened> {
  const reads: string[] = [];
  const setStatus = vi.fn(async (_id: string, _from: QuoteStatus, _to: QuoteStatus) => {
    if (refusal) throw new DataError(refusal);
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: CotizadorData,
        useValue: {
          quote: async (id: string) => (reads.push(id), shown),
          setStatus,
          defaultHoldUntil: async () => IN_A_DAY,
          setHold: async () => ({ heldAt: null, holdUntil: null }),
        },
      },
      workspaceAs('operator'),
      {
        provide: PlanService,
        useValue: { version: signal(0), current: () => Promise.reject(new Error('sin plan')), invalidate: () => {} },
      },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'variant' }) } },
    ],
  });
  const fixture = TestBed.createComponent(CotizacionPage);
  fixture.componentRef.setInput('id', shown.id);
  await settle(fixture);
  return { fixture, reads, setStatus };
}

async function settle(fixture: ComponentFixture<CotizacionPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<CotizacionPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function button(fixture: ComponentFixture<CotizacionPage>, label: string): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find((candidate) =>
    (candidate as HTMLButtonElement).textContent?.includes(label),
  ) as HTMLButtonElement | undefined;
}

describe('CotizacionPage', () => {
  it('offers the next step and a new version on the newest version of a document without its order', async () => {
    const { fixture } = await open(quote());

    expect(text(fixture)).toContain('El cliente aceptó');
    expect(text(fixture)).toContain('Crear versión nueva');
  });

  it('does not offer a new version from a version whose document already became an order (T4-09)', async () => {
    // COT-2026-0001: v1 rejected, v2 became ORD-2026-0004.
    const { fixture } = await open(
      quote({
        number: 'COT-2026-0001',
        status: 'rejected',
        hasNewerVersion: true,
        documentOrder: { ...ORD_4, version: 2 },
        latest: { id: 'quote-2', version: 2 },
      }),
    );

    expect(text(fixture)).not.toContain('Crear versión nueva');
    expect(text(fixture)).toContain('La versión 2 de COT-2026-0001 ya es el pedido ORD-2026-0004');
  });

  it('on old data, does not offer to send, accept or hold the version after the one that became the order', async () => {
    const { fixture } = await open(
      quote({ version: 2, status: 'sent', documentOrder: { ...ORD_4, version: 1 }, latest: { id: 'quote-1', version: 2 } }),
    );

    expect(text(fixture)).not.toContain('El cliente aceptó');
    expect(text(fixture)).not.toContain('Marcar como enviada');
    expect(text(fixture)).not.toContain('Crear versión nueva');
    expect(button(fixture, 'Cambiar')).toBeUndefined();
  });

  it('lets an old sent version that still holds only let go, and points at the newest', async () => {
    // COT-0002: v1 sent and holding, v2 a draft: v1 keeps holding until v2 is sent.
    const { fixture } = await open(quote({ hasNewerVersion: true, holdUntil: IN_A_DAY, latest: { id: 'quote-2', version: 2 } }));

    expect(text(fixture)).toContain('la versión 2');
    expect(text(fixture)).toContain('todavía separa lo que pide');
    expect(button(fixture, 'Soltar ya')).toBeDefined();
    expect(button(fixture, 'Cambiar')).toBeUndefined();
    expect(text(fixture)).not.toContain('El cliente aceptó');
    expect(text(fixture)).not.toContain('Crear versión nueva');
  });

  it('says why a step was refused over the quote, and reads it again (T4-03)', async () => {
    const refusal =
      'La cotización COT-2026-0002 ya se aceptó y tiene el pedido ORD-2026-0004: no pasa a «rechazada». Si el cliente se echó atrás, cancela el pedido.';
    const { fixture, reads, setStatus } = await open(quote(), refusal);

    button(fixture, 'El cliente la rechazó')!.click();
    await settle(fixture);
    button(fixture, 'Sí, la rechazó')!.click();
    await settle(fixture);

    expect(setStatus).toHaveBeenCalledWith('quote-1', 'sent', 'rejected');
    expect(text(fixture)).toContain(refusal);
    expect(reads).toEqual(['quote-1', 'quote-1']);
  });
});
