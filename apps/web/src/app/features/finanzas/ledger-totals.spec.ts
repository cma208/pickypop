import {
  ledgerOrder,
  ledgerTotals,
  legKey,
  markVoidable,
  otherLegBeforeOpening,
  transfersCaption,
  type LedgerAmount,
  type LedgerPlace,
} from './ledger-totals';

describe('ledgerOrder', () => {
  const place = (transactionId: string, occurredAt: string, isCounterLeg = false): LedgerPlace & { label: string } => ({
    transactionId,
    occurredAt,
    isCounterLeg,
    label: `${transactionId}${isCounterLeg ? '-in' : ''}`,
  });

  it('puts the newest first', () => {
    const rows = [place('a', '2026-10-07T15:00:00+00:00'), place('b', '2026-10-07T16:00:00+00:00')];
    expect(rows.sort(ledgerOrder).map((row) => row.label)).toEqual(['b', 'a']);
  });

  it('keeps the two legs of a transfer together when another movement shares the minute (E5-13)', () => {
    const minute = '2026-10-07T20:54:00+00:00';
    const rows = [
      place('94e0ba63', minute, true),
      place('b8131817', minute),
      place('94e0ba63', minute, false),
    ];
    expect(rows.sort(ledgerOrder).map((row) => row.label)).toEqual(['94e0ba63', '94e0ba63-in', 'b8131817']);
  });
});

function leg(overrides: Partial<LedgerAmount> = {}): LedgerAmount {
  return {
    transactionId: 't1',
    type: 'income',
    signedAmount: 100,
    amount: 100,
    voided: false,
    beforeOpening: false,
    otherBeforeOpening: false,
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
    expect(totals.transfersMovingTotal).toBe(0);
  });

  it('tells apart a transfer with one leg before its account opened: that one moves the total (E5-02)', () => {
    const totals = ledgerTotals([
      // Yape opened on the 7th, Efectivo on the 1st: S/ 30 sent on the 5th.
      leg({ transactionId: 'tr', type: 'transfer', signedAmount: -30, amount: 30, beforeOpening: true }),
      leg({ transactionId: 'tr', type: 'transfer', signedAmount: 30, amount: 30, otherBeforeOpening: true }),
      // Both before their openings: neither balance moves, the total does not either.
      leg({ transactionId: 'old', type: 'transfer', signedAmount: -5, amount: 5, beforeOpening: true, otherBeforeOpening: true }),
    ]);

    expect(totals.transfers).toBe(2);
    expect(totals.transfersMovingTotal).toBe(1);
  });

  it('sees it from one leg alone, as the book filtered by account shows it', () => {
    const totals = ledgerTotals([
      leg({ transactionId: 'tr', type: 'transfer', signedAmount: 30, amount: 30, otherBeforeOpening: true }),
    ]);

    expect(totals.transfersMovingTotal).toBe(1);
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
      transfersMovingTotal: 0,
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

describe('transfersCaption', () => {
  it('says the total does not change while every transfer moves both balances or neither', () => {
    expect(transfersCaption({ transfers: 2, transfersMovingTotal: 0 })).toEqual({
      label: 'Transferencias (no cambian el total)',
      note: null,
    });
  });

  it('stops saying it when a leg falls before its account opened (E5-02)', () => {
    expect(transfersCaption({ transfers: 1, transfersMovingTotal: 1 })).toEqual({
      label: 'Transferencias',
      note: 'Una de sus patas es anterior a la apertura de su cuenta: cambia el total del taller.',
    });
    expect(transfersCaption({ transfers: 3, transfersMovingTotal: 1 }).note).toBe(
      'Una tiene una pata anterior a la apertura de su cuenta: esa sí cambia el total del taller.',
    );
    expect(transfersCaption({ transfers: 3, transfersMovingTotal: 2 }).note).toBe(
      '2 tienen una pata anterior a la apertura de su cuenta: esas sí cambian el total del taller.',
    );
  });
});

describe('otherLegBeforeOpening', () => {
  // 5 October at noon in Lima.
  const leg = { transactionId: 'tr', isCounterLeg: true, occurredAt: '2026-10-05T17:00:00.000Z' };

  it('believes what the database said of the other leg when the book brought it', () => {
    const legs = new Map([[legKey('tr', false), true]]);
    // The opening day passed here would say otherwise: the database wins.
    expect(otherLegBeforeOpening(leg, legs, '2026-10-01')).toBe(true);
  });

  it('judges it from the other account opening when the book is filtered to this account', () => {
    expect(otherLegBeforeOpening(leg, new Map(), '2026-10-07')).toBe(true);
    expect(otherLegBeforeOpening(leg, new Map(), '2026-10-01')).toBe(false);
  });

  it('says no when there is nothing to judge it by', () => {
    expect(otherLegBeforeOpening(leg, new Map(), null)).toBe(false);
  });
});
