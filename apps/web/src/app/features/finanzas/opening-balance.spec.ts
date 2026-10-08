import {
  beforeOpening,
  beforeOpeningNotice,
  beforeOpeningSummary,
  dayBeforeOpening,
  openingDay,
} from './opening-balance';

/** Intl puts a no-break space between «S/» and the number; the assertions read it as a plain one. */
const plain = (text: string | null) => text?.replace(/ /g, ' ') ?? null;

const TODAY = '2026-10-07';
const EFECTIVO = { name: 'Efectivo', openingBalanceOn: '2026-10-07' };

describe('beforeOpening', () => {
  it('is true for a movement of an earlier day', () => {
    expect(beforeOpening('2026-09-30T15:00:00.000Z', '2026-10-07')).toBe(true);
  });

  it('counts the opening day itself, from its first minute', () => {
    expect(beforeOpening('2026-10-07T05:30:00.000Z', '2026-10-07')).toBe(false);
  });

  it('reads the day in Lima: 23:59 of the 6th is already the 7th in UTC', () => {
    // 2026-10-06 23:59 in Lima
    expect(beforeOpening('2026-10-07T04:59:00.000Z', '2026-10-07')).toBe(true);
  });

  it('and 21:00 of 30 September is still September, though UTC says October', () => {
    expect(beforeOpening('2026-10-01T02:00:00.000Z', '2026-10-01')).toBe(true);
  });
});

describe('dayBeforeOpening', () => {
  it('compares plain days', () => {
    expect(dayBeforeOpening('2026-10-06', '2026-10-07')).toBe(true);
    expect(dayBeforeOpening('2026-10-07', '2026-10-07')).toBe(false);
  });
});

describe('openingDay', () => {
  it('says the day and the month, without a UTC shift', () => {
    expect(openingDay('2026-10-07', TODAY)).toBe('7 de octubre');
  });

  it('adds the year when it is not this one', () => {
    expect(openingDay('2025-12-31', TODAY)).toBe('31 de diciembre de 2025');
  });
});

describe('beforeOpeningNotice', () => {
  it('says what still counts and why the balance does not move', () => {
    expect(beforeOpeningNotice(EFECTIVO, 'cuenta en Resultados', TODAY)).toBe(
      'Es anterior a la apertura de Efectivo (7 de octubre): cuenta en Resultados, pero no cambia su saldo, porque ya está dentro del saldo de apertura.',
    );
  });

  it('says only the balance part when nothing else counts, as for a transfer', () => {
    expect(beforeOpeningNotice({ name: 'Yape', openingBalanceOn: '2026-10-07' }, null, TODAY)).toBe(
      'Es anterior a la apertura de Yape (7 de octubre): no cambia su saldo, porque ya está dentro del saldo de apertura.',
    );
  });
});

describe('beforeOpeningSummary', () => {
  it('is null when nothing came before the opening', () => {
    expect(beforeOpeningSummary({ ...EFECTIVO, movementsBeforeOpening: 0, netBeforeOpening: 0 }, TODAY)).toBeNull();
  });

  it('counts the movements and signs what they would have moved', () => {
    expect(plain(beforeOpeningSummary({ ...EFECTIVO, movementsBeforeOpening: 2, netBeforeOpening: 5 }, TODAY))).toBe(
      '2 movimientos anteriores al 7 de octubre (+S/ 5.00) no cambian el saldo',
    );
  });

  it('agrees in the singular and shows a loss with a minus', () => {
    expect(plain(beforeOpeningSummary({ ...EFECTIVO, movementsBeforeOpening: 1, netBeforeOpening: -4 }, TODAY))).toBe(
      '1 movimiento anterior al 7 de octubre (−S/ 4.00) no cambia el saldo',
    );
  });
});
