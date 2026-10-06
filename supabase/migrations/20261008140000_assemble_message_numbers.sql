-- "hacen falta 20. y hay 8." — el punto suelto no es un detalle.
--
-- La máscara `FM999999990.999` quita los decimales que sobran pero deja el
-- separador, así que un número redondo salía con un punto colgando. El mensaje
-- de esta función es lo que lee una persona cuando no le alcanza el stock, y
-- ahí un número mal escrito hace dudar del número.

-- Un número para leer: sin ceros de relleno, sin decimales inútiles y sin el
-- punto que queda colgando cuando no hay ninguno.
create or replace function app.tidy_number(value numeric)
returns text
language sql
immutable
as $$
  select rtrim(rtrim(to_char(value, 'FM999999999990.999'), '0'), '.');
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
         c.cost_per_unit, 'assembly',
         coalesce(p_note, 'Armado de producto')
  from public.recipe_items ri
  left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
  where ri.recipe_id = v_recipe
  returning *;
end;
$$;

grant execute on function app.assemble_product(uuid, numeric, text) to authenticated;

comment on function app.assemble_product(uuid, numeric, text) is
  'Arma unidades de una variante consumiendo su receta. Todo o nada: si falta algo, no mueve nada y dice qué y cuánto.';
