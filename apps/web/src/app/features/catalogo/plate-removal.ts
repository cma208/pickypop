import type { PlateOutput, RecipePlate } from './catalogo.models';
import { joinWithAnd } from './catalogo.util';

type PlateOutputs = Pick<RecipePlate, 'id' | 'outputs'>;

/**
 * The parts that this plate prints and no other plate of the recipe does.
 * Removing the plate leaves them in the recipe with nothing to print them.
 */
export function partsOnlyThisPlateMakes(plate: PlateOutputs, plates: readonly PlateOutputs[]): string[] {
  const elsewhere = new Set(
    plates.filter((other) => other.id !== plate.id).flatMap((other) => other.outputs.map((output) => output.inventoryItemId)),
  );
  return [...new Set(plate.outputs.map((output) => output.inventoryItemId))].filter((id) => !elsewhere.has(id));
}

/**
 * Whether no other output of the recipe prints this output's part, so
 * removing it, or changing it for another part, leaves that part in the
 * recipe with nothing to print it.
 */
export function isOnlySourceOf(output: Pick<PlateOutput, 'id' | 'inventoryItemId'>, plates: readonly PlateOutputs[]): boolean {
  return !plates.some((plate) =>
    plate.outputs.some((other) => other.id !== output.id && other.inventoryItemId === output.inventoryItemId),
  );
}

/**
 * What «✕» asks before removing a plate. It used to ask only about the plate
 * and its filaments, and the cost of the product dropped without a word when
 * the plate was the only one that printed a part (T2-07).
 */
export function removePlateQuestion(plate: Pick<RecipePlate, 'plateIndex' | 'label'>, orphanNames: readonly string[]): string {
  const name = `la placa ${plate.plateIndex}${plate.label ? ` (${plate.label})` : ''}`;
  const question = `¿Quitar ${name} y sus filamentos?`;
  if (orphanNames.length === 0) return question;

  const names = joinWithAnd(orphanNames.map((part) => `«${part}»`));
  return `${question}\n\nEs la única placa de la receta que imprime ${names}. ${orphanConsequences(orphanNames.length === 1)}`;
}

/** What «✕» on the only output that prints a part asks first: the same as for a plate (T2-07). */
export function removeOutputQuestion(partName: string): string {
  return (
    `¿Quitar «${partName}» de esta placa?\n\n` +
    `Es la única placa de la receta que la imprime. ${orphanConsequences(true)}`
  );
}

/** Changing the only output of a part for another one leaves the first part without a plate, too. */
export function swapOutputQuestion(partName: string, newPartName: string): string {
  return (
    `¿Cambiar «${partName}» por «${newPartName}» en esta placa?\n\n` +
    `Es la única placa de la receta que imprime «${partName}». ${orphanConsequences(true)}`
  );
}

function orphanConsequences(one: boolean): string {
  return (
    `La receta ${one ? 'la' : 'las'} sigue pidiendo, pero ninguna de sus placas ${one ? 'la' : 'las'} va a imprimir: ` +
    `su costo ya no sale de las corridas de esta receta y el plan no sabrá con qué placa ${one ? 'hacerla' : 'hacerlas'}. ` +
    `Si el producto ya no ${one ? 'la' : 'las'} lleva, ${one ? 'quítala' : 'quítalas'} también de «Piezas impresas por unidad».`
  );
}
