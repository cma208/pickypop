import { jsPDF } from 'jspdf';
import type { QuoteDocument } from './quote-document';

/** A4 in millimetres, which is what the workshop prints and shares. */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const RIGHT = PAGE_WIDTH - MARGIN;
const BOTTOM = PAGE_HEIGHT - MARGIN;

/** Right edge of each column of the lines table, in millimetres. */
const DESCRIPTION_WIDTH = 92;
const QUANTITY_RIGHT = 124;
const UNIT_PRICE_RIGHT = 158;
const TOTALS_LABEL_LEFT = 124;
const LINE_HEIGHT = 5;

/**
 * Draws the quote on an A4 page. The caller passes a document that already
 * holds formatted strings, so nothing here decides what a number looks like.
 */
export function renderQuotePdf(doc: QuoteDocument): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN + 4;

  pdf.setFont('helvetica', 'bold').setFontSize(16);
  pdf.text(doc.workshopName, MARGIN, y);
  pdf.setFontSize(13);
  pdf.text(doc.title, RIGHT, y, { align: 'right' });

  y += 4;
  pdf.setDrawColor(150);
  pdf.line(MARGIN, y, RIGHT, y);
  y += 8;

  pdf.setFontSize(10);
  for (const field of doc.fields) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${field.label}:`, MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(field.value, MARGIN + 36, y);
    y += LINE_HEIGHT + 1;
  }

  y += 4;
  y = tableHeader(pdf, y);

  for (const line of doc.lines) {
    const wrapped: string[] = pdf.splitTextToSize(line.description, DESCRIPTION_WIDTH);
    const height = wrapped.length * LINE_HEIGHT + 3;

    // Leave room for the rule and the footer before spilling onto a new page.
    if (y + height > BOTTOM - 14) {
      pdf.addPage();
      y = tableHeader(pdf, MARGIN + 4);
    }

    pdf.setFont('helvetica', 'normal').setFontSize(10);
    pdf.text(wrapped, MARGIN, y);
    pdf.text(line.quantity, QUANTITY_RIGHT, y, { align: 'right' });
    pdf.text(line.unitPrice, UNIT_PRICE_RIGHT, y, { align: 'right' });
    pdf.text(line.lineTotal, RIGHT, y, { align: 'right' });
    y += height;
  }

  y += 2;
  pdf.setDrawColor(150);
  pdf.line(TOTALS_LABEL_LEFT, y, RIGHT, y);
  y += 7;

  for (const total of doc.totals) {
    pdf.setFont('helvetica', total.strong ? 'bold' : 'normal');
    pdf.setFontSize(total.strong ? 12 : 10);
    pdf.text(total.label, TOTALS_LABEL_LEFT, y);
    pdf.text(total.value, RIGHT, y, { align: 'right' });
    y += total.strong ? LINE_HEIGHT + 2 : LINE_HEIGHT + 1;
  }

  if (doc.note !== null) {
    y += 6;
    pdf.setFont('helvetica', 'bold').setFontSize(10);
    pdf.text('Nota', MARGIN, y);
    y += LINE_HEIGHT;
    pdf.setFont('helvetica', 'normal');
    pdf.text(pdf.splitTextToSize(doc.note, RIGHT - MARGIN), MARGIN, y);
  }

  pdf.setFont('helvetica', 'normal').setFontSize(8);
  pdf.setTextColor(110);
  const footer: string[] = pdf.splitTextToSize(doc.footer, RIGHT - MARGIN);
  pdf.text(footer, MARGIN, BOTTOM - (footer.length - 1) * 3.5);

  return pdf;
}

/** Draws the column titles and returns the baseline for the first row. */
function tableHeader(pdf: jsPDF, top: number): number {
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text('Descripción', MARGIN, top);
  pdf.text('Cant.', QUANTITY_RIGHT, top, { align: 'right' });
  pdf.text('P. unitario', UNIT_PRICE_RIGHT, top, { align: 'right' });
  pdf.text('Total', RIGHT, top, { align: 'right' });

  const ruleY = top + 2;
  pdf.setDrawColor(150);
  pdf.line(MARGIN, ruleY, RIGHT, ruleY);

  return ruleY + 6;
}

/** Renders the quote and hands the file to the browser. */
export function downloadQuotePdf(doc: QuoteDocument): void {
  renderQuotePdf(doc).save(doc.fileName);
}
