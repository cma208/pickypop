-- Al armar, las piezas salían del stock sin costo.
--
-- `assemble_product` tomaba el costo de `inventory_item_costs`, que lo deriva
-- de la última compra. Una pieza impresa no se compra nunca, así que su
-- movimiento de consumo quedaba con `unit_cost` nulo: el kardex mostraba
-- piezas saliendo gratis y el costo del producto armado salía por debajo.
--
-- El costo de una pieza ya lo resuelve `part_stock`, promediando lo que costó
-- producirla. Aquí solo hay que preguntarle a quien corresponde según el tipo
-- de artículo, en vez de a uno solo para todos.

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

  return query
  insert into public.stock_movements (
    workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
  )
  select v_workspace, 'consumption', ri.inventory_item_id,
         -(ri.quantity_per_unit * p_units),
         -- Lo que se compra vale lo que costó comprarlo; lo que se imprime,
         -- lo que costó imprimirlo.
         coalesce(ps.cost_per_unit, c.cost_per_unit), 'assembly',
         coalesce(p_note, 'Armado de producto')
  from public.recipe_items ri
  left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
  left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
  where ri.recipe_id = v_recipe
  returning *;
end;
$$;

grant execute on function app.assemble_product(uuid, numeric, text) to authenticated;
