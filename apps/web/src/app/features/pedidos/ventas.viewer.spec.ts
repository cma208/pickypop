import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { workspaceAs } from '../../core/workspace.testing';
import { FinanzasData } from '../finanzas/finanzas.data';
import { PedidoAvance } from './pedido-avance';
import { PedidoCobro } from './pedido-cobro';
import { PedidoEntrega } from './pedido-entrega';
import { PedidosData, type OrderLine, type PaymentSummary } from './pedidos.data';

/**
 * «Solo lectura» sees an order whole and is offered nothing to write (ADR-025):
 * no collection, no delivery, no change of state. The database refuses them
 * anyway; offered, they read as a broken page.
 */

const OWED: PaymentSummary = { total: 12.99, paid: 0, balance: 12.99, paymentStatus: 'unpaid', lastPaymentAt: null };

const LINE = {
  id: 'line-1',
  kind: 'catalog',
  variantId: 'variant-1',
  description: 'Calavera roja',
  quantity: 2,
  delivered: 0,
  pending: 2,
  unitPrice: 6.5,
  lineTotal: 13,
  estimatedUnitCost: 3,
  imagePath: null,
} as unknown as OrderLine;

function configure(role: 'viewer' | 'operator') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      workspaceAs(role),
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      { provide: PlanService, useValue: { version: signal(0), current: () => Promise.reject(new Error('sin plan')), invalidate: () => undefined } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'product' }) } },
      {
        provide: PedidosData,
        useValue: {
          paymentAccounts: async () => [{ id: 'cash', name: 'Efectivo', defaultMethod: 'cash', openingBalanceOn: '2026-09-01' }],
        },
      },
    ],
  });
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const labels = (fixture: ComponentFixture<unknown>) =>
  ([...(fixture.nativeElement as HTMLElement).querySelectorAll('button')] as HTMLButtonElement[]).map((button) =>
    (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

const text = (fixture: ComponentFixture<unknown>) => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('An order for a member who only reads', () => {
  it('says what is owed without the form that collects it', async () => {
    configure('viewer');
    const fixture = TestBed.createComponent(PedidoCobro);
    fixture.componentRef.setInput('orderId', 'order-3');
    fixture.componentRef.setInput('summary', OWED);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    expect(labels(fixture)).not.toContain('Registrar cobro');
    expect(text(fixture)).toContain('Lo cobran el dueño o un operador');
  });

  it('says what is pending without the form that delivers it', async () => {
    configure('viewer');
    const fixture = TestBed.createComponent(PedidoEntrega);
    fixture.componentRef.setInput('orderId', 'order-3');
    fixture.componentRef.setInput('lines', [LINE]);
    fixture.componentRef.setInput('deliveries', []);
    fixture.componentRef.setInput('balance', 12.99);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    expect(labels(fixture)).not.toContain('Cobrar saldo');
    expect(text(fixture)).toContain('Lo entregan el dueño o un operador');
  });

  it('shows where the order is without the buttons that move it', async () => {
    configure('viewer');
    const fixture = TestBed.createComponent(PedidoAvance);
    fixture.componentRef.setInput('orderId', 'order-3');
    fixture.componentRef.setInput('status', 'confirmed');
    fixture.componentRef.setInput('hasPending', true);
    fixture.componentRef.setInput('hasDeliveries', false);
    fixture.componentRef.setInput('paid', 0);
    fixture.componentRef.setInput('prints', []);
    await settle(fixture);

    expect(labels(fixture)).toEqual([]);
    expect(text(fixture)).toContain('Confirmado');
  });
});

describe('An order for an operator', () => {
  it('still offers to collect', async () => {
    configure('operator');
    const fixture = TestBed.createComponent(PedidoCobro);
    fixture.componentRef.setInput('orderId', 'order-3');
    fixture.componentRef.setInput('summary', OWED);
    await settle(fixture);

    expect(labels(fixture)).toContain('Registrar cobro');
  });
});
