-- Armar un producto tiene que dejarlo en algún lado.
--
-- Hasta hoy `assemble_product` consumía las piezas, los dulces y la bolsa, y
-- ahí terminaba: el producto terminado no entraba a ningún inventario. El
-- dueño lo dijo sin tener el código delante —"no se ve a dónde va ese
-- inventario de productos armados"—, y no es que no se viera: no iba a
-- ninguna parte. El stock quedaba contando menos de lo que el taller tenía.
--
-- Para que entre hace falta un artículo de inventario por variante. La tabla
-- ya tenía el tipo `finished_good` y le faltaba a qué variante corresponde.

alter table public.inventory_items
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null;

-- Una variante tiene un solo artículo terminado, o el stock se parte en dos
-- sitios y ninguno de los dos dice la verdad.
create unique index if not exists inventory_items_finished_good_variant_key
  on public.inventory_items (product_variant_id)
  where kind = 'finished_good' and product_variant_id is not null;

comment on column public.inventory_items.product_variant_id is
  'Para los artículos de tipo finished_good: la variante del catálogo que representa. El armado los crea solo.';

-- Busca el artículo terminado de una variante, y lo crea si no existe. Pedirle
-- al dueño que lo cree a mano antes de armar sería pedirle que conozca una
-- tabla; esto es contabilidad interna, no una decisión suya.
create or replace function app.finished_good_for(p_variant_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_item uuid;
  v_workspace uuid;
  v_name text;
begin
  select id into v_item
  from public.inventory_items
  where product_variant_id = p_variant_id and kind = 'finished_good';

  if v_item is not null then
    return v_item;
  end if;

  select v.workspace_id, p.name || ' · ' || v.name
    into v_workspace, v_name
  from public.product_variants v
  join public.catalog_products p on p.id = v.product_id
  where v.id = p_variant_id;

  if v_workspace is null then
    raise exception 'esa variante no existe';
  end if;

  insert into public.inventory_items (workspace_id, kind, name, unit, min_stock, product_variant_id)
  values (v_workspace, 'finished_good', v_name, 'unidad', 0, p_variant_id)
  returning id into v_item;

  return v_item;
end;
$$;

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
  v_shortage text;
  v_item uuid;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'hay que armar al menos una unidad';
  end if;

  select v.workspace_id, r.id into v_workspace, v_recipe
  from public.product_variants v
  join public.recipes r on r.variant_id = v.id
  where v.id = p_variant_id
  order by r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'esa variante no tiene receta: no se sabe con qué armarla';
  end if;

  -- Primero se mira si alcanza para todo, y recién después se mueve algo.
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

  -- Las dos mitades en una sola orden: lo que sale y lo que entra. Un `insert`
  -- que lee lo que devolvió el anterior deja el costo repartido sin tener que
  -- guardarlo en ningún lado intermedio.
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
    -- Lo que costó armar una unidad es lo que se consumió, repartido: la misma
    -- regla con la que una impresión valoriza las piezas que produce.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    select v_workspace, 'production', v_item, p_units,
           round(coalesce((select sum(abs(quantity) * coalesce(unit_cost, 0)) from consumed), 0) / p_units, 6),
           'assembly',
           coalesce(p_note, 'Armado de producto')
    returning *
  )
  select * from consumed
  union all
  select * from produced;
end;
$$;

grant execute on function app.assemble_product(uuid, numeric, text) to authenticated;
grant execute on function app.finished_good_for(uuid) to authenticated;

comment on function app.assemble_product(uuid, numeric, text) is
  'Arma unidades de una variante: consume su receta y mete el producto terminado al inventario con el costo de lo consumido. Todo o nada.';
