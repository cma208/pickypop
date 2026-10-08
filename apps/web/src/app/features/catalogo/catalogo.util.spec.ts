import { describe, expect, it } from 'vitest';
import {
  comparableName,
  countOf,
  emptyPickerText,
  joinWithAnd,
  repeatedProductMessage,
  repeatedVariantMessage,
  sameName,
  variantUsageText,
} from './catalogo.util';

describe('comparableName and sameName', () => {
  it('reads names the way a person compares them: no accents, no case, no extra spaces (T2-21)', () => {
    expect(comparableName('  Poción   ROJA ')).toBe('pocion roja');
    expect(comparableName('calavéra')).toBe(comparableName('Calavera'));
  });

  it('finds the one a person would take for the same, or nothing', () => {
    const products = [{ name: 'Calavera dulcera' }, { name: 'Posavasos' }];

    expect(sameName('calavéra  DULCERA', products)?.name).toBe('Calavera dulcera');
    expect(sameName('Calavera', products)).toBeNull();
    expect(sameName('   ', products)).toBeNull();
  });
});

describe('repeated names (T2-15)', () => {
  const products = [
    { id: 'p1', name: 'Calavera dulcera', status: 'published' as const },
    { id: 'p2', name: 'Poción', status: 'archived' as const },
  ];

  it('says which product the name repeats, and that an archived one can be restored', () => {
    expect(repeatedProductMessage('calavera dulcera ', products)).toBe(
      'Ya hay un producto «Calavera dulcera». Usa otro nombre, o agrégale una variante a ese.',
    );
    expect(repeatedProductMessage('pocion', products)).toBe(
      'Ya hay un producto «Poción», archivado. Restáuralo desde el catálogo o usa otro nombre.',
    );
  });

  it('does not take a product for its own repeat while it is edited', () => {
    expect(repeatedProductMessage('Calavera Dulcera', products, 'p1')).toBeNull();
  });

  it('says the same of two variants of one product', () => {
    const siblings = [{ id: 'v1', name: 'Llavero' }];

    expect(repeatedVariantMessage('llavero ', siblings)).toBe('Ya hay una variante «Llavero» en este producto. Usa otro nombre.');
    expect(repeatedVariantMessage('llavero', siblings, 'v1')).toBeNull();
  });
});

describe('variantUsageText (T2-01)', () => {
  it('says where a variant is used, agreeing with every number', () => {
    expect(variantUsageText({ quotes: 2, orders: 1, shelf: 0 })).toBe('Está en 2 cotizaciones y en 1 pedido.');
    expect(variantUsageText({ quotes: 1, orders: 0, shelf: 1 })).toBe(
      'Está en 1 cotización y en el inventario como producto armado.',
    );
  });

  it('says nothing of a variant nothing uses', () => {
    expect(variantUsageText({ quotes: 0, orders: 0, shelf: 0 })).toBeNull();
  });
});

describe('countOf', () => {
  it('puts the noun in agreement with the number', () => {
    expect(countOf(1, 'placa', 'placas')).toBe('1 placa');
    expect(countOf(3, 'placa', 'placas')).toBe('3 placas');
    expect(countOf(0, 'placa', 'placas')).toBe('0 placas');
    expect(countOf(3.5, 'producto', 'productos')).toBe('3.5 productos');
  });
});

describe('joinWithAnd', () => {
  it('reads a list the way a person says it', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['Tapa ×7'])).toBe('Tapa ×7');
    expect(joinWithAnd(['Tapa ×7', 'Cuerpo ×7'])).toBe('Tapa ×7 y Cuerpo ×7');
    expect(joinWithAnd(['Tapa', 'Gancho', 'Frente'])).toBe('Tapa, Gancho y Frente');
  });
});

describe('emptyPickerText', () => {
  it('says every part is already in the recipe, and where another one comes from', () => {
    const text = emptyPickerText('part', 4);

    expect(text).toContain('Todas tus piezas ya están en la receta');
    expect(text).toContain('Inventario › Piezas impresas');
  });

  it('tells a workshop with no parts yet how to make the first', () => {
    expect(emptyPickerText('part', 0)).toContain('Todavía no hay piezas impresas');
  });

  it('says the same of supplies, in their own words', () => {
    expect(emptyPickerText('supply', 2)).toContain('Todos tus insumos y empaques ya están en la receta');
    expect(emptyPickerText('supply', 0)).toContain('Todavía no hay insumos ni empaques');
  });
});
