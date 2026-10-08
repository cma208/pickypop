import { inactivePartLine } from './piezas-desactivadas';

describe('inactivePartLine', () => {
  it('says what a switched-off piece still has on the shelf', () => {
    expect(inactivePartLine({ onHand: 7, unit: 'unidad' })).toBe('Quedan 7 unidades en el estante');
    expect(inactivePartLine({ onHand: 1, unit: 'unidad' })).toBe('Queda 1 unidad en el estante');
  });

  it('says so when nothing is left', () => {
    expect(inactivePartLine({ onHand: 0, unit: 'unidad' })).toBe('Sin unidades en el estante');
  });
});
