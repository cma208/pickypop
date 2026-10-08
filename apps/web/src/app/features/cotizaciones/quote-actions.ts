import type { QuoteDetail } from '../cotizador/cotizador.data';

/** How the hold card shows: whole, only to let go of what it still holds, or not at all. */
export type HoldCard = 'full' | 'release' | null;

export interface QuoteActions {
  /** History: a newer version exists, or the document already became an order. */
  historical: boolean;
  canSend: boolean;
  canAccept: boolean;
  canReject: boolean;
  canVersion: boolean;
  hold: HoldCard;
}

/**
 * What a quote page offers, by the same rules the database applies (T4-03,
 * T4-09). Only the newest version of a document is sent, accepted or held,
 * and never once the document has its live order, whichever version became
 * it. Offering what the database then refuses sent people round in circles:
 * they rebuilt a whole new version only to have it refused on saving.
 *
 * An old version that was sent still holds until a newer one is sent or
 * accepted, as the database lets it: its card only lets go.
 */
export function quoteActions(
  quote: Pick<QuoteDetail, 'status' | 'hasNewerVersion' | 'order' | 'documentOrder'>,
): QuoteActions {
  const historical = quote.hasNewerVersion || quote.documentOrder !== null;
  const open = quote.status === 'draft' || quote.status === 'sent';

  return {
    historical,
    canSend: quote.status === 'draft' && !historical,
    canAccept: quote.status === 'sent' && !historical,
    // An old version can still be rejected: it only lets go of what it held.
    canReject: quote.status === 'sent' && quote.order === null,
    // From the newest version, of a document without its order: the new one could be sent.
    canVersion: !quote.hasNewerVersion && quote.documentOrder === null,
    hold: open && !historical ? 'full' : quote.status === 'sent' ? 'release' : null,
  };
}
