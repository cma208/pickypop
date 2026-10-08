import { Component, input, NO_ERRORS_SCHEMA, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CatalogoData } from './catalogo.data';
import type { CostContext, Lookups, ProductDetail, Variant } from './catalogo.models';
import { CatalogoError } from './catalogo.util';
import { ProductoPage } from './producto.page';

/** Stands in for the variant detail: what is under test is what the page hands it. */
@Component({ selector: 'app-variante-detalle', template: '' })
class VarianteDetalleStub {
  readonly variant = input<Variant>();
  readonly productSlug = input('');
  readonly siblings = input<readonly { id: string; name: string }[]>([]);
  readonly lookups = input<Lookups | null>(null);
  readonly lookupsError = input<string | null>(null);
  readonly lookupsRefreshError = input<string | null>(null);
  readonly context = input<CostContext | null>(null);
  readonly variantSaved = output<void>();
  readonly variantRemoved = output<void>();
  readonly itemsChanged = output<void>();
}

const PRODUCT: ProductDetail = {
  id: 'product-1',
  name: 'Calavera',
  slug: 'calavera',
  description: '',
  category: '',
  tags: [],
  status: 'published',
  botVisible: false,
  leadTimeDays: null,
  imagePath: null,
  specs: [],
};

const VARIANT: Variant = {
  id: 'variant-1',
  productId: 'product-1',
  name: 'Blanca',
  options: [],
  skuCode: null,
  listPrice: null,
  minOrderUnits: null,
  active: true,
  imagePath: null,
};

const lookupsWith = (...parts: string[]): Lookups => ({
  materials: [],
  skus: [],
  supplies: parts.map((name) => ({ id: name, name, unit: 'unidad', costPerUnit: null, kind: 'part' as const })),
  printedParts: new Set(),
});

async function open(data: { lookups: ReturnType<typeof vi.fn> }) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CatalogoData,
        useValue: {
          getProduct: async () => PRODUCT,
          listVariants: async () => [VARIANT],
          costContext: async (): Promise<CostContext> => ({ profile: null, printers: [] }),
          ...data,
        },
      },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'product-1' })) } },
    ],
  });
  // The rest of the sheet has its own tests; only the detail's inputs matter here.
  TestBed.overrideComponent(ProductoPage, { set: { imports: [VarianteDetalleStub], schemas: [NO_ERRORS_SCHEMA] } });
  const fixture = TestBed.createComponent(ProductoPage);
  fixture.detectChanges();
  const detail = async (): Promise<VarianteDetalleStub> => {
    await fixture.whenStable();
    fixture.detectChanges();
    const found = fixture.debugElement.query(By.directive(VarianteDetalleStub));
    if (!found) throw new Error('The variant detail is not on the page');
    return found.componentInstance as VarianteDetalleStub;
  };
  return { fixture, detail };
}

describe('ProductoPage, the options read again after an import', () => {
  it('keeps the recipe and the options it had when reading them again fails, and says so apart', async () => {
    const before = lookupsWith('Gancho');
    const lookups = vi
      .fn()
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new CatalogoError('No hay conexión con el servidor. Revisa tu internet.'));
    const { detail } = await open({ lookups });
    await vi.waitFor(async () => expect((await detail()).lookups()).toBe(before));

    (await detail()).itemsChanged.emit();
    await vi.waitFor(async () => expect((await detail()).lookupsRefreshError()).not.toBeNull());

    const stub = await detail();
    // lookupsError replaces the whole recipe card; a failed refresh must not.
    expect(stub.lookupsError()).toBeNull();
    expect(stub.lookups()).toBe(before);
    expect(stub.lookupsRefreshError()).toBe(
      'No hay conexión con el servidor. Revisa tu internet. ' +
        'Las piezas recién creadas todavía no aparecen para elegir en las placas.',
    );
  });

  it('forgets the failed refresh once a later one works', async () => {
    const after = lookupsWith('Gancho', 'Tapa de calavera');
    const lookups = vi
      .fn()
      .mockResolvedValueOnce(lookupsWith('Gancho'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(after);
    const { detail } = await open({ lookups });
    await vi.waitFor(async () => expect((await detail()).lookups()).not.toBeNull());

    (await detail()).itemsChanged.emit();
    await vi.waitFor(async () => expect((await detail()).lookupsRefreshError()).not.toBeNull());
    (await detail()).itemsChanged.emit();
    await vi.waitFor(async () => expect((await detail()).lookups()).toBe(after));

    expect((await detail()).lookupsRefreshError()).toBeNull();
  });
});
