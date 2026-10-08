import { voidSummary, type VoidedRow } from './void-summary';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string | null) => text?.replace(/ /g, ' ') ?? null;

function row(overrides: Partial<VoidedRow> = {}): VoidedRow {
  return {
    type: 'expense',
    amount: 4,
    accountId: 'acc-efectivo',
    accountName: 'Efectivo',
    otherAccountName: null,
    isCounterLeg: false,
    orderNumber: null,
    walkInOrder: false,
    purchaseId: null,
    voided: false,
    voidReason: null,
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

  it('says a voided refund counts as collected again, and never beyond the total', () => {
    const summary = voidSummary(row({ type: 'expense', amount: 8, orderNumber: 'ORD-2026-0010' }));
    expect(plain(summary.consequence)).toBe(
      'El pedido ORD-2026-0010 vuelve a contar esos S/ 8.00 como cobrados. Si ya se volvió a cobrar, no se anula: quedaría cobrado de más.',
    );
    expect(summary.blocked).toBeNull();
  });

  it('refuses up front the collection of a sale to «Clientes varios» (T5-05)', () => {
    const summary = voidSummary(
      row({ type: 'income', amount: 25, accountName: 'Yape', accountId: 'acc-yape', orderNumber: 'ORD-2026-0001', walkInOrder: true }),
    );
    expect(plain(summary.blocked)).toContain('quedaría debiendo S/ 25.00 a nombre de nadie, así que no se anula');
    expect(summary.consequence).toBeNull();
  });

  it('offers both corrections, filled in: the money went elsewhere, or it never came', () => {
    const summary = voidSummary(
      row({ type: 'income', amount: 25, accountName: 'Yape', accountId: 'acc-yape', orderNumber: 'ORD-2026-0001', walkInOrder: true }),
    );

    const [elsewhere, never] = summary.corrections;
    expect(elsewhere?.action).toBe('Registrar la transferencia');
    expect(elsewhere?.what).toContain('transferencia de Yape a la cuenta donde entró');
    expect(elsewhere?.preset).toEqual({
      type: 'transfer',
      accountId: 'acc-yape',
      amount: 25,
      note: 'El cobro de ORD-2026-0001 entró en otra cuenta',
    });

    // A forged note or a Yape that never went through: the sale stands, the money is a loss.
    expect(never?.when).toContain('nunca llegó');
    expect(plain(never?.what ?? null)).toBe(
      'Registra un egreso de S/ 25.00 en Yape: la venta queda hecha y lo que no llegó queda como pérdida.',
    );
    expect(never?.preset).toEqual({ type: 'expense', accountId: 'acc-yape', amount: 25, note: 'No llegó el cobro de ORD-2026-0001' });
  });

  it('offers no correction for what can simply be voided', () => {
    expect(voidSummary(row({ type: 'income', amount: 57.34, orderNumber: 'ORD-2026-0004' })).corrections).toEqual([]);
    expect(voidSummary(row()).corrections).toEqual([]);
  });

  it('says a movement voided from another tab is already voided, with its reason (T5-10)', () => {
    const summary = voidSummary(row({ voided: true, voidReason: 'Se anotó dos veces' }));
    expect(summary.blocked).toBe(
      'Este movimiento ya está anulado (motivo: «Se anotó dos veces»): ya no cuenta en ningún saldo, no hay nada más que anular.',
    );
    expect(summary.corrections).toEqual([]);
  });

  it('says it of a transfer too, without listing legs that no longer move anything', () => {
    const summary = voidSummary(
      row({ type: 'transfer', amount: 30, accountName: 'Yape', otherAccountName: 'Efectivo', voided: true, voidReason: 'Duplicada' }),
    );
    expect(plain(summary.what)).toBe('Transferencia de S/ 30.00 de Yape a Efectivo');
    expect(summary.legs).toBeNull();
    expect(summary.blocked).toContain('ya está anulado (motivo: «Duplicada»)');
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
