import { ITEM_KINDS, type ItemKind } from './inventario.format';

/** How an article of each kind is counted in a sentence: «1 insumo», «2 empaques». */
const COUNT_WORDS: Record<ItemKind, readonly [one: string, many: string]> = {
  supply: ['insumo', 'insumos'],
  packaging: ['empaque', 'empaques'],
  spare_part: ['repuesto', 'repuestos'],
  part: ['pieza', 'piezas'],
  finished_good: ['producto', 'productos'],
};

/** «a», «a y b», «a, b y c». */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * What a purchase puts on the shelf, for the confirmation before saving it:
 * «Se crearán 3 rollos con sus movimientos de entrada, y entran 2 insumos y 1
 * empaque.» It used to be one fixed sentence, which promised «0 rollos» for a
 * purchase of sweets and bags and called the bag an «insumo» (E1-05). Each
 * article line counts once, under its own kind. Empty when nothing comes in.
 */
export function purchaseEntries(rolls: number, itemKinds: readonly ItemKind[]): string {
  const counted = ITEM_KINDS.map((kind) => ({ kind, count: itemKinds.filter((each) => each === kind).length })).filter(
    ({ count }) => count > 0,
  );
  const items = listOf(counted.map(({ kind, count }) => `${count} ${COUNT_WORDS[kind][count === 1 ? 0 : 1]}`));
  const verb = itemKinds.length === 1 ? 'entra' : 'entran';

  const rollText =
    rolls === 1 ? 'Se creará 1 rollo con su movimiento de entrada' : `Se crearán ${rolls} rollos con sus movimientos de entrada`;

  if (rolls > 0 && items) return `${rollText}, y ${verb} ${items}.`;
  if (rolls > 0) return `${rollText}.`;
  if (items) return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${items}.`;
  return '';
}
