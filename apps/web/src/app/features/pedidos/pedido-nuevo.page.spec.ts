import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserFacingError } from '../../core/friendly-error';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { CostEstimator } from './cost-estimate';
import { applyLineKind } from './pedido-linea';
import { PedidoNuevoPage } from './pedido-nuevo.page';
import { PedidosData, type NewOrder } from './pedidos.data';

interface Opened {
  fixture: ComponentFixture<PedidoNuevoPage>;
  calls: [NewOrder, string][];
  /** The database answers the call in flight: the order made, or this failure. */
  answer: (failure?: unknown) => void;
  navigate: ReturnType<typeof vi.fn>;
}

/** The database answers only when `answer` is called: a second click arrives while it is still busy. */
async function open(): Promise<Opened> {
  const calls: [NewOrder, string][] = [];
  let answer: (failure?: unknown) => void = () => {};
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PedidosData,
        useValue: {
          customers: async () => [{ id: 'customer-1', name: 'Ana Prueba' }],
          giftCategories: async () => [],
          variants: async () => [],
          createOrder: (order: NewOrder, key: string) => {
            calls.push([order, key]);
            return new Promise((resolve, reject) =>
              (answer = (failure) => (failure ? reject(failure) : resolve({ id: 'order-9', number: 'ORD-2026-0009' }))),
            );
          },
        },
      },
      { provide: PlanService, useValue: { version: signal(0), current: () => Promise.reject(new Error('sin plan')), invalidate: () => {} } },
      { provide: CostEstimator, useValue: {} },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'variant' }) } },
    ],
  });
  const navigate = vi.fn(async () => true);
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  const fixture = TestBed.createComponent(PedidoNuevoPage);
  await settle(fixture);
  return { fixture, calls, answer: (failure) => answer(failure), navigate };
}

async function settle(fixture: ComponentFixture<PedidoNuevoPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** A sale to Ana of something made to order, as a person fills it. */
function fill(fixture: ComponentFixture<PedidoNuevoPage>, unitPrice: number): void {
  const form = fixture.componentInstance['form'];
  form.controls.customerId.setValue('customer-1');
  const line = form.controls.lines.at(0);
  applyLineKind(line, 'custom');
  line.patchValue({ description: 'Llavero con nombre', quantity: 3, unitPrice });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<PedidoNuevoPage>): void {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
}

const text = (fixture: ComponentFixture<PedidoNuevoPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('PedidoNuevoPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates one order for a double click, with its key, and opens it (T4-04)', async () => {
    const { fixture, calls, answer, navigate } = await open();
    fill(fixture, 4);

    submit(fixture);
    submit(fixture);
    answer();
    await settle(fixture);

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatchObject({
      purpose: 'sale',
      customerId: 'customer-1',
      lines: [{ variantId: null, description: 'Llavero con nombre', quantity: 3, unitPrice: 4 }],
    });
    expect(calls[0]![1]).toMatch(/[0-9a-f-]{36}/);
    expect(navigate).toHaveBeenCalledWith(['/pedidos', 'order-9']);
  });

  it('does not save a sale of S/ 0, and says it with the words of the quick sale (T4-16)', async () => {
    const { fixture, calls } = await open();
    fill(fixture, 0);

    submit(fixture);
    await settle(fixture);

    expect(calls).toEqual([]);
    expect(text(fixture)).toContain('La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.');
  });

  it('sends the same key again after a failure, while nothing changed', async () => {
    const { fixture, calls, answer } = await open();
    fill(fixture, 4);

    submit(fixture);
    answer({ code: '', message: 'TypeError: Failed to fetch' });
    await settle(fixture);
    submit(fixture);
    answer();
    await settle(fixture);

    expect(calls).toHaveLength(2);
    expect(calls[1]![1]).toBe(calls[0]![1]);
  });

  it('shows the refusal of the database word for word', async () => {
    const { fixture, answer } = await open();
    fill(fixture, 4);

    submit(fixture);
    answer(new UserFacingError('«Botella de poción — Molde» ya no se vende: está desactivado en el catálogo. Quítalo del pedido.'));
    await settle(fixture);

    expect(text(fixture)).toContain('ya no se vende: está desactivado en el catálogo');
  });
});
