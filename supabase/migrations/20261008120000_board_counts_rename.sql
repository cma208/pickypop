-- Dos columnas de la vista se llamaban igual que dos tablas.
--
-- `opportunity_board` exponía las cuentas como `quotes` y `orders`. PostgREST
-- resuelve un nombre así en el `select` como **relación embebida**, no como
-- columna, así que el cliente tipado del navegador no lograba leerlas y el
-- build fallaba con un error que no decía nada de esto.
--
-- Son cuentas, no colecciones: `quote_count` y `order_count` dicen lo que son
-- y dejan de chocar. Todo lo demás de la vista queda idéntico.

-- `create or replace` no puede renombrar columnas de una vista: hay que
-- soltarla y volver a crearla.
drop view if exists public.opportunity_board;

create view public.opportunity_board with (security_invoker = true) as
select
  o.id as opportunity_id,
  o.workspace_id,
  o.title,
  o.stage,
  o.customer_id,
  c.name as customer_name,
  o.owner,
  m.display_name as owner_name,
  o.expected_close,
  o.note,
  o.blocked_reason,
  o.blocked_at,
  o.created_at,
  coalesce(q.quote_count, 0) as quote_count,
  coalesce(q.quoted_total, 0::numeric) as quoted_total,
  coalesce(d.order_count, 0) as order_count,
  coalesce(d.ordered_total, 0::numeric) as ordered_total,
  -- Mientras no haya pedido, el trato vale lo cotizado; en cuanto lo hay,
  -- vale lo que de verdad se comprometió.
  case
    when coalesce(d.order_count, 0) > 0 then coalesce(d.ordered_total, 0::numeric)
    else coalesce(q.quoted_total, 0::numeric)
  end as amount,
  coalesce(d.open_orders, 0) as open_orders,
  coalesce(d.owing_orders, 0) as owing_orders,
  greatest(
    o.created_at,
    coalesce(h.last_change_at, o.created_at),
    coalesce(q.last_quote_at, o.created_at),
    coalesce(d.last_order_at, o.created_at)
  ) as last_activity_at
from public.opportunities o
left join public.customers c on c.id = o.customer_id
left join public.workspace_members m on m.user_id = o.owner and m.workspace_id = o.workspace_id
left join lateral (
  select max(sh.changed_at) as last_change_at
  from public.opportunity_stage_history sh
  where sh.opportunity_id = o.id
) h on true
left join lateral (
  select
    count(*) as quote_count,
    sum(x.total) filter (where x.status <> 'rejected') as quoted_total,
    max(greatest(x.created_at, x.updated_at)) as last_quote_at
  from public.quotes x
  where x.opportunity_id = o.id
) q on true
left join lateral (
  select
    count(*) as order_count,
    sum(x.total) filter (where x.status <> 'cancelled') as ordered_total,
    count(*) filter (
      where x.status <> 'cancelled' and x.status not in ('delivered', 'closed')
    ) as open_orders,
    count(*) filter (
      where x.status <> 'cancelled' and x.payment_status not in ('paid', 'not_applicable')
    ) as owing_orders,
    max(greatest(x.created_at, x.updated_at)) as last_order_at
  from public.orders x
  where x.opportunity_id = o.id
) d on true;

comment on view public.opportunity_board is
  'Cada trato con sus cuentas y su monto. Las cuentas se llaman *_count: un nombre igual al de una tabla lo lee PostgREST como relación embebida.';
