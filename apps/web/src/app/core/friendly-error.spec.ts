import { describe, expect, it } from 'vitest';
import { friendlyError, permissionError, UserFacingError } from './friendly-error';

const FALLBACK = 'No pudimos guardar el cambio.';

describe('friendlyError', () => {
  it('shows a message the database wrote for a person, word for word', () => {
    // Lo que devuelve `app.assemble_product` cuando no alcanza el stock. Nadie
    // puede reescribirlo mejor desde aquí: sabe qué falta y cuánto.
    const message = 'No alcanza para armar 20 unidades. Falta: Tapa impresa (hacen falta 20 y hay 5)';
    expect(friendlyError({ code: 'P0001', message }, FALLBACK)).toBe(message);
  });

  it('does not show an empty one, which would leave the screen silent', () => {
    expect(friendlyError({ code: 'P0001', message: '   ' }, FALLBACK)).toBe(FALLBACK);
  });

  it('names the constraint it has been taught', () => {
    expect(friendlyError({ message: 'violates check constraint "customers_dni_format"' }, FALLBACK)).toContain(
      '8 dígitos',
    );
  });

  it('turns a blocked row into the permission sentence, by code or by text', () => {
    const byCode = friendlyError({ code: '42501' }, FALLBACK);
    const byText = friendlyError({ message: 'new row violates row-level security policy' }, FALLBACK);
    expect(byCode).toBe(byText);
    expect(byCode).toContain('permiso');
  });

  it('keeps a message that was already written for the user', () => {
    expect(friendlyError(new UserFacingError('Faltan los gramos de la placa 2.'), FALLBACK)).toBe(
      'Faltan los gramos de la placa 2.',
    );
    expect(friendlyError(permissionError(), FALLBACK)).toContain('permiso');
  });

  it('falls back when it has nothing better, including on nothing at all', () => {
    expect(friendlyError(null, FALLBACK)).toBe(FALLBACK);
    expect(friendlyError({ code: '99999', message: 'something odd' }, FALLBACK)).toBe(FALLBACK);
  });
});
