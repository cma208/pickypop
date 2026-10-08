import { requestKey } from './request-key';

describe('requestKey', () => {
  let next = 0;
  const newKey = () => `key-${++next}`;

  beforeEach(() => (next = 0));

  it('gives a first write a key of its own', () => {
    expect(requestKey(null, { amount: 5 }, newKey)).toEqual({ key: 'key-1', payload: { amount: 5 } });
  });

  it('keeps the key when the same write is sent again: a double click is one payment (T4-01)', () => {
    const first = requestKey(null, { amount: 5, account: 'cash' }, newKey);
    expect(requestKey(first, { amount: 5, account: 'cash' }, newKey).key).toBe('key-1');
  });

  it('gives another key when anything changed: a kept key would bring back the first write', () => {
    const first = requestKey(null, { amount: 5 }, newKey);
    expect(requestKey(first, { amount: 6 }, newKey).key).toBe('key-2');
  });
});
