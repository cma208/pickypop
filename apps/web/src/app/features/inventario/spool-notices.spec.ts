import { needsWeighingToReturn, statusNotice, statusWarning, weighingNotice } from './spool-notices';

/** Intl writes «S/» with a non-breaking space. */
const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');

const ROLL = { code: 'PLA-PRUEBA-02', status: 'open' as const, remainingG: -50.126 };

describe('weighingNotice', () => {
  it('says nothing was adjusted when the second tab finds the roll already weighed (T3-02)', () => {
    const notice = weighingNotice(ROLL, { netG: 0, beforeG: 0, differenceG: 0, afterG: 0, status: 'empty' });

    expect(notice).toBe('El rollo PLA-PRUEBA-02 ya tenía 0 g según sus movimientos: no hizo falta ningún ajuste.');
  });

  it('says what it adjusted, and from what, when the roll changed while the dialog was open', () => {
    const notice = weighingNotice(
      { ...ROLL, remainingG: 1000 },
      { netG: 800, beforeG: 904.09, differenceG: -104.09, afterG: 800, status: 'open' },
    );

    expect(notice).toContain('ajuste de −104.09 g');
    expect(notice).toContain('quedó en 800 g');
    expect(notice).toContain('pasó de 1 kg a 904.09 g');
  });

  it('says a discarded roll that still had filament is open again', () => {
    const notice = weighingNotice(
      { code: 'X', status: 'discarded', remainingG: 0 },
      { netG: 250, beforeG: 0, differenceG: 250, afterG: 250, status: 'open' },
    );

    expect(notice).toContain('vuelve a estar abierto');
  });
});

describe('statusWarning', () => {
  const spool = { code: 'PLA-PRUEBA-01', remainingG: 1000, costPerGram: 0.05 };

  it('says how many grams and how much money leave the stock before discarding (T1-08)', () => {
    expect(plain(statusWarning(spool, 'discarded'))).toBe(
      'Según sus movimientos, al rollo PLA-PRUEBA-01 le quedan 1 kg (S/ 50.00). Al descartarlo salen del stock como merma y dejan de contar para el plan.',
    );
    expect(statusWarning(spool, 'empty')).toContain('como ajuste');
  });

  it('has nothing to warn about for a roll with no grams, or a state that keeps them', () => {
    expect(statusWarning({ ...spool, remainingG: 0 }, 'discarded')).toBeNull();
    expect(statusWarning(spool, 'in_use')).toBeNull();
  });
});

describe('statusNotice', () => {
  it('says where the grams went', () => {
    expect(plain(statusNotice('PETG-NEGRO-01', { status: 'empty', changed: true, removedG: 904.09, removedCost: 45.2 }))).toBe(
      'El rollo PETG-NEGRO-01 ahora está: agotado. Salieron del stock 904.09 g (S/ 45.20) como ajuste, y ya no cuentan para el plan.',
    );
  });

  it('is the plain sentence when nothing moved', () => {
    expect(statusNotice('X-01', { status: 'in_use', changed: true, removedG: 0, removedCost: 0 })).toBe(
      'El rollo X-01 ahora está: en uso.',
    );
  });
});

describe('needsWeighingToReturn', () => {
  it('sends an empty or discarded roll with no grams to the scale, not back to use (T3-07)', () => {
    expect(needsWeighingToReturn({ status: 'empty', remainingG: 0 }, 'in_use')).toBe(true);
    expect(needsWeighingToReturn({ status: 'discarded', remainingG: 0 }, 'open')).toBe(true);
  });

  it('lets every other change through', () => {
    expect(needsWeighingToReturn({ status: 'empty', remainingG: 0 }, 'discarded')).toBe(false);
    expect(needsWeighingToReturn({ status: 'open', remainingG: 0 }, 'in_use')).toBe(false);
    expect(needsWeighingToReturn({ status: 'empty', remainingG: 300 }, 'open')).toBe(false);
  });
});
