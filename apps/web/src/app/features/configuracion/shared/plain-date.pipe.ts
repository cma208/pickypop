import { Pipe, type PipeTransform } from '@angular/core';

const PLAIN_DATE = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Formats a date-only column ("2026-09-01"). The shared `fecha` pipe parses
 * such values as UTC midnight and, in Lima, shows the previous day; this one
 * keeps the calendar day exactly as stored.
 */
@Pipe({ name: 'fechaDia' })
export class PlainDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? '—' : PLAIN_DATE.format(parsed);
  }
}
