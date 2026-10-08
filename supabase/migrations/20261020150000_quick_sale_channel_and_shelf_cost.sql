-- The quick sale keeps its channel, and its line costs what left the shelf
-- (the owner's decisions on ADR-024 and ADR-022).
--
-- The channel. Every order can say where the sale came from
-- (`orders.channel_id`), and the quick sale said nothing: a basket sold at
-- the door and one sold through Instagram looked the same. `quick_sale`
-- receives it now. When the call names none it takes the workshop's default
-- channel, the one that stands for direct sales, so a screen that does not
-- send it yet still records one.
--
-- * The default is the owner's choice (`workshop_settings.default_channel_id`,
--   in Configuración › Canales de venta). It is set here, once, to the active
--   channel called «Directo», which bootstrap.sql creates. A workshop without
--   one has no default until the owner chooses it: nothing else is guessed,
--   not even the only active channel, because «Instagram» alone is not where
--   the sales at the door come from. The screen says it is missing.
-- * The channel has to be of the workshop and active.
-- * A channel's commission is only used by the quote calculator, to gross up
--   the price of made-to-order work. A catalogue product sells at its list
--   price, the quick sale included, and Resultados does not read the
--   commission. So the channel is only recorded: nothing is charged for it.
--
-- The cost. A quick sale takes what is on the shelf and delivers it in the
-- same transaction, so its real cost is known the moment it is sold. Its
-- line keeps that as its estimate, what the delivery says a unit cost when it
-- left the shelf (labour included since 20261020100000), instead of the cost
-- of a new batch of that quantity the screen sent. The order then says the
-- same as Resultados, which reads the delivery. The screen no longer sends a
-- cost, and one it sends is not read.
--
-- `finished_good_costs` lets the screen show that cost before selling: what
-- a unit of each assembled product is worth on the shelf, by the very
-- function a delivery uses.

-- ----------------------------------------------------- the default channel

-- Lets the settings point at a channel of their own workshop only, and the
-- foreign key say so without a trigger.
alter table public.sales_channels
  add constraint sales_channels_id_workspace_key unique (id, workspace_id);

alter table public.workshop_settings
  add column default_channel_id uuid,
  add constraint workshop_settings_default_channel_fkey
    foreign key (default_channel_id, workspace_id)
    references public.sales_channels (id, workspace_id);

comment on column public.workshop_settings.default_channel_id is
  'El canal de las ventas directas: el que la Venta rápida pone por defecto. Sin elegir, ninguno: la Venta rápida avisa que falta y vende sin canal.';

-- «Directo» and «directo» may both exist: one per workshop, or the upsert
-- would touch the same row twice.
insert into public.workshop_settings (workspace_id, default_channel_id)
select distinct on (c.workspace_id) c.workspace_id, c.id
from public.sales_channels c
where c.active
  and lower(btrim(c.name)) = 'directo'
order by c.workspace_id, c.name = 'Directo' desc, c.created_at
on conflict (workspace_id) do update
  set default_channel_id = excluded.default_channel_id
  where public.workshop_settings.default_channel_id is null;

/*
 * The workshop's default channel: the one the owner chose, while it is still
 * active. Without a choice, none: which channel the sales at the door come
 * through is not guessed.
 */
create or replace function app.default_channel(p_workspace_id uuid)
returns uuid
language sql
stable
as $$
  select c.id
  from public.workshop_settings s
  join public.sales_channels c on c.id = s.default_channel_id and c.active
  where s.workspace_id = p_workspace_id;
$$;

grant execute on function app.default_channel(uuid) to authenticated;

-- PostgREST only sees the public schema: the screen asks which one to preselect.
create or replace function public.default_channel(p_workspace_id uuid)
returns uuid
language sql
stable
as $$
  select app.default_channel(p_workspace_id);
$$;

grant execute on function public.default_channel(uuid) to authenticated;

-- ------------------------------------------------- what a unit is worth

create or replace view public.finished_good_costs with (security_invoker = true) as
select
  i.workspace_id,
  i.product_variant_id as variant_id,
  i.id as inventory_item_id,
  app.produced_unit_cost(i.id) as unit_cost
from public.inventory_items i
where i.kind = 'finished_good'
  and i.product_variant_id is not null;

comment on view public.finished_good_costs is
  'Lo que vale una unidad de cada producto armado en el estante: con lo que sale al entregarlo (app.produced_unit_cost), mano de obra incluida desde que armar la suma.';

-- ------------------------------------------------------------- the sale

-- A new argument is a new signature: the old one goes, or PostgREST would
-- find two functions for one call.
drop function public.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text, uuid
);
drop function app.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text, uuid
);

/*
 * Sells from the shelf in one transaction: order, lines, delivery, payment.
 * The one of 20261019100000_quick_sale, with the channel and the shelf cost.
 *
 * `p_lines` is [{"variant_id", "quantity", "unit_price"}]. The description is
 * the database's, «Producto — variante», as «Nuevo pedido» writes it. The
 * cost of each line is not asked: it is what the delivery says a unit cost
 * when it left the shelf, written on the line once delivered. An
 * "estimated_unit_cost" an older screen sends is not read.
 *
 * Each line has to take an assembled product off the shelf, as itself: its
 * latest recipe is assembled. A variant without a recipe would be delivered
 * without moving anything, and a kit that is not assembled leaves as its
 * parts (or as nothing, when its recipe lists none). Both go through a normal
 * order. Whether the units are free (not separated for another order) is the
 * plan's to say (ADR-021): the screen offers only those, and reads the plan
 * again right before selling.
 *
 * Quantities and prices are JSON numbers. A string would let through "NaN",
 * which numeric accepts and which compares greater than everything: no check
 * below would catch it, and the month's income statement would read NaN from
 * then on.
 *
 * The customer is `p_customer_id`, or else a new one with `p_customer_name` and
 * `p_customer_phone`, or else the walk-in customer («Clientes varios»). A
 * name that is the walk-in customer's, typed in any case or with any accent,
 * is the walk-in customer: it would otherwise make a second one that can owe.
 *
 * `p_channel_id` is where the sale came from: a channel of the workshop, and
 * active. Null is the workshop's default channel (`app.default_channel`).
 *
 * `p_amount` is what was collected now. Zero is allowed («me paga después»)
 * and the order waits in «Por cobrar», but then somebody has to owe it: a
 * debt of the walk-in customer is nobody's. More than the total is refused
 * here, before `record_payment` would name an order that is never going to
 * exist.
 *
 * `p_sold_at` dates the order (its day in the workshop's time zone), the
 * delivery and the payment. Null is now.
 *
 * `p_sale_key` names the sale. Asked again with the same key, the function
 * returns the order it made and does nothing else: the lock makes a second
 * call that arrives while the first one is still running wait for it, and
 * then find its order.
 */
create or replace function app.quick_sale(
  p_workspace_id uuid,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_account_id uuid default null,
  p_amount numeric default 0,
  p_payment_method public.payment_method default null,
  p_sold_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_sale_key uuid default null,
  p_channel_id uuid default null
)
returns public.orders
language plpgsql
as $$
declare
  -- What the columns can hold: numeric(12, 2) for money, integer for a
  -- quantity. Past them the insert would fail with an overflow nobody can read.
  c_money_ceiling constant numeric := 1e10;
  c_units_ceiling constant numeric := 2147483647;
  v_when timestamptz := coalesce(p_sold_at, now());
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_day date;
  v_line jsonb;
  v_variant record;
  v_quantity numeric;
  v_price numeric;
  -- [{"variant", "description", "quantity", "unit_price"}]
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_customer uuid;
  v_channel uuid;
  v_order public.orders;
begin
  if not app.is_member(p_workspace_id) then
    raise exception 'No perteneces a este taller.';
  end if;

  -- The same sale asked again: the order it already made, and nothing else.
  if p_sale_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('quick_sale ' || p_sale_key::text, 0));
    select * into v_order
    from public.orders o
    where o.workspace_id = p_workspace_id and o.quick_sale_key = p_sale_key;
    if found then
      return v_order;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;

  -- NaN compares greater than everything, so it would pass every check below.
  if v_amount = 'NaN'::numeric then
    raise exception 'Lo cobrado tiene que ser un monto en soles.';
  end if;
  if v_amount < 0 then
    raise exception 'Lo cobrado no puede ser negativo.';
  end if;
  if v_amount > 0 and p_account_id is null then
    raise exception 'Elige la cuenta donde entró el dinero, o deja lo cobrado en cero si te paga después.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha de la venta no es válida.';
  end if;
  -- A few minutes of slack: the phone's clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'La venta no puede tener fecha futura.';
  end if;

  -- «Clientes varios» typed by hand is the walk-in customer, not a new one.
  if v_name is not null and app.is_walk_in_name(p_workspace_id, v_name) then
    if v_phone is not null then
      raise exception '«%» es el cliente de las ventas sin nombre: para guardar un teléfono, escribe el nombre de la persona.',
        v_name;
    end if;
    v_name := null;
  end if;

  if v_name is null and v_phone is not null then
    raise exception 'Escribe el nombre del cliente para guardar su teléfono.';
  end if;

  if p_channel_id is null then
    v_channel := app.default_channel(p_workspace_id);
  else
    select c.id into v_channel
    from public.sales_channels c
    where c.id = p_channel_id and c.workspace_id = p_workspace_id and c.active;

    if v_channel is null then
      raise exception 'Ese canal de venta no es de este taller o ya no está activo. Elige otro.';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select v.id, p.name || ' — ' || v.name as label, r.id as recipe_id, r.assembled
      into v_variant
    from public.product_variants v
    join public.catalog_products p on p.id = v.product_id
    -- The recipe `deliver_order` will read: the latest version.
    left join lateral (
      select r.id, r.assembled
      from public.recipes r
      where r.variant_id = v.id
      order by r.version desc
      limit 1
    ) r on true
    where v.id = (v_line ->> 'variant_id')::uuid
      and v.workspace_id = p_workspace_id;

    if not found then
      raise exception 'Uno de los productos no es de este taller o ya no existe.';
    end if;
    if v_variant.recipe_id is null then
      raise exception '«%» no tiene receta, así que nada en el estante lo representa. Véndelo con un pedido normal.',
        v_variant.label;
    end if;
    if not v_variant.assembled then
      raise exception '«%» no es un producto armado: sale del estante en piezas, no como producto. Véndelo con un pedido normal.',
        v_variant.label;
    end if;

    if jsonb_typeof(v_line -> 'quantity') is distinct from 'number' then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_variant.label;
    end if;
    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) or v_quantity > c_units_ceiling then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_variant.label;
    end if;

    if jsonb_typeof(v_line -> 'unit_price') is distinct from 'number' then
      raise exception 'Falta el precio de «%», o es negativo.', v_variant.label;
    end if;
    v_price := round((v_line ->> 'unit_price')::numeric, 2);
    if v_price < 0 then
      raise exception 'Falta el precio de «%», o es negativo.', v_variant.label;
    end if;
    if v_price >= c_money_ceiling then
      raise exception 'El precio de «%» es demasiado grande: revísalo.', v_variant.label;
    end if;

    -- Price times quantity, line by line: what `order_lines.line_total` will say.
    v_total := v_total + v_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant', v_variant.id,
      'description', v_variant.label,
      -- As an integer already: "2.0" would not cast to the column.
      'quantity', v_quantity::integer,
      'unit_price', v_price
    );
  end loop;

  -- Something handed over for nothing is a gift, and a gift has its own kind
  -- of order. Here a zero is far more often a price nobody typed.
  if v_total = 0 then
    raise exception 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
  end if;
  if v_total >= c_money_ceiling then
    raise exception 'La venta suma demasiado: revisa los precios y las cantidades.';
  end if;

  if v_amount > v_total then
    raise exception 'Lo cobrado (S/ %) pasa del total de la venta (S/ %).',
      to_char(v_amount, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
  end if;

  -- What stays owed needs somebody who owes it: the walk-in customer is
  -- everybody, so «Por cobrar» could never say whom to ask.
  if v_amount < v_total and (
    (p_customer_id is null and v_name is null)
    or exists (
      select 1 from public.customers c
      where c.id = p_customer_id and c.workspace_id = p_workspace_id and c.walk_in
    )
  ) then
    raise exception 'Quedan S/ % por cobrar. Escribe el nombre de quien te debe, o elige al cliente: una deuda sin nombre no hay a quién cobrársela.',
      to_char(v_total - v_amount, 'FM999999990.00');
  end if;

  if p_customer_id is not null then
    select c.id into v_customer
    from public.customers c
    where c.id = p_customer_id and c.workspace_id = p_workspace_id;

    if v_customer is null then
      raise exception 'No encontramos ese cliente en este taller.';
    end if;
  elsif v_name is not null then
    insert into public.customers (workspace_id, name, phone)
    values (p_workspace_id, v_name, v_phone)
    returning id into v_customer;
  else
    v_customer := app.walk_in_customer(p_workspace_id);
  end if;

  -- The day of the sale in the workshop, not in UTC: after 19:00 in Lima it is
  -- already tomorrow in UTC, and Resultados would put the sale in that day.
  v_day := app.workspace_day(p_workspace_id, v_when);

  -- Read by the status history trigger, on creation and on delivery alike.
  perform set_config('app.change_reason', 'Venta rápida.', true);
  -- The walk-in customer buys here only: this sale collects or has a name.
  perform set_config('app.quick_sale', 'on', true);

  insert into public.orders (
    workspace_id, number, purpose, customer_id, channel_id, status, ordered_on, note, total, quick_sale_key
  ) values (
    p_workspace_id,
    app.next_document_number(p_workspace_id, 'order'),
    'sale',
    v_customer,
    v_channel,
    'confirmed',
    v_day,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_total,
    p_sale_key
  )
  returning * into v_order;

  insert into public.order_lines (
    workspace_id, order_id, position, variant_id, description,
    quantity, unit_price, estimated_unit_cost
  )
  select
    p_workspace_id,
    v_order.id,
    l.position,
    (l.line ->> 'variant')::uuid,
    l.line ->> 'description',
    (l.line ->> 'quantity')::integer,
    (l.line ->> 'unit_price')::numeric,
    0
  from jsonb_array_elements(v_lines) with ordinality as l (line, position);

  -- Everything pending goes out. Its refusal says what is short and how much,
  -- and nothing above survives it.
  perform app.deliver_order(v_order.id, null, v_when, 'Venta rápida.');

  -- What left the shelf is what each line cost: its estimate says so, and the
  -- order says what Resultados says. A product with nothing behind its value
  -- left at no known cost, and stays at zero.
  update public.order_lines l
  set estimated_unit_cost = coalesce(dl.unit_cost, 0)
  from public.order_delivery_lines dl
  where dl.order_line_id = l.id
    and l.order_id = v_order.id;

  if v_amount > 0 then
    perform app.record_payment(
      v_order.id,
      p_account_id,
      v_amount,
      p_payment_method,
      v_when,
      null,
      nullif(btrim(coalesce(p_reference, '')), ''),
      format('Cobro de la venta rápida %s', v_order.number)
    );
  end if;

  perform set_config('app.change_reason', '', true);
  perform set_config('app.quick_sale', '', true);

  -- As it ended: delivered, and paid, partly paid or unpaid.
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;

grant execute on function app.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text, uuid, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.quick_sale(
  p_workspace_id uuid,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_account_id uuid default null,
  p_amount numeric default 0,
  p_payment_method public.payment_method default null,
  p_sold_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_sale_key uuid default null,
  p_channel_id uuid default null
)
returns public.orders
language sql
volatile
as $$
  select app.quick_sale(
    p_workspace_id, p_lines, p_customer_id, p_customer_name, p_customer_phone,
    p_account_id, p_amount, p_payment_method, p_sold_at, p_reference, p_note, p_sale_key, p_channel_id
  );
$$;

grant execute on function public.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text, uuid, uuid
) to authenticated;
