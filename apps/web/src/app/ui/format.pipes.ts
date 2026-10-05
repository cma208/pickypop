import { Pipe, type PipeTransform } from '@angular/core';
import { date, duration, grams, money, percent } from '../core/format';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, fractionDigits = 2): string {
    return money(value, fractionDigits);
  }
}

@Pipe({ name: 'grams' })
export class GramsPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return grams(value);
  }
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return duration(value);
  }
}

@Pipe({ name: 'fecha' })
export class DatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return date(value);
  }
}

@Pipe({ name: 'percent1' })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return percent(value);
  }
}

export const FORMAT_PIPES = [MoneyPipe, GramsPipe, DurationPipe, DatePipe, PercentPipe] as const;
