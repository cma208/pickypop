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
 * The parts only this plate prints, split by whether the recipe asks for
 * them. A plate may also print parts for another product, which someone took
 * off this recipe on purpose: losing the plate costs this recipe nothing for
 * those, and saying it would was false.
 */
export interface SoleParts {
  /** In «Piezas impresas por unidad»: left in the recipe with no plate. */
  asked: string[];
  /** Not in the recipe: they only stop coming out of its runs. */
  notAsked: string[];
}

/** Splits the parts only this plate prints into the ones the recipe asks for and the rest. */
export function splitByRecipe(partIds: readonly string[], askedIds: ReadonlySet<string>): { asked: string[]; notAsked: string[] } {
  return {
    asked: partIds.filter((id) => askedIds.has(id)),
    notAsked: partIds.filter((id) => !askedIds.has(id)),
  };
}

/**
 * What «✕» asks before removing a plate. It used to ask only about the plate
 * and its filaments, and the cost of the product dropped without a word when
 * the plate was the only one that printed a part (T2-07).
 */
export function removePlateQuestion(plate: Pick<RecipePlate, 'plateIndex' | 'label'>, sole: SoleParts): string {
  const name = `la placa ${plate.plateIndex}${plate.label ? ` (${plate.label})` : ''}`;
  const question = `¿Quitar ${name} y sus filamentos?`;
  const { asked, notAsked } = sole;
  if (asked.length === 0 && notAsked.length === 0) return question;

  const said: string[] = [];
  if (asked.length > 0) {
    said.push(`Es la única placa de la receta que imprime ${quoted(asked)}. ${orphanConsequences(asked.length === 1, true)}`);
  }
  if (notAsked.length > 0) {
    const opening = asked.length > 0 ? 'También es la única que imprime' : 'Es la única placa de la receta que imprime';
    said.push(`${opening} ${quoted(notAsked)}, que la receta no pide: ${stopsComingOut(notAsked.length === 1)}`);
  }
  return `${question}\n\n${said.join('\n\n')}`;
}

/**
 * What «✕» on the only output that prints a part asks first: the same as for
 * a plate (T2-07). Only the owner removes outputs, so the advice is for them.
 */
export function removeOutputQuestion(partName: string, asked: boolean): string {
  const question = `¿Quitar «${partName}» de esta placa?\n\n`;
  return asked
    ? `${question}Es la única placa de la receta que la imprime. ${orphanConsequences(true, true)}`
    : `${question}Es la única placa de la receta que la imprime, y la receta no la pide: ${stopsComingOut(true)}`;
}

/**
 * Changing the only output of a part for another one leaves the first part
 * without a plate, too. The operator may change outputs but not take a part
 * off the recipe, so they are told to ask the owner instead.
 */
export function swapOutputQuestion(
  partName: string,
  newPartName: string,
  who: { asked: boolean; owner: boolean },
): string {
  const question = `¿Cambiar «${partName}» por «${newPartName}» en esta placa?\n\n`;
  return who.asked
    ? `${question}Es la única placa de la receta que imprime «${partName}». ${orphanConsequences(true, who.owner)}`
    : `${question}Es la única placa de la receta que imprime «${partName}», y la receta no la pide: ${stopsComingOut(true)}`;
}

function quoted(names: readonly string[]): string {
  return joinWithAnd(names.map((part) => `«${part}»`));
}

function stopsComingOut(one: boolean): string {
  return one ? 'ya no saldrá de sus corridas.' : 'ya no saldrán de sus corridas.';
}

function orphanConsequences(one: boolean, owner: boolean): string {
  const it = one ? 'la' : 'las';
  const advice = owner
    ? `${one ? 'quítala' : 'quítalas'} también de «Piezas impresas por unidad».`
    : `pídele al dueño que ${one ? 'la quite' : 'las quite'} de «Piezas impresas por unidad».`;
  return (
    `La receta ${it} sigue pidiendo, pero ninguna de sus placas ${it} va a imprimir: ` +
    `su costo ya no sale de las corridas de esta receta y el plan no sabrá con qué placa ${one ? 'hacerla' : 'hacerlas'}. ` +
    `Si el producto ya no ${it} lleva, ${advice}`
  );
}
