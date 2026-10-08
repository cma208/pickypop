import {
  buildTransactionDraft,
  draftProblem,
  effectsOf,
  previewBalances,
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
