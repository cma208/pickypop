import { describe, expect, it } from 'vitest';
import { draftOwner, isEmptyDraft, parseDraft, serializeDraft, type QuoteDraft } from './quote-draft';
import { emptyPlate } from './quote-model';

const OWNER = draftOwner('taller-1', 'ana');

function draft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    owner: OWNER,
    line: { description: '', variantId: '', quantity: 1, setupMinutes: 0, minutesPerUnit: 0 },
    plates: [],
    supplies: [],
    lines: [],
    price: { printerId: 'a1', channelId: '', volumeDiscountPercent: 0, urgencySurchargePercent: 0 },
    quote: { customerId: '', requestId: '', validityDays: 15, note: '' },
    previousVersion: null,
    ...overrides,
  };
}

describe('quote drafts', () => {
  it('comes back exactly as it was written', () => {
    const written = draft({
      line: { description: 'Calavera', variantId: 'v1', quantity: 2, setupMinutes: 10, minutesPerUnit: 5 },
      plates: [emptyPlate(1)],
      quote: { customerId: 'c1', requestId: '', validityDays: 7, note: 'Para el viernes' },
    });

    expect(parseDraft(serializeDraft(written), OWNER)).toEqual(written);
  });

  it('is never handed to another person or workshop', () => {
    // Two people share the workshop and may share a browser.
    const stored = serializeDraft(draft({ plates: [emptyPlate(1)] }));

    expect(parseDraft(stored, draftOwner('taller-1', 'beto'))).toBeNull();
    expect(parseDraft(stored, draftOwner('taller-2', 'ana'))).toBeNull();
  });

  it('drops what it cannot read instead of breaking the calculator', () => {
    for (const raw of [null, '', 'no es json', '42', '{"version":1}', '{"version":0,"draft":{}}']) {
      expect(parseDraft(raw, OWNER)).toBeNull();
    }
    const broken = JSON.stringify({ version: 1, draft: { ...draft(), plates: 'placa' } });
    expect(parseDraft(broken, OWNER)).toBeNull();
  });

  it('counts as empty only when nothing was typed', () => {
    expect(isEmptyDraft(draft())).toBe(true);
    // A price or a customer alone is not a quote worth coming back to.
    expect(isEmptyDraft(draft({ quote: { customerId: 'c1', requestId: '', validityDays: 15, note: '' } }))).toBe(true);

    expect(isEmptyDraft(draft({ plates: [emptyPlate(1)] }))).toBe(false);
    expect(isEmptyDraft(draft({ line: { ...draft().line, description: 'Llaveros' } }))).toBe(false);
    expect(isEmptyDraft(draft({ line: { ...draft().line, variantId: 'v1' } }))).toBe(false);
    expect(isEmptyDraft(draft({ previousVersion: { quoteId: 'q1', number: 'COT-2026-0001', version: 1 } }))).toBe(
      false,
    );
  });
});
