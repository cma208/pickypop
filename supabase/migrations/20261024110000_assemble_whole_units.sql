-- Se arman unidades enteras, y el mensaje concuerda con cuántas.
--
-- `assemble_product` solo exigía más de cero, así que por la API se armaban
-- 0.5 calaveras (T3-04): media unidad en el estante que «Contar el estante»,
-- que solo acepta enteros, no deja corregir sin tocarla. Y al faltar stock
-- para una sola decía «No alcanza para armar 1 unidades» (T3-17).
--
-- Es la de 20261020100000_assembly_carries_labor con esos dos cambios, y los
-- mensajes que estaban en minúscula, escritos como los demás. Lo ya armado con
-- fracciones no se toca: se corrige contando el estante.

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
    raise exception 'Hay que armar al menos una unidad.';
  end if;
  if p_units <> trunc(p_units) then
    raise exception 'Se arman unidades enteras: escribe cuántas, sin decimales.';
  end if;

  select v.workspace_id, r.id, r.assembled into v_workspace, v_recipe, v_assembled
  from public.product_variants v
  join public.recipes r on r.variant_id = v.id
  where v.id = p_variant_id
  order by r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'Esa variante no tiene receta: no se sabe con qué armarla.';
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
    raise exception 'No alcanza para armar %. Falta: %',
      case when p_units = 1 then '1 unidad' else app.tidy_number(p_units) || ' unidades' end,
      v_shortage;
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
  'Arma unidades enteras de una variante: consume su receta y mete el producto al estante a lo que consumió más la mano de obra de la receta (la preparación una vez por armado, los minutos por unidad por cada una). Todo o nada.';
