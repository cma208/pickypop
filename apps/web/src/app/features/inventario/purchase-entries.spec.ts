import { purchaseEntries } from './purchase-entries';

describe('purchaseEntries', () => {
  it('says nothing about rolls when none are bought (E1-05)', () => {
    expect(purchaseEntries(0, ['supply', 'supply', 'packaging'])).toBe('Entran 2 insumos y 1 empaque.');
  });

  it('calls each article by its kind', () => {
    expect(purchaseEntries(0, ['packaging', 'spare_part', 'supply'])).toBe('Entran 1 insumo, 1 empaque y 1 repuesto.');
  });

  it('agrees the verb with a single article', () => {
    expect(purchaseEntries(0, ['packaging'])).toBe('Entra 1 empaque.');
  });

  it('says the rolls alone when only filament is bought', () => {
    expect(purchaseEntries(3, [])).toBe('Se crearán 3 rollos con sus movimientos de entrada.');
    expect(purchaseEntries(1, [])).toBe('Se creará 1 rollo con su movimiento de entrada.');
  });

  it('joins rolls and articles in one sentence', () => {
    expect(purchaseEntries(2, ['supply'])).toBe('Se crearán 2 rollos con sus movimientos de entrada, y entra 1 insumo.');
  });

  it('is empty when nothing comes in', () => {
    expect(purchaseEntries(0, [])).toBe('');
  });
});
