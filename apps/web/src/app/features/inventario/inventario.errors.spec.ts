import { UserFacingError } from '../../core/friendly-error';
import { noAnswerReason, outcomeUnknown } from './inventario.errors';

describe('outcomeUnknown', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('knows nothing was written when the database answered with a code', () => {
    expect(outcomeUnknown({ code: 'P0001', message: 'La cuenta Yape está desactivada.' })).toBe(false);
    expect(outcomeUnknown({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(outcomeUnknown({ code: 'PGRST202', message: 'function not found' })).toBe(false);
  });

  it('knows nothing was sent when the screen itself refused', () => {
    expect(outcomeUnknown(new UserFacingError('No tienes permiso.'))).toBe(false);
  });

  it('does not know when the answer never arrived (T1-04)', () => {
    // What postgrest-js returns when fetch throws: the code is empty.
    expect(outcomeUnknown({ code: '', message: 'TypeError: Failed to fetch' })).toBe(true);
    // A gateway page instead of JSON: no code at all.
    expect(outcomeUnknown({ message: '<html>502 Bad Gateway</html>' })).toBe(true);
    expect(outcomeUnknown(new Error('Failed to fetch'))).toBe(true);
    expect(outcomeUnknown(null)).toBe(true);
  });

  it('says why the answer did not arrive, or that it did not', () => {
    expect(noAnswerReason({ code: '', message: 'TypeError: Failed to fetch' })).toContain('No hay conexión');
    expect(noAnswerReason({ message: '<html>502</html>' })).toBe('La respuesta del servidor no llegó.');
  });
});
