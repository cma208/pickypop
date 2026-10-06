import { Pipe, type PipeTransform } from '@angular/core';
import type { BadgeTone } from '../../ui';

/** Business timezone: days are cut at midnight in Lima, wherever the browser is. */
const TIME_ZONE = 'America/Lima';

export type SpoolStatus = 'sealed' | 'open' | 'in_use' | 'empty' | 'discarded';
export type MovementType =
  | 'purchase'
  | 'production'
  | 'consumption'
  | 'waste'
  | 'adjustment'
  | 'maintenance'
  | 'reservation'
  | 'release';
export type ItemKind = 'supply' | 'packaging' | 'spare_part' | 'finished_good' | 'part';

export const SPOOL_STATUS_LABELS: Record<SpoolStatus, string> = {
  sealed: 'Sellado',
  open: 'Abierto',
  in_use: 'En uso',
  empty: 'Agotado',
  discarded: 'Descartado',
};

export const SPOOL_STATUS_TONES: Record<SpoolStatus, BadgeTone> = {
  sealed: 'info',
  open: 'neutral',
  in_use: 'good',
  empty: 'warn',
  discarded: 'bad',
};

export const SPOOL_STATUSES = Object.keys(SPOOL_STATUS_LABELS) as SpoolStatus[];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  purchase: 'Compra',
  production: 'Producción',
  consumption: 'Consumo',
  waste: 'Merma',
  adjustment: 'Ajuste',
  maintenance: 'Mantenimiento',
  reservation: 'Reserva',
  release: 'Liberación de reserva',
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Compra',
  print_job: 'Impresión',
  maintenance_log: 'Mantenimiento',
  maintenance: 'Mantenimiento',
  assembly: 'Armado',
  order: 'Pedido',
  weighing: 'Pesaje',
  manual: 'Registro manual',
};

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  supply: 'Insumo',
  packaging: 'Empaque',
  // Lo que sale de una placa: no se compra, se imprime, y se consume al armar.
  part: 'Pieza impresa',
  spare_part: 'Repuesto',
  finished_good: 'Producto terminado',
};

export const ITEM_KINDS = Object.keys(ITEM_KIND_LABELS) as ItemKind[];

export function sourceLabel(sourceType: string | null): string {
  if (!sourceType) return 'Sin origen';
  return SOURCE_LABELS[sourceType] ?? sourceType;
}

const QUANTITY = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

/**
 * The unit as it reads after a number: "1 unidad" but "60 unidades". Only the
 * word the app writes itself is made plural; a unit somebody typed ("g",
 * "par", "caja") is left as they wrote it.
 */
export function unitFor(value: number, unit: string): string {
  return unit === 'unidad' && Math.abs(value) !== 1 ? 'unidades' : unit;
}

/** "+1000 g" / "−250 g": explicit sign so the kardex reads as additions and removals. */
export function signedQuantity(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${QUANTITY.format(Math.abs(value))} ${unitFor(value, unit)}`;
}

export function quantity(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return '—';
  return `${QUANTITY.format(value)} ${unitFor(value, unit)}`;
}

/** Today as YYYY-MM-DD in Lima. */
export function todayIso(): string {
  return dayKey(new Date().toISOString());
}

/** Calendar day of a timestamp in Lima, as YYYY-MM-DD. */
export function dayKey(timestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

export function timeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * A date column (no time) must not go through `new Date('2026-09-01')`: that
 * parses as UTC midnight and shows the previous day in Lima.
 */
function parsePlainDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function plainDate(isoDate: string | null | undefined): string {
  const parsed = isoDate ? parsePlainDate(isoDate) : null;
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

export function dayHeading(isoDay: string): string {
  const parsed = parsePlainDate(isoDay);
  if (!parsed) return isoDay;
  const text = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Start and end of a Lima calendar day as ISO instants (Lima has no DST: UTC-5). */
export function dayStart(isoDay: string): string {
  return `${isoDay}T00:00:00-05:00`;
}

export function dayEnd(isoDay: string): string {
  return `${isoDay}T23:59:59.999-05:00`;
}

@Pipe({ name: 'fechaDia' })
export class PlainDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return plainDate(value);
  }
}

@Pipe({ name: 'signed' })
export class SignedQuantityPipe implements PipeTransform {
  transform(value: number, unit: string): string {
    return signedQuantity(value, unit);
  }
}

@Pipe({ name: 'qty' })
export class QuantityPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: string): string {
    return quantity(value, unit);
  }
}

export const INVENTORY_PIPES = [PlainDatePipe, SignedQuantityPipe, QuantityPipe] as const;

/** Hex colour that is safe to put in a style attribute. */
export function safeHex(value: string | null | undefined): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}
