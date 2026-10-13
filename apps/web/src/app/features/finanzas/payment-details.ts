import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { AccountKind } from './finanzas.models';

/**
 * What somebody needs to pay the workshop into an account. Nothing shows it
 * to a customer yet; it is kept from now on because a quote or a message to
 * collect an advance will need it (owner's decision, 2026-10-12). The
 * database holds the same rules: `20261028110000_account_payment_details.sql`.
 */
export interface PaymentDetails {
  holderName: string | null;
  accountNumber: string | null;
  interbankNumber: string | null;
  phone: string | null;
}

export type PaymentDetail = keyof PaymentDetails;

/**
 * Which details make sense for each kind. A cash box takes nobody's payment.
 * A bank can also take Yape or Plin on a phone number. A wallet has no account
 * number, but some give a CCI (Ligo does).
 */
export const PAYMENT_DETAILS_BY_KIND: Record<AccountKind, readonly PaymentDetail[]> = {
  cash: [],
  bank: ['holderName', 'accountNumber', 'interbankNumber', 'phone'],
  wallet: ['holderName', 'interbankNumber', 'phone'],
};

export const NO_PAYMENT_DETAILS: PaymentDetails = {
  holderName: null,
  accountNumber: null,
  interbankNumber: null,
  phone: null,
};

export const HOLDER_NAME_MAX = 120;

/** A CCI in Peru is always 20 digits: bank, branch, account and two check digits. */
const INTERBANK_PATTERN = /^[0-9]{20}$/;
/** Every bank writes its numbers its own way: digits, with dashes only between them. */
const ACCOUNT_NUMBER_PATTERN = /^[0-9]+(-[0-9]+)*$/;
const ACCOUNT_NUMBER_DIGITS = { min: 6, max: 20 };
/** Yape and Plin only work with a Peruvian mobile: nine digits starting with 9. */
const PHONE_PATTERN = /^9[0-9]{8}$/;
/** Pasted from a contact card, a phone comes as +51 987 654 321. */
const COUNTRY_PREFIX = /^51(9[0-9]{8})$/;

/** Dashes that look like one but are not: the en dash, the non-breaking hyphen, the minus sign. */
const DASH_LOOKALIKES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

// ------------------------------------------------------- what is saved

/**
 * What a paste brings that nobody sees. The phone's contacts and WhatsApp wrap
 * a number in direction marks, and a bank's PDF writes its dashes as en
 * dashes: the number looks right and would not pass. NFKC also turns
 * full-width digits into plain ones.
 */
function cleanPaste(text: string): string {
  return text.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(DASH_LOOKALIKES, '-');
}

/** Bank apps show the CCI as 002-191-… or in blocks with spaces: it is saved as its 20 digits. */
export function normalizeInterbank(text: string): string {
  return cleanPaste(text).replace(/[\s-]/g, '');
}

/** Spaces, dashes, parentheses and the +51 go: what remains is the nine digits. */
export function normalizePhone(text: string): string {
  const digits = cleanPaste(text).replace(/[\s\-()+.]/g, '');
  return COUNTRY_PREFIX.exec(digits)?.[1] ?? digits;
}

/** The account number keeps its dashes, the way the bank gives it; a space counts as one. */
export function normalizeAccountNumber(text: string): string {
  return cleanPaste(text).trim().replace(/[\s-]+/g, '-');
}

/**
 * The details as they are saved: cleaned, and only those that make sense for
 * the kind. Switching a bank to a cash box drops its numbers instead of
 * leaving them where nothing shows them.
 */
export function paymentDetailsFor(kind: AccountKind, typed: Record<PaymentDetail, string>): PaymentDetails {
  const shown = PAYMENT_DETAILS_BY_KIND[kind];
  const keep = (detail: PaymentDetail, value: string) => (shown.includes(detail) && value !== '' ? value : null);
  return {
    holderName: keep('holderName', typed.holderName.trim()),
    accountNumber: keep('accountNumber', normalizeAccountNumber(typed.accountNumber)),
    interbankNumber: keep('interbankNumber', normalizeInterbank(typed.interbankNumber)),
    phone: keep('phone', normalizePhone(typed.phone)),
  };
}

// ---------------------------------------------------------- validators

/** Judged on what would be saved, so pasting it with dashes or spaces is fine. */
export function interbankFormat(control: AbstractControl): ValidationErrors | null {
  const value = normalizeInterbank((control.value as string | null) ?? '');
  return value === '' || INTERBANK_PATTERN.test(value) ? null : { interbank: true };
}

export function accountNumberFormat(control: AbstractControl): ValidationErrors | null {
  const value = normalizeAccountNumber((control.value as string | null) ?? '');
  if (value === '') return null;
  const digits = value.replace(/-/g, '').length;
  const fits = ACCOUNT_NUMBER_PATTERN.test(value) && digits >= ACCOUNT_NUMBER_DIGITS.min && digits <= ACCOUNT_NUMBER_DIGITS.max;
  return fits ? null : { accountNumber: true };
}

export function phoneFormat(control: AbstractControl): ValidationErrors | null {
  const value = normalizePhone((control.value as string | null) ?? '');
  return value === '' || PHONE_PATTERN.test(value) ? null : { phone: true };
}

export const PAYMENT_DETAIL_MESSAGES = {
  holderName: { maxlength: `Hasta ${HOLDER_NAME_MAX} caracteres.` },
  accountNumber: {
    accountNumber: `Solo dígitos, con guiones si el banco los usa: entre ${ACCOUNT_NUMBER_DIGITS.min} y ${ACCOUNT_NUMBER_DIGITS.max}. Ej.: 191-12345678-0-12.`,
  },
  interbankNumber: { interbank: 'El CCI tiene 20 dígitos. Puedes pegarlo con guiones o espacios.' },
  phone: { phone: 'Un celular del Perú: 9 dígitos que empiezan con 9. Ej.: 987 654 321.' },
} as const;

// ----------------------------------------------------------- display

/** 002-191-112345678012-55: bank, branch, account and check digits, the way banks print it. */
export function formatInterbank(cci: string): string {
  return INTERBANK_PATTERN.test(cci) ? `${cci.slice(0, 3)}-${cci.slice(3, 6)}-${cci.slice(6, 18)}-${cci.slice(18)}` : cci;
}

/** 987 654 321, the way a phone is read aloud here. */
export function formatPhone(phone: string): string {
  return PHONE_PATTERN.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

/** One detail as Cuentas shows it. `whole`: a number, which must not be cut at its dashes. */
export interface PaymentDetailLine {
  label: string;
  value: string;
  whole: boolean;
}

/**
 * What Cuentas shows, one detail per line and in a fixed order: number, CCI,
 * phone and holder. Empty when nothing was written.
 */
export function paymentDetailsLines(details: PaymentDetails): PaymentDetailLine[] {
  const lines: (PaymentDetailLine | null)[] = [
    details.accountNumber ? { label: 'N.º', value: details.accountNumber, whole: true } : null,
    details.interbankNumber ? { label: 'CCI', value: formatInterbank(details.interbankNumber), whole: true } : null,
    details.phone ? { label: 'Celular', value: formatPhone(details.phone), whole: true } : null,
    details.holderName ? { label: 'A nombre de', value: details.holderName, whole: false } : null,
  ];
  return lines.filter((line): line is PaymentDetailLine => line !== null);
}
