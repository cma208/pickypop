import { purchaseLineProblems, purchaseTotalProblem, type PurchaseLineFacts } from './purchase-line-rules';

const roll = (quantity: number | null, unitPrice: number | null = 50): PurchaseLineFacts => ({
  kind: 'sku',
  quantity,
  unitPrice,
  unit: null,
});

const supply = (quantity: number | null, unitPrice: number | null = 0.015, unit = 'g'): PurchaseLineFacts => ({
  kind: 'item',
  quantity,
  unitPrice,
  unit,
});

describe('purchaseLineProblems', () => {
  it('says «al menos 1 rollo» instead of «el valor mínimo es 0.001» (T1-24)', () => {
    expect(purchaseLineProblems(roll(0)).quantity).toBe('Al menos 1 rollo.');
  });

  it('keeps rolls whole and within a purchase of this workshop', () => {
    expect(purchaseLineProblems(roll(1.5)).quantity).toBe('Los rollos se compran enteros.');
    expect(purchaseLineProblems(roll(501)).quantity).toContain('Hasta 500 rollos');
    expect(purchaseLineProblems(roll(3)).quantity).toBeNull();
  });

  it('stops ten billion grams of sweets before the database has to (T1-06)', () => {
    expect(purchaseLineProblems(supply(10_000_000_000)).quantity).toContain('revisa la cantidad');
    expect(purchaseLineProblems(supply(1000)).quantity).toBeNull();
  });

  it('counts units whole and measures grams to three decimals', () => {
    expect(purchaseLineProblems(supply(2.5, 1, 'unidad')).quantity).toBe('Se cuenta por unidad: la cantidad va entera.');
    expect(purchaseLineProblems(supply(2.5, 1, 'g')).quantity).toBeNull();
    expect(purchaseLineProblems(supply(1.2345)).quantity).toBe('Hasta 3 decimales.');
  });

  it('prices a roll in cents and a supply to six decimals (T1-16)', () => {
    expect(purchaseLineProblems(roll(1, 53.335)).unitPrice).toBe('El precio de un rollo va en céntimos: hasta 2 decimales.');
    expect(purchaseLineProblems(supply(1000, 0.01500499)).unitPrice).toBe('Hasta 6 decimales: así se guarda el precio.');
    expect(purchaseLineProblems(supply(1000, 0.015005)).unitPrice).toBeNull();
  });

  it('asks for what is missing and refuses a negative or absurd price', () => {
    expect(purchaseLineProblems(roll(null, null))).toEqual({ quantity: 'Indica la cantidad.', unitPrice: 'Indica el precio.' });
    expect(purchaseLineProblems(roll(1, -1)).unitPrice).toBe('El precio no puede ser negativo.');
    expect(purchaseLineProblems(roll(1, 200_000)).unitPrice).toContain('revisa el precio');
  });
});

describe('purchaseTotalProblem', () => {
  it('flags a total no purchase of this workshop reaches', () => {
    expect(purchaseTotalProblem(150_000_100)).toContain('revisa cantidades y precios');
    expect(purchaseTotalProblem(250)).toBeNull();
  });
});
