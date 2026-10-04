/** Formatting helpers. The interface is in Spanish for Peru; the code is not. */

const SOLES = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

export function money(amount: number | string | null | undefined, fractionDigits = 2): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  if (fractionDigits === 2) return SOLES.format(value);

  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function grams(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';

  return amount >= 1000
    ? `${NUMBER.format(amount / 1000)} kg`
    : `${NUMBER.format(amount)} g`;
}

/** Seconds as "1 h 23 min", the way a print time reads out loud. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.round(Number(seconds) / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);

  return Number.isNaN(parsed.getTime()) ? '—' : DATE.format(parsed);
}

export function percent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—';
  return `${NUMBER.format(Number(fraction) * 100)} %`;
}
