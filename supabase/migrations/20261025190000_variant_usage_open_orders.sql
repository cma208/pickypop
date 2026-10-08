-- Antes de desactivar una variante, la pantalla sabe qué falta entregar de ella.
--
-- Una variante usada en un documento no se borra: se desactiva (20261025100000).
-- La pantalla decía que eso no le cambiaba nada a lo vendido, sin mirar si
-- quedaba algo por entregar. Pero una variante desactivada sale de Armar y del
-- conteo del estante (`assembly_options` y `shelf_count_items` filtran
-- `v.active`): sus pedidos sin entregar ya no se podían armar, y las unidades
-- armadas que quedaban en el estante ya no se contaban.
--
-- `variant_usage` dice ahora, además, cuántos pedidos suyos siguen abiertos y
-- cuántas unidades armadas hay en el estante, para que la pantalla lo diga
-- antes de desactivarla. Las claves de antes no cambian: el disparador que
-- impide borrar una variante usada las sigue leyendo igual.

create or replace function app.variant_usage(p_variant_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'quotes', (select count(distinct ql.quote_id) from public.quote_lines ql where ql.variant_id = p_variant_id),
    'orders', (select count(distinct ol.order_id) from public.order_lines ol where ol.variant_id = p_variant_id),
    'shelf', (select count(*) from public.inventory_items i where i.product_variant_id = p_variant_id),
    'open_orders', (
      select count(distinct ol.order_id)
      from public.order_lines ol
      join public.orders o on o.id = ol.order_id
      where ol.variant_id = p_variant_id
        and o.status not in ('delivered', 'closed', 'cancelled')
    ),
    'on_hand', (
      select coalesce(sum(b.on_hand), 0)
      from public.inventory_items i
      join public.inventory_balances b on b.inventory_item_id = i.id
      where i.product_variant_id = p_variant_id
        and i.kind = 'finished_good'
    )
  );
$$;

comment on function app.variant_usage(uuid) is
  'Dónde se usa una variante: cotizaciones y pedidos que la tienen en una línea (y cuántos de esos pedidos siguen sin entregar), si su producto armado es un artículo del inventario y cuántas unidades armadas hay en el estante. Una variante usada no se borra: se desactiva.';
