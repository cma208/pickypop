import { permissionError, UserFacingError } from '../../core/friendly-error';
import { isRefusal } from './finanzas.data';

describe('isRefusal', () => {
  it('is a sentence the database wrote for a person', () => {
    expect(isRefusal({ code: 'P0001', message: 'Este movimiento ya estaba anulado (motivo: «Primera»).' })).toBe(true);
    expect(isRefusal(new UserFacingError('Escribe el motivo de la anulación: queda en el registro.'))).toBe(true);
  });

  it('is a refusal by role too, which comes as 42501 with its sentence (ADR-025)', () => {
    // An operator whose tab still shows «Anular» from when they were the owner.
    expect(isRefusal({ code: '42501', message: 'Solo el dueño del taller puede anular un movimiento de dinero.' })).toBe(true);
    expect(isRefusal({ code: '42501', message: 'new row violates row-level security policy for table "transactions"' })).toBe(true);
    expect(isRefusal(permissionError())).toBe(true);
  });

  it('is not a failure that says nothing about the row or the role', () => {
    expect(isRefusal({ message: 'Failed to fetch' })).toBe(false);
    expect(isRefusal({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isRefusal(null)).toBe(false);
  });
});
