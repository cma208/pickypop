import type { BatchCostBreakdown, PriceBreakdown } from '../../core/pricing';
import type { LineDraft, MaterialLineRow, PlateDraft, SupplyDraft } from './quote-model';

/** A line already added to the quote being built. */
export interface QuoteLineDraft {
  key: number;
  draft: LineDraft;
  cost: BatchCostBreakdown;
  price: PriceBreakdown;
  materials: MaterialLineRow[];
}

/**
 * The quote someone is writing, kept while they go and look something up.
 *
 * Going to Clientes and coming back used to start the calculator from zero:
 * twenty minutes of plates and supplies gone because a customer's phone had
 * to be checked. Everything a person typed is here; nothing derived is, except
 * the lines already added, which keep the price they were added at.
 */
export interface QuoteDraft {
  /** Whose draft it is: a draft never crosses to another workshop or person. */
  owner: string;
  line: {
    description: string;
    variantId: string;
    quantity: number;
    setupMinutes: number;
    minutesPerUnit: number;
  };
  plates: PlateDraft[];
  supplies: SupplyDraft[];
  lines: QuoteLineDraft[];
  price: {
    printerId: string;
    channelId: string;
    volumeDiscountPercent: number;
    urgencySurchargePercent: number;
  };
  quote: {
    customerId: string;
    requestId: string;
    validityDays: number;
    note: string;
  };
  previousVersion: { quoteId: string; number: string; version: number } | null;
}

/** Bumped when the shape changes: an old draft is dropped, never half-read. */
export const DRAFT_VERSION = 1;

/** Who is writing, in which workshop. */
export function draftOwner(workspaceId: string, userId: string | null): string {
  return `${workspaceId}/${userId ?? 'anon'}`;
}

/**
 * Nothing worth keeping: no line added, nothing being composed. Such a draft
 * is removed instead of stored, so «Limpiar» on an empty quote leaves nothing
 * behind to come back.
 */
export function isEmptyDraft(draft: QuoteDraft): boolean {
  return (
    draft.lines.length === 0 &&
    draft.plates.length === 0 &&
    draft.supplies.length === 0 &&
    draft.line.description.trim() === '' &&
    draft.line.variantId === '' &&
    draft.previousVersion === null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a stored draft back. Storage can hold anything (an older version, a
 * half-written value, something typed in the console), and a draft that
 * cannot be read is dropped: a calculator that starts empty is better than
 * one that breaks on load.
 */
export function parseDraft(raw: string | null, owner: string): QuoteDraft | null {
  if (raw === null) return null;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(stored) || stored['version'] !== DRAFT_VERSION) return null;
  const draft = stored['draft'];
  if (!isRecord(draft) || draft['owner'] !== owner) return null;

  const arrays = ['plates', 'supplies', 'lines'] as const;
  const records = ['line', 'price', 'quote'] as const;
  if (arrays.some((key) => !Array.isArray(draft[key]))) return null;
  if (records.some((key) => !isRecord(draft[key]))) return null;

  return draft as unknown as QuoteDraft;
}

/** What goes into storage: the draft and the version it was written with. */
export function serializeDraft(draft: QuoteDraft): string {
  return JSON.stringify({ version: DRAFT_VERSION, draft });
}
