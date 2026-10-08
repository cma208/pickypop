import { quoteActions } from './quote-actions';

const FRESH = { status: 'sent' as const, hasNewerVersion: false, order: null, documentOrder: null };
const ORDER_ON_V2 = { id: 'order-4', number: 'ORD-2026-0004', version: 2 };

describe('quoteActions', () => {
  it('offers everything on the newest version of a document without its order', () => {
    expect(quoteActions(FRESH)).toEqual({
      historical: false,
      canSend: false,
      canAccept: true,
      canReject: true,
      canVersion: true,
      hold: 'full',
    });
    expect(quoteActions({ ...FRESH, status: 'draft' })).toMatchObject({ canSend: true, canAccept: false, hold: 'full' });
  });

  it('does not offer a new version from history, which the database numbers after the newest', () => {
    // COT-0002: v1 sent, v2 in draft. «Versión 2» from v1 would have been saved as v3.
    const actions = quoteActions({ ...FRESH, hasNewerVersion: true });

    expect(actions).toMatchObject({ historical: true, canSend: false, canAccept: false, canVersion: false });
    expect(actions.canReject).toBe(true);
  });

  it('judges by the order of the document, not only of this version', () => {
    // COT-2026-0001: v1 rejected, v2 became ORD-2026-0004. The v1 page offered «Crear versión nueva».
    expect(quoteActions({ ...FRESH, status: 'rejected', hasNewerVersion: true, documentOrder: ORDER_ON_V2 }).canVersion).toBe(false);

    // Old data: v1 has the order and v2 is still a draft or sent. The database refuses all three.
    const v2 = quoteActions({ ...FRESH, documentOrder: { ...ORDER_ON_V2, version: 1 } });
    expect(v2).toMatchObject({ historical: true, canSend: false, canAccept: false, canVersion: false });
    expect(quoteActions({ ...FRESH, status: 'draft', documentOrder: ORDER_ON_V2 }).canSend).toBe(false);
  });

  it('lets an old sent version only let go of what it still holds', () => {
    expect(quoteActions({ ...FRESH, hasNewerVersion: true }).hold).toBe('release');
    expect(quoteActions({ ...FRESH, status: 'draft', hasNewerVersion: true }).hold).toBeNull();
    expect(quoteActions({ ...FRESH, status: 'accepted', order: ORDER_ON_V2, documentOrder: ORDER_ON_V2 }).hold).toBeNull();
  });

  it('a closed quote with its order is not rejected', () => {
    expect(quoteActions({ ...FRESH, status: 'accepted', order: ORDER_ON_V2, documentOrder: ORDER_ON_V2 }).canReject).toBe(false);
  });
});
