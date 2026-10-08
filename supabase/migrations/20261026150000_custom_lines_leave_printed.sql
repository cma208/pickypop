-- Lo hecho a medida se entrega impreso (T4-08).
--
-- En la tercera pasada, una línea a medida con su impresión todavía
-- «Planificada» se entregó: la confirmación dijo «Se entrega 1 unidad hecha
-- para este pedido», el pedido pasó a Entregado y su trabajo siguió primero
-- en la cola, con «Iniciar» a mano, para un pedido que ya se fue.
-- `deliver_order` se salta las líneas sin variante, porque no sacan nada del
-- estante, y no miraba sus impresiones.
--
-- Lo que se decidió, por el ADR-020 (el estante y el costo se mueven por sus
-- flujos): las últimas unidades de una línea a medida no se entregan
-- mientras le quede una impresión planificada o en curso. La entrega no
-- decide por la persona qué pasó con esa impresión, porque hay dos casos y
-- se registran distinto:
--
-- * Ya se imprimió: se cierra «Exitosa» en Producción. Así se descuenta el
--   filamento del rollo y el pedido tiene su costo real. Si la entrega la
--   cancelara, ese filamento no saldría de ningún rollo y la línea quedaría
--   costando cero.
-- * No hace falta (se hizo de otra forma, o el cliente se la llevó así): se
--   cancela en Producción, sin tiempo ni costo.
--
-- Una entrega parcial sí puede salir con trabajos en la cola: lo que falta
-- todavía se imprime. Lo de catálogo no cambia: sale del estante, y desde el
-- ADR-021 sus impresiones no se atan a un pedido.
--
-- Y nada nuevo se imprime para una línea ya entregada entera: una pestaña
-- vieja podía poner un trabajo «para este pedido» después de entregarlo.
-- Una reposición, si hace falta, va como trabajo suelto.
--
-- `deliver_order` es la de 20261020100000_assembly_carries_labor, con la
-- regla nueva en el recorrido de las líneas.

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
  -- {"<line>": labour of that line}, only for what is delivered as its parts.
  v_labor jsonb := '{}'::jsonb;
  v_line_labor numeric;
  v_request jsonb;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_delivery public.order_deliveries;
  v_when timestamptz := coalesce(p_delivered_at, now());
  v_day date;
  v_planned integer;
  v_printing integer;
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

  v_day := app.workspace_day(v_order.workspace_id, v_when);

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

    -- The last units of a made-to-order line leave once its prints are
    -- closed: what came out of them is said in the queue, and a print left
    -- planned for a delivered line stayed first in the queue (T4-08).
    if v_line.variant_id is null and v_quantity = v_line.pending then
      select count(*) filter (where j.status = 'planned'),
             count(*) filter (where j.status = 'printing')
        into v_planned, v_printing
      from public.print_jobs j
      where j.order_line_id = v_line.id and j.status in ('planned', 'printing');

      if v_printing > 0 then
        raise exception '«%» se está imprimiendo para este pedido. Ciérrala en la cola de impresión con lo que salió, y después entrégala.',
          v_line.description;
      end if;
      if v_planned > 0 then
        raise exception '«%» tiene % en la cola, sin imprimir. Si ya la imprimiste, ciérrala como exitosa en Producción; si no hace falta, cancélala allí. Después entrégala.',
          v_line.description, app.planned_prints_text(v_planned);
      end if;
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

      -- Its handling happens now: the minutes per unit assembling would have added.
      v_line_labor := coalesce(app.recipe_unit_labor(v_recipe, (v_request ->> 'quantity')::numeric, v_day), 0);
      if v_line_labor > 0 then
        v_labor := v_labor || jsonb_build_object(v_request ->> 'line', v_line_labor);
      end if;
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
  -- A line that took nothing off the shelf keeps a null cost, labour or not:
  -- nothing on the shelf stands for it, and its labour alone would read as
  -- its whole real cost. Resultados keeps it at its estimate.
  insert into public.order_delivery_lines (workspace_id, delivery_id, order_line_id, quantity, unit_cost)
  select
    v_order.workspace_id,
    v_delivery.id,
    (r ->> 'line')::uuid,
    (r ->> 'quantity')::integer,
    (
      select case
               when count(v.item) = 0 then null
               else round(
                 (coalesce(sum(v.quantity * coalesce(v.unit_cost, 0)), 0) + coalesce((v_labor ->> (r ->> 'line'))::numeric, 0))
                 / (r ->> 'quantity')::numeric,
                 6
               )
             end
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


/*
 * Nothing new is printed for a line that already left in full, nor for any
 * line of a delivered order. A cancelled order has its own rule
 * (`no_prints_for_cancelled_orders`). Prints already in the queue are not
 * judged: closing one is how it leaves.
 */
create or replace function app.no_prints_for_delivered_lines()
returns trigger
language plpgsql
as $$
declare
  v_number text;
  v_description text;
begin
  if new.order_line_id is null or new.status not in ('planned', 'printing') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.order_line_id is not distinct from old.order_line_id then
    return new;
  end if;

  select o.number, l.description into v_number, v_description
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  join public.order_line_delivery_status s on s.order_line_id = l.id
  where l.id = new.order_line_id
    and o.status <> 'cancelled'
    and (o.status in ('delivered', 'closed') or s.pending = 0);

  if found then
    raise exception '«%» del pedido % ya se entregó entera: no se imprime nada más para ella. Si hace falta reponerla, créala como trabajo suelto.',
      v_description, v_number;
  end if;

  return new;
end;
$$;

create trigger print_jobs_not_for_delivered_lines
  before insert or update of order_line_id on public.print_jobs
  for each row execute function app.no_prints_for_delivered_lines();
