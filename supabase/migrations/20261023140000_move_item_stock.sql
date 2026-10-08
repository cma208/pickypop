-- A movement of a supply by hand, judged against what there is when it is saved.
--
-- «Movimiento» on a supply, a bag or a spare part had the weighing's problem
-- (T3-02): the count mode wrote «counted − what there was when the dialog
-- opened», and «no puedes sacar más de lo que hay» was checked against that
-- same old number. Two tabs, or an assembly in between, and the count left the
-- shelf somewhere nobody counted.
--
-- Now the screen sends what the person did (entered, took out, counted) and
-- `move_item_stock` works out the movement under the article's lock.
--
-- Only for what is bought and spent: supplies, packaging and spare parts. A
-- printed part and a product move only through their flows (ADR-020).

/*
 * `p_mode`: 'in' adds `p_quantity`, 'out' takes it out (as `p_reason`:
 * consumption or waste), 'count' says that `p_quantity` is what there is.
 * Returns {"before", "difference", "after"}: a difference of zero wrote
 * nothing.
 */
create or replace function app.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null
)
returns jsonb
language plpgsql
as $$
declare
  c_max_quantity constant numeric := 1000000;
  v_item public.inventory_items;
  v_before numeric;
  v_difference numeric;
  v_type public.stock_movement_type;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'No existe el artículo indicado.';
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

  select coalesce(sum(m.quantity), 0) into v_before
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

  if v_difference <> 0 then
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    values (
      v_item.workspace_id,
      v_type,
      p_item_id,
      v_difference,
      (select c.cost_per_unit from public.inventory_item_costs c where c.inventory_item_id = p_item_id),
      'manual',
      coalesce(
        v_note,
        case when p_mode = 'count'
          then format('Conteo: había %s, se contaron %s', trim_scale(v_before)::text, trim_scale(p_quantity)::text)
        end
      )
    );
  end if;

  return jsonb_build_object(
    'before', v_before,
    'difference', v_difference,
    'after', v_before + v_difference
  );
end;
$$;

grant execute on function app.move_item_stock(uuid, text, numeric, public.stock_movement_type, text) to authenticated;

create or replace function public.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null
)
returns jsonb
language sql
volatile
as $$
  select app.move_item_stock(p_item_id, p_mode, p_quantity, p_reason, p_note);
$$;

grant execute on function public.move_item_stock(uuid, text, numeric, public.stock_movement_type, text) to authenticated;
