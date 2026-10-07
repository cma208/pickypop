import { UserFacingError } from '../../core/friendly-error';
import { explainError } from './pedidos.errors';

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

  it('falls back for anything else', () => {
    expect(explainError({ code: '23503', message: 'violates foreign key' }, 'generic')).toBe('generic');
    expect(explainError({ code: 'P0001', message: '  ' }, 'generic')).toBe('generic');
  });
});
