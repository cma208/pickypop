-- La receta que se usa es la activa, y la Venta rápida escribe sus montos
-- con doce cifras.
--
-- La receta. Desde 20261025110000 una variante tiene a lo sumo una receta
-- activa, y desde 20261025200000 el plan (`current_recipes`) toma la activa,
-- y si ninguna lo está, la más alta. Pero armar, entregar y vender seguían
-- tomando la versión más alta sin mirar si estaba activa, y lo mismo las
-- vistas de la pantalla de armar y la del conteo. Hoy coinciden, porque la
-- activa que quedó fue la más alta. El día que la más alta quede desactivada
-- (se volvió a la anterior), `assemble_product` consumiría las piezas de una
-- receta que nadie ve, `deliver_order` sacaría del estante lo que esa receta
-- dice, y `quick_sale` diría que un producto armado «no es un producto
-- armado». Ahora todas eligen como el plan: la activa, y si ninguna lo está,
-- la más alta.
--
-- Los montos. `quick_sale` era la última función que escribía montos con
-- 'FM999999990.00', que pasados los cien millones imprime «S/ #########.##»
-- en el mensaje de un cobro de más (T4-15). Ahora usa 'FM999999999990.00',
-- como el resto.
--
-- Y el rol: `quick_sale` pregunta al principio con `app.require_operator`,
-- como las demás (20261027100000): «Solo lectura» lee qué no puede antes de
-- que se pida un número, en vez de chocar con la política de `orders`.
--
-- `assemble_product`, `deliver_order` y `assembly_unit_cost` (que `count_shelf`
-- lee como su dueño) leen la receta y sus líneas solo del taller de lo que
-- arman, entregan o cuentan, como en 20261027100000.
--
-- Se recrean desde su última versión sin cambiar nada más: `assemble_product`
-- y `deliver_order` de 20261027100000 (como su dueño), `quick_sale` de
-- 20261020150000, `assembly_unit_cost` de 20261020100000, y las vistas
-- `assembly_options` (20261010130000), `assembly_components` (20261009170000)
-- y `shelf_count_items` (20261010160000), con las mismas columnas en el mismo
-- orden. Las firmas no cambian.

-- ------------------------------------------------------------- armar
--
-- La de 20261027100000_shelf_moves_only_through_its_flows, con la receta activa.
create or replace function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null,
  p_request_key uuid default null
)
returns setof public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_item uuid;
  v_labor numeric;
  v_done_variant uuid;
  v_done_units numeric;
begin
  -- Runs as its owner, because it writes the shelf: whoever calls has to
  -- operate in the product's workshop.
  perform app.require_operator(
    (select v.workspace_id from public.product_variants v where v.id = p_variant_id),
    'No encontramos ese producto. Recarga la página y vuelve a elegirlo.',
    'armar productos'
  );

  if p_units is null or p_units = 'NaN'::numeric or p_units <= 0 then
    raise exception 'Hay que armar al menos una unidad.';
  end if;
  if p_units > 10000 then
    raise exception 'Se arman hasta 10000 unidades a la vez.';
  end if;
  if p_units <> trunc(p_units) then
    raise exception 'Se arman unidades enteras: escribe cuántas, sin decimales.';
  end if;

  select workspace_id into v_workspace from public.product_variants where id = p_variant_id;
  if v_workspace is null then
    raise exception 'No encontramos ese producto. Recarga la página y vuelve a elegirlo.';
  end if;

  -- The same submission again (a retry after the answer was lost, a second
  -- tab sending what the first did): what it assembled the first time, and
  -- nothing moves. The lock puts two of them in line, and the second one
  -- reads what the first committed.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('assemble_product:' || p_request_key::text, 0));

    select i.product_variant_id, m.quantity
      into v_done_variant, v_done_units
    from public.stock_movements m
    join public.inventory_items i on i.id = m.inventory_item_id
    where m.workspace_id = v_workspace
      and m.source_type = 'assembly'
      and m.source_id = p_request_key
      and m.type = 'production';

    if found then
      if v_done_variant is distinct from p_variant_id or v_done_units <> p_units then
        raise exception 'Ese armado ya se registró con otro producto u otra cantidad. Recarga la página y vuelve a armar.';
      end if;
      return query
      select m.*
      from public.stock_movements m
      where m.workspace_id = v_workspace
        and m.source_type = 'assembly'
        and m.source_id = p_request_key
      order by m.type = 'production', m.inventory_item_id;
      return;
    end if;
  end if;

  -- The recipe the screen shows: the active one, or the latest if none is.
  select r.id, r.assembled into v_recipe, v_assembled
  from public.recipes r
  where r.variant_id = p_variant_id
    -- Running as its owner it sees every workshop: only this one's rows,
    -- here and in every read below.
    and r.workspace_id = v_workspace
  order by r.active desc, r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'Esa variante no tiene receta: no se sabe con qué armarla.';
  end if;
  if not v_assembled then
    raise exception 'Este producto no se arma: se entrega tal como sale de la impresora. Entrégalo desde su pedido.';
  end if;
  if not exists (select 1 from public.recipe_items where recipe_id = v_recipe and workspace_id = v_workspace) then
    raise exception 'La receta de este producto no tiene piezas ni insumos: no hay nada que armar.';
  end if;

  -- Locked until the end, in id order, so two assemblies sharing components
  -- do not wait for each other crosswise.
  perform 1
  from public.inventory_items
  where id in (
    select inventory_item_id from public.recipe_items where recipe_id = v_recipe and workspace_id = v_workspace
  )
  order by id
  for update;

  -- First whether there is enough for everything, and only then anything moves.
  select string_agg(
           format('%s (hacen falta %s y hay %s)',
                  i.name,
                  app.tidy_number(ri.quantity_per_unit * p_units),
                  app.tidy_number(coalesce(b.on_hand, 0))),
           '; ' order by i.name)
    into v_shortage
  from public.recipe_items ri
  join public.inventory_items i on i.id = ri.inventory_item_id and i.workspace_id = v_workspace
  left join public.inventory_balances b on b.inventory_item_id = i.id
  where ri.recipe_id = v_recipe
    and ri.workspace_id = v_workspace
    and coalesce(b.on_hand, 0) < ri.quantity_per_unit * p_units;

  if v_shortage is not null then
    raise exception 'No alcanza para armar %. Falta: %',
      case when p_units = 1 then '1 unidad' else app.tidy_number(p_units) || ' unidades' end,
      v_shortage;
  end if;

  v_item := app.finished_good_for(p_variant_id);
  -- The work of this assembly: its setup once, its minutes for every unit.
  v_labor := coalesce(app.recipe_labor_cost(v_recipe, p_units, app.workspace_day(v_workspace, now())), 0);

  -- Both halves in one statement: what leaves and what enters. An `insert`
  -- that reads what the previous one returned spreads the cost without
  -- keeping it anywhere in between. Both carry the key as the assembly's id.
  return query
  with consumed as (
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_workspace, 'consumption', ri.inventory_item_id,
           -(ri.quantity_per_unit * p_units),
           coalesce(ps.cost_per_unit, c.cost_per_unit), 'assembly', p_request_key,
           coalesce(p_note, 'Armado de producto')
    from public.recipe_items ri
    left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
    left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
    where ri.recipe_id = v_recipe
      and ri.workspace_id = v_workspace
    returning *
  ),
  produced as (
    -- A unit costs what was consumed plus the work, spread over the units:
    -- the rule a print uses for the parts it makes, with the hands added.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_workspace, 'production', v_item, p_units,
           round((coalesce((select sum(abs(quantity) * coalesce(unit_cost, 0)) from consumed), 0) + v_labor) / p_units, 6),
           'assembly', p_request_key,
           coalesce(p_note, 'Armado de producto')
    returning *
  )
  select * from consumed
  union all
  select * from produced;
end;
$$;

-- ------------------------------------------------------------- entregar
--
-- La de 20261027100000_shelf_moves_only_through_its_flows (cinco argumentos,
-- como su dueño), con la receta activa.
create or replace function app.deliver_order(
  p_order_id uuid,
  p_lines jsonb default null,
  p_delivered_at timestamptz default null,
  p_note text default null,
  p_delivery_key uuid default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = ''
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
  -- Runs as its owner, because it writes the deliveries and the shelf:
  -- whoever calls has to operate in the order's workshop.
  perform app.require_operator(
    (select o.workspace_id from public.orders o where o.id = p_order_id),
    'No existe el pedido indicado.',
    'entregar pedidos'
  );

  if p_delivery_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('deliver_order ' || p_delivery_key::text, 0));
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No existe el pedido indicado.';
  end if;

  -- The same delivery asked again: the one it already made, and nothing else.
  -- Before the status, because the first one may have been the last and the
  -- order is delivered by now.
  if p_delivery_key is not null then
    select * into v_delivery
    from public.order_deliveries d
    where d.workspace_id = v_order.workspace_id and d.delivery_key = p_delivery_key;
    if found then
      if v_delivery.order_id <> p_order_id then
        raise exception 'Esa entrega ya se registró en otro pedido. Vuelve a abrir este pedido y anota la entrega otra vez.';
      end if;
      return v_delivery;
    end if;
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
      where l.id = (e ->> 'order_line_id')::uuid
        and l.order_id = p_order_id
        -- Running as its owner it sees every workshop: only this one's rows,
        -- here and in every read below.
        and l.workspace_id = v_order.workspace_id
    )
  ) then
    raise exception 'Una de las líneas no es de este pedido.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha de la entrega no es válida.';
  end if;
  -- Stock does not move in the future. A few minutes of slack: the phone's
  -- clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'La entrega no puede tener fecha futura: anótala con el día en que salió.';
  end if;

  v_day := app.workspace_day(v_order.workspace_id, v_when);

  -- What goes out today, line by line, checked against what is still pending.
  for v_line in
    select l.id, l.variant_id, l.description, s.pending
    from public.order_lines l
    join public.order_line_delivery_status s on s.order_line_id = l.id
    where l.order_id = p_order_id
      and l.workspace_id = v_order.workspace_id
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
      where j.order_line_id = v_line.id
        and j.workspace_id = v_order.workspace_id
        and j.status in ('planned', 'printing');

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

    -- The recipe the screen shows: the active one, or the latest if none is.
    select r.id, r.assembled into v_recipe, v_assembled
    from public.recipes r
    where r.variant_id = (v_request ->> 'variant')::uuid
      and r.workspace_id = v_order.workspace_id
    order by r.active desc, r.version desc
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
      where ri.recipe_id = v_recipe
        and ri.workspace_id = v_order.workspace_id;

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
  join public.inventory_items i on i.id = x.item and i.workspace_id = v_order.workspace_id
  left join public.inventory_balances b on b.inventory_item_id = x.item
  where coalesce(b.on_hand, 0) < x.needed;

  if v_shortage is not null then
    raise exception 'No alcanza para entregar. Falta: %. Arma o imprime lo que falta, o entrega una parte.', v_shortage;
  end if;

  insert into public.order_deliveries (workspace_id, order_id, delivered_at, note, delivery_key)
  values (v_order.workspace_id, p_order_id, v_when, nullif(btrim(p_note), ''), p_delivery_key)
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

  -- A catalogue print still tied to a line that has gone out whole (from
  -- before ADR-021) is no longer this order's: it goes on as a loose print,
  -- the way cancel_order lets go of the prints it does not cancel, and what
  -- it makes reaches the shelf like any other.
  update public.print_jobs j
     set order_line_id = null,
         label = coalesce(nullif(btrim(j.label), ''), l.description),
         note = concat_ws(E'\n', nullif(btrim(j.note), ''),
                          format('Era del pedido %s, que se entregó desde el estante.', v_order.number))
    from public.order_lines l
    join public.order_line_delivery_status s on s.order_line_id = l.id
   where j.order_line_id = l.id
     and l.order_id = p_order_id
     and l.workspace_id = v_order.workspace_id
     and l.variant_id is not null
     and s.pending = 0
     and j.status in ('planned', 'printing')
     -- Running as its owner, it sees every workshop: only this one's prints.
     and j.workspace_id = v_order.workspace_id;

  -- Nothing left to deliver: the order is delivered. A partial delivery leaves
  -- the order where it was.
  if not exists (
    select 1 from public.order_line_delivery_status
    where order_id = p_order_id and workspace_id = v_order.workspace_id and pending > 0
  ) then
    update public.orders set status = 'delivered' where id = p_order_id;
  end if;

  return v_delivery;
end;
$$;

-- ------------------------------------------------------------- vender
--
-- La de 20261020150000_quick_sale_channel_and_shelf_cost, con la receta
-- activa, el rol al principio y los montos con doce cifras. Sigue siendo
-- `security invoker` (20261027100000).
create or replace function app.quick_sale(
  p_workspace_id uuid,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_account_id uuid default null,
  p_amount numeric default 0,
  p_payment_method public.payment_method default null,
  p_sold_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_sale_key uuid default null,
  p_channel_id uuid default null
)
returns public.orders
language plpgsql
as $$
declare
  -- What the columns can hold: numeric(12, 2) for money, integer for a
  -- quantity. Past them the insert would fail with an overflow nobody can read.
  c_money_ceiling constant numeric := 1e10;
  c_units_ceiling constant numeric := 2147483647;
  v_when timestamptz := coalesce(p_sold_at, now());
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_day date;
  v_line jsonb;
  v_variant record;
  v_quantity numeric;
  v_price numeric;
  -- [{"variant", "description", "quantity", "unit_price"}]
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_customer uuid;
  v_channel uuid;
  v_order public.orders;
begin
  -- Whoever is not of the workshop is told so, and «Solo lectura» gets its
  -- 42501 before anything is numbered or written.
  perform app.require_operator(p_workspace_id, 'No perteneces a este taller.', 'vender');

  -- The same sale asked again: the order it already made, and nothing else.
  if p_sale_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('quick_sale ' || p_sale_key::text, 0));
    select * into v_order
    from public.orders o
    where o.workspace_id = p_workspace_id and o.quick_sale_key = p_sale_key;
    if found then
      return v_order;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;

  -- NaN compares greater than everything, so it would pass every check below.
  if v_amount = 'NaN'::numeric then
    raise exception 'Lo cobrado tiene que ser un monto en soles.';
  end if;
  if v_amount < 0 then
    raise exception 'Lo cobrado no puede ser negativo.';
  end if;
  if v_amount > 0 and p_account_id is null then
    raise exception 'Elige la cuenta donde entró el dinero, o deja lo cobrado en cero si te paga después.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha de la venta no es válida.';
  end if;
  -- A few minutes of slack: the phone's clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'La venta no puede tener fecha futura.';
  end if;

  -- «Clientes varios» typed by hand is the walk-in customer, not a new one.
  if v_name is not null and app.is_walk_in_name(p_workspace_id, v_name) then
    if v_phone is not null then
      raise exception '«%» es el cliente de las ventas sin nombre: para guardar un teléfono, escribe el nombre de la persona.',
        v_name;
    end if;
    v_name := null;
  end if;

  if v_name is null and v_phone is not null then
    raise exception 'Escribe el nombre del cliente para guardar su teléfono.';
  end if;

  if p_channel_id is null then
    v_channel := app.default_channel(p_workspace_id);
  else
    select c.id into v_channel
    from public.sales_channels c
    where c.id = p_channel_id and c.workspace_id = p_workspace_id and c.active;

    if v_channel is null then
      raise exception 'Ese canal de venta no es de este taller o ya no está activo. Elige otro.';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select v.id, p.name || ' — ' || v.name as label, r.id as recipe_id, r.assembled
      into v_variant
    from public.product_variants v
    join public.catalog_products p on p.id = v.product_id
    -- The recipe `deliver_order` will read: the active one, or the latest
    -- if none is.
    left join lateral (
      select r.id, r.assembled
      from public.recipes r
      where r.variant_id = v.id
      order by r.active desc, r.version desc
      limit 1
    ) r on true
    where v.id = (v_line ->> 'variant_id')::uuid
      and v.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Uno de los productos no es de este taller o ya no existe.';
    end if;
    if v_variant.recipe_id is null then
      raise exception '«%» no tiene receta, así que nada en el estante lo representa. Véndelo con un pedido normal.',
        v_variant.label;
    end if;
    if not v_variant.assembled then
      raise exception '«%» no es un producto armado: sale del estante en piezas, no como producto. Véndelo con un pedido normal.',
        v_variant.label;
    end if;

    if jsonb_typeof(v_line -> 'quantity') is distinct from 'number' then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_variant.label;
    end if;
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) or v_quantity > c_units_ceiling then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_variant.label;
    end if;

    if jsonb_typeof(v_line -> 'unit_price') is distinct from 'number' then
      raise exception 'Falta el precio de «%», o es negativo.', v_variant.label;
    end if;
    v_price := round((v_line ->> 'unit_price')::numeric, 2);
    if v_price < 0 then
      raise exception 'Falta el precio de «%», o es negativo.', v_variant.label;
    end if;
    if v_price >= c_money_ceiling then
      raise exception 'El precio de «%» es demasiado grande: revísalo.', v_variant.label;
    end if;

    -- Price times quantity, line by line: what `order_lines.line_total` will say.
    v_total := v_total + v_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant', v_variant.id,
      'description', v_variant.label,
      -- As an integer already: "2.0" would not cast to the column.
      'quantity', v_quantity::integer,
      'unit_price', v_price
    );
  end loop;

  -- Something handed over for nothing is a gift, and a gift has its own kind
  -- of order. Here a zero is far more often a price nobody typed.
  if v_total = 0 then
    raise exception 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
  end if;
  if v_total >= c_money_ceiling then
    raise exception 'La venta suma demasiado: revisa los precios y las cantidades.';
  end if;

  if v_amount > v_total then
    raise exception 'Lo cobrado (S/ %) pasa del total de la venta (S/ %).',
      to_char(v_amount, 'FM999999999990.00'), to_char(v_total, 'FM999999999990.00');
  end if;

  -- What stays owed needs somebody who owes it: the walk-in customer is
  -- everybody, so «Por cobrar» could never say whom to ask.
  if v_amount < v_total and (
    (p_customer_id is null and v_name is null)
    or exists (
      select 1 from public.customers c
      where c.id = p_customer_id and c.workspace_id = p_workspace_id and c.walk_in
    )
  ) then
    raise exception 'Quedan S/ % por cobrar. Escribe el nombre de quien te debe, o elige al cliente: una deuda sin nombre no hay a quién cobrársela.',
      to_char(v_total - v_amount, 'FM999999999990.00');
  end if;

  if p_customer_id is not null then
    select c.id into v_customer
    from public.customers c
    where c.id = p_customer_id and c.workspace_id = p_workspace_id;

    if v_customer is null then
      raise exception 'No encontramos ese cliente en este taller.';
    end if;
  elsif v_name is not null then
    insert into public.customers (workspace_id, name, phone)
    values (p_workspace_id, v_name, v_phone)
    returning id into v_customer;
  else
    v_customer := app.walk_in_customer(p_workspace_id);
  end if;

  -- The day of the sale in the workshop, not in UTC: after 19:00 in Lima it is
  -- already tomorrow in UTC, and Resultados would put the sale in that day.
  v_day := app.workspace_day(p_workspace_id, v_when);

  -- Read by the status history trigger, on creation and on delivery alike.
  perform set_config('app.change_reason', 'Venta rápida.', true);
  -- The walk-in customer buys here only: this sale collects or has a name.
  perform set_config('app.quick_sale', 'on', true);

  insert into public.orders (
    workspace_id, number, purpose, customer_id, channel_id, status, ordered_on, note, total, quick_sale_key
  ) values (
    p_workspace_id,
    app.next_document_number(p_workspace_id, 'order'),
    'sale',
    v_customer,
    v_channel,
    'confirmed',
    v_day,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_total,
    p_sale_key
  )
  returning * into v_order;

  insert into public.order_lines (
    workspace_id, order_id, position, variant_id, description,
    quantity, unit_price, estimated_unit_cost
  )
  select
    p_workspace_id,
    v_order.id,
    l.position,
    (l.line ->> 'variant')::uuid,
    l.line ->> 'description',
    (l.line ->> 'quantity')::integer,
    (l.line ->> 'unit_price')::numeric,
    0
  from jsonb_array_elements(v_lines) with ordinality as l (line, position);

  -- Everything pending goes out. Its refusal says what is short and how much,
  -- and nothing above survives it.
  perform app.deliver_order(v_order.id, null, v_when, 'Venta rápida.');

  -- What left the shelf is what each line cost: its estimate says so, and the
  -- order says what Resultados says. A product with nothing behind its value
  -- left at no known cost, and stays at zero.
  update public.order_lines l
  set estimated_unit_cost = coalesce(dl.unit_cost, 0)
  from public.order_delivery_lines dl
  where dl.order_line_id = l.id
    and l.order_id = v_order.id;

  if v_amount > 0 then
    perform app.record_payment(
      v_order.id,
      p_account_id,
      v_amount,
      p_payment_method,
      v_when,
      null,
      nullif(btrim(coalesce(p_reference, '')), ''),
      format('Cobro de la venta rápida %s', v_order.number)
    );
  end if;

  perform set_config('app.change_reason', '', true);
  perform set_config('app.quick_sale', '', true);

  -- As it ended: delivered, and paid, partly paid or unpaid.
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;

-- ------------------------------------------------- lo que vale una unidad
--
-- La de 20261020100000_assembly_carries_labor, con la receta activa: es lo
-- que vale una unidad que un conteo encuentra sin que nadie la armara.
create or replace function app.assembly_unit_cost(p_variant_id uuid)
returns numeric
language sql
stable
as $$
  with recipe as (
    select r.id, r.workspace_id, r.minutes_per_unit
    from public.recipes r
    where r.variant_id = p_variant_id
      -- Read as their owner by count_shelf: only the variant's workshop.
      and r.workspace_id = (select v.workspace_id from public.product_variants v where v.id = p_variant_id)
    order by r.active desc, r.version desc
    limit 1
  ),
  components as (
    select ri.quantity_per_unit as quantity,
           coalesce(ps.cost_per_unit, c.cost_per_unit) as unit_cost
    from public.recipe_items ri
    join recipe on recipe.id = ri.recipe_id and recipe.workspace_id = ri.workspace_id
    left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
    left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
  ),
  labor as (
    select app.recipe_unit_labor(recipe.id, 1, app.workspace_day(recipe.workspace_id, now())) as cost
    from recipe
  )
  select case
           when count(*) = 0 or bool_or(unit_cost is null) then null
           else round(sum(quantity * unit_cost) + coalesce((select cost from labor), 0), 6)
         end
  from components;
$$;

-- ------------------------------------------------------------- las vistas
--
-- Las mismas columnas, en el mismo orden, con la receta activa: lo que la
-- pantalla de armar y la del conteo enseñan es lo que la base va a mover.

-- La de 20261010130000_assembly_guards.
create or replace view public.assembly_options with (security_invoker = true) as
select
  v.workspace_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(v.image_path, p.image_path) as image_path,
  r.id as recipe_id,
  coalesce(fg.on_hand, 0) as assembled_on_hand,
  coalesce(limits.buildable_units, 0) as buildable_units,
  coalesce(limits.component_count, 0) as component_count
from public.product_variants v
join public.catalog_products p on p.id = v.product_id
join lateral (
  select id, assembled from public.recipes where variant_id = v.id order by active desc, version desc limit 1
) r on true
left join lateral (
  select b.on_hand
  from public.inventory_items i
  join public.inventory_balances b on b.inventory_item_id = i.id
  where i.product_variant_id = v.id and i.kind = 'finished_good'
  limit 1
) fg on true
left join lateral (
  select
    floor(min(coalesce(b.on_hand, 0) / nullif(ri.quantity_per_unit, 0))) as buildable_units,
    count(*) as component_count
  from public.recipe_items ri
  left join public.inventory_balances b on b.inventory_item_id = ri.inventory_item_id
  where ri.recipe_id = r.id
) limits on true
where v.active
  and r.assembled;

-- La de 20261009170000_assembly_views (con security_invoker desde 20261009180000).
create or replace view public.assembly_components with (security_invoker = true) as
select
  ri.workspace_id,
  r.variant_id,
  i.id as inventory_item_id,
  i.name,
  i.unit,
  i.kind,
  i.image_path,
  ri.quantity_per_unit,
  coalesce(b.on_hand, 0) as on_hand
from public.recipe_items ri
join public.recipes r on r.id = ri.recipe_id
join public.inventory_items i on i.id = ri.inventory_item_id
left join public.inventory_balances b on b.inventory_item_id = i.id
where r.id = (
  select id from public.recipes where variant_id = r.variant_id order by active desc, version desc limit 1
);

-- La de 20261010160000_shelf_count.
create or replace view public.shelf_count_items with (security_invoker = true) as
select
  'part'::text as kind,
  i.id as inventory_item_id,
  null::uuid as variant_id,
  i.workspace_id,
  i.name,
  null::text as detail,
  i.image_path,
  coalesce(b.on_hand, 0) as on_hand,
  ps.cost_per_unit
from public.inventory_items i
left join public.inventory_balances b on b.inventory_item_id = i.id
left join public.part_stock ps on ps.inventory_item_id = i.id
where i.kind = 'part' and i.active
union all
select
  'product'::text,
  fg.id,
  v.id,
  v.workspace_id,
  p.name,
  v.name,
  coalesce(v.image_path, p.image_path),
  coalesce(b.on_hand, 0),
  coalesce(app.produced_unit_cost(fg.id), app.assembly_unit_cost(v.id))
from public.product_variants v
join public.catalog_products p on p.id = v.product_id
join lateral (
  select r.assembled
  from public.recipes r
  where r.variant_id = v.id
  order by r.active desc, r.version desc
  limit 1
) r on r.assembled
left join public.inventory_items fg on fg.product_variant_id = v.id and fg.kind = 'finished_good'
left join public.inventory_balances b on b.inventory_item_id = fg.id
where v.active;
