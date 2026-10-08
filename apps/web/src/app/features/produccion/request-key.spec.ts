import { runKeys } from './proposal-queue-form';
import { requestKey } from './request-key';

const KEY = '0f8b1c2d-3e4f-4a5b-8c6d-7e8f90a1b2c3';

describe('requestKey', () => {
  it('keeps the key when the very same thing is sent again', () => {
    let made = 0;
    const newKey = () => `key-${++made}`;
    const first = requestKey(null, { label: 'Molde' }, newKey);
    const retry = requestKey(first, { label: 'Molde' }, newKey);
    expect(retry.key).toBe(first.key);
    expect(made).toBe(1);
  });

  it('gives a new key to anything changed', () => {
    let made = 0;
    const newKey = () => `key-${++made}`;
    const first = requestKey(null, { label: 'Molde' }, newKey);
    expect(requestKey(first, { label: 'Molde V2' }, newKey).key).not.toBe(first.key);
  });
});

describe('runKeys', () => {
  it('one key per run, the first one the submission key, all different', () => {
    const keys = runKeys(KEY, 3);
    expect(keys[0]).toBe(KEY);
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('gives the same keys for the same submission, so a retry is recognised', () => {
    expect(runKeys(KEY, 4)).toEqual(runKeys(KEY, 4));
  });

  it('wraps around at the end of the last group', () => {
    const last = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    expect(runKeys(last, 2)[1]).toBe('ffffffff-ffff-4fff-8fff-000000000000');
  });
});
