import { describe, expect, it } from 'vitest';
import { friendlyError, isPermissionError, permissionError, UserFacingError } from './friendly-error';

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

  it('says how large a number may be, and does not invite a retry that cannot work', () => {
    const money = friendlyError(
      {
        code: '22003',
        message: 'numeric field overflow',
        details: 'A field with precision 12, scale 2 must round to an absolute value less than 10^10.',
      },
      FALLBACK,
    );
    expect(money).toContain('9,999,999,999.99');
    expect(money).not.toContain('Inténtalo');

    const count = friendlyError({ code: '22003', message: 'value "5999999999940" is out of range for type integer' }, FALLBACK);
    expect(count).toContain('2,147,483,647');

    expect(friendlyError({ code: '22003', message: 'something else' }, FALLBACK)).toContain('demasiado grande');
  });

  it('tells a whole quantity with decimals apart from something that is not a number', () => {
    expect(friendlyError({ code: '22P02', message: 'invalid input syntax for type integer: "1.5"' }, FALLBACK)).toContain(
      'sin decimales',
    );
    expect(friendlyError({ code: '22P02', message: 'invalid input syntax for type numeric: "abc"' }, FALLBACK)).toContain(
      'no es un número',
    );
  });

  it('names the field of a check it knows, reading the constraint name exactly', () => {
    const check = (constraint: string) =>
      friendlyError({ code: '23514', message: `new row violates check constraint "${constraint}"` }, FALLBACK);

    expect(check('accounts_name_check')).toContain('nombre de la cuenta');
    expect(check('workshop_settings_check1')).toContain('todo tiene que haber terminado');
    expect(check('workshop_settings_check')).toContain('después de la primera');
    expect(check('workshop_settings_changeover_fits_a_day')).toContain('1440');
    // A name check nobody mapped still says what to do.
    expect(check('suppliers_name_check')).toContain('Escribe el nombre');
  });

  it('explains the duplicates that only differ in capitals', () => {
    const duplicate = (index: string) =>
      friendlyError({ code: '23505', message: `duplicate key value violates unique constraint "${index}"` }, FALLBACK);

    expect(duplicate('sales_channels_name_ci_key')).toContain('canal');
    expect(duplicate('accounts_name_ci_key')).toContain('cuenta');
    expect(duplicate('filament_skus_identity_ci_key')).toContain('filamento');
    expect(duplicate('printers_name_ci_key')).toContain('impresora');
  });

  it('explains the rules the third pass added, instead of the generic sentence', () => {
    const refused = (code: string, constraint: string) =>
      friendlyError({ code, message: `violates constraint "${constraint}"` }, FALLBACK);

    expect(refused('23514', 'transaction_categories_capital_is_not_sales')).toContain('capital y de ventas');
    expect(refused('23505', 'transactions_workspace_entry_key_key')).toContain('ya quedó registrado');
    expect(refused('23514', 'filament_skus_color_name_not_blank')).toContain('nombre del color');
    expect(refused('23514', 'inventory_items_unit_not_blank')).toContain('unidad');
  });

  it('says a ledger is voided or corrected, never edited, when even the owner is refused', () => {
    const money = friendlyError({ code: '42501', message: 'permission denied for table transactions' }, FALLBACK);
    const stock = friendlyError({ code: '42501', message: 'permission denied for table stock_movements' }, FALLBACK);

    expect(money).toContain('se anula');
    expect(stock).toContain('conteo');
    expect(friendlyError({ code: '42501', message: 'permission denied for table printers' }, FALLBACK)).toContain('permiso');
  });

  it('shows the sentence of a function that refuses by role, and the generic one for PostgreSQL\'s own', () => {
    const owner = 'Solo el dueño del taller puede registrar o cambiar las impresoras.';
    expect(friendlyError({ code: '42501', message: owner }, FALLBACK)).toBe(owner);
    expect(
      friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "printers"' }, FALLBACK),
    ).toContain('No tienes permiso');
    expect(friendlyError({ code: '42501', message: '' }, FALLBACK)).toContain('No tienes permiso');
  });

  it('knows a refusal of who is asking from a refusal of what was written', () => {
    expect(isPermissionError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(true);
    expect(isPermissionError({ code: '42501', message: 'Solo el dueño del taller puede registrar o cambiar las impresoras.' })).toBe(true);
    expect(isPermissionError({ code: 'P0001', message: 'Escribe el nombre de la impresora.' })).toBe(false);
    expect(isPermissionError(permissionError())).toBe(true);
    expect(isPermissionError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isPermissionError(new UserFacingError('Faltan los gramos.'))).toBe(false);
  });

  it('sees the refusal behind an error a screen already translated', () => {
    const owner = 'Solo el dueño del taller puede registrar o cambiar las impresoras.';
    expect(isPermissionError(new UserFacingError(owner, { cause: { code: '42501', message: owner } }))).toBe(true);
    expect(isPermissionError(new UserFacingError('Ya hay un producto.', { cause: { code: '23505' } }))).toBe(false);
  });

  it('falls back when it has nothing better, including on nothing at all', () => {
    expect(friendlyError(null, FALLBACK)).toBe(FALLBACK);
    expect(friendlyError({ code: '99999', message: 'something odd' }, FALLBACK)).toBe(FALLBACK);
  });
});
