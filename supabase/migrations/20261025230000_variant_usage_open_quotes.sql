-- Antes de desactivar una variante, la pantalla sabe qué cotizaciones suyas
-- siguen abiertas.
--
-- Desactivar es lo que se ofrece en lugar de borrar una variante usada
-- (20261025100000). Una cotización en borrador o enviada se sigue pudiendo
-- aceptar con el precio que tiene, porque sus líneas lo guardan. Pero el
-- cotizador solo ofrece variantes activas: una versión nueva de esa
-- cotización ya no la encuentra en el catálogo y la vuelve a cotizar por
-- costo, como un trabajo a medida. La pantalla decía que lo cotizado conservaba
-- su producto y no avisaba de eso.
--
-- `variant_usage` cuenta ahora, además, las cotizaciones abiertas (borrador o
-- enviada), una por número aunque tenga varias versiones. Las claves de antes
-- no cambian.

create or replace function app.variant_usage(p_variant_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'quotes', (select count(distinct ql.quote_id) from public.quote_lines ql where ql.variant_id = p_variant_id),
    'orders', (select count(distinct ol.order_id) from public.order_lines ol where ol.variant_id = p_variant_id),
    'shelf', (select count(*) from public.inventory_items i where i.product_variant_id = p_variant_id),
    'open_quotes', (
      select count(distinct q.number)
      from public.quote_lines ql
      join public.quotes q on q.id = ql.quote_id
      where ql.variant_id = p_variant_id
        and q.status in ('draft', 'sent')
    ),
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
  'Dónde se usa una variante: cotizaciones y pedidos que la tienen en una línea (y cuántas de esas cotizaciones siguen en borrador o enviadas, y cuántos de esos pedidos siguen sin entregar), si su producto armado es un artículo del inventario y cuántas unidades armadas hay en el estante. Una variante usada no se borra: se desactiva.';
