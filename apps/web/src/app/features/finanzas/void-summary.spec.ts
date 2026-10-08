import { voidSummary, type VoidedRow } from './void-summary';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string | null) => text?.replace(/ /g, ' ') ?? null;

function row(overrides: Partial<VoidedRow> = {}): VoidedRow {
  return {
    type: 'expense',
    amount: 4,
    accountName: 'Efectivo',
    otherAccountName: null,
    isCounterLeg: false,
    orderNumber: null,
    walkInOrder: false,
    purchaseId: null,
    ...overrides,
  };
}

describe('voidSummary', () => {
  it('names the one account of an ordinary movement', () => {
    const summary = voidSummary(row());
    expect(plain(summary.what)).toBe('Egreso de S/ 4.00 en Efectivo');
    expect(summary.legs).toBeNull();
  });

  it('names both accounts of a transfer opened from the arriving leg (E5-06)', () => {
    // «Viene de Yape», seen from Efectivo.
    const summary = voidSummary(
      row({ type: 'transfer', amount: 30, accountName: 'Efectivo', otherAccountName: 'Yape', isCounterLeg: true }),
    );
    expect(plain(summary.what)).toBe('Transferencia de S/ 30.00 de Yape a Efectivo');
    expect(summary.legs).toBe('Se anulan sus dos partes: el dinero deja de salir de Yape y de llegar a Efectivo.');
  });

  it('says the same from the leaving leg', () => {
    const summary = voidSummary(
      row({ type: 'transfer', amount: 30, accountName: 'Yape', otherAccountName: 'Efectivo', isCounterLeg: false }),
    );
    expect(plain(summary.what)).toBe('Transferencia de S/ 30.00 de Yape a Efectivo');
  });

  it('says the order owes again when its collection is voided (T5-05)', () => {
    const summary = voidSummary(row({ type: 'income', amount: 57.34, orderNumber: 'ORD-2026-0004' }));
    expect(plain(summary.consequence)).toBe('El pedido ORD-2026-0004 vuelve a deber S/ 57.34: si ya se entregó, aparece en Por cobrar.');
    expect(summary.blocked).toBeNull();
  });

  it('refuses up front the collection of a sale to «Clientes varios», and says what to do', () => {
    const summary = voidSummary(row({ type: 'income', amount: 8, orderNumber: 'ORD-2026-0001', walkInOrder: true }));
    expect(plain(summary.blocked)).toContain('quedaría debiendo S/ 8.00 a nombre de nadie');
    expect(summary.blocked).toContain('transferencia entre cuentas');
    expect(summary.consequence).toBeNull();
  });

  it('says a purchase is to be paid again', () => {
    const summary = voidSummary(row({ amount: 37.5, purchaseId: 'p-1' }));
    expect(plain(summary.consequence)).toBe('La compra vuelve a quedar por pagar en S/ 37.50.');
  });

  it('says nothing else for a movement that settled nothing', () => {
    const summary = voidSummary(row());
    expect(summary.consequence).toBeNull();
    expect(summary.blocked).toBeNull();
  });
});
