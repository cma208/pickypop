import { UserFacingError } from '../../core/friendly-error';
import { explainError, refusedByDatabase } from './pedidos.errors';

const SHORTAGE =
  'No alcanza para entregar. Falta: Botella de poción · Con dulces surtidos (hacen falta 2 y hay 1). Arma o imprime lo que falta, o entrega una parte.';

describe('explainError', () => {
  it('shows a message the database wrote for a person word for word', () => {
    expect(explainError(new UserFacingError(SHORTAGE), 'generic')).toBe(SHORTAGE);
    expect(explainError({ code: 'P0001', message: SHORTAGE }, 'generic')).toBe(SHORTAGE);
  });

  it('still translates the older checks that raise in English', () => {
    expect(explainError({ code: 'P0001', message: 'a failed job needs a cause' }, 'generic')).toBe(
      'Una impresión fallida necesita su causa.',
    );
  });

  it('says what went wrong with a number too large instead of inviting a retry (T3-14)', () => {
    const tooLarge = explainError(
      { code: '22003', message: 'numeric field overflow', details: 'A field with precision 12, scale 2 must round to an absolute value less than 10^10.' },
      'No pudimos guardar. Inténtalo de nuevo.',
    );

    expect(tooLarge).toContain('demasiado grande');
    expect(tooLarge).toContain('9,999,999,999.99');
  });

  it('leaves to friendlyError what it does not know: permissions, the network, other areas', () => {
    expect(explainError({ code: '42501', message: 'new row violates row-level security policy' }, 'generic')).toContain(
      'No tienes permiso',
    );
    expect(explainError({ code: '23514', message: 'violates check constraint "customers_dni_format"' }, 'generic')).toContain(
      '8 dígitos',
    );
    expect(explainError(new TypeError('Failed to fetch'), 'generic')).toContain('No hay conexión');
  });

  it('falls back when nobody knows better', () => {
    expect(explainError({ code: '99999', message: 'something odd' }, 'generic')).toBe('generic');
    expect(explainError({ code: 'P0001', message: '  ' }, 'generic')).toBe('generic');
  });
});

describe('refusedByDatabase', () => {
  it('knows the database said no when it answered with a code', () => {
    expect(refusedByDatabase(new UserFacingError(SHORTAGE))).toBe(true);
    expect(refusedByDatabase({ code: 'P0001', message: SHORTAGE })).toBe(true);
    expect(refusedByDatabase({ code: '42501', message: 'row-level security' })).toBe(true);
  });

  it('cannot tell after a network failure: the write may have been saved', () => {
    expect(refusedByDatabase({ code: '', message: 'TypeError: Failed to fetch' })).toBe(false);
    expect(refusedByDatabase(new TypeError('Failed to fetch'))).toBe(false);
    expect(refusedByDatabase(null)).toBe(false);
  });
});
