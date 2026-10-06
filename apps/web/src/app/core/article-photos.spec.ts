import { itemPhoto, jobPhoto, orderPhoto, plateThumbnailFor, variantPhoto } from './article-photos';

const PRODUCT = { image_path: 'ws/productos/pocion.webp' };

describe('variantPhoto', () => {
  it('prefers the photo of the variant', () => {
    expect(variantPhoto({ image_path: 'ws/variantes/roja.webp', catalog_products: PRODUCT }).path).toBe(
      'ws/variantes/roja.webp',
    );
  });

  it('borrows the product photo when the variant has none', () => {
    expect(variantPhoto({ image_path: null, catalog_products: PRODUCT })).toEqual({
      path: PRODUCT.image_path,
      kind: 'product',
    });
  });

  it('has nothing for a variant it could not find', () => {
    expect(variantPhoto(null)).toEqual({ path: null, kind: 'product' });
  });
});

describe('itemPhoto', () => {
  it('prefers a real photo over the plate thumbnail', () => {
    expect(itemPhoto({ kind: 'part', image_path: 'ws/articulos/tapa.webp' }, 'ws/impresiones/placa.webp').path).toBe(
      'ws/articulos/tapa.webp',
    );
  });

  it('falls back to the plate that prints it', () => {
    expect(itemPhoto({ kind: 'part', image_path: null }, 'ws/impresiones/placa.webp')).toEqual({
      path: 'ws/impresiones/placa.webp',
      kind: 'part',
    });
  });

  it('keeps the kind for the icon, and draws a finished good as a product', () => {
    expect(itemPhoto({ kind: 'packaging', image_path: null }).kind).toBe('packaging');
    expect(itemPhoto({ kind: 'finished_good', image_path: null }).kind).toBe('product');
  });
});

describe('plateThumbnailFor', () => {
  const plate = (thumbnail: string | null, kinds: number) => ({
    inventory_item_id: 'tapa',
    recipe_plates: { thumbnail_path: thumbnail, recipe_plate_outputs: [{ count: kinds }] },
  });

  it('prefers a plate that makes only this piece', () => {
    expect(plateThumbnailFor([plate('ws/impresiones/mixta.webp', 2), plate('ws/impresiones/tapas.webp', 1)])).toBe(
      'ws/impresiones/tapas.webp',
    );
  });

  it('settles for a mixed plate when it is the only picture there is', () => {
    expect(plateThumbnailFor([plate(null, 1), plate('ws/impresiones/mixta.webp', 2)])).toBe('ws/impresiones/mixta.webp');
  });

  it('has nothing when no plate has a thumbnail', () => {
    expect(plateThumbnailFor([plate(null, 1)])).toBeNull();
    expect(plateThumbnailFor([])).toBeNull();
  });
});

describe('jobPhoto', () => {
  const cap = { position: 1, inventory_items: { kind: 'part' as const, image_path: 'ws/articulos/tapa.webp' } };
  const body = { position: 0, inventory_items: { kind: 'part' as const, image_path: null } };
  const line = { product_variants: { image_path: null, catalog_products: PRODUCT } };

  it('shows the plate first: it is what goes on the bed', () => {
    const row = { recipe_plates: { thumbnail_path: 'ws/impresiones/placa.webp', recipe_plate_outputs: [cap] }, order_lines: line };
    expect(jobPhoto(row)).toEqual({ path: 'ws/impresiones/placa.webp', kind: 'plate' });
  });

  it('then the first piece of its list that has a photo', () => {
    const row = { recipe_plates: { thumbnail_path: null, recipe_plate_outputs: [cap, body] }, order_lines: line };
    expect(jobPhoto(row).path).toBe('ws/articulos/tapa.webp');
  });

  it('then the product of the order line it was printed for', () => {
    const row = { recipe_plates: { thumbnail_path: null, recipe_plate_outputs: [body] }, order_lines: line };
    expect(jobPhoto(row).path).toBe(PRODUCT.image_path);
  });

  it('draws the plate icon for a loose job', () => {
    expect(jobPhoto({ recipe_plates: null, order_lines: null })).toEqual({ path: null, kind: 'plate' });
  });
});

describe('orderPhoto', () => {
  it('uses the first line, in the order of the order', () => {
    const lines = [
      { position: 2, product_variants: { image_path: 'ws/variantes/segunda.webp', catalog_products: null } },
      { position: 1, product_variants: { image_path: 'ws/variantes/primera.webp', catalog_products: null } },
    ];
    expect(orderPhoto(lines).path).toBe('ws/variantes/primera.webp');
  });

  it('skips lines without a photo', () => {
    const lines = [
      { position: 1, product_variants: null },
      { position: 2, product_variants: { image_path: null, catalog_products: PRODUCT } },
    ];
    expect(orderPhoto(lines).path).toBe(PRODUCT.image_path);
  });
});
