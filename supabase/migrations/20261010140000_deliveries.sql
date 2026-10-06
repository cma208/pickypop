-- Entregar un pedido saca las cosas del estante.
--
-- Hasta hoy "entregado" era solo un estado: el pedido cambiaba de columna y el
-- estante seguía igual. Armar producía stock (ADR-018) y nada lo consumía, así
-- que el estante solo crecía, y la vista de lo que falta producir descontaba de
-- otros pedidos pociones que ya se habían llevado. En la prueba del barrido
-- decía que faltaban 31 cuando faltaban 41.
--
-- Una entrega puede ser parcial: se entregan 6 de 10 hoy y 4 el viernes. Cada
-- una guarda qué salió y cuánto costó lo que salió, al promedio de lo que
-- había. El costo de ventas de Resultados todavía sale de la receta (ADR-019);
-- este es el dato con el que se va a reemplazar.

-- ------------------------------------------------------------ las entregas

create table public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete restrict,
  delivered_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index order_deliveries_order_idx on public.order_deliveries (order_id);

create table public.order_delivery_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  delivery_id uuid not null references public.order_deliveries (id) on delete cascade,
  order_line_id uuid not null references public.order_lines (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  -- Lo que costó cada unidad que salió del estante. Nulo cuando la línea no
  -- saca nada del estante, como una pieza a medida sin receta.
  unit_cost numeric(12, 6),
  created_at timestamptz not null default now(),
  unique (delivery_id, order_line_id)
);

create index order_delivery_lines_line_idx on public.order_delivery_lines (order_line_id);

select app.apply_workspace_rls('order_deliveries');
select app.apply_workspace_rls('order_delivery_lines');

comment on table public.order_deliveries is
  'Cada vez que algo de un pedido sale del taller. Un pedido puede entregarse en partes.';

-- Cuánto de cada línea ya se entregó y cuánto falta. Un pedido que ya estaba
-- entregado o cerrado antes de que existieran las entregas cuenta como
-- entregado entero: no hay registro, pero tampoco nada pendiente.
create view public.order_line_delivery_status with (security_invoker = true) as
select
  l.id as order_line_id,
  l.workspace_id,
  l.order_id,
  l.quantity,
  case
    when o.status in ('delivered', 'closed') then l.quantity
    else least(coalesce(d.delivered, 0), l.quantity)
  end as delivered,
  case
    when o.status in ('delivered', 'closed', 'cancelled') then 0
    else greatest(l.quantity - coalesce(d.delivered, 0), 0)
  end as pending
from public.order_lines l
join public.orders o on o.id = l.order_id
left join (
  select order_line_id, sum(quantity) as delivered
  from public.order_delivery_lines
  group by order_line_id
) d on d.order_line_id = l.id;

comment on view public.order_line_delivery_status is
  'Por línea de pedido: cuánto se entregó y cuánto falta entregar.';

-- Lo que vale una unidad de algo que se produjo en el taller (un producto
-- armado): el promedio de lo que entró, ponderado por cantidad. Es la regla con
-- la que `part_stock` valoriza las piezas.
create or replace function app.produced_unit_cost(p_item_id uuid)
returns numeric
language sql
stable
as $$
  select round(sum(m.quantity * coalesce(m.unit_cost, 0)) / nullif(sum(m.quantity), 0), 6)
  from public.stock_movements m
  where m.inventory_item_id = p_item_id
    and m.type in ('production', 'purchase')
    and m.quantity > 0;
$$;

grant execute on function app.produced_unit_cost(uuid) to authenticated;

/*
 * Delivers an order, or part of it, in one transaction.
 *
 * `p_lines` says how much of each line goes out today:
 * [{"order_line_id": ..., "quantity": 6}]. Left out, everything still pending
 * goes. What leaves the shelf depends on the line:
 *
 * - a catalog product that is assembled: its finished goods.
 * - a catalog product that is not assembled (`recipes.assembled = false`): the
 *   parts and supplies of its recipe, directly.
 * - a custom piece, or a product without a recipe: nothing, because there is
 *   nothing on the shelf that stands for it.
 *
 * If something is missing, nothing moves and the message says what and how
 * much. When nothing of the order is left to deliver, the order becomes
 * "delivered".
 */
create or replace function app.deliver_order(
  p_order_id uuid,
  p_lines jsonb default null,
  p_delivered_at timestamptz default null,
  p_note text default null
)
returns public.order_deliveries
language plpgsql
as $$
declare
  v_order public.orders;
  v_line record;
  v_quantity numeric;
  -- [{"line": uuid, "variant": uuid, "quantity": n}]
  v_requested jsonb := '[]'::jsonb;
  -- [{"line": uuid, "item": uuid, "quantity": n, "valuation": "produced"|"component"}]
  v_needs jsonb := '[]'::jsonb;
  v_request jsonb;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_delivery public.order_deliveries;
  v_when timestamptz := coalesce(p_delivered_at, now());
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No existe el pedido indicado.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido % está cancelado: no hay nada que entregar.', v_order.number;
  end if;
  if v_order.status in ('delivered', 'closed') then
    raise exception 'El pedido % ya se entregó.', v_order.number;
  end if;

  if p_lines is not null and exists (
    select 1 from jsonb_array_elements(p_lines) e
    where not exists (
      select 1 from public.order_lines l
      where l.id = (e ->> 'order_line_id')::uuid and l.order_id = p_order_id
    )
  ) then
    raise exception 'Una de las líneas no es de este pedido.';
  end if;

  -- What goes out today, line by line, checked against what is still pending.
  for v_line in
    select l.id, l.variant_id, l.description, s.pending
    from public.order_lines l
    join public.order_line_delivery_status s on s.order_line_id = l.id
    where l.order_id = p_order_id
    order by l.position
  loop
    if p_lines is null then
      v_quantity := v_line.pending;
    else
      select (e ->> 'quantity')::numeric into v_quantity
      from jsonb_array_elements(p_lines) e
      where (e ->> 'order_line_id')::uuid = v_line.id;
    end if;

    continue when coalesce(v_quantity, 0) = 0;

    if v_quantity < 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'La cantidad a entregar de «%» tiene que ser un número entero positivo.', v_line.description;
    end if;
    if v_quantity > v_line.pending then
      raise exception 'De «%» quedan % por entregar y se intentó entregar %.',
        v_line.description, app.tidy_number(v_line.pending), app.tidy_number(v_quantity);
    end if;

    v_requested := v_requested || jsonb_build_object(
      'line', v_line.id, 'variant', v_line.variant_id, 'quantity', v_quantity
    );
  end loop;

  if jsonb_array_length(v_requested) = 0 then
    raise exception 'No queda nada por entregar en el pedido %.', v_order.number;
  end if;

  -- What each line takes off the shelf.
  for v_request in select value from jsonb_array_elements(v_requested) loop
    continue when v_request ->> 'variant' is null;

    select r.id, r.assembled into v_recipe, v_assembled
    from public.recipes r
    where r.variant_id = (v_request ->> 'variant')::uuid
    order by r.version desc
    limit 1;

    continue when v_recipe is null;

    if v_assembled then
      v_needs := v_needs || jsonb_build_object(
        'line', v_request ->> 'line',
        'item', app.finished_good_for((v_request ->> 'variant')::uuid),
        'quantity', (v_request ->> 'quantity')::numeric,
        'valuation', 'produced'
      );
    else
      select v_needs || coalesce(jsonb_agg(jsonb_build_object(
               'line', v_request ->> 'line',
               'item', ri.inventory_item_id,
               'quantity', ri.quantity_per_unit * (v_request ->> 'quantity')::numeric,
               'valuation', 'component'
             )), '[]'::jsonb)
        into v_needs
      from public.recipe_items ri
      where ri.recipe_id = v_recipe;
    end if;
  end loop;

  -- Locked before the check, in id order, so two deliveries (or a delivery and
  -- an assembly) of the same things queue up instead of both passing.
  perform 1
  from public.inventory_items
  where id in (select (n ->> 'item')::uuid from jsonb_array_elements(v_needs) n)
  order by id
  for update;

  select string_agg(
           format('%s (hacen falta %s y hay %s)',
                  i.name, app.tidy_number(x.needed), app.tidy_number(coalesce(b.on_hand, 0))),
           '; ' order by i.name)
    into v_shortage
  from (
    select (n ->> 'item')::uuid as item, sum((n ->> 'quantity')::numeric) as needed
    from jsonb_array_elements(v_needs) n
    group by 1
  ) x
  join public.inventory_items i on i.id = x.item
  left join public.inventory_balances b on b.inventory_item_id = x.item
  where coalesce(b.on_hand, 0) < x.needed;

  if v_shortage is not null then
    raise exception 'No alcanza para entregar. Falta: %. Arma o imprime lo que falta, o entrega una parte.', v_shortage;
  end if;

  insert into public.order_deliveries (workspace_id, order_id, delivered_at, note)
  values (v_order.workspace_id, p_order_id, v_when, nullif(btrim(p_note), ''))
  returning * into v_delivery;

  -- What leaves the shelf, valued the way it entered: a finished product at the
  -- average of what it cost to assemble, a part or a supply the way assembling
  -- values it (ADR-016).
  with valued as (
    select
      (n ->> 'line')::uuid as line,
      (n ->> 'item')::uuid as item,
      (n ->> 'quantity')::numeric as quantity,
      case n ->> 'valuation'
        when 'produced' then app.produced_unit_cost((n ->> 'item')::uuid)
        else coalesce(ps.cost_per_unit, c.cost_per_unit)
      end as unit_cost
    from jsonb_array_elements(v_needs) n
    left join public.part_stock ps on ps.inventory_item_id = (n ->> 'item')::uuid
    left join public.inventory_item_costs c on c.inventory_item_id = (n ->> 'item')::uuid
  ),
  moved as (
    insert into public.stock_movements (
      workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_order.workspace_id, v_when, 'delivery', item, -quantity, unit_cost,
           'order_delivery', v_delivery.id, format('Entrega del pedido %s', v_order.number)
    from valued
  )
  -- `moved` runs even though nothing reads it: a data-modifying WITH always does.
  insert into public.order_delivery_lines (workspace_id, delivery_id, order_line_id, quantity, unit_cost)
  select
    v_order.workspace_id,
    v_delivery.id,
    (r ->> 'line')::uuid,
    (r ->> 'quantity')::integer,
    (
      select round(sum(v.quantity * coalesce(v.unit_cost, 0)) / (r ->> 'quantity')::numeric, 6)
      from valued v
      where v.line = (r ->> 'line')::uuid
    )
  from jsonb_array_elements(v_requested) r;

  -- Nothing left to deliver: the order is delivered. A partial delivery leaves
  -- the order where it was.
  if not exists (
    select 1 from public.order_line_delivery_status
    where order_id = p_order_id and pending > 0
  ) then
    update public.orders set status = 'delivered' where id = p_order_id;
  end if;

  return v_delivery;
end;
$$;

grant execute on function app.deliver_order(uuid, jsonb, timestamptz, text) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.deliver_order(
  p_order_id uuid,
  p_lines jsonb default null,
  p_delivered_at timestamptz default null,
  p_note text default null
)
returns public.order_deliveries
language sql
volatile
as $$
  select app.deliver_order(p_order_id, p_lines, p_delivered_at, p_note);
$$;

grant execute on function public.deliver_order(uuid, jsonb, timestamptz, text) to authenticated;

-- ----------------------------------------- lo que falta producir, sin mentir
--
-- La vista contaba por estado del pedido: dejaba fuera los pedidos "listos",
-- cuyas unidades siguen en el estante esperando al cliente, y entonces se las
-- ofrecía a otros pedidos. Ahora cuenta lo que falta **entregar**, en todo
-- pedido abierto. Un pedido en espera sigue fuera hasta que exista el separo
-- con vencimiento.

create or replace view public.production_needs with (security_invoker = true) as
select
  o.workspace_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(v.image_path, p.image_path) as image_path,
  -- Bigint, como antes: una vista existente no deja cambiar el tipo de una columna.
  sum(s.pending)::bigint as committed_units,
  coalesce(max(stock.on_hand), 0) as assembled_units,
  greatest(sum(s.pending) - coalesce(max(stock.on_hand), 0), 0) as missing_units,
  min(o.due_date) as first_due_date,
  count(distinct o.id) as order_count
from public.order_lines ol
join public.order_line_delivery_status s on s.order_line_id = ol.id
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
where o.status <> 'on_hold'
  and s.pending > 0
group by o.workspace_id, v.id, p.name, v.name, coalesce(v.image_path, p.image_path)
having greatest(sum(s.pending) - coalesce(max(stock.on_hand), 0), 0) > 0;

comment on view public.production_needs is
  'Unidades que faltan entregar en pedidos abiertos, menos lo armado en el estante. Todavía no descuenta piezas sueltas ni trabajos en cola: eso llega con la cuenta única.';
