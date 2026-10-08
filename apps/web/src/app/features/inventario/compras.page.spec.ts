import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { FinanzasData } from '../finanzas/finanzas.data';
import { ComprasPage } from './compras.page';
import { InventarioData } from './inventario.data';
import { InventoryPlan } from './inventory-plan';

/** The page's protected steps, as the template reaches them. */
interface Internals {
  startNew(): void;
  refresh(): Promise<void>;
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
        {
          provide: InventarioData,
          useValue: {
            purchases: () => answer([]),
            skus: () => answer([]),
            items: () => answer([]),
            suppliers: () => answer([]),
            paymentAccounts: () => answer([]),
            currentRole: async () => 'operator',
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
});
