-- Guardar una cotización es una sola transacción, una sola vez, y siempre
-- con cliente (T4-02 y la decisión del dueño del 2026-10-08).
--
-- El Cotizador hacía lo mismo que «Nuevo pedido»: pedía el número, insertaba
-- la cotización y después sus líneas, y si las líneas fallaban la borraba a
-- mano. El número se perdía, y con el operador, que no puede borrar, quedaba
-- una cotización sin líneas. `save_quote` lo hace todo o nada.
--
-- * El cliente es obligatorio: «siempre tiene que haber un nombre», dijo el
--   dueño. Tampoco vale «Clientes varios»: es el cliente de las ventas al
--   paso, que se cobran en el acto, y su cotización aceptada sería un pedido
--   que la base rechaza (`walk_in_buys_on_the_spot`). Las cotizaciones que ya
--   existen sin cliente siguen como están, y al aceptarlas se elige uno.
-- * Una versión nueva toma el número de su documento y la versión que sigue
--   a la última que existe, no a la que se abrió: dos personas que hacían la
--   versión 2 de la misma ya no chocan, la segunda queda como la 3. Y no se
--   hace versión nueva de un documento que ya tiene pedido: no se podría
--   enviar ni aceptar.
-- * Viaja con una llave: el mismo guardado pedido dos veces devuelve la
--   cotización que ya hizo.
-- * Montos, cantidades y tiempos se revisan contra lo que caben sus columnas,
--   con un mensaje que dice qué línea.
-- * Si responde a un pedido de cotización, lo marca cotizado en la misma
--   transacción.

alter table public.quotes add column save_key uuid;

create unique index quotes_one_per_save_key
  on public.quotes (workspace_id, save_key)
  where save_key is not null;

comment on column public.quotes.save_key is
  'La llave con que el Cotizador pidió guardar la cotización: la misma llave otra vez devuelve esta cotización en lugar de crear otra (save_quote).';

/*
 * The live order of a quote document (any of its versions), as its number,
 * or null. A cancelled order does not count: the customer can come back.
 */
create or replace function app.quote_document_order(p_workspace_id uuid, p_number text)
returns text
language sql
stable
as $$
  select o.number
  from public.orders o
  join public.quotes q on q.id = o.quote_id
  where q.workspace_id = p_workspace_id
    and q.number = p_number
    and o.status <> 'cancelled'
  order by o.created_at
  limit 1;
$$;

grant execute on function app.quote_document_order(uuid, text) to authenticated;

/*
 * Saves a quote with its lines in one transaction, once per key.
 *
 * `p_lines` is [{"variant_id", "description", "quantity", "setup_minutes",
 * "minutes_per_unit", "unit_cost", "unit_price", "plates", "items"}], as the
 * calculator worked them out with the shared rules: the database checks
 * they fit and are sensible, it does not price them again.
 *
 * `p_previous_quote_id` makes it a new version of that quote's document.
 */
create or replace function app.save_quote(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_channel_id uuid default null,
  p_request_id uuid default null,
  p_valid_until date default null,
  p_note text default null,
  p_snapshot jsonb default '{}'::jsonb,
  p_subtotal numeric default 0,
  p_discount numeric default 0,
  p_igv numeric default 0,
  p_total numeric default 0,
  p_previous_quote_id uuid default null,
  p_save_key uuid default null
)
returns public.quotes
language plpgsql
as $$
declare
  c_money_ceiling constant numeric := 1e10;
  c_cost_ceiling constant numeric := 1e8;
  c_minutes_ceiling constant numeric := 1e6;
  c_units_ceiling constant numeric := 2147483647;
  v_customer record;
  v_previous public.quotes;
  v_number text;
  v_version integer := 1;
  v_taken text;
  v_issued date;
  v_line jsonb;
  v_position integer := 0;
  v_variant_id uuid;
  v_name text;
  v_quantity numeric;
  v_amount numeric;
  v_field text;
  v_label text;
  v_ceiling numeric;
  v_quote public.quotes;
begin
  if not app.is_member(p_workspace_id) then
    raise exception 'No perteneces a este taller.';
  end if;

  -- The same save asked again: the quote it already made, and nothing else.
  if p_save_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('save_quote ' || p_save_key::text, 0));
    select * into v_quote
    from public.quotes q
    where q.workspace_id = p_workspace_id and q.save_key = p_save_key;
    if found then
      return v_quote;
    end if;
  end if;

  if p_customer_id is null then
    raise exception 'Elige el cliente de la cotización: siempre tiene que haber un nombre. Si es nuevo, créalo con «+ Nuevo cliente».';
  end if;
  select c.name, c.walk_in into v_customer
  from public.customers c
  where c.id = p_customer_id and c.workspace_id = p_workspace_id;
  if not found then
    raise exception 'No encontramos ese cliente en este taller.';
  end if;
  if v_customer.walk_in then
    raise exception '«%» es el cliente de las ventas rápidas, que se cobran en el acto: su cotización no se podría aceptar. Elige o crea a la persona que la pide.',
      v_customer.name;
  end if;

  if p_channel_id is not null then
    perform 1 from public.sales_channels c where c.id = p_channel_id and c.workspace_id = p_workspace_id;
    if not found then
      raise exception 'Ese canal de venta no es de este taller.';
    end if;
  end if;
  if p_request_id is not null then
    perform 1 from public.quote_requests r where r.id = p_request_id and r.workspace_id = p_workspace_id;
    if not found then
      raise exception 'Ese pedido de cotización no es de este taller.';
    end if;
  end if;

  -- NaN compares greater than everything, so the ceiling refuses it too.
  foreach v_field in array array['subtotal', 'discount', 'igv', 'total'] loop
    v_amount := case v_field
                  when 'subtotal' then p_subtotal
                  when 'discount' then p_discount
                  when 'igv' then p_igv
                  else p_total
                end;
    if v_amount is null or v_amount < 0 then
      raise exception 'Los montos de la cotización no pueden ser negativos.';
    end if;
    if v_amount >= c_money_ceiling then
      raise exception 'La cotización suma demasiado: revisa los precios y las cantidades.';
    end if;
  end loop;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos una línea a la cotización.';
  end if;

  if p_previous_quote_id is not null then
    select * into v_previous
    from public.quotes q
    where q.id = p_previous_quote_id and q.workspace_id = p_workspace_id;
    if not found then
      raise exception 'No encontramos la cotización de la que sale esta versión.';
    end if;

    -- Every version of the document, so two new versions saved at once queue up.
    perform 1
    from public.quotes q
    where q.workspace_id = p_workspace_id and q.number = v_previous.number
    order by q.version
    for update;

    v_taken := app.quote_document_order(p_workspace_id, v_previous.number);
    if v_taken is not null then
      raise exception 'La cotización % ya tiene el pedido %: una versión nueva no se podría enviar ni aceptar. Si el cliente pide algo más, cotízalo aparte.',
        v_previous.number, v_taken;
    end if;

    v_number := v_previous.number;
    select max(q.version) + 1 into v_version
    from public.quotes q
    where q.workspace_id = p_workspace_id and q.number = v_previous.number;
  else
    v_number := app.next_document_number(p_workspace_id, 'quote');
  end if;

  v_issued := app.workspace_day(p_workspace_id, now());
  if p_valid_until is not null and p_valid_until < v_issued then
    raise exception 'La vigencia tiene que terminar hoy o después. Para que no venza, déjala en 0 días.';
  end if;

  insert into public.quotes (
    workspace_id, number, version, parent_quote_id, customer_id, channel_id, request_id,
    status, issued_on, valid_until, cost_profile_snapshot, subtotal, discount, igv, total, note, save_key
  ) values (
    p_workspace_id, v_number, v_version, p_previous_quote_id, p_customer_id, p_channel_id, p_request_id,
    'draft', v_issued, p_valid_until, coalesce(p_snapshot, '{}'::jsonb),
    round(p_subtotal, 2), round(p_discount, 2), round(p_igv, 2), round(p_total, 2),
    nullif(btrim(coalesce(p_note, '')), ''), p_save_key
  )
  returning * into v_quote;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    v_name := nullif(btrim(coalesce(v_line ->> 'description', '')), '');
    if v_name is null then
      raise exception 'La línea % no dice qué se cotiza. Escribe una descripción.', v_position;
    end if;

    v_variant_id := nullif(btrim(coalesce(v_line ->> 'variant_id', '')), '')::uuid;
    if v_variant_id is not null then
      perform 1 from public.product_variants v where v.id = v_variant_id and v.workspace_id = p_workspace_id;
      if not found then
        raise exception 'El producto de «%» no es de este taller o ya no existe.', v_name;
      end if;
    end if;

    if jsonb_typeof(v_line -> 'quantity') is distinct from 'number' then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_name;
    end if;
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_name;
    end if;
    if v_quantity > c_units_ceiling then
      raise exception 'La cantidad de «%» es demasiado grande: revísala.', v_name;
    end if;

    foreach v_field in array array['unit_price', 'unit_cost', 'setup_minutes', 'minutes_per_unit'] loop
      v_label := case v_field
                   when 'unit_price' then 'el precio'
                   when 'unit_cost' then 'el costo'
                   when 'setup_minutes' then 'el tiempo de preparación'
                   else 'el trabajo por unidad'
                 end;
      if jsonb_typeof(v_line -> v_field) is distinct from 'number' then
        raise exception 'A «%» le falta %: vuelve a calcular la línea.', v_name, v_label;
      end if;
      v_amount := (v_line ->> v_field)::numeric;
      if v_amount < 0 then
        raise exception 'En «%», % no puede ser negativo.', v_name, v_label;
      end if;
      v_ceiling := case v_field
                     when 'unit_price' then c_money_ceiling
                     when 'unit_cost' then c_cost_ceiling
                     else c_minutes_ceiling
                   end;
      if v_amount >= v_ceiling then
        raise exception 'En «%», % es demasiado grande: revísalo.', v_name, v_label;
      end if;
    end loop;

    if (v_line ->> 'unit_price')::numeric * v_quantity >= c_money_ceiling then
      raise exception '«%» suma demasiado: revisa el precio y la cantidad.', v_name;
    end if;

    insert into public.quote_lines (
      workspace_id, quote_id, position, kind, variant_id, description, quantity,
      plates, items, setup_minutes, minutes_per_unit, unit_cost, unit_price
    ) values (
      p_workspace_id,
      v_quote.id,
      v_position,
      case when v_variant_id is null then 'custom' else 'catalog' end::public.quote_line_kind,
      v_variant_id,
      v_name,
      v_quantity::integer,
      case when jsonb_typeof(v_line -> 'plates') = 'array' then v_line -> 'plates' else '[]'::jsonb end,
      coalesce(case when jsonb_typeof(v_line -> 'items') in ('array', 'object') then v_line -> 'items' end, '[]'::jsonb),
      round((v_line ->> 'setup_minutes')::numeric, 2),
      round((v_line ->> 'minutes_per_unit')::numeric, 2),
      round((v_line ->> 'unit_cost')::numeric, 6),
      round((v_line ->> 'unit_price')::numeric, 2)
    );
  end loop;

  if p_request_id is not null then
    update public.quote_requests set status = 'quoted' where id = p_request_id;
  end if;

  return v_quote;
end;
$$;

grant execute on function app.save_quote(
  uuid, uuid, jsonb, uuid, uuid, date, text, jsonb, numeric, numeric, numeric, numeric, uuid, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.save_quote(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_channel_id uuid default null,
  p_request_id uuid default null,
  p_valid_until date default null,
  p_note text default null,
  p_snapshot jsonb default '{}'::jsonb,
  p_subtotal numeric default 0,
  p_discount numeric default 0,
  p_igv numeric default 0,
  p_total numeric default 0,
  p_previous_quote_id uuid default null,
  p_save_key uuid default null
)
returns public.quotes
language sql
volatile
as $$
  select app.save_quote(
    p_workspace_id, p_customer_id, p_lines, p_channel_id, p_request_id, p_valid_until, p_note,
    p_snapshot, p_subtotal, p_discount, p_igv, p_total, p_previous_quote_id, p_save_key
  );
$$;

grant execute on function public.save_quote(
  uuid, uuid, jsonb, uuid, uuid, date, text, jsonb, numeric, numeric, numeric, numeric, uuid, uuid
) to authenticated;

comment on function public.save_quote(uuid, uuid, jsonb, uuid, uuid, date, text, jsonb, numeric, numeric, numeric, numeric, uuid, uuid) is
  'Guarda una cotización con sus líneas en una sola transacción, siempre con cliente (no «Clientes varios»). p_previous_quote_id la hace versión nueva de ese documento. La misma llave (p_save_key) devuelve la cotización que ya hizo.';
