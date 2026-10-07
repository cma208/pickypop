-- Contar el estante.
--
-- Desde la etapa 1 un pedido solo llega a "Entregado" entregándolo, y entregar
-- saca del estante lo que se lleva el cliente. Pero el estante de la aplicación
-- no sabe lo que el taller ya tenía hecho antes de que existiera: pociones
-- armadas a mano, tapas impresas sin registrar. Sin una forma de decirlo, los
-- pedidos abiertos quedarían trabados con "No alcanza para entregar".
--
-- Contar es decir cuántas hay de verdad. La diferencia con lo que la aplicación
-- creía se registra como movimiento, con origen `shelf_count`:
--
-- * Si hay más de lo que se creía, entran como `production`: se hicieron, solo
--   que antes de que alguien las anotara. Así las valoriza la misma regla que a
--   lo armado y a lo impreso, sin un caso aparte.
-- * Si hay menos, salen como `adjustment`, al costo promedio de lo que había.
--
-- Lo que entra necesita un costo, o una entrega futura lo valdría cero y el
-- costo de ventas mentiría. Se toma el que la base ya conoce (el promedio de lo
-- producido o, para un producto, lo que costaría armarlo hoy). Si no conoce
-- ninguno, la persona escribe uno aproximado.

-- Lo que cuesta armar una unidad de una variante con lo que hay hoy en el
-- estante: la misma regla con la que `assemble_product` valoriza lo que arma.
-- Nulo si la receta falta o está vacía, o si algún componente no tiene costo:
-- un costo a medias se vería como uno completo.
create or replace function app.assembly_unit_cost(p_variant_id uuid)
returns numeric
language sql
stable
as $$
  with recipe as (
    select r.id
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
  )
  select case
           when count(*) = 0 or bool_or(unit_cost is null) then null
           else round(sum(quantity * unit_cost), 6)
         end
  from components;
$$;

grant execute on function app.assembly_unit_cost(uuid) to authenticated;

-- Lo que se cuenta: cada pieza impresa activa y cada variante que se arma, con
-- lo que la aplicación cree que hay y lo que vale una unidad. Una variante que
-- nadie armó todavía no tiene artículo propio y aparece con cero.
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
  order by r.version desc
  limit 1
) r on r.assembled
left join public.inventory_items fg on fg.product_variant_id = v.id and fg.kind = 'finished_good'
left join public.inventory_balances b on b.inventory_item_id = fg.id
where v.active;

comment on view public.shelf_count_items is
  'Piezas impresas y productos que se arman, con lo que la aplicación cree que hay en el estante y lo que vale una unidad.';

/*
 * Records a count of the shelf in one transaction.
 *
 * `p_counts` is [{"inventory_item_id": ..., "counted": 7}] for a part, or
 * [{"variant_id": ..., "counted": 4}] for a product, which may have no item
 * of its own yet. "unit_cost" is optional and only used for units that come
 * in when the database knows no cost for them.
 *
 * Only what differs moves. Returns how many articles changed.
 */
create or replace function app.count_shelf(p_counts jsonb, p_note text default null)
returns integer
language plpgsql
as $$
declare
  v_entry jsonb;
  v_item uuid;
  v_counted numeric;
  v_given numeric;
  -- [{"item": uuid, "counted": n, "given": n}], one per article counted.
  v_rows jsonb := '[]'::jsonb;
  -- [{"item", "workspace", "name", "diff", "unit_cost"}], only what changes.
  v_moves jsonb;
  v_missing text;
  v_note text := coalesce(nullif(btrim(p_note), ''), 'Conteo del estante');
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'No hay nada contado.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_counts) loop
    v_counted := (v_entry ->> 'counted')::numeric;
    if v_counted is null or v_counted < 0 or v_counted <> trunc(v_counted) then
      raise exception 'Lo contado tiene que ser un número entero, cero o más.';
    end if;

    v_given := nullif(v_entry ->> 'unit_cost', '')::numeric;
    if v_given is not null and v_given < 0 then
      raise exception 'El costo por unidad no puede ser negativo.';
    end if;

    if v_entry ? 'variant_id' then
      select id into v_item
      from public.inventory_items
      where product_variant_id = (v_entry ->> 'variant_id')::uuid and kind = 'finished_good';

      if v_item is null then
        -- Nobody has assembled it yet. Counting none of it leaves it that way
        -- instead of creating an empty article.
        continue when v_counted = 0;
        v_item := app.finished_good_for((v_entry ->> 'variant_id')::uuid);
      end if;
    else
      v_item := (v_entry ->> 'inventory_item_id')::uuid;
    end if;

    if v_rows @> jsonb_build_array(jsonb_build_object('item', v_item)) then
      raise exception 'Un mismo artículo aparece dos veces en el conteo.';
    end if;

    v_rows := v_rows || jsonb_build_object('item', v_item, 'counted', v_counted, 'given', v_given);
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_rows) r
    left join public.inventory_items i on i.id = (r ->> 'item')::uuid
    where i.id is null or i.kind not in ('part', 'finished_good')
  ) then
    raise exception 'Aquí solo se cuentan piezas impresas y productos armados.';
  end if;

  -- Locked before reading what is there, in id order, so a delivery or an
  -- assembly running at the same time waits instead of slipping in between.
  perform 1
  from public.inventory_items
  where id in (select (r ->> 'item')::uuid from jsonb_array_elements(v_rows) r)
  order by id
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item', d.item,
           'workspace', d.workspace_id,
           'name', d.name,
           'diff', d.diff,
           'unit_cost', case when d.diff > 0 then coalesce(d.given, d.known) else d.known end
         )), '[]'::jsonb)
    into v_moves
  from (
    select
      i.id as item,
      i.workspace_id,
      i.name,
      (r ->> 'counted')::numeric - coalesce(b.on_hand, 0) as diff,
      (r ->> 'given')::numeric as given,
      case
        when i.kind = 'finished_good'
          then coalesce(app.produced_unit_cost(i.id), app.assembly_unit_cost(i.product_variant_id))
        else ps.cost_per_unit
      end as known
    from jsonb_array_elements(v_rows) r
    join public.inventory_items i on i.id = (r ->> 'item')::uuid
    left join public.inventory_balances b on b.inventory_item_id = i.id
    left join public.part_stock ps on ps.inventory_item_id = i.id
  ) d
  where d.diff <> 0;

  select string_agg(m ->> 'name', ', ' order by m ->> 'name')
    into v_missing
  from jsonb_array_elements(v_moves) m
  where (m ->> 'diff')::numeric > 0 and m ->> 'unit_cost' is null;

  if v_missing is not null then
    raise exception 'No sabemos cuánto costó cada unidad de: %. Escribe un costo aproximado por unidad.', v_missing;
  end if;

  insert into public.stock_movements (
    workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
  )
  select
    (m ->> 'workspace')::uuid,
    case when (m ->> 'diff')::numeric > 0 then 'production' else 'adjustment' end::public.stock_movement_type,
    (m ->> 'item')::uuid,
    (m ->> 'diff')::numeric,
    (m ->> 'unit_cost')::numeric,
    'shelf_count',
    v_note
  from jsonb_array_elements(v_moves) m;

  return jsonb_array_length(v_moves);
end;
$$;

grant execute on function app.count_shelf(jsonb, text) to authenticated;

comment on function app.count_shelf(jsonb, text) is
  'Registra un conteo del estante: lo que difiere de lo que la aplicación creía entra como producción o sale como ajuste. Todo o nada.';

-- PostgREST only sees the public schema.
create or replace function public.count_shelf(p_counts jsonb, p_note text default null)
returns integer
language sql
volatile
as $$
  select app.count_shelf(p_counts, p_note);
$$;

grant execute on function public.count_shelf(jsonb, text) to authenticated;
