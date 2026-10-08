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
});
