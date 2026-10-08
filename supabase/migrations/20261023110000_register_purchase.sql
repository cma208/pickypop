-- Registering a purchase, all of it or nothing.
--
-- The browser used to write a purchase in four or five separate requests: the
-- purchase, its lines, the rolls, their movements and, last, the payment. Any
-- of them could fail after the others had gone in, and the tercera pasada
-- found every way it does:
--
-- * T1-06: an absurd quantity overflowed the lines, and the purchase stayed
--   as «Compra sin líneas · S/ 0.00 · Pagada».
-- * T1-05: two purchases of the same colour at the same time computed the same
--   roll label in the browser (last number + 1), the second one hit the unique
--   label and stayed with a line, a total to pay and no roll.
-- * T1-04: «Deshacer lo creado» deleted nothing for an operator (deleting is
--   the owner's), and said «Se deshizo».
--
-- Now one function writes it all in one transaction, and there is nothing
-- left to undo. It also decides what only the database can decide safely:
--
-- * The roll labels. «PLA-NEGRO-03» is the next free number for its material
--   and colour, taken under a lock per label, so two purchases at once wait
--   for each other instead of colliding. `app.spool_code_prefix` is the rule
--   that `spoolCodePrefix` used to apply in the browser, which no longer has it.
-- * The payment, when it was paid on the spot: the amount is what the
--   database says the purchase costs, as before (ADR-019). If the payment is
--   refused, the purchase is not written either, and the person sees why.
-- * The key: the same purchase asked again (a double click, a lost answer)
--   returns the purchase it already made.
--
-- The money arithmetic (how shipping is spread, what each roll costs) is still
-- `planPurchase` in packages/domain: the screen sends its plan, and this
-- function checks that it adds up to the cent before writing it.

alter table public.purchases
  add column purchase_key uuid;

create unique index purchases_one_per_key
  on public.purchases (workspace_id, purchase_key)
  where purchase_key is not null;

comment on column public.purchases.purchase_key is
  'La llave con que la pantalla pidió esta compra. Si se vuelve a pedir con la misma, register_purchase devuelve esta compra en vez de hacer otra.';

-- Letters and digits of a text, without accents, in capitals: «Azul cielo»
-- is AZULCIELO. The same steps as the browser used: NFD, drop the marks,
-- upper case, keep A-Z and 0-9.
create or replace function app.code_letters(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    upper(regexp_replace(normalize(coalesce(p_text, ''), NFD), '[̀-ͯ]', '', 'g')),
    '[^A-Z0-9]', '', 'g'
  );
$$;

-- The shelf label of a new roll without its number: «PETG-NEGRO». The
-- material is part of it so a PETG black and a PLA black never share a
-- sequence (H12), and a «+» becomes PLUS so PLA+ is not taken for PLA.
create or replace function app.spool_code_prefix(p_material text, p_color text)
returns text
language sql
immutable
as $$
  select case when material <> '' then material || '-' || color else color end
  from (
    select
      left(app.code_letters(replace(coalesce(p_material, ''), '+', 'PLUS')), 8) as material,
      coalesce(nullif(left(app.code_letters(p_color), 6), ''), 'ROLLO') as color
  ) parts;
$$;

-- Units that are counted, not measured: nobody buys 2.5 boxes. Free text
-- typed by somebody else («m», «kg») is not judged. The screen keeps the same
-- list in `inventario.format.ts` (WHOLE_UNITS).
create or replace function app.counted_whole(p_unit text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_unit, ''))) in ('unidad', 'unidades', 'par', 'pares', 'caja', 'cajas');
$$;

-- What a registered purchase says back: its total, what is paid, and the
-- rolls it brought in with the label each one got.
create or replace function app.purchase_receipt(p_purchase_id uuid, p_replayed boolean default false)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'purchase_id', p.id,
    'replayed', p_replayed,
    'total', s.total,
    'paid', s.paid,
    'pending', s.pending,
    'spools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'code', sp.code,
        'material_code', m.code,
        'color_name', k.color_name
      ) order by sp.code)
      from public.purchase_lines l
      join public.spools sp on sp.purchase_line_id = l.id
      join public.filament_skus k on k.id = sp.filament_sku_id
      join public.materials m on m.id = k.material_id
      where l.purchase_id = p.id
    ), '[]'::jsonb)
  )
  from public.purchases p
  join public.purchase_payment_status s on s.purchase_id = p.id
  where p.id = p_purchase_id;
$$;

grant execute on function app.code_letters(text) to authenticated;
grant execute on function app.spool_code_prefix(text, text) to authenticated;
grant execute on function app.counted_whole(text) to authenticated;
grant execute on function app.purchase_receipt(uuid, boolean) to authenticated;

/*
 * Registers a purchase in one transaction: the purchase, its lines, a roll
 * per filament bought (with its label), the movements that put everything on
 * the shelf and, if `p_account_id` is given, the payment of what it costs.
 *
 * `p_lines` is the screen's plan, one object per line, in order:
 *   {"filament_sku_id" or "inventory_item_id", "quantity", "unit_price",
 *    "allocated_extra_cost", "expires_on",
 *    "unit_costs": [the final cost of each roll]   (filament lines)
 *    "unit_cost": the final cost of one unit]       (supply lines)
 *
 * The caps are the same the screen applies (compra-form.ts): past them it is a
 * typing mistake, not a purchase of this workshop.
 *
 * `p_purchase_key` names the purchase. Asked again with the same key, the
 * function returns what it made the first time and writes nothing.
 */
create or replace function app.register_purchase(
  p_workspace_id uuid,
  p_lines jsonb,
  p_purchased_at date default null,
  p_supplier_id uuid default null,
  p_document_ref text default null,
  p_shipping_cost numeric default 0,
  p_other_costs numeric default 0,
  p_allocation public.cost_allocation default 'by_amount',
  p_note text default null,
  p_account_id uuid default null,
  p_payment_method public.payment_method default null,
  p_purchase_key uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  c_max_rolls constant integer := 500;
  c_max_quantity constant numeric := 1000000;
  c_max_unit_price constant numeric := 100000;
  c_max_extra constant numeric := 100000;
  c_max_total constant numeric := 1000000;
  c_oldest_day constant date := date '2000-01-01';
  -- Half of the sixth decimal: how far a unit cost rounded by `unitShare` can
  -- be from the exact division.
  c_unit_cost_slack constant numeric := 0.0000005;
  v_today date;
  v_day date;
  v_when timestamptz;
  v_shipping numeric := coalesce(p_shipping_cost, 0);
  v_other numeric := coalesce(p_other_costs, 0);
  v_purchase public.purchases;
  v_line jsonb;
  v_index bigint;
  v_sku public.filament_skus;
  v_material text;
  v_item public.inventory_items;
  v_name text;
  v_quantity numeric;
  v_price numeric;
  v_extra numeric;
  v_extra_sum numeric := 0;
  v_subtotal numeric;
  v_total numeric := 0;
  v_unit_costs jsonb;
  v_unit_cost numeric;
  v_cost jsonb;
  v_expires date;
  v_line_id uuid;
  v_prefix text;
  v_next numeric;
  v_spool public.spools;
  v_pending numeric;
begin
  if p_workspace_id is null or not app.is_member(p_workspace_id) then
    raise exception 'No perteneces a este taller.';
  end if;

  -- The same purchase asked again: what it made, and nothing else.
  if p_purchase_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('register_purchase ' || p_purchase_key::text, 0));
    select * into v_purchase
    from public.purchases
    where workspace_id = p_workspace_id and purchase_key = p_purchase_key;
    if found then
      return app.purchase_receipt(v_purchase.id, true);
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos un producto a la compra.';
  end if;

  v_today := app.workspace_day(p_workspace_id, now());
  v_day := coalesce(p_purchased_at, v_today);
  if v_day > v_today then
    raise exception 'La fecha de la compra no puede ser futura.';
  end if;
  if v_day < c_oldest_day then
    raise exception 'La fecha de la compra no es válida: revisa el año.';
  end if;
  -- Now if it is today, noon in the workshop otherwise: a bare date would be
  -- midnight UTC, the evening before in Lima.
  v_when := case
    when v_day = v_today then now()
    else (v_day + time '12:00') at time zone (select w.timezone from public.workspaces w where w.id = p_workspace_id)
  end;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.workspace_id = p_workspace_id
  ) then
    raise exception 'No existe el proveedor indicado.';
  end if;

  -- NaN compares greater than everything, so it would pass every check below.
  if v_shipping = 'NaN'::numeric or v_other = 'NaN'::numeric then
    raise exception 'El envío y los otros costos tienen que ser montos en soles.';
  end if;
  if v_shipping < 0 or v_other < 0 then
    raise exception 'El envío y los otros costos no pueden ser negativos.';
  end if;
  if v_shipping > c_max_extra or v_other > c_max_extra then
    raise exception 'El envío y los otros costos van hasta S/ 100000 cada uno: revisa el monto.';
  end if;
  if v_shipping <> round(v_shipping, 2) or v_other <> round(v_other, 2) then
    raise exception 'El envío y los otros costos van en céntimos: como máximo 2 decimales.';
  end if;

  insert into public.purchases (
    workspace_id, supplier_id, purchased_at, document_ref,
    shipping_cost, other_costs, allocation, note, purchase_key
  )
  values (
    p_workspace_id, p_supplier_id, v_day, nullif(btrim(p_document_ref), ''),
    v_shipping, v_other, coalesce(p_allocation, 'by_amount'), nullif(btrim(p_note), ''), p_purchase_key
  )
  returning * into v_purchase;

  for v_line, v_index in
    select value, ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    if jsonb_typeof(v_line) is distinct from 'object'
       or jsonb_typeof(v_line -> 'quantity') is distinct from 'number'
       or jsonb_typeof(v_line -> 'unit_price') is distinct from 'number' then
      raise exception 'A la línea % le falta la cantidad o el precio.', v_index;
    end if;
    if (nullif(v_line ->> 'filament_sku_id', '') is null) = (nullif(v_line ->> 'inventory_item_id', '') is null) then
      raise exception 'La línea % tiene que ser un filamento o un insumo.', v_index;
    end if;

    v_quantity := (v_line ->> 'quantity')::numeric;
    v_price := (v_line ->> 'unit_price')::numeric;
    v_extra := coalesce((v_line ->> 'allocated_extra_cost')::numeric, 0);
    v_sku := null;
    v_item := null;

    if nullif(v_line ->> 'filament_sku_id', '') is not null then
      select * into v_sku from public.filament_skus k where k.id = (v_line ->> 'filament_sku_id')::uuid;
      if v_sku.id is null or v_sku.workspace_id <> p_workspace_id then
        raise exception 'No existe el filamento de la línea %.', v_index;
      end if;
      select m.code into v_material from public.materials m where m.id = v_sku.material_id;
      v_name := btrim(coalesce(v_material, '') || ' ' || v_sku.color_name);
      if not v_sku.active then
        raise exception 'El filamento % está desactivado: actívalo en Filamentos para comprarlo.', v_name;
      end if;
      if v_quantity < 1 or v_quantity <> trunc(v_quantity) then
        raise exception 'Los rollos se compran enteros: revisa la cantidad de %.', v_name;
      end if;
      if v_quantity > c_max_rolls then
        raise exception 'Una línea va hasta % rollos: revisa la cantidad de %.', c_max_rolls, v_name;
      end if;
      if v_price <> round(v_price, 2) then
        raise exception 'El precio de un rollo va en céntimos: el de % tiene más de 2 decimales.', v_name;
      end if;
    else
      select * into v_item from public.inventory_items i where i.id = (v_line ->> 'inventory_item_id')::uuid;
      if v_item.id is null or v_item.workspace_id <> p_workspace_id then
        raise exception 'No existe el artículo de la línea %.', v_index;
      end if;
      v_name := v_item.name;
      -- A printed part and an assembled product are made here, never bought
      -- (ADR-016, ADR-018): bought, the shelf would be valued at a price paid.
      if v_item.kind in ('part', 'finished_good') then
        raise exception '% se produce en el taller: no se compra.', v_name;
      end if;
      if not v_item.active then
        raise exception 'El artículo % está desactivado: actívalo para comprarlo.', v_name;
      end if;
      if v_quantity <= 0 then
        raise exception 'La cantidad de % tiene que ser mayor que cero.', v_name;
      end if;
      if v_quantity > c_max_quantity then
        raise exception 'La cantidad de % va hasta 1000000: revísala.', v_name;
      end if;
      if v_quantity <> round(v_quantity, 3) then
        raise exception 'La cantidad de % admite hasta 3 decimales.', v_name;
      end if;
      if app.counted_whole(v_item.unit) and v_quantity <> trunc(v_quantity) then
        raise exception '% se cuenta por %: la cantidad va entera.', v_name, v_item.unit;
      end if;
      if v_price <> round(v_price, 6) then
        raise exception 'El precio de % admite hasta 6 decimales.', v_name;
      end if;
    end if;

    if v_price < 0 then
      raise exception 'El precio de % no puede ser negativo.', v_name;
    end if;
    if v_price > c_max_unit_price then
      raise exception 'El precio de % va hasta S/ 100000 por unidad: revísalo.', v_name;
    end if;
    if v_extra < 0 or v_extra <> round(v_extra, 2) then
      raise exception 'La parte del envío de % no es un monto válido.', v_name;
    end if;

    v_subtotal := round(v_quantity * v_price, 2);
    v_total := v_total + v_subtotal + v_extra;
    v_extra_sum := v_extra_sum + v_extra;

    v_expires := null;
    if v_item.id is not null and nullif(v_line ->> 'expires_on', '') is not null then
      v_expires := (v_line ->> 'expires_on')::date;
    end if;

    insert into public.purchase_lines (
      workspace_id, purchase_id, filament_sku_id, inventory_item_id,
      quantity, unit_price, allocated_extra_cost, expires_on
    )
    values (
      p_workspace_id, v_purchase.id, v_sku.id, v_item.id,
      v_quantity, v_price, v_extra, v_expires
    )
    returning id into v_line_id;

    if v_sku.id is not null then
      v_unit_costs := v_line -> 'unit_costs';
      if jsonb_typeof(v_unit_costs) is distinct from 'array' or jsonb_array_length(v_unit_costs) <> v_quantity then
        raise exception 'Falta el costo de cada rollo de %.', v_name;
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_unit_costs) c
        where jsonb_typeof(c) <> 'number' or (c #>> '{}')::numeric < 0
           or (c #>> '{}')::numeric <> round((c #>> '{}')::numeric, 2)
      ) or (
        select sum((c #>> '{}')::numeric) from jsonb_array_elements(v_unit_costs) c
      ) <> v_subtotal + v_extra then
        raise exception 'El costo de los rollos de % no cuadra con su precio y su parte del envío.', v_name;
      end if;

      -- One label sequence per material and colour. The lock makes a second
      -- purchase of the same one wait until this one is in, and then see its
      -- labels.
      v_prefix := app.spool_code_prefix(v_material, v_sku.color_name);
      perform pg_advisory_xact_lock(hashtextextended('spool_code ' || p_workspace_id::text || ' ' || v_prefix, 0));
      select coalesce(max(substring(s.code from '([0-9]+)$')::numeric), 0)
        into v_next
      from public.spools s
      where s.workspace_id = p_workspace_id
        and s.code ~* ('^' || v_prefix || '-[0-9]+$');

      for v_cost in select value from jsonb_array_elements(v_unit_costs) loop
        v_next := v_next + 1;
        insert into public.spools (
          workspace_id, filament_sku_id, purchase_line_id, code, initial_weight_g, unit_cost, status
        )
        values (
          p_workspace_id, v_sku.id, v_line_id,
          v_prefix || '-' || lpad(v_next::text, greatest(2, length(v_next::text)), '0'),
          v_sku.net_weight_g, (v_cost #>> '{}')::numeric, 'sealed'
        )
        returning * into v_spool;

        insert into public.stock_movements (
          workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, source_id, note
        )
        values (
          p_workspace_id, v_when, 'purchase', v_spool.id, v_spool.initial_weight_g,
          v_spool.cost_per_gram, 'purchase', v_purchase.id, 'Ingreso del rollo'
        );
      end loop;
    else
      if jsonb_typeof(v_line -> 'unit_cost') is distinct from 'number' then
        raise exception 'Falta el costo por unidad de %.', v_name;
      end if;
      v_unit_cost := (v_line ->> 'unit_cost')::numeric;
      if abs(v_unit_cost - (v_subtotal + v_extra) / v_quantity) > c_unit_cost_slack then
        raise exception 'El costo por unidad de % no cuadra con su precio y su parte del envío.', v_name;
      end if;

      insert into public.stock_movements (
        workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
      )
      values (
        p_workspace_id, v_when, 'purchase', v_item.id, v_quantity,
        v_unit_cost, 'purchase', v_purchase.id, 'Ingreso por compra'
      );
    end if;
  end loop;

  if v_extra_sum <> v_shipping + v_other then
    raise exception 'El envío y los otros costos no quedaron repartidos entre las líneas: se repartieron S/ % de S/ %.',
      to_char(v_extra_sum, 'FM999999999990.00'),
      to_char(v_shipping + v_other, 'FM999999999990.00');
  end if;
  if v_total > c_max_total then
    raise exception 'La compra suma S/ %, y va hasta S/ 1000000: revisa cantidades y precios.',
      to_char(v_total, 'FM999999999990.00');
  end if;

  -- Last, so the amount is what the database says the purchase costs.
  if p_account_id is not null then
    select s.pending into v_pending
    from public.purchase_payment_status s
    where s.purchase_id = v_purchase.id;

    if v_pending > 0 then
      perform app.record_purchase_payment(
        p_purchase_id => v_purchase.id,
        p_account_id => p_account_id,
        p_amount => v_pending,
        p_payment_method => p_payment_method,
        p_occurred_at => v_when
      );
    end if;
  end if;

  return app.purchase_receipt(v_purchase.id, false);
end;
$$;

grant execute on function app.register_purchase(
  uuid, jsonb, date, uuid, text, numeric, numeric, public.cost_allocation, text, uuid, public.payment_method, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.register_purchase(
  p_workspace_id uuid,
  p_lines jsonb,
  p_purchased_at date default null,
  p_supplier_id uuid default null,
  p_document_ref text default null,
  p_shipping_cost numeric default 0,
  p_other_costs numeric default 0,
  p_allocation public.cost_allocation default 'by_amount',
  p_note text default null,
  p_account_id uuid default null,
  p_payment_method public.payment_method default null,
  p_purchase_key uuid default null
)
returns jsonb
language sql
volatile
as $$
  select app.register_purchase(
    p_workspace_id, p_lines, p_purchased_at, p_supplier_id, p_document_ref,
    p_shipping_cost, p_other_costs, p_allocation, p_note,
    p_account_id, p_payment_method, p_purchase_key
  );
$$;

grant execute on function public.register_purchase(
  uuid, jsonb, date, uuid, text, numeric, numeric, public.cost_allocation, text, uuid, public.payment_method, uuid
) to authenticated;
