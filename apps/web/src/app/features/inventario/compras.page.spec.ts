import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { FinanzasData } from '../finanzas/finanzas.data';
import { CompraForm } from './compra-form';
import { ComprasPage } from './compras.page';
import { InventarioData, type InventoryItemSummary } from './inventario.data';
import { InventoryPlan } from './inventory-plan';
import { workspaceAs } from '../../core/workspace.testing';
import type { MemberRole } from '../../core/workspace';

/** The page's protected steps, as the template reaches them. */
interface Internals {
  startNew(): void;
  refresh(): Promise<void>;
}

const BOXES = {
  id: 'boxes',
  kind: 'packaging',
  name: 'Caja kraft chica',
  unit: 'unidad',
  imagePath: null,
  minStock: 0,
  perishable: false,
  note: null,
  active: true,
  onHand: 0,
  belowMinimum: false,
} as InventoryItemSummary;

/** The form's first line, as the template reaches it. */
interface FormInternals {
  lines: { at(index: number): { controls: Record<'target' | 'quantity' | 'unitPrice', { value: unknown }> } };
}

/** The page reached the way «Comprar» reaches it: through the router, with the query bound as an input. */
async function openAt(url: string, role: MemberRole = 'operator') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'inventario/compras', component: ComprasPage }], withComponentInputBinding()),
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'packaging' }) } },
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      { provide: InventoryPlan, useValue: { changed: () => undefined } },
      workspaceAs(role),
      {
        provide: InventarioData,
        useValue: {
          purchases: async () => [],
          skus: async () => [],
          items: async () => [BOXES, { ...BOXES, id: 'lid', kind: 'part', name: 'Tapa chica' }],
          suppliers: async () => [],
          paymentAccounts: async () => [],
        },
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ComprasPage);
  await harness.fixture.whenStable();
  harness.detectChanges();
  const form = () => harness.fixture.debugElement.query(By.directive(CompraForm))?.componentInstance as FormInternals | undefined;
  return { harness, form };
}

describe('ComprasPage', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('keeps the open form when the reload after a refusal fails too (T1-04)', async () => {
    let offline = false;
    const answer = async <T>(value: T): Promise<T> => {
      if (offline) throw { code: '', message: 'TypeError: Failed to fetch' };
      return value;
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Media, useValue: { url: async () => null, version: signal(0) } },
        { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'supply' }) } },
        { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
        { provide: InventoryPlan, useValue: { changed: () => undefined } },
        workspaceAs('operator'),
        {
          provide: InventarioData,
          useValue: {
            purchases: () => answer([]),
            skus: () => answer([]),
            items: () => answer([]),
            suppliers: () => answer([]),
            paymentAccounts: () => answer([]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ComprasPage);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as Internals;
    page.startNew();
    fixture.detectChanges();

    offline = true;
    await page.refresh();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Datos de la compra');
    expect(text).not.toContain('No pudimos cargar las compras');
  });

  it('opens a new purchase with the item «Comprar» was pressed on, quantity and price left empty', async () => {
    const { form } = await openAt('/inventario/compras?articulo=boxes');

    const first = form()?.lines.at(0).controls;
    expect(first?.target.value).toBe('item:boxes');
    expect(first?.quantity.value).toBeNull();
    expect(first?.unitPrice.value).toBeNull();
  });

  it('opens the form with nothing chosen when the link names no item, or one made here', async () => {
    for (const id of ['gone', 'lid']) {
      TestBed.resetTestingModule();
      const { form } = await openAt(`/inventario/compras?articulo=${id}`);

      expect(form()).toBeDefined();
      expect(form()?.lines.at(0).controls.target.value).toBe('');
    }
  });

  it('takes the item out of the address when the form closes, so a reload does not open it again', async () => {
    const { harness, form } = await openAt('/inventario/compras?articulo=boxes');
    const cancel = [...(harness.routeNativeElement?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Cancelar',
    );

    cancel?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/inventario/compras');
    expect(form()).toBeUndefined();
  });

  it('shows a viewer the list, not a purchase form', async () => {
    const { harness, form } = await openAt('/inventario/compras?articulo=boxes', 'viewer');

    expect(form()).toBeUndefined();
    expect(harness.routeNativeElement?.textContent).not.toContain('Nueva compra');
  });
});
