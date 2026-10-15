-- Lo que entra sin compra trae su costo (ADR-023, punto 7).
--
-- Un insumo, un empaque o un repuesto cuesta lo que dice
-- `inventory_item_costs`: su última compra, y si no tiene, su costo estándar
-- (`inventory_items.standard_cost`). Ninguna pantalla escribía ese costo
-- estándar, y «Movimiento → Entrada» no pedía precio. Así, lo que solo entró
-- a mano (lo que ya había, un regalo del proveedor) valía S/ 0 al armar, al
-- entregar, en el cotizador, en el catálogo y en las mermas, y su movimiento
-- quedaba sin costo. En producción ya pasó con los empaques.
--
-- Ahora `move_item_stock` toma `p_unit_cost`, al final de la firma:
--
-- * Si el movimiento cambia el stock (una entrada, una salida, o un conteo
--   con diferencia) y el artículo no tiene costo, lo exige. Queda como su
--   costo estándar y como el costo del movimiento. Va de más de S/ 0 a
--   S/ 100 000 por unidad, con hasta 4 decimales, los de la columna: un valor
--   con más no se redondea callado, se rechaza.
-- * Si el artículo ya tiene costo (una compra o su costo estándar), lo ignora
--   y manda la vista, como antes. Lo pagado se registra en Compras.
-- * Un conteo sin diferencia no escribe nada y no lo pide.
--
-- El resultado dice además con qué costo se movió (`unit_cost`,
-- `cost_source`), y la llave del pedido lo guarda con lo demás, para que un
-- reintento conteste lo mismo. La firma cambia, así que la vieja se suelta de
-- las dos funciones: PostgREST vería dos candidatas para la misma llamada.
-- El resto es lo de 20261027120000_results_see_what_leaves_the_stock (la de
-- `app`) y 20261027110000_purchases_ask_the_role_first (la de `public`).
--
-- `app.guard_inventory_item_ranges` suma el tope del costo estándar, el mismo
-- precio por unidad que admite una línea de compra, con la frase que ya dice
-- `move_item_stock`, para la ficha del artículo y una llamada directa. Como
-- la regla del mínimo, solo juzga el número que se está escribiendo.
--
-- Nada de lo guardado cambia: lo que ya entró sin costo lo corrige el dueño
-- desde la ficha del artículo o con una compra, no esta migración.

-- ------------------------------------------------------------- el movimiento

drop function public.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid);
drop function app.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid);

/*
 * `p_mode`: 'in' adds `p_quantity`, 'out' takes it out (as `p_reason`:
 * consumption or waste), 'count' says that `p_quantity` is what there is.
 * Returns {"before", "difference", "after", "unit_cost", "cost_source",
 * "replayed"}. A difference of zero wrote nothing, and its cost is the
 * article's as it stands, null and 'unknown' when it has none.
 *
 * `p_unit_cost` is what one unit is worth, asked only when the article has
 * no cost and the stock changes. Otherwise it is ignored.
 *
 * `p_request_key` names the request. Asked again with the same key, the
 * function returns its first answer, with "replayed" true, and moves nothing.
 */
create function app.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null,
  p_request_key uuid default null,
  p_unit_cost numeric default null
)
returns jsonb
language plpgsql
as $$
declare
  c_max_quantity constant numeric := 1000000;
  -- The price per unit a purchase line takes.
  c_max_unit_cost constant numeric := 100000;
  v_item public.inventory_items;
  v_before numeric;
  v_difference numeric;
  v_type public.stock_movement_type;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_tracked boolean;
  v_unit_cost numeric;
  v_cost_source text;
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'No existe el artículo indicado.';
  end if;

  -- The same request asked again: its first answer, before judging anything,
  -- because an exit already made would now find less on the shelf.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('move_item_stock ' || p_request_key::text, 0));
    select r.result into v_result
    from public.item_movement_requests r
    where r.workspace_id = v_item.workspace_id and r.request_key = p_request_key;
    if found then
      return v_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  if v_item.kind not in ('supply', 'packaging', 'spare_part') then
    raise exception '% se mueve solo por sus flujos: imprimir, armar, entregar o contar el estante.', v_item.name;
  end if;
  if p_mode is null or p_mode not in ('in', 'out', 'count') then
    raise exception 'Elige si es una entrada, una salida o un conteo.';
  end if;

  if p_quantity is null or p_quantity = 'NaN'::numeric then
    raise exception 'Indica la cantidad.';
  end if;
  if p_quantity < 0 or (p_mode <> 'count' and p_quantity = 0) then
    raise exception 'La cantidad tiene que ser mayor que cero.';
  end if;
  if p_quantity > c_max_quantity then
    raise exception 'La cantidad va hasta 1000000: revísala.';
  end if;
  if p_quantity <> round(p_quantity, 3) then
    raise exception 'La cantidad admite hasta 3 decimales.';
  end if;
  if app.counted_whole(v_item.unit) and p_quantity <> trunc(p_quantity) then
    raise exception '% se cuenta por %: la cantidad va entera.', v_item.name, v_item.unit;
  end if;

  select coalesce(sum(m.quantity), 0), count(*) > 0 into v_before, v_tracked
  from public.stock_movements m
  where m.inventory_item_id = p_item_id
    and m.type not in ('reservation', 'release');

  if p_mode = 'out' and p_quantity > v_before then
    raise exception 'No puedes sacar más de lo que hay: quedan % %.', trim_scale(v_before)::text, v_item.unit;
  end if;

  v_difference := case p_mode
    when 'in' then p_quantity
    when 'out' then -p_quantity
    else p_quantity - v_before
  end;

  v_type := case
    when p_mode = 'out' and p_reason in ('consumption', 'waste') then p_reason
    when p_mode = 'out' then 'consumption'
    else 'adjustment'
  end;

  select c.cost_per_unit, c.cost_source into v_unit_cost, v_cost_source
  from public.inventory_item_costs c
  where c.inventory_item_id = p_item_id;

  -- Stock that moves without a cost is worth S/ 0 to everything that reads
  -- it later: assembling, delivering, quoting, the losses in Resultados. An
  -- article with no purchase and no standard cost gets one here, from the
  -- person who knows what it is worth. One that has a cost keeps it: what
  -- was paid goes through Compras, not through this field.
  if v_difference <> 0 and v_cost_source = 'unknown' then
    if p_unit_cost is null then
      raise exception '% todavía no tiene costo: escribe cuánto vale cada %.', v_item.name, v_item.unit;
    end if;
    -- numeric sorts NaN above every number: unnamed, it would only reach the
    -- cap, with a sentence about a number nobody wrote.
    if p_unit_cost = 'NaN'::numeric or p_unit_cost <= 0 then
      raise exception 'El costo por % tiene que ser mayor que cero.', v_item.unit;
    end if;
    if p_unit_cost > c_max_unit_cost then
      raise exception 'El costo por unidad va hasta S/ 100 000: revisa el número.';
    end if;
    -- standard_cost keeps 4 decimals: a fifth would be rounded away quietly,
    -- and the movement would say one cost and the article another.
    if p_unit_cost <> round(p_unit_cost, 4) then
      raise exception 'El costo por % admite hasta 4 decimales.', v_item.unit;
    end if;

    update public.inventory_items
    set standard_cost = p_unit_cost
    where id = p_item_id;

    v_unit_cost := p_unit_cost;
    v_cost_source := 'standard';
  end if;

  if v_difference <> 0 then
    -- A count names what it counted, as a weighing names its roll: that is
    -- how Resultados tells a count that found more from an entry. The first
    -- count of an article that never moved is its opening stock, what was
    -- there before anyone counted: it names nothing, like an entry.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    values (
      v_item.workspace_id,
      v_type,
      p_item_id,
      v_difference,
      v_unit_cost,
      'manual',
      case when p_mode = 'count' and v_tracked then p_item_id end,
      coalesce(
        v_note,
        case when p_mode = 'count'
          then format('Conteo: había %s, se contaron %s', trim_scale(v_before)::text, trim_scale(p_quantity)::text)
        end
      )
    );
  end if;

  v_result := jsonb_build_object(
    'before', v_before,
    'difference', v_difference,
    'after', v_before + v_difference,
    'unit_cost', v_unit_cost,
    'cost_source', v_cost_source,
    'replayed', false
  );

  if p_request_key is not null then
    insert into public.item_movement_requests (workspace_id, request_key, inventory_item_id, result)
    values (v_item.workspace_id, p_request_key, p_item_id, v_result);
  end if;

  return v_result;
end;
$$;

grant execute on function app.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid, numeric) to authenticated;

create function public.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null,
  p_request_key uuid default null,
  p_unit_cost numeric default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_flow text := current_setting('app.stock_flow', true);
  v_result jsonb;
begin
  -- The role first: «Solo lectura» hears it was the role, not the cost.
  perform app.require_operator(
    (select i.workspace_id from public.inventory_items i where i.id = p_item_id),
    'No existe el artículo indicado.',
    'mover el stock de un artículo'
  );
  -- The entry, exit or count enters the stock through the policy, as its flow.
  perform set_config('app.stock_flow', 'move_item_stock', true);
  v_result := app.move_item_stock(p_item_id, p_mode, p_quantity, p_reason, p_note, p_request_key, p_unit_cost);
  perform set_config('app.stock_flow', coalesce(v_flow, ''), true);
  return v_result;
end;
$$;

grant execute on function public.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid, numeric) to authenticated;

-- ------------------------------------------------------------- los topes

-- The one of 20261023190000_article_ranges, with the standard cost capped at
-- the price per unit a purchase line takes.
create or replace function app.guard_inventory_item_ranges()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or new.min_stock is distinct from old.min_stock)
     and new.min_stock > 1000000 then
    raise exception 'El mínimo va hasta 1 000 000: revisa el número.';
  end if;

  if (tg_op = 'INSERT' or new.standard_cost is distinct from old.standard_cost)
     and new.standard_cost > 100000 then
    raise exception 'El costo por unidad va hasta S/ 100 000: revisa el número.';
  end if;

  return new;
end;
$$;
