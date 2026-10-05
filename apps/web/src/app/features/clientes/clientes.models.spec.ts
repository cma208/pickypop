import { documentError } from './clientes.models';

describe('documentError', () => {
  it('accepts customers without a document', () => {
    expect(documentError('none', '')).toBeNull();
  });

  it('requires exactly 8 digits for a DNI', () => {
    expect(documentError('dni', '12345678')).toBeNull();
    expect(documentError('dni', '1234567')).toContain('8 dígitos');
    expect(documentError('dni', '1234567a')).toContain('8 dígitos');
  });

  it('requires exactly 11 digits for a RUC', () => {
    expect(documentError('ruc', '20123456789')).toBeNull();
    expect(documentError('ruc', '2012345678')).toContain('11 dígitos');
  });

  it('asks for the number when the type needs one', () => {
    expect(documentError('dni', '  ')).toBe('Indica el número de documento.');
  });
});
