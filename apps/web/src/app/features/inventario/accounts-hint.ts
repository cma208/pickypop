/**
 * What to say when there is no active account to pay from. Only the owner
 * creates accounts (ADR-025): the operator is told whom to ask instead of
 * being sent to a screen that would refuse.
 */
export function noAccountsText(isOwner: boolean): string {
  return isOwner
    ? 'No hay cuentas activas desde donde pagar. Crea una en Finanzas › Cuentas.'
    : 'No hay cuentas activas desde donde pagar. Solo el dueño crea cuentas: pídele que cree una en Finanzas › Cuentas.';
}
