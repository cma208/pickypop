import { documentTitle, linesSummary } from './document-title';

const POTION = { description: 'Botella de poción con dulces surtidos', quantity: 10 };
const CAP = { description: 'Tapa suelta', quantity: 2 };

describe('documentTitle', () => {
  it('puts the customer before the product', () => {
    expect(documentTitle('Ana Quispe', [POTION])).toBe('Ana Quispe · 10 × Botella de poción con dulces surtidos');
  });

  it('says there is no customer instead of leaving a gap', () => {
    expect(documentTitle(null, [POTION])).toBe('Sin cliente · 10 × Botella de poción con dulces surtidos');
    expect(documentTitle('  ', [])).toBe('Sin cliente');
  });

  it('is only the customer while there are no lines', () => {
    expect(documentTitle('Café Lima', [])).toBe('Café Lima');
  });
});

describe('linesSummary', () => {
  it('names the first line and counts the rest', () => {
    expect(linesSummary([POTION, CAP])).toBe('10 × Botella de poción con dulces surtidos y 1 producto más');
    expect(linesSummary([POTION, CAP, CAP])).toBe('10 × Botella de poción con dulces surtidos y 2 productos más');
  });
});
