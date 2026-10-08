-- A manual entry or exit of a supply is written once, however many times it
-- arrives.
--
-- The review of the tercera pasada showed what a lost answer does on the
-- purchase screens: the database committed, the phone never heard it, and a
-- retry wrote the thing again. «Movimiento» on a supply, a bag or a spare
-- part has the same hole. The dialog ignores a second click, but an entry of
-- 500 g whose answer is lost and is sent again puts 1000 g on the shelf. A
-- count is harmless (it says what there is), an entry or an exit is not.
--
-- So `move_item_stock` takes a key, like `record_purchase_payment`: asked
-- again with the same key, it returns what it did the first time and writes
-- nothing. The keys live in a table of their own, beside `stock_movements`,
-- with the answer they got.

create table public.item_movement_requests (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  request_key uuid not null,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_key)
);

comment on table public.item_movement_requests is
  'La llave con que se pidió cada movimiento a mano de un insumo, y lo que respondió move_item_stock. Si el mismo pedido llega dos veces (la respuesta se perdió y se reintentó), devuelve esa respuesta en vez de mover el stock otra vez.';

select app.apply_workspace_rls('item_movement_requests');

-- The signature gains a parameter: the old one has to go, or PostgREST would
-- see two candidates for the same call.
drop function public.move_item_stock(uuid, text, numeric, public.stock_movement_type, text);
drop function app.move_item_stock(uuid, text, numeric, public.stock_movement_type, text);

/*
 * `p_mode`: 'in' adds `p_quantity`, 'out' takes it out (as `p_reason`:
 * consumption or waste), 'count' says that `p_quantity` is what there is.
 * Returns {"before", "difference", "after", "replayed"}: a difference of zero
 * wrote nothing.
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
  p_request_key uuid default null
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
  v_result jsonb;
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

  v_result := jsonb_build_object(
    'before', v_before,
    'difference', v_difference,
    'after', v_before + v_difference,
    'replayed', false
  );

  if p_request_key is not null then
    insert into public.item_movement_requests (workspace_id, request_key, inventory_item_id, result)
    values (v_item.workspace_id, p_request_key, p_item_id, v_result);
  end if;

  return v_result;
end;
$$;

grant execute on function app.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid) to authenticated;

create function public.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null,
  p_request_key uuid default null
)
returns jsonb
language sql
volatile
as $$
  select app.move_item_stock(p_item_id, p_mode, p_quantity, p_reason, p_note, p_request_key);
$$;

grant execute on function public.move_item_stock(uuid, text, numeric, public.stock_movement_type, text, uuid) to authenticated;
