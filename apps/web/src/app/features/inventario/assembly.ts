import type { SupplyCostSource } from '../cotizador/supply-costs';
import type { AssemblyComponent, AssemblyOption } from './inventario.data';
import { quantity, type ItemKind } from './inventario.format';

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

/** Where a bought component is listed, which is where its cost is given. */
export interface CostPage {
  route: string;
  /** The name of that page in the menu. */
  label: string;
}

/**
 * Only what is bought has a cost to give. A printed part costs what printing
 * it cost (`part_stock`), and a finished product what assembling it cost:
 * `inventory_item_costs` says «unknown» for both, and neither has a page
 * where a cost is typed, so warning about them would only be noise.
 */
const COST_PAGES: Partial<Record<ItemKind, CostPage>> = {
  supply: { route: '/inventario/insumos', label: 'Insumos' },
  spare_part: { route: '/inventario/insumos', label: 'Insumos' },
  packaging: { route: '/inventario/empaque', label: 'Empaque' },
};

export function costPageOf(kind: ItemKind): CostPage | null {
  return COST_PAGES[kind] ?? null;
}

/** The components whose cost comes from `inventory_item_costs`: the bought ones. */
export function boughtComponentIds(components: readonly AssemblyComponent[]): string[] {
  return components.filter((component) => costPageOf(component.kind) !== null).map((component) => component.inventoryItemId);
}

export interface UncostedComponent {
  component: AssemblyComponent;
  page: CostPage;
}

/**
 * The bought components nobody has given a cost to. `assemble_product` takes
 * them out at zero, so the product enters the shelf worth less than it cost,
 * and every sale of it shows a profit that is not there. It is said, not
 * blocked (the owner's decision): an order due today still goes out. But the
 * cost given afterwards does not reach what was already assembled, which
 * keeps the value it entered with, so it is said before.
 *
 * A component missing from `sources` has not been read yet: that is not
 * "without cost", and saying so would flash a warning that is not true.
 */
export function uncostedComponents(
  components: readonly AssemblyComponent[],
  sources: ReadonlyMap<string, SupplyCostSource>,
): UncostedComponent[] {
  return components.flatMap((component) => {
    const page = costPageOf(component.kind);
    return page && sources.get(component.inventoryItemId) === 'unknown' ? [{ component, page }] : [];
  });
}
