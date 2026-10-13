import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import {
  accountNumberFormat,
  formatInterbank,
  formatPhone,
  interbankFormat,
  normalizeAccountNumber,
  normalizeInterbank,
  normalizePhone,
  paymentDetailsFor,
  paymentDetailsLines,
  phoneFormat,
} from './payment-details';

const TYPED = {
  holderName: ' Carlos Machicado ',
  accountNumber: '191 12345678 0 12',
  interbankNumber: '002 191 112345678012 55',
  phone: '987-654-321',
};

describe('what is saved', () => {
  it('keeps the CCI as its 20 digits, however it was pasted', () => {
    expect(normalizeInterbank('002-191-112345678012-55')).toBe('00219111234567801255');
    expect(normalizeInterbank(' 0021 9111 2345 6780 1255 ')).toBe('00219111234567801255');
  });

  it('drops the +51 and the separators of a phone', () => {
    expect(normalizePhone('+51 987 654 321')).toBe('987654321');
    expect(normalizePhone('(51) 987-654-321')).toBe('987654321');
    expect(normalizePhone('987654321')).toBe('987654321');
  });

  it('takes what a paste hides: direction marks, en dashes, non-breaking hyphens and full-width digits', () => {
    expect(normalizePhone('\u202D+51 987 654 321\u202C')).toBe('987654321');
    expect(normalizePhone('\u202A+51 987 654 321\u202C')).toBe('987654321');
    expect(normalizeInterbank('\u200E002\u2011191\u2011112345678012\u201155')).toBe('00219111234567801255');
    expect(normalizeAccountNumber('191\u201312345678\u20130\u201312')).toBe('191-12345678-0-12');
    expect(normalizeAccountNumber('191\u221212345678')).toBe('191-12345678');
    expect(normalizePhone('\uFF19\uFF18\uFF17\uFF16\uFF15\uFF14\uFF13\uFF12\uFF11')).toBe('987654321');
  });

  it('keeps the dashes of an account number, and reads a space as one', () => {
    expect(normalizeAccountNumber(' 191-12345678-0-12 ')).toBe('191-12345678-0-12');
    expect(normalizeAccountNumber('191 12345678  0 - 12')).toBe('191-12345678-0-12');
  });

  it('keeps all four for a bank', () => {
    expect(paymentDetailsFor('bank', TYPED)).toEqual({
      holderName: 'Carlos Machicado',
      accountNumber: '191-12345678-0-12',
      interbankNumber: '00219111234567801255',
      phone: '987654321',
    });
  });

  it('keeps all but the account number for a wallet, and nothing for a cash box', () => {
    expect(paymentDetailsFor('wallet', TYPED)).toEqual({
      holderName: 'Carlos Machicado',
      accountNumber: null,
      interbankNumber: '00219111234567801255',
      phone: '987654321',
    });
    expect(paymentDetailsFor('cash', TYPED)).toEqual({
      holderName: null,
      accountNumber: null,
      interbankNumber: null,
      phone: null,
    });
  });

  it('saves an empty or blank field as nothing', () => {
    expect(paymentDetailsFor('bank', { holderName: '   ', accountNumber: '', interbankNumber: ' ', phone: '' })).toEqual({
      holderName: null,
      accountNumber: null,
      interbankNumber: null,
      phone: null,
    });
  });
});

describe('validators', () => {
  const judge = (validator: typeof phoneFormat, value: string) => validator(new FormControl(value));

  it('takes an empty field: every detail is optional', () => {
    expect(judge(interbankFormat, '')).toBeNull();
    expect(judge(accountNumberFormat, '  ')).toBeNull();
    expect(judge(phoneFormat, '')).toBeNull();
  });

  it('wants exactly 20 digits in a CCI', () => {
    expect(judge(interbankFormat, '002-191-112345678012-55')).toBeNull();
    expect(judge(interbankFormat, '0021911123456780125')).toEqual({ interbank: true });
    expect(judge(interbankFormat, '002191112345678012555')).toEqual({ interbank: true });
    expect(judge(interbankFormat, '0021911123456780125A')).toEqual({ interbank: true });
  });

  it('takes an account number of 6 to 20 digits, with dashes between them', () => {
    expect(judge(accountNumberFormat, '191-12345678-0-12')).toBeNull();
    expect(judge(accountNumberFormat, '0011-0123-0123456789')).toBeNull();
    expect(judge(accountNumberFormat, '12345')).toEqual({ accountNumber: true });
    expect(judge(accountNumberFormat, '123456789012345678901')).toEqual({ accountNumber: true });
    expect(judge(accountNumberFormat, '191-ABC')).toEqual({ accountNumber: true });
  });

  it('wants a Peruvian mobile: nine digits starting with 9', () => {
    expect(judge(phoneFormat, '987 654 321')).toBeNull();
    expect(judge(phoneFormat, '+51 987 654 321')).toBeNull();
    expect(judge(phoneFormat, '014567890')).toEqual({ phone: true });
    expect(judge(phoneFormat, '98765432')).toEqual({ phone: true });
  });
});

describe('display', () => {
  it('prints a CCI in its four blocks and a phone in threes', () => {
    expect(formatInterbank('00219111234567801255')).toBe('002-191-112345678012-55');
    expect(formatPhone('987654321')).toBe('987 654 321');
  });

  it('gives one line per detail written, in a fixed order, and none when there is nothing', () => {
    expect(
      paymentDetailsLines({
        holderName: 'Carlos Machicado',
        accountNumber: '191-12345678-0-12',
        interbankNumber: '00219111234567801255',
        phone: null,
      }),
    ).toEqual([
      { label: 'N.º', value: '191-12345678-0-12', whole: true },
      { label: 'CCI', value: '002-191-112345678012-55', whole: true },
      { label: 'A nombre de', value: 'Carlos Machicado', whole: false },
    ]);
    expect(paymentDetailsLines({ holderName: null, accountNumber: null, interbankNumber: null, phone: '987654321' })).toEqual([
      { label: 'Celular', value: '987 654 321', whole: true },
    ]);
    expect(paymentDetailsLines({ holderName: null, accountNumber: null, interbankNumber: null, phone: null })).toEqual([]);
  });
});
