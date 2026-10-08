import {
  buildTransactionDraft,
  draftProblem,
  effectsOf,
  FUTURE_DATE_PROBLEM,
  isInTheFuture,
  negativeBalanceNotice,
  previewBalances,
  TOO_LARGE_PROBLEM,
  workshopChange,
  type BalanceAccount,
  type TransactionFormValue,
} from './transaction-draft';

function form(overrides: Partial<TransactionFormValue> = {}): TransactionFormValue {
  return {
    type: 'income',
    accountId: 'cash',
    counterAccountId: '',
    categoryId: '',
    amount: 100,
    occurredAt: '2026-10-04T18:30',
    paymentMethod: 'cash',
    counterparty: '',
    reference: '',
    note: '',
    ...overrides,
  };
}

describe('draftProblem', () => {
  it('passes a complete movement', () => {
    expect(draftProblem(form())).toBeNull();
  });

  it('refuses an amount that is missing, zero or negative', () => {
    expect(draftProblem(form({ amount: null }))).toBe('Indica el monto.');
    expect(draftProblem(form({ amount: 0 }))).toBe('El monto tiene que ser mayor que cero.');
    expect(draftProblem(form({ amount: -5 }))).toBe('El monto tiene que ser mayor que cero.');
  });

  it('asks for an account', () => {
    expect(draftProblem(form({ accountId: '' }))).toBe('Elige la cuenta del movimiento.');
  });

  it('asks a transfer for its destination, and refuses the same account twice', () => {
    expect(draftProblem(form({ type: 'transfer' }))).toBe('Elige la cuenta a la que llega el dinero.');
    expect(draftProblem(form({ type: 'transfer', counterAccountId: 'cash' }))).toBe(
      'La cuenta de destino tiene que ser distinta de la de origen.',
    );
    expect(draftProblem(form({ type: 'transfer', counterAccountId: 'bank' }))).toBeNull();
  });

  it('refuses a half typed date', () => {
    expect(draftProblem(form({ occurredAt: '' }))).toBe('Indica la fecha y la hora del movimiento.');
    expect(draftProblem(form({ occurredAt: '0000-00-00T99:99' }))).toBe(
      'La fecha y la hora no son válidas.',
    );
  });
});

describe('buildTransactionDraft', () => {
  it('keeps the amount positive and rounds it to cents', () => {
    expect(buildTransactionDraft(form({ amount: 10.005 })).amount).toBe(10.01);
  });

  it('turns blank text into null so optional columns stay clean', () => {
    const draft = buildTransactionDraft(form({ counterparty: '  ', reference: '', note: ' ok ' }));
    expect(draft.counterparty).toBeNull();
    expect(draft.reference).toBeNull();
    expect(draft.note).toBe('ok');
  });

  it('reads the form time as Lima time', () => {
    expect(buildTransactionDraft(form()).occurredAt).toBe('2026-10-04T23:30:00.000Z');
  });

  it('builds a transfer as one row with two accounts and no category', () => {
    const draft = buildTransactionDraft(
      form({ type: 'transfer', counterAccountId: 'bank', categoryId: 'in-1', counterparty: 'Nadie' }),
    );
    expect(draft.accountId).toBe('cash');
    expect(draft.counterAccountId).toBe('bank');
    expect(draft.categoryId).toBeNull();
    expect(draft.counterparty).toBeNull();
  });

  it('never leaves a counter account on a movement that is not a transfer', () => {
    const draft = buildTransactionDraft(form({ type: 'expense', counterAccountId: 'bank' }));
    expect(draft.counterAccountId).toBeNull();
  });

  it('keeps the category of an income or an expense', () => {
    expect(buildTransactionDraft(form({ categoryId: 'in-1' })).categoryId).toBe('in-1');
  });
});

describe('effectsOf', () => {
  it('adds to the account on an income and on an owner contribution', () => {
    expect(effectsOf(buildTransactionDraft(form({ type: 'income' })))).toEqual([
      { accountId: 'cash', delta: 100 },
    ]);
    expect(effectsOf(buildTransactionDraft(form({ type: 'owner_contribution' })))).toEqual([
      { accountId: 'cash', delta: 100 },
    ]);
  });

  it('takes from the account on an expense and on an owner draw', () => {
    expect(effectsOf(buildTransactionDraft(form({ type: 'expense' })))).toEqual([
      { accountId: 'cash', delta: -100 },
    ]);
    expect(effectsOf(buildTransactionDraft(form({ type: 'owner_draw' })))).toEqual([
      { accountId: 'cash', delta: -100 },
    ]);
  });

  it('leaves the workshop total untouched on a transfer', () => {
    const effects = effectsOf(
      buildTransactionDraft(form({ type: 'transfer', counterAccountId: 'bank' })),
    );
    expect(effects).toEqual([
      { accountId: 'cash', delta: -100 },
      { accountId: 'bank', delta: 100 },
    ]);
    expect(effects.reduce((total, effect) => total + effect.delta, 0)).toBe(0);
  });
});

describe('previewBalances', () => {
  const accounts: BalanceAccount[] = [
    { id: 'cash', name: 'Efectivo', balance: 350, openingBalanceOn: '2026-10-07' },
    { id: 'bank', name: 'Banco', balance: 1000, openingBalanceOn: '2026-10-01' },
  ];
  const draft = (overrides: Partial<TransactionFormValue>) => buildTransactionDraft(form(overrides));

  it('moves the balance of a movement dated after the opening', () => {
    const [line] = previewBalances(draft({ type: 'expense', amount: 4, occurredAt: '2026-10-07T15:00' }), accounts);
    expect(line).toMatchObject({ name: 'Efectivo', before: 350, after: 346, beforeOpening: false });
  });

  it('leaves the balance alone when the movement is dated before the opening (E5-02)', () => {
    const [line] = previewBalances(draft({ type: 'expense', amount: 4, occurredAt: '2026-09-30T21:00' }), accounts);
    expect(line).toMatchObject({ name: 'Efectivo', before: 350, after: 350, beforeOpening: true });
  });

  it('judges each leg of a transfer by its own account', () => {
    const previews = previewBalances(
      draft({ type: 'transfer', counterAccountId: 'bank', amount: 30, occurredAt: '2026-10-05T12:00' }),
      accounts,
    );
    expect(previews.map((line) => [line.name, line.after, line.beforeOpening])).toEqual([
      ['Efectivo', 350, true],
      ['Banco', 1030, false],
    ]);
    // Efectivo already had that money out in its opening balance, so the workshop total does grow.
    expect(workshopChange(previews)).toBe(30);
  });

  it('keeps the workshop total when both legs count', () => {
    const previews = previewBalances(
      draft({ type: 'transfer', counterAccountId: 'bank', amount: 30, occurredAt: '2026-10-07T12:00' }),
      accounts,
    );
    expect(workshopChange(previews)).toBe(0);
  });
});

describe('draftProblem, the rules the ledger enforces too', () => {
  // 8 Oct 2026, 10:00 in Lima.
  const now = Date.parse('2026-10-08T15:00:00Z');

  it('refuses a date that has not come yet (T5-08)', () => {
    expect(draftProblem(form({ occurredAt: '2026-10-31T23:59' }), now)).toBe(FUTURE_DATE_PROBLEM);
    expect(draftProblem(form({ occurredAt: '2026-10-08T10:30' }), now)).toBe(FUTURE_DATE_PROBLEM);
  });

  it('allows the few minutes a phone clock may be ahead', () => {
    expect(draftProblem(form({ occurredAt: '2026-10-08T10:04' }), now)).toBeNull();
    expect(draftProblem(form({ occurredAt: '2026-10-01T09:00' }), now)).toBeNull();
  });

  it('refuses an amount over the ceiling, in soles (T5-11)', () => {
    expect(draftProblem(form({ amount: 99_999_999_999 }), now)).toBe(TOO_LARGE_PROBLEM);
    expect(TOO_LARGE_PROBLEM).toContain('1,000,000.00');
    expect(draftProblem(form({ amount: 1_000_000 }), now)).toBeNull();
  });
});

describe('isInTheFuture', () => {
  it('gives the clocks five minutes', () => {
    const now = Date.parse('2026-10-08T15:00:00Z');
    expect(isInTheFuture('2026-10-08T15:05:00Z', now)).toBe(false);
    expect(isInTheFuture('2026-10-08T15:05:01Z', now)).toBe(true);
  });
});

describe('a balance that goes below zero (T5-04)', () => {
  const accounts: BalanceAccount[] = [
    { id: 'yape', name: 'Yape', balance: 200, openingBalanceOn: '2026-10-01' },
    { id: 'cash', name: 'Efectivo', balance: 299, openingBalanceOn: '2026-10-01' },
  ];
  const draft = (overrides: Partial<TransactionFormValue>) =>
    buildTransactionDraft(form({ accountId: 'yape', occurredAt: '2026-10-07T12:00', ...overrides }));

  it('marks the account a transfer empties past zero, and only that one', () => {
    const previews = previewBalances(draft({ type: 'transfer', counterAccountId: 'cash', amount: 1000 }), accounts);
    expect(previews.map((line) => [line.name, line.after, line.goesNegative])).toEqual([
      ['Yape', -800, true],
      ['Efectivo', 1299, false],
    ]);
  });

  it('marks an expense bigger than the balance, not one that leaves it at zero', () => {
    expect(previewBalances(draft({ type: 'expense', amount: 200.01 }), accounts)[0]?.goesNegative).toBe(true);
    expect(previewBalances(draft({ type: 'owner_draw', amount: 200 }), accounts)[0]?.goesNegative).toBe(false);
  });

  it('never marks money coming in, nor a leg before the opening', () => {
    const negative: BalanceAccount[] = [{ id: 'yape', name: 'Yape', balance: -50, openingBalanceOn: '2026-10-01' }];
    expect(previewBalances(draft({ type: 'income', amount: 10 }), negative)[0]?.goesNegative).toBe(false);
    const early = draft({ type: 'expense', amount: 999, occurredAt: '2026-09-30T12:00' });
    expect(previewBalances(early, accounts)[0]?.goesNegative).toBe(false);
  });

  it('says how far below and why it may be', () => {
    // Intl puts a no-break space between «S/» and the number.
    const plain = (text: string) => text.replace(/ /g, ' ');
    expect(plain(negativeBalanceNotice({ name: 'Yape', before: 200, after: -800 }))).toBe(
      'Yape quedaría en -S/ 800.00: sale más de lo que hay (S/ 200.00). ¿Falta registrar un ingreso, o el saldo de apertura está mal?',
    );
    expect(plain(negativeBalanceNotice({ name: 'Yape', before: -50, after: -60 }))).toContain(
      'ya estaba en -S/ 50.00 y sigue bajando',
    );
  });
});
