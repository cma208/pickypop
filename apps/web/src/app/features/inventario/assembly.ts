import type { AssemblyComponent, AssemblyOption } from './inventario.data';
import { quantity } from './inventario.format';

export interface AssemblyLeaving {
  component: AssemblyComponent;
  /** «2 unidades», «66 g»: what leaves the shelf, in the component's own unit. */
  amount: string;
}

export interface AssemblyOutcome {
  leaving: AssemblyLeaving[];
  /** «1 unidad de Calavera dulcera (Con dulces surtidos)». */
  entering: string;
}

/**
 * What «Sí, armar» moves, said before it moves it (E3-04). Assembling is as
 * final as closing a print or delivering an order: the components leave the
 * shelf and the only way back is a shelf count, which books them as a loss.
 * So, like those two, it asks first and says what goes out and what comes in.
 */
export function assemblyOutcome(
  units: number,
  product: Pick<AssemblyOption, 'productName' | 'variantName'>,
  components: readonly AssemblyComponent[],
): AssemblyOutcome {
  const howMany = units === 1 ? '1 unidad' : `${units} unidades`;
  return {
    leaving: components.map((component) => ({
      component,
      amount: quantity(component.quantityPerUnit * units, component.unit),
    })),
    entering: `${howMany} de ${product.productName} (${product.variantName})`,
  };
}
