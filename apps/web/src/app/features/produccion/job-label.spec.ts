import { describe, expect, it } from 'vitest';
import { labelForPlate } from './job-label';

describe('labelForPlate', () => {
  it('fills an empty «Qué se imprime» with the plate', () => {
    expect(labelForPlate({ label: '', fromPlate: null }, 'Tapas y ganchos')).toEqual({
      label: 'Tapas y ganchos',
      fromPlate: 'Tapas y ganchos',
    });
  });

  it('follows the plate while nobody changed what it wrote', () => {
    const first = labelForPlate({ label: '', fromPlate: null }, 'Frente');

    expect(labelForPlate(first, 'Trasera').label).toBe('Trasera');
    expect(labelForPlate(first, null)).toEqual({ label: '', fromPlate: null });
  });

  it('never replaces what the person wrote', () => {
    expect(labelForPlate({ label: 'Prueba de soporte', fromPlate: null }, 'Frente').label).toBe('Prueba de soporte');
    expect(labelForPlate({ label: 'Frente, la buena', fromPlate: 'Frente' }, 'Trasera').label).toBe('Frente, la buena');
  });
});
