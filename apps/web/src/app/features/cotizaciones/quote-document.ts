import { date, money } from '../../core/format';
import type { QuoteDetail } from '../cotizador/cotizador.data';

/** A label and its already formatted value, as the header prints it. */
export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentLine {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface DocumentTotal {
  label: string;
  value: string;
  /** The grand total is the only one printed in bold. */
  strong: boolean;
}

/**
 * Everything the PDF prints, already turned into strings. Building it apart
 * from jsPDF is what makes the numbers testable without rendering anything.
 */
export interface QuoteDocument {
  workshopName: string;
  title: string;
  fields: DocumentField[];
  lines: DocumentLine[];
  totals: DocumentTotal[];
  note: string | null;
  footer: string;
  fileName: string;
}

const UNNAMED_CUSTOMER = 'Sin cliente';
const NO_EXPIRY = 'Sin fecha de vencimiento';

/**
 * The currency formatter separates "S/" with a non-breaking space, which the
 * standard PDF fonts do not draw. Everything that reaches jsPDF goes through
 * here so the amounts read the same on paper as on screen.
 */
export function printable(value: string): string {
  return value.replace(/ /g, ' ');
}

function soles(amount: number): string {
  return printable(money(amount));
}

/** Keeps a document number usable as a file name on any system. */
function slug(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function quoteFileName(quote: Pick<QuoteDetail, 'number' | 'version'>): string {
  return `Cotizacion-${slug(quote.number)}-v${quote.version}.pdf`;
}

/**
 * Turns a saved quote into the document to print, reading only the amounts
 * frozen into it. Nothing is recalculated with today's prices: a quote the
 * customer already received has to keep saying what it said.
 */
export function buildQuoteDocument(quote: QuoteDetail, workshopName: string): QuoteDocument {
  const totals: DocumentTotal[] = [
    { label: 'Valor de venta', value: soles(quote.subtotal), strong: false },
  ];

  if (quote.igv > 0) totals.push({ label: 'IGV', value: soles(quote.igv), strong: false });
  if (quote.discount > 0) {
    totals.push({ label: 'Descuento aplicado', value: soles(quote.discount), strong: false });
  }

  totals.push({ label: 'Total', value: soles(quote.total), strong: true });

  return {
    workshopName: printable(workshopName.trim() === '' ? 'Pickypop' : workshopName.trim()),
    title: printable(`Cotización ${quote.number}`),
    fields: [
      { label: 'Cliente', value: printable(quote.customerName ?? UNNAMED_CUSTOMER) },
      { label: 'Versión', value: String(quote.version) },
      { label: 'Fecha de emisión', value: printable(date(quote.issuedOn)) },
      {
        label: 'Válida hasta',
        value: quote.validUntil === null ? NO_EXPIRY : printable(date(quote.validUntil)),
      },
    ],
    lines: quote.storedLines.map((line) => ({
      description: printable(line.description),
      quantity: String(line.quantity),
      unitPrice: soles(line.unitPrice),
      lineTotal: soles(line.lineTotal),
    })),
    totals,
    note: quote.note === null || quote.note.trim() === '' ? null : printable(quote.note.trim()),
    footer: printable(
      quote.validUntil === null
        ? 'Precios en soles. Esta cotización no genera compromiso de stock hasta su aceptación.'
        : `Precios en soles, válidos hasta el ${date(quote.validUntil)}. Esta cotización no genera compromiso de stock hasta su aceptación.`,
    ),
    fileName: quoteFileName(quote),
  };
}
