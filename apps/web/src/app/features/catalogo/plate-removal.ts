import type { RecipePlate } from './catalogo.models';
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
 * What «✕» asks before removing a plate. It used to ask only about the plate
 * and its filaments, and the cost of the product dropped without a word when
 * the plate was the only one that printed a part (T2-07).
 */
export function removePlateQuestion(plate: Pick<RecipePlate, 'plateIndex' | 'label'>, orphanNames: readonly string[]): string {
  const name = `la placa ${plate.plateIndex}${plate.label ? ` (${plate.label})` : ''}`;
  const question = `¿Quitar ${name} y sus filamentos?`;
  if (orphanNames.length === 0) return question;

  const names = joinWithAnd(orphanNames.map((part) => `«${part}»`));
  const one = orphanNames.length === 1;
  return (
    `${question}\n\n` +
    `Es la única placa de la receta que imprime ${names}. ` +
    `La receta ${one ? 'la' : 'las'} sigue pidiendo, pero ninguna de sus placas ${one ? 'la' : 'las'} va a imprimir: ` +
    `su costo ya no sale de las corridas de esta receta y el plan no sabrá con qué placa ${one ? 'hacerla' : 'hacerlas'}. ` +
    `Si el producto ya no ${one ? 'la' : 'las'} lleva, ${one ? 'quítala' : 'quítalas'} también de «Piezas impresas por unidad».`
  );
}
