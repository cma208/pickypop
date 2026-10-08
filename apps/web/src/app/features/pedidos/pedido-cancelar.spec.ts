import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { UserFacingError } from '../../core/friendly-error';
import { Media } from '../../core/media';
import { CurrentWorkspace, type MemberRole } from '../../core/workspace';
import type { QueuedPrint } from './order-prints';
import { PedidoCancelar } from './pedido-cancelar';
import { PedidosData } from './pedidos.data';

const KEYCHAIN: QueuedPrint = {
  id: 'j1',
  name: 'Llavero con nombre, 5 cm',
  printing: false,
  time: '20 min en A1 mini',
  rolls: 'PLA-BLANCO-01 · PLA Blanco (5 g)',
  plateThumbnailPath: null,
};

type Call = [orderId: string, seenPrints: readonly string[], cancelPrints: boolean | null];

interface Opened {
  fixture: ComponentFixture<PedidoCancelar>;
  calls: Call[];
  notices: (string | null)[];
  stale: number;
}

function open(
  prints: QueuedPrint[],
  cancelOrder?: () => Promise<void>,
  paid: number | null = 0,
  role: MemberRole = 'owner',
): Opened {
  const calls: Call[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CurrentWorkspace, useValue: { role: signal(role), info: async () => ({ role }) } },
      // The pictures are not what is being tested: nothing is signed or looked up.
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
      {
        provide: PedidosData,
        useValue: {
          cancelOrder: async (orderId: string, seenPrints: readonly string[], cancelPrints: boolean | null) => {
            calls.push([orderId, [...seenPrints], cancelPrints]);
            await cancelOrder?.();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PedidoCancelar);
  fixture.componentRef.setInput('orderId', 'order-2');
  fixture.componentRef.setInput('paid', paid);
  fixture.componentRef.setInput('prints', prints);
  const opened: Opened = { fixture, calls, notices: [], stale: 0 };
  fixture.componentInstance.cancelled.subscribe((notice) => opened.notices.push(notice));
  fixture.componentInstance.stale.subscribe(() => opened.stale++);
  fixture.detectChanges();
  return opened;
}

const text = (fixture: ComponentFixture<PedidoCancelar>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function press(fixture: ComponentFixture<PedidoCancelar>, label: string): void {
  const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`no button «${label}» among ${buttons.map((b) => b.textContent?.trim()).join(', ')}`);
  button.click();
}

async function settle(fixture: ComponentFixture<PedidoCancelar>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PedidoCancelar', () => {
  it('lists what the order put in the queue, how long and with which roll, and asks', () => {
    const { fixture } = open([KEYCHAIN]);

    expect(text(fixture)).toContain('Llavero con nombre, 5 cm');
    expect(text(fixture)).toContain('20 min en A1 mini');
    expect(text(fixture)).toContain('PLA-BLANCO-01 · PLA Blanco (5 g)');
    expect(text(fixture)).toContain('¿Cancelas también la impresión planificada?');
  });

  it('cancels the prints with the order when the person says so', async () => {
    const { fixture, calls, notices } = open([KEYCHAIN]);

    press(fixture, 'Cancelar el pedido y sus impresiones');
    await settle(fixture);

    expect(calls).toEqual([['order-2', ['j1'], true]]);
    expect(notices).toEqual(['También se canceló una impresión planificada, sin tiempo ni costo.']);
  });

  it('leaves them in the queue as loose jobs when the person says so', async () => {
    const { fixture, calls, notices } = open([KEYCHAIN]);

    press(fixture, 'Cancelar solo el pedido');
    await settle(fixture);

    expect(calls).toEqual([['order-2', ['j1'], false]]);
    expect(notices).toEqual(['Su impresión planificada quedó en la cola como trabajo suelto, sin pedido.']);
  });

  // Nothing was shown, so nothing was answered: the database is told so, and
  // a print queued from Producción meanwhile is not cancelled behind anyone's back.
  it('asks nothing about prints when there are none, and answers nothing for them', async () => {
    const { fixture, calls, notices } = open([]);

    expect(text(fixture)).toContain('¿Cancelar este pedido?');
    press(fixture, 'Sí, cancelar pedido');
    await settle(fixture);

    expect(calls).toEqual([['order-2', [], null]]);
    expect(notices).toEqual([null]);
  });

  it('answers only for the planned prints it showed, not for the one on the printer', async () => {
    const { fixture, calls } = open([
      { ...KEYCHAIN, id: 'j0', name: 'Llavero grande', printing: true },
      KEYCHAIN,
      { ...KEYCHAIN, id: 'j2', name: 'Llavero rojo' },
    ]);

    press(fixture, 'Cancelar solo el pedido');
    await settle(fixture);

    expect(calls).toEqual([['order-2', ['j1', 'j2'], false]]);
  });

  it('when the queue changed meanwhile, shows the refusal and has the list read again', async () => {
    const changed = 'La cola cambió: el pedido ORD-2026-0002 tiene ahora una impresión planificada. Revisa la lista y vuelve a elegir.';
    const opened = open([], async () => {
      throw new UserFacingError(changed);
    });

    press(opened.fixture, 'Sí, cancelar pedido');
    await settle(opened.fixture);

    expect(opened.notices).toEqual([]);
    expect(opened.stale).toBe(1);
    expect(text(opened.fixture)).toContain(changed);

    // The page reads the queue again and hands the new list down: now it asks.
    opened.fixture.componentRef.setInput('prints', [KEYCHAIN]);
    opened.fixture.detectChanges();
    expect(text(opened.fixture)).toContain('¿Cancelas también la impresión planificada?');
    expect(text(opened.fixture)).toContain(changed);
  });

  it('shows the database refusal for a print on the printer as it comes, with the way to the queue', async () => {
    const refusal = '«Llavero grande» se está imprimiendo en A1 mini para el pedido ORD-2026-0002, y ya gastó filamento.';
    const { fixture, notices } = open(
      [{ ...KEYCHAIN, id: 'j0', name: 'Llavero grande', printing: true }, KEYCHAIN],
      async () => {
        throw new UserFacingError(refusal);
      },
    );

    expect(text(fixture)).toContain('Imprimiendo');
    press(fixture, 'Cancelar el pedido y sus impresiones');
    await settle(fixture);

    expect(notices).toEqual([]);
    expect(text(fixture)).toContain(refusal);
    expect(fixture.nativeElement.querySelector('a[href="/produccion"]')).not.toBeNull();
  });

  it('sends to Caja first when there is money collected', () => {
    const { fixture } = open([KEYCHAIN], undefined, 15);

    expect(text(fixture)).toContain('Este pedido tiene S/ 15.00 cobrados.');
    expect(fixture.nativeElement.querySelector('a[href="/finanzas/movimientos"]')).not.toBeNull();
    expect(text(fixture)).not.toContain('¿Cancelas también');
  });

  it('tells the operator that voiding is for the owner, instead of sending them to do it', () => {
    const { fixture } = open([KEYCHAIN], undefined, 15, 'operator');

    expect(text(fixture)).toContain('anular es solo del dueño');
    expect(fixture.nativeElement.querySelector('a[href="/finanzas/movimientos"]')).toBeNull();
  });
});
