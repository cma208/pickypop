import { noAccountsText } from './accounts-hint';

describe('noAccountsText', () => {
  it('sends the owner to create an account', () => {
    expect(noAccountsText(true)).toContain('Crea una en Finanzas › Cuentas.');
  });

  it('tells the operator whom to ask, instead of sending them where the database refuses', () => {
    const text = noAccountsText(false);
    expect(text).toContain('Solo el dueño crea cuentas');
    expect(text).not.toContain('Crea una');
  });
});
