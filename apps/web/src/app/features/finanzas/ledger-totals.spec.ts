import { ledgerTotals, markVoidable, type LedgerAmount } from './ledger-totals';

function leg(overrides: Partial<LedgerAmount> = {}): LedgerAmount {
  return {
    transactionId: 't1',
    type: 'income',
    signedAmount: 100,
    amount: 100,
    voided: false,
    ...overrides,
  };
}

describe('ledgerTotals', () => {
  it('separates what came in from what went out', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'a', signedAmount: 150, amount: 150 }),
      leg({ transactionId: 'b', type: 'expense', signedAmount: -40, amount: 40 }),
    ]);

    expect(totals.inflow).toBe(150);
    expect(totals.outflow).toBe(40);
    expect(totals.net).toBe(110);
  });

  it('counts an owner movement on the side it belongs to', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'a', type: 'owner_contribution', signedAmount: 500, amount: 500 }),
      leg({ transactionId: 'b', type: 'owner_draw', signedAmount: -200, amount: 200 }),
    ]);

    expect(totals.inflow).toBe(500);
    expect(totals.outflow).toBe(200);
  });

  it('leaves a transfer out of the inflow and the outflow, and counts it once', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'tr', type: 'transfer', signedAmount: -80, amount: 80 }),
      leg({ transactionId: 'tr', type: 'transfer', signedAmount: 80, amount: 80 }),
    ]);

    expect(totals.inflow).toBe(0);
    expect(totals.outflow).toBe(0);
    expect(totals.net).toBe(0);
    expect(totals.transfers).toBe(1);
    expect(totals.transferAmount).toBe(80);
  });

  it('does not let an annulled movement add up', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'a', signedAmount: 100, amount: 100 }),
      leg({ transactionId: 'b', signedAmount: 0, amount: 999, voided: true }),
    ]);

    expect(totals.inflow).toBe(100);
    expect(totals.net).toBe(100);
    expect(totals.voided).toBe(1);
  });

  it('adds cents without drifting', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'a', signedAmount: 0.1, amount: 0.1 }),
      leg({ transactionId: 'b', signedAmount: 0.2, amount: 0.2 }),
    ]);

    expect(totals.inflow).toBe(0.3);
  });

  it('answers zero for an empty book', () => {
    expect(ledgerTotals([])).toEqual({
      inflow: 0,
      outflow: 0,
      net: 0,
      transfers: 0,
      transferAmount: 0,
      voided: 0,
    });
  });
});

describe('markVoidable', () => {
  it('offers the annulment once per movement, on the first leg shown', () => {
    const marked = markVoidable([
      { transactionId: 'tr', voided: false, side: 'out' },
      { transactionId: 'tr', voided: false, side: 'in' },
    ]);

    expect(marked.map((row) => row.canVoid)).toEqual([true, false]);
  });

  it('offers it on the arriving leg when that is the only one on screen', () => {
    expect(markVoidable([{ transactionId: 'tr', voided: false }])[0].canVoid).toBe(true);
  });

  it('never offers it on a movement that is already annulled', () => {
    expect(markVoidable([{ transactionId: 'a', voided: true }])[0].canVoid).toBe(false);
  });
});
