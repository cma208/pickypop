/**
 * Lo que sale de una placa al estante, y cómo se dice.
 *
 * Una placa puede producir varias piezas a la vez —siete tapas y siete
 * cuerpos—, y en una corrida real no tienen por qué salir todas: se despega
 * un cuerpo y salen siete tapas pero seis cuerpos. Por eso el cierre pregunta
 * pieza por pieza, y por eso nada de esto suma piezas distintas en un solo
 * número: "13 piezas" no le dice a nadie qué hay en el estante.
 */

/** Una pieza que la placa produce, con lo necesario para reconocerla. */
export interface PlatePart {
  inventoryItemId: string;
  name: string;
  imagePath: string | null;
  /** Cuántas salen de una corrida completa. */
  unitsPerRun: number;
}

/** Una pieza y cuántas, sea lo planeado o lo que salió. */
export interface PartCount {
  inventoryItemId: string;
  name: string;
  imagePath: string | null;
  units: number;
}

/**
 * Lo que espera `complete_print_job` en `p_outputs`. Es un `type` y no una
 * `interface` porque así encaja en el `Json` del cliente tipado.
 */
export type OutputArgument = {
  inventory_item_id: string;
  units: number;
};

/**
 * Lo que salió, para `complete_print_job`: **todas** las piezas de la placa,
 * cada una con lo que se contó.
 *
 * Una pieza sin conteo va con su rendimiento completo, que es lo mismo que la
 * base haría con ella; mandarla explícita deja el cierre escrito tal como se
 * mostró en la confirmación. Fuera de un cierre exitoso no se manda nada: una
 * impresión fallida o cancelada no produce piezas.
 */
export function outputsOf(
  parts: readonly PlatePart[],
  result: 'success' | 'failed' | 'cancelled',
  counted: ReadonlyMap<string, number | null>,
): OutputArgument[] | undefined {
  if (result !== 'success' || parts.length === 0) return undefined;
  return parts.map((part) => {
    const units = counted.get(part.inventoryItemId);
    return { inventory_item_id: part.inventoryItemId, units: units ?? part.unitsPerRun };
  });
}

/** Lo que una corrida completa pone en el estante. */
export function plannedCounts(parts: readonly PlatePart[]): PartCount[] {
  return parts.map(({ unitsPerRun, ...part }) => ({ ...part, units: unitsPerRun }));
}

/**
 * "7 Tapa calavera y 6 Cuerpo calavera". Las piezas en cero se callan, salvo
 * que todas lo estén: entonces lo que hay que decir es justamente que no salió
 * nada.
 */
export function describeCounts(counts: readonly Pick<PartCount, 'name' | 'units'>[]): string {
  const some = counts.filter((count) => count.units > 0);
  if (some.length === 0) return 'ninguna pieza';
  const items = some.map((count) => `${formatUnits(count.units)} ${count.name}`);
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Las piezas son enteras casi siempre; cuando no, se ven con lo justo. */
function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toLocaleString('es-PE', { maximumFractionDigits: 3 });
}
