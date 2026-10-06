-- Una pieza impresa no tiene precio de compra, porque nadie la compra.
--
-- `part_stock` tomaba el costo de `inventory_item_costs`, que lo deriva de la
-- última línea de compra. Para un dulce eso es correcto; para una tapa no hay
-- ninguna, así que toda pieza salía con costo desconocido y la pantalla decía
-- "sin costo" sobre inventario que sí costó producirlo.
--
-- El costo de una pieza es lo que costó imprimirla, y como salen de corridas
-- distintas a precios distintos, se promedia ponderando por cantidad: el mismo
-- criterio `weighted_avg` que el taller ya usa para el filamento. Solo cuentan
-- los movimientos de entrada; los consumos no tienen costo propio que aportar.

create or replace view public.part_stock with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.min_stock,
  coalesce(b.on_hand, 0) as on_hand,
  coalesce(b.on_hand, 0) < i.min_stock as below_minimum,
  coalesce(made.cost_per_unit, i.standard_cost) as cost_per_unit,
  case
    when made.cost_per_unit is not null then 'produced'
    when i.standard_cost is not null then 'standard'
    else 'unknown'
  end as cost_source
from public.inventory_items i
left join public.inventory_balances b on b.inventory_item_id = i.id
left join lateral (
  select round(sum(m.quantity * m.unit_cost) / nullif(sum(m.quantity), 0), 6) as cost_per_unit
  from public.stock_movements m
  where m.inventory_item_id = i.id
    and m.quantity > 0
    and m.unit_cost is not null
) as made on true
where i.kind = 'part' and i.active;

comment on view public.part_stock is
  'Las piezas impresas que hay en el estante. El costo es el promedio ponderado de lo que costó producirlas.';
