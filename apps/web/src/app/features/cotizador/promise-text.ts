import type { PlanLinePlan, PlanShortage } from '@pickypop/domain';
import { dateTimeLong } from '../../core/dates';
import { lineSituation, readyText, shortageText } from '../../core/plan-format';
import type { Amount, HoldAhead, LinePromise, SalePromise } from './sale-promise';

/**
 * The words of "¿para cuándo?" at the moment of selling, built on the shared
 * vocabulary of `core/plan-format`: the same "en el estante · por armar · por
 * imprimir" and the same day and hour the queue and the order say.
 */

/** "hoy 22:52", "mañana 07:20", "el jueves 8 de octubre, 10:18", or "ya". */
export function readyPhrase(iso: string, now: string): string {
  const text = readyText(iso, now);
  return text === 'ya' || text.startsWith('hoy ') || text.startsWith('mañana ') ? text : `el ${text}`;
}

/** "Listo el viernes 9 de octubre, 17:36": what the seller tells the customer. */
export function readyLine(iso: string, now: string): string {
  const phrase = readyPhrase(iso, now);
  return phrase === 'ya' ? 'Listo ya' : `Listo ${phrase}`;
}

/**
 * "0 en el estante · 10 por imprimir". The shelf is said even when it gives
 * nothing: next to somebody's hold, "0 en el estante" is the answer the
 * seller was looking for. Made to order there is no shelf to speak of.
 */
export function saleSituation(
  plan: Pick<PlanLinePlan, 'quantity' | 'onShelf' | 'toAssemble' | 'toMake'>,
  madeToOrder = false,
): string {
  const situation = lineSituation(plan);
  if (madeToOrder || plan.onShelf > 0 || plan.quantity <= 0) return situation;
  return `0 en el estante · ${situation}`;
}

/**
 * "4 unidades de Botella impresa y 264 g de Dulces surtidos". The shared
 * wording for an amount of an article is the one for what is missing, so it
 * is borrowed instead of written twice.
 */
export function amountsText(amounts: readonly Amount[]): string {
  return shortageText(
    amounts.map((amount) => ({
      kind: 'item' as const,
      id: amount.itemId,
      label: amount.label,
      missing: amount.amount,
      unit: amount.unit,
    })),
  );
}

/**
 * "Separado para María Pérez (COT-0004) hasta el miércoles 7 de octubre,
 * 18:00: 4 unidades de Botella impresa y su turno en la impresora. Si no
 * confirma, se libera a esa hora."
 */
export function holdText(hold: HoldAhead): string {
  const who = hold.customerName ? `${hold.customerName} (${hold.number})` : hold.number;
  const kept = [...hold.amounts, ...hold.filaments].map((amount) => amountsText([amount]));
  if (hold.printing) kept.push('su turno en la impresora');
  const unless = hold.kind === 'quote' ? 'Si no confirma' : 'Si el pedido sigue en espera';
  return `Separado para ${who} hasta el ${dateTimeLong(hold.holdUntil)}: ${joinParts(kept)}. ${unless}, se libera a esa hora.`;
}

/** The other answer a hold leaves open: "Si no confirma, listo el viernes 9 de octubre, 17:36." */
export function withoutHoldsText(promise: Pick<LinePromise, 'holds' | 'readyWithoutHolds'>, now: string): string | null {
  if (promise.readyWithoutHolds === null) return null;
  const unless = promise.holds.length === 1 ? 'Si no confirma' : 'Si esos separos vencen sin confirmarse';
  return `${unless}, ${readyLine(promise.readyWithoutHolds, now).toLowerCase()}.`;
}

/** "a, b y c", as the shared wording joins what is missing. */
function joinParts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Why the shelf did not give it, when it was not a hold: somebody already bought it. */
export function forOrdersText(amounts: readonly Amount[]): string {
  return `Ya es de pedidos confirmados: ${amountsText(amounts)} del estante.`;
}

/** "Antes hay que comprar 660 g de Dulces surtidos." It informs; it never stops the sale. */
export function buyText(plan: Pick<PlanLinePlan, 'needsPurchase' | 'shortages'>): string | null {
  return plan.needsPurchase ? `Antes hay que comprar ${shortageText(plan.shortages)}.` : null;
}

/**
 * What the whole sale has to buy first. Two lines of the same bottle each
 * lack sweets; the customer's answer is one amount of sweets, not two.
 */
export function saleBuyText(promise: Pick<SalePromise, 'lines'>): string | null {
  const merged: PlanShortage[] = [];
  for (const shortage of promise.lines.flatMap((line) => line?.plan.shortages ?? [])) {
    const same = merged.find(
      (row) => row.kind === shortage.kind && row.id === shortage.id && (row.id !== null || row.label === shortage.label),
    );
    if (same) same.missing += shortage.missing;
    else merged.push({ ...shortage });
  }
  return buyText({ needsPurchase: merged.length > 0, shortages: merged });
}

export interface ReadyComparison {
  /** "Cuando se cotizó: el viernes 9 de octubre, 17:36". Null when it was not kept or it did not move. */
  quoted: string | null;
  today: string;
  /** Later than what the customer heard. */
  later: boolean;
}

/**
 * What the customer heard against what the plan says today. A day and an
 * hour on both sides, and the old one only when it is not what today says.
 */
export function compareReady(quotedReadyAt: string | null, todayReadyAt: string, now: string): ReadyComparison {
  const today = readyPhrase(todayReadyAt, now);
  if (quotedReadyAt === null) return { quoted: null, today, later: false };
  // What was promised is a fixed moment of the past: never "hoy" nor "ya".
  const quoted = dateTimeLong(quotedReadyAt);
  if (quoted === dateTimeLong(todayReadyAt)) return { quoted: null, today, later: false };
  return { quoted: `el ${quoted}`, today, later: Date.parse(todayReadyAt) > Date.parse(quotedReadyAt) };
}
