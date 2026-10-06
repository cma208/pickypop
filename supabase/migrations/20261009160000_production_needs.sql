-- Lo que hay que imprimir para no quedar mal.
--
-- El dueño lo llamó "la cuota que me pide ventas": de los pedidos que ya están
-- comprometidos y todavía no se entregaron, cuántas unidades faltan después de
-- descontar lo que ya está armado en el estante. Sin esto, la cola de
-- impresión dice qué se está haciendo pero no qué habría que estar haciendo.
--
-- Es la misma pregunta que M5 responde del lado de ventas —cuánto puedo
-- prometer—, mirada desde el taller. Cuando M5 llegue con la explosión de la
-- receta, esta vista crece ahí y no en otro sitio.
--
-- Deliberadamente **no** descuenta las piezas sueltas ni lo que ya está en la
-- cola: la primera cuenta necesita explotar la receta y la segunda necesita
-- saber qué pieza produce cada trabajo. Mientras tanto esto sobreestima, que
-- del lado de un pedido comprometido es el error que no cuesta caro.

create view public.production_needs as
select
  o.workspace_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(v.image_path, p.image_path) as image_path,
  sum(ol.quantity) as committed_units,
  coalesce(max(stock.on_hand), 0) as assembled_units,
  greatest(sum(ol.quantity) - coalesce(max(stock.on_hand), 0), 0) as missing_units,
  min(o.due_date) as first_due_date,
  count(distinct o.id) as order_count
from public.order_lines ol
join public.orders o on o.id = ol.order_id
join public.product_variants v on v.id = ol.variant_id
join public.catalog_products p on p.id = v.product_id
left join lateral (
  select b.on_hand
  from public.inventory_items i
  join public.inventory_balances b on b.inventory_item_id = i.id
  where i.product_variant_id = v.id and i.kind = 'finished_good'
  limit 1
) stock on true
where o.status in ('confirmed', 'queued', 'printing', 'post_processing')
group by o.workspace_id, v.id, p.name, v.name, coalesce(v.image_path, p.image_path)
having greatest(sum(ol.quantity) - coalesce(max(stock.on_hand), 0), 0) > 0;

comment on view public.production_needs is
  'Unidades comprometidas en pedidos sin entregar, menos lo armado en el estante. Sobreestima a propósito: todavía no descuenta piezas sueltas ni trabajos en cola.';
