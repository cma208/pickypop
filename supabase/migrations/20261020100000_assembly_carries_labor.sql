-- What is assembled enters the shelf with its labour (the owner's decision on
-- ADR-022: the cost of what is sold is what it really cost, labour included).
--
-- Assembling valued the product at what it consumed: parts, sweets, the bag.
-- The minutes of assembling and packing that the recipe states, and that the
-- estimate charges, were nowhere. Three potions estimated at S/ 12.66 left the
-- shelf at S/ 7.21, and once Resultados reads the cost of what left the shelf
-- (20261020110000) that difference would be profit that does not exist.
--
-- So the labour goes where the product is valued, once:
--
-- * `assemble_product` puts the product on the shelf at what it consumed plus
--   the recipe's labour: the minutes per unit for every unit, and the setup
--   once per assembly, spread over the units assembled. The hour costs what
--   the cost profile in force that day says. Everything that reads the value
--   of an assembled product then carries it without a change of its own: a
--   delivery (`produced_unit_cost`), a shelf count, its listing.
-- * `deliver_order` adds the same labour to a product that is not assembled
--   (a keychain delivered as its parts and its bag). ADR-020 promised that a
--   unit delivered that way is worth what it would be worth assembled. Its
--   handling happens on delivery, so its labour is counted there: once per
--   delivery of the line, like one assembly.
-- * `assembly_unit_cost`, what a counted product nobody ever assembled enters
--   the shelf at, adds the minutes per unit. Not the setup: the count does not
--   know in how many assemblies those units were made, and a whole setup on
--   every unit would multiply it.
--
-- What was assembled before this keeps its value: the shelf is not revalued.
-- The labour rule is `laborCost` in packages/domain, which the estimate uses.

-- --------------------------------------------------------------- labour

/*
 * What the labour of a recipe costs for `p_units` finished products: the
 * setup once and the minutes per unit for each, each half rounded to cents on
 * its own (`laborCost` in packages/domain/src/cost.ts, the rule the estimate
 * charges). The hour is the profile's in force on `p_on`. With no profile the
 * labour is zero: nothing says what an hour costs, and assembling must not
 * stop for it.
 */
create or replace function app.recipe_labor_cost(p_recipe_id uuid, p_units numeric, p_on date)
returns numeric
language sql
stable
as $$
  select round(r.setup_minutes / 60 * coalesce(p.labor_rate_per_hour, 0), 2)
       + round(r.minutes_per_unit * p_units / 60 * coalesce(p.labor_rate_per_hour, 0), 2)
  from public.recipes r
  left join lateral app.current_cost_profile(r.workspace_id, p_on) p on true
  where r.id = p_recipe_id;
$$;

grant execute on function app.recipe_labor_cost(uuid, numeric, date) to authenticated;

comment on function app.recipe_labor_cost(uuid, numeric, date) is
  'La mano de obra de una receta para tantas unidades: la preparación una vez y los minutos por unidad por cada una, a la tarifa del perfil vigente ese día. Es la regla de laborCost en packages/domain.';

-- The workshop's day: after 19:00 in Lima it is already tomorrow in UTC, and
-- the profile of tomorrow may not be the one in force.
create or replace function app.workspace_day(p_workspace_id uuid, p_at timestamptz)
returns date
language sql
stable
as $$
  select (p_at at time zone w.timezone)::date
  from public.workspaces w
  where w.id = p_workspace_id;
$$;

grant execute on function app.workspace_day(uuid, timestamptz) to authenticated;

-- ------------------------------------------------------------- assembling

-- The one of 20261010130000_assembly_guards, plus the labour on what enters.
create or replace function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null
)
returns setof public.stock_movements
language plpgsql
as $$
declare
  v_workspace uuid;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_item uuid;
  v_labor numeric;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'hay que armar al menos una unidad';
  end if;

  select v.workspace_id, r.id, r.assembled into v_workspace, v_recipe, v_assembled
  from public.product_variants v
  join public.recipes r on r.variant_id = v.id
  where v.id = p_variant_id
  order by r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'esa variante no tiene receta: no se sabe con qué armarla';
  end if;
  if not v_assembled then
    raise exception 'Este producto no se arma: se entrega tal como sale de la impresora. Entrégalo desde su pedido.';
  end if;
  if not exists (select 1 from public.recipe_items where recipe_id = v_recipe) then
    raise exception 'La receta de este producto no tiene piezas ni insumos: no hay nada que armar.';
  end if;

  -- Locked until the end, in id order, so two assemblies sharing components
  -- do not wait for each other crosswise.
  perform 1
  from public.inventory_items
  where id in (select inventory_item_id from public.recipe_items where recipe_id = v_recipe)
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
  join public.inventory_items i on i.id = ri.inventory_item_id
  left join public.inventory_balances b on b.inventory_item_id = i.id
  where ri.recipe_id = v_recipe
    and coalesce(b.on_hand, 0) < ri.quantity_per_unit * p_units;

  if v_shortage is not null then
    raise exception 'No alcanza para armar % unidades. Falta: %',
      app.tidy_number(p_units), v_shortage;
  end if;

  v_item := app.finished_good_for(p_variant_id);
  -- The work of this assembly: its setup once, its minutes for every unit.
  v_labor := coalesce(app.recipe_labor_cost(v_recipe, p_units, app.workspace_day(v_workspace, now())), 0);

  -- Both halves in one statement: what leaves and what enters. An `insert`
  -- that reads what the previous one returned spreads the cost without
  -- keeping it anywhere in between.
  return query
  with consumed as (
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    select v_workspace, 'consumption', ri.inventory_item_id,
           -(ri.quantity_per_unit * p_units),
           coalesce(ps.cost_per_unit, c.cost_per_unit), 'assembly',
           coalesce(p_note, 'Armado de producto')
    from public.recipe_items ri
    left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
    left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
    where ri.recipe_id = v_recipe
    returning *
  ),
  produced as (
    -- A unit costs what was consumed plus the work, spread over the units:
    -- the rule a print uses for the parts it makes, with the hands added.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    select v_workspace, 'production', v_item, p_units,
           round((coalesce((select sum(abs(quantity) * coalesce(unit_cost, 0)) from consumed), 0) + v_labor) / p_units, 6),
           'assembly',
           coalesce(p_note, 'Armado de producto')
    returning *
  )
  select * from consumed
  union all
  select * from produced;
end;
$$;

comment on function app.assemble_product(uuid, numeric, text) is
  'Arma unidades de una variante: consume su receta y mete el producto al estante a lo que consumió más la mano de obra de la receta (la preparación una vez por armado, los minutos por unidad por cada una). Todo o nada.';

-- ----------------------------------------------- what a counted unit is worth

/*
 * What a unit of a variant would cost to assemble today: its components at
 * what they are worth on the shelf, plus the recipe's minutes per unit. The
 * setup is left out: the units a count finds were assembled in batches nobody
 * recorded, and a whole setup on each unit would multiply it. Null if the
 * recipe is missing or empty, or a component has no cost: half a cost would
 * read as a whole one.
 */
create or replace function app.assembly_unit_cost(p_variant_id uuid)
returns numeric
language sql
stable
as $$
  with recipe as (
    select r.id, r.workspace_id, r.minutes_per_unit
    from public.recipes r
    where r.variant_id = p_variant_id
    order by r.version desc
    limit 1
  ),
  components as (
    select ri.quantity_per_unit as quantity,
           coalesce(ps.cost_per_unit, c.cost_per_unit) as unit_cost
    from public.recipe_items ri
    join recipe on recipe.id = ri.recipe_id
    left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
    left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
  ),
  labor as (
    select round(recipe.minutes_per_unit / 60 * coalesce(p.labor_rate_per_hour, 0), 2) as cost
    from recipe
    left join lateral app.current_cost_profile(
      recipe.workspace_id, app.workspace_day(recipe.workspace_id, now())
    ) p on true
  )
  select case
           when count(*) = 0 or bool_or(unit_cost is null) then null
           else round(sum(quantity * unit_cost) + coalesce((select cost from labor), 0), 6)
         end
  from components;
$$;

comment on function app.assembly_unit_cost(uuid) is
  'Lo que costaría armar una unidad hoy: sus componentes a lo que valen en el estante más los minutos por unidad de la receta, sin la preparación. Con esto entra un producto contado que nadie armó todavía.';

-- -------------------------------------------------------------- delivering

/*
 * The one of 20261010140000_deliveries, with the labour of what is not
 * assembled. Delivers an order, or part of it, in one transaction.
 *
 * `p_lines` says how much of each line goes out today:
 * [{"order_line_id": ..., "quantity": 6}]. Left out, everything still pending
 * goes. What leaves the shelf depends on the line:
 *
 * - a catalog product that is assembled: its finished goods, at what they are
 *   worth (assembling already put the labour in them).
 * - a catalog product that is not assembled (`recipes.assembled = false`): the
 *   parts and supplies of its recipe, directly. Its handling happens now, so
 *   the recipe's labour is added here, as if this delivery were one assembly.
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

      -- Its handling happens now: the labour assembling would have added.
      v_line_labor := coalesce(app.recipe_labor_cost(v_recipe, (v_request ->> 'quantity')::numeric, v_day), 0);
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
  -- A line that took nothing off the shelf and carries no labour keeps a null
  -- cost: nothing on the shelf stands for it.
  insert into public.order_delivery_lines (workspace_id, delivery_id, order_line_id, quantity, unit_cost)
  select
    v_order.workspace_id,
    v_delivery.id,
    (r ->> 'line')::uuid,
    (r ->> 'quantity')::integer,
    (
      select case
               when count(v.item) = 0 and not v_labor ? (r ->> 'line') then null
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
