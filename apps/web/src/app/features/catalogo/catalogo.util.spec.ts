import { describe, expect, it } from 'vitest';
import { countOf, emptyPickerText } from './catalogo.util';

describe('countOf', () => {
  it('puts the noun in agreement with the number', () => {
    expect(countOf(1, 'placa', 'placas')).toBe('1 placa');
    expect(countOf(3, 'placa', 'placas')).toBe('3 placas');
    expect(countOf(0, 'placa', 'placas')).toBe('0 placas');
    expect(countOf(3.5, 'producto', 'productos')).toBe('3.5 productos');
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
