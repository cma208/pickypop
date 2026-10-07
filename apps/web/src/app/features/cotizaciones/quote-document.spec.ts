import { buildQuoteDocument, printable, quoteFileName } from './quote-document';
import type { QuoteDetail, StoredLine } from '../cotizador/cotizador.data';

function line(partial: Partial<StoredLine> = {}): StoredLine {
  return {
    id: 'line-1',
    position: 1,
    kind: 'custom',
    variantId: null,
    description: 'Llavero personalizado',
    quantity: 9,
    setupMinutes: 10,
    minutesPerUnit: 4,
    unitCost: 1.2,
    unitPrice: 3.5,
    lineTotal: 31.5,
    plates: [],
    supplies: [],
    filamentLabels: {},
    filamentCostPerKg: {},
    ...partial,
  };
}

function quote(partial: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: 'quote-1',
    number: 'COT-0001',
    version: 1,
    status: 'sent',
    customerName: 'Marisol Quispe',
    issuedOn: '2026-10-04',
    validUntil: '2026-10-18',
    total: 31.5,
    lines: 1,
    hasNewerVersion: false,
    parentQuoteId: null,
    customerId: 'customer-1',
    channelId: null,
    channelName: null,
    requestId: null,
    note: null,
    subtotal: 31.5,
    discount: 0,
    igv: 0,
    snapshot: null,
    storedLines: [line()],
    heldAt: null,
    holdUntil: null,
    order: null,
    ...partial,
  };
}

describe('printable', () => {
  it('turns the non-breaking space of the currency format into a plain one', () => {
    expect(printable('S/ 1,234.50')).toBe('S/ 1,234.50');
  });
});

describe('quoteFileName', () => {
  it('carries the quote number and its version', () => {
    expect(quoteFileName({ number: 'COT-0001', version: 2 })).toBe('Cotizacion-COT-0001-v2.pdf');
  });

  it('drops anything a file system would choke on', () => {
    expect(quoteFileName({ number: 'COT/0007 bis', version: 1 })).toBe(
      'Cotizacion-COT-0007-bis-v1.pdf',
    );
  });
});

describe('buildQuoteDocument', () => {
  it('prints the header with the workshop, the number and the version', () => {
    const doc = buildQuoteDocument(quote({ version: 3 }), 'Pickypop');

    expect(doc.workshopName).toBe('Pickypop');
    expect(doc.title).toBe('Cotización COT-0001');
    expect(doc.fields).toEqual([
      { label: 'Cliente', value: 'Marisol Quispe' },
      { label: 'Versión', value: '3' },
      { label: 'Fecha de emisión', value: '04 oct. 2026' },
      { label: 'Válida hasta', value: '18 oct. 2026' },
    ]);
  });

  it('says so when there is no customer and no expiry date', () => {
    const doc = buildQuoteDocument(quote({ customerName: null, validUntil: null }), 'Pickypop');

    expect(doc.fields[0]).toEqual({ label: 'Cliente', value: 'Sin cliente' });
    expect(doc.fields[3]).toEqual({ label: 'Válida hasta', value: 'Sin fecha de vencimiento' });
    expect(doc.footer).not.toContain('válidos hasta');
  });

  it('copies the frozen amounts of each line instead of recomputing them', () => {
    const doc = buildQuoteDocument(
      quote({
        storedLines: [line({ quantity: 9, unitPrice: 3.5, lineTotal: 31.5 })],
      }),
      'Pickypop',
    );

    expect(doc.lines).toEqual([
      {
        description: 'Llavero personalizado',
        quantity: '9',
        unitPrice: 'S/ 3.50',
        lineTotal: 'S/ 31.50',
      },
    ]);
  });

  it('keeps a stored line total that does not match quantity times unit price', () => {
    // A quote sent with a hand-adjusted total has to keep showing that total.
    const doc = buildQuoteDocument(
      quote({ storedLines: [line({ quantity: 2, unitPrice: 10, lineTotal: 18 })] }),
      'Pickypop',
    );

    expect(doc.lines[0]!.lineTotal).toBe('S/ 18.00');
  });

  it('lists only the totals that apply', () => {
    const doc = buildQuoteDocument(quote(), 'Pickypop');

    expect(doc.totals).toEqual([
      { label: 'Valor de venta', value: 'S/ 31.50', strong: false },
      { label: 'Total', value: 'S/ 31.50', strong: true },
    ]);
  });

  it('adds the IGV and the discount when the quote carries them', () => {
    const doc = buildQuoteDocument(
      quote({ subtotal: 100, igv: 18, discount: 5, total: 113 }),
      'Pickypop',
    );

    expect(doc.totals.map((total) => total.label)).toEqual([
      'Valor de venta',
      'IGV',
      'Descuento aplicado',
      'Total',
    ]);
    expect(doc.totals.at(-1)).toEqual({ label: 'Total', value: 'S/ 113.00', strong: true });
  });

  it('leaves out an empty note', () => {
    expect(buildQuoteDocument(quote({ note: '   ' }), 'Pickypop').note).toBeNull();
    expect(buildQuoteDocument(quote({ note: 'Entrega en Surquillo' }), 'Pickypop').note).toBe(
      'Entrega en Surquillo',
    );
  });

  it('falls back to the brand when the workshop has no name', () => {
    expect(buildQuoteDocument(quote(), '  ').workshopName).toBe('Pickypop');
  });
});
