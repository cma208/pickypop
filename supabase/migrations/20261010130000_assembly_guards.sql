-- Armar no fabrica de la nada, no deja pasar a dos a la vez, y sabe qué no se arma.
--
-- Tres huecos de `app.assemble_product` que encontró el barrido:
--
-- 1. **Una receta sin artículos armaba unidades de la nada, a costo cero.**
--    La revisión de faltantes no encontraba nada que faltara, y el producto
--    terminado entraba igual.
-- 2. **Dos personas armando a la vez pasaban las dos la revisión de stock.**
--    Ahora se bloquean las filas de lo que se va a consumir antes de mirar el
--    stock, en orden, para que dos armados se pongan en fila sin trabarse.
-- 3. **Una pieza suelta tenía que "armarse" aunque fuera una sola** (un
--    llavero). El dueño decidió que la receta diga si el producto se arma. Lo
--    que no se arma no tiene producto terminado: al entregarlo se descuentan
--    directamente sus piezas y su empaque.

alter table public.recipes
  add column assembled boolean not null default true;

comment on column public.recipes.assembled is
  'Si el producto se arma. Falso: se entrega tal como sale de la impresora, y al entregarlo se descuentan directamente sus piezas e insumos.';

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

  -- Lo que se va a consumir queda bloqueado hasta el final, en orden de id
  -- para que dos armados que comparten artículos no se esperen en cruz.
  perform 1
  from public.inventory_items
  where id in (select inventory_item_id from public.recipe_items where recipe_id = v_recipe)
  order by id
  for update;

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

-- Lo que no se arma no aparece en la pantalla de armar.
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
  select id, assembled from public.recipes where variant_id = v.id order by version desc limit 1
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

comment on view public.assembly_options is
  'Variantes que se arman: cuántas hay armadas y cuántas más alcanzan a armarse con el stock de hoy.';
