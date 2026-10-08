import { money, percent } from '../../core/format';
import {
  VALUATION_HELP,
  VALUATION_LABELS,
  type CostProfileRecord,
  type ProfileLine,
} from './configuracion.models';

/** Every value of a cost profile, with a one-line explanation for each. */
export function describeProfile(profile: CostProfileRecord): ProfileLine[] {
  return [
    {
      label: 'Merma de material',
      value: percent(profile.materialWasteRate),
      explanation: 'Material extra por cebado y restos del rollo; la purga ya viene en los gramos del laminado.',
    },
    {
      label: 'Tasa de fallo',
      value: percent(profile.failureRate),
      explanation: 'Parte de las impresiones que se pierde; su costo se reparte entre las que salen bien.',
    },
    {
      label: 'Hora de trabajo',
      value: money(profile.laborRatePerHour),
      explanation: 'Lo que cuesta una hora de tu tiempo en preparación y postproceso.',
    },
    {
      label: 'Tarifa eléctrica',
      value: `${money(profile.energyRatePerKwh, 4)} por kWh`,
      explanation: 'Precio de la luz que se usa para costear la energía de cada impresión.',
    },
    {
      label: 'Margen objetivo',
      value: percent(profile.targetMargin),
      explanation: 'Ganancia que quieres sobre el precio de venta, no sobre el costo.',
    },
    {
      label: 'Precio mínimo',
      value: profile.minOrderPrice > 0 ? money(profile.minOrderPrice) : 'Sin mínimo',
      explanation: 'Ningún pedido se cotiza por debajo de este monto.',
    },
    {
      label: 'Redondeo',
      value: profile.roundingStep > 0 ? `Múltiplos de ${money(profile.roundingStep)}` : 'Sin redondeo',
      explanation: 'El precio final sube hasta el siguiente múltiplo de este valor.',
    },
    {
      label: 'IGV',
      value: percent(profile.igvRate),
      explanation: 'Solo se desglosa si el taller está en RER, RMT o Régimen General.',
    },
    {
      label: 'Valorización del material',
      value: VALUATION_LABELS[profile.materialValuation],
      explanation: VALUATION_HELP[profile.materialValuation],
    },
  ];
}

/**
 * The profile in force on a given day: the newest version that has already
 * started. `profiles` may come in any order.
 */
export function pickCurrent(profiles: CostProfileRecord[], today: string): CostProfileRecord | null {
  return (
    [...profiles]
      .filter((profile) => profile.validFrom <= today)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null
  );
}

export type ProfileState = 'current' | 'scheduled' | 'past';

/**
 * Where a version stands today. Only a scheduled one may still be corrected
 * or taken back: nothing has been priced with it yet. The database applies the
 * same rule with the workshop's day.
 */
export function profileState(
  profile: CostProfileRecord,
  current: CostProfileRecord | null,
  today: string,
): ProfileState {
  if (profile.id === current?.id) return 'current';
  return profile.validFrom > today ? 'scheduled' : 'past';
}
