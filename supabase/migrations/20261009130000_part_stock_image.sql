-- La pieza impresa también lleva su foto: en el estante hay cuatro tapas que
-- solo se distinguen por el tamaño, y el nombre escrito no las distingue.
drop view if exists public.part_stock;

create view public.part_stock as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.image_path,
  i.min_stock,
  coalesce(b.on_hand, 0::numeric) as on_hand,
  coalesce(b.on_hand, 0::numeric) < i.min_stock as below_minimum,
  coalesce(made.cost_per_unit, i.standard_cost) as cost_per_unit,
  case
    when made.cost_per_unit is not null then 'produced'
    when i.standard_cost is not null then 'standard'
    else 'unknown'
  end as cost_source
from public.inventory_items i
left join public.inventory_balances b on b.inventory_item_id = i.id
left join lateral (
  -- Una pieza no se compra nunca: su costo es el promedio ponderado de lo que
  -- costó imprimirla.
  select round(sum(m.quantity * m.unit_cost) / nullif(sum(m.quantity), 0), 6) as cost_per_unit
  from public.stock_movements m
  where m.inventory_item_id = i.id and m.quantity > 0 and m.unit_cost is not null
) made on true
where i.kind = 'part' and i.active;
