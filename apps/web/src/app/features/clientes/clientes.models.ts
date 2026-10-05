import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { Database } from '../../core/database.types';

export type CustomerKind = Database['public']['Enums']['customer_kind'];
export type DocType = Database['public']['Enums']['customer_doc_type'];

export interface CustomerRecord {
  id: string;
  kind: CustomerKind;
  name: string;
  docType: DocType;
  docNumber: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  orderCount: number;
}

export interface CustomerDraft {
  kind: CustomerKind;
  name: string;
  docType: DocType;
  docNumber: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
}

export const KIND_LABELS: Record<CustomerKind, string> = {
  person: 'Persona',
  company: 'Empresa',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  none: 'Sin documento',
  dni: 'DNI',
  ruc: 'RUC',
  ce: 'Carné de extranjería',
};

const DNI_PATTERN = /^[0-9]{8}$/;
const RUC_PATTERN = /^[0-9]{11}$/;
const CE_PATTERN = /^[A-Za-z0-9]{9,12}$/;

/** What the person should type for each document type, shown under the field. */
export const DOC_FORMAT_HINTS: Record<DocType, string> = {
  none: 'No hace falta número de documento.',
  dni: 'El DNI tiene exactamente 8 dígitos, sin espacios ni letras. Ej.: 12345678.',
  ruc: 'El RUC tiene exactamente 11 dígitos, sin espacios ni letras. Ej.: 20123456789.',
  ce: 'El carné de extranjería tiene entre 9 y 12 letras o números.',
};

/** Checks the document number against the same rules the database enforces. */
export function documentError(docType: DocType, docNumber: string): string | null {
  const value = docNumber.trim();
  if (docType === 'none') return null;
  if (value === '') return 'Indica el número de documento.';

  const pattern = { dni: DNI_PATTERN, ruc: RUC_PATTERN, ce: CE_PATTERN }[docType];
  return pattern.test(value) ? null : DOC_FORMAT_HINTS[docType];
}

/** Group validator for the customer form: the number must match its type. */
export function documentValidator(group: AbstractControl): ValidationErrors | null {
  const docType = group.get('docType')?.value as DocType;
  const docNumber = (group.get('docNumber')?.value as string) ?? '';
  const message = documentError(docType, docNumber);

  return message ? { document: message } : null;
}
