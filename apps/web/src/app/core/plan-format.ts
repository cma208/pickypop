import type { PlanLinePlan, PlanShortage } from '@pickypop/domain';
import { dateTimeLong, localDate } from './dates';
import { grams } from './format';

/**
 * One vocabulary for the plan, so the seller, the queue and the shelf say the
 * same thing with the same words (docs/barrido/sintesis.md): a sale line is
 * "en el estante · por armar · por fabricar" (to print, or to buy first: the
 * owner's word was "fabricar"), an article is "Hay · Separado ·
 * Libre · Falta", and a moment is a day and an hour, never a duration.
 */

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** "4 en el estante · 2 por armar · 4 por fabricar"; the parts in zero are left out. */
export function lineSituation(line: Pick<PlanLinePlan, 'onShelf' | 'toAssemble' | 'toMake'>): string {
  const parts = [
    line.onShelf > 0 ? `${NUMBER.format(line.onShelf)} en el estante` : null,
    line.toAssemble > 0 ? `${NUMBER.format(line.toAssemble)} por armar` : null,
    line.toMake > 0 ? `${NUMBER.format(line.toMake)} por fabricar` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Nada que preparar';
}

/**
 * When something is ready, as a person says it: "ya", "hoy 22:52", "mañana
 * 07:20" or "jueves 8 de octubre, 10:18".
 */
export function readyText(iso: string, now: string, timeZone = 'America/Lima'): string {
  if (Date.parse(iso) <= Date.parse(now)) return 'ya';
  const day = localDate(iso, timeZone);
  const today = localDate(now, timeZone);
  const time = dateTimeLong(iso, timeZone).split(', ')[1] ?? '';
  if (day === today) return `hoy ${time}`;
  if (day === localDate(new Date(Date.parse(now) + 86_400_000), timeZone)) return `mañana ${time}`;
  return dateTimeLong(iso, timeZone);
}

/** "140 g de Dulces surtidos y 12.76 g de PLA Rosado". */
export function shortageText(shortages: readonly PlanShortage[]): string {
  const parts = shortages.map((shortage) => {
    // Grams read like everywhere else in the app: "2.38 kg", not "2384 g".
    if (shortage.unit === 'g') return `${grams(shortage.missing)} de ${shortage.label}`;
    const amount = NUMBER.format(shortage.missing);
    const unit = shortage.unit === 'unidad' ? (shortage.missing === 1 ? 'unidad' : 'unidades') : shortage.unit;
    return `${amount} ${unit} de ${shortage.label}`;
  });
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * The full answer to "¿para cuándo?" in one sentence: what there is, when it
 * would be ready, and what has to be bought first. It informs and never
 * blocks: the seller decides (decision of the owner).
 */
export function promiseSentence(line: PlanLinePlan, now: string): string {
  const situation = lineSituation(line);
  const ready = readyText(line.readyAt, now);
  const when = ready === 'ya' ? 'Está lista ya.' : `Estaría ${ready}.`;
  const risk =
    line.readyAtIfFailure !== line.readyAt ? ` Si falla una placa, ${readyText(line.readyAtIfFailure, now)}.` : '';
  const buy = line.needsPurchase ? ` Antes hay que comprar ${shortageText(line.shortages)}.` : '';
  return `${situation}. ${when}${risk}${buy}`;
}
