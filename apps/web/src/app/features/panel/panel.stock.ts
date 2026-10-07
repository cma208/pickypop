import type { Database } from '../../core/database.types';

type ItemKind = Database['public']['Enums']['inventory_item_kind'];

/** One row of `inventory_balances`, as PostgREST returns it: numerics may come as strings. */
export interface BalanceRow {
  inventory_item_id: string | null;
  kind: ItemKind | null;
  name: string | null;
  unit: string | null;
  min_stock: number | string | null;
  on_hand: number | string | null;
}

/** A piece or a supply under the minimum someone set for it. */
export interface LowItem {
  id: string;
  name: string;
  kind: ItemKind;
  onHand: number;
  minimum: number;
  /** "4 unidades", "300 g": the badge, as the filament card shows its grams. */
  onHandText: string;
  /** "Mínimo 7 unidades". */
  minimumText: string;
  /** Where it is managed: printed parts in Piezas, the rest in Insumos or Empaque. */
  route: string;
}

/** The card: what is low, and how many items have a minimum at all, so an empty list is not read as "all fine". */
export interface LowStock {
  items: LowItem[];
  watched: number;
}

const ROUTES: Record<Exclude<ItemKind, 'finished_good'>, string> = {
  part: '/inventario/piezas',
  supply: '/inventario/insumos',
  spare_part: '/inventario/insumos',
  packaging: '/inventario/empaque',
};

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

function quantity(value: number, unit: string): string {
  const plural = unit === 'unidad' && value !== 1 ? 'unidades' : unit;
  return `${NUMBER.format(value)} ${plural}`;
}

/**
 * What is under its minimum, emptiest first. Only what someone gave a
 * minimum to: a minimum of zero means "do not watch it". Finished products
 * are left out: what is missing of those is what the orders ask for, and the
 * plan already says it.
 */
export function belowMinimum(rows: readonly BalanceRow[]): LowItem[] {
  return rows
    .flatMap((row): LowItem[] => {
      const kind = row.kind;
      if (!row.inventory_item_id || kind === null || kind === 'finished_good') return [];
      const minimum = Number(row.min_stock ?? 0);
      const onHand = Number(row.on_hand ?? 0);
      if (!(minimum > 0) || onHand >= minimum) return [];
      const unit = row.unit ?? 'unidad';
      return [
        {
          id: row.inventory_item_id,
          name: row.name ?? 'Sin nombre',
          kind,
          onHand,
          minimum,
          onHandText: quantity(onHand, unit),
          minimumText: `Mínimo ${quantity(minimum, unit)}`,
          route: ROUTES[kind],
        },
      ];
    })
    .sort((a, b) => a.onHand / a.minimum - b.onHand / b.minimum || a.name.localeCompare(b.name, 'es'));
}
