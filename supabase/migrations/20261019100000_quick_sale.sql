-- Quick sale: selling what is already assembled, in one step (ADR-024).
--
-- The workshop produces first (assembled baskets) and then goes out to offer
-- them to many people. A full order for every sale is slow, and in the
-- walkthrough those sales ended up in Caja as an «Ingreso». That breaks every
-- figure at once: the product never leaves the shelf, its cost is never
-- counted and Resultados does not add it to the sales.
--
-- `quick_sale` does in one transaction what three screens would do: it creates
-- the sale order with its number and its lines, delivers all of it from the
-- shelf with `deliver_order` and records what was collected with
-- `record_payment`. It moves no stock and no money by itself: the shelf only
-- moves through its flows (ADR-020) and collecting has one rule. If something
-- is short, or the payment goes over the total, the database refuses with its
-- message and nothing is left half done.
--
-- Why the order reaches «Entregado» legitimately, trigger by trigger:
--
-- * it is born «Confirmado», like an order written by hand, and
--   `deliver_order` moves it to «Entregado» because nothing is pending. That
--   is a step forward: `guard_order_status_change` only asks for a reason to
--   go back.
-- * `guard_delivered_status` looks at what is pending: the delivery lines are
--   written before the status changes, so nothing is.
-- * `guard_settled_order` and `guard_cancelled_order_prints` only look at an
--   order leaving «Entregado» or going to «Cancelado».
-- * `order_hold` does nothing: the order is not and was not on hold.
--   `priority_at` takes its usual value (now), and it does not matter: a
--   delivered order claims nothing in the plan.
-- * the status history says «Venta rápida.» on both steps, through the same
--   transaction setting `set_order_status` uses.
--
-- A sale without a customer goes to «Cliente al paso», a customer of the
-- workshop created the first time and reused afterwards. A column marks it,
-- not its name: the owner can rename it without a second one appearing.

-- ------------------------------------------------------- walk-in customer

alter table public.customers
  add column walk_in boolean not null default false;

-- One per workshop: with two, the sales without a name would split between them.
create unique index customers_one_walk_in_per_workspace
  on public.customers (workspace_id)
  where walk_in;

comment on column public.customers.walk_in is
  'El cliente de las ventas rápidas sin nombre («Cliente al paso»). Uno por taller: lo crea app.walk_in_customer la primera vez.';

/*
 * The workshop's walk-in customer, created the first time a sale needs it.
 * Two first sales at once both try to insert: the unique index keeps one, and
 * the other reads it back.
 */
create or replace function app.walk_in_customer(p_workspace_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.customers c
  where c.workspace_id = p_workspace_id and c.walk_in;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.customers (workspace_id, name, walk_in, note)
  values (
    p_workspace_id,
    'Cliente al paso',
    true,
    'Las ventas rápidas sin nombre. Lo creó la aplicación con la primera.'
  )
  on conflict (workspace_id) where walk_in do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
    from public.customers c
    where c.workspace_id = p_workspace_id and c.walk_in;
  end if;

  return v_id;
end;
$$;

grant execute on function app.walk_in_customer(uuid) to authenticated;

-- ------------------------------------------------------------- the sale

/*
 * Sells from the shelf in one transaction: order, lines, delivery, payment.
 *
 * `p_lines` is [{"variant_id", "quantity", "unit_price", "estimated_unit_cost"}].
 * The description is the database's, «Producto — variante», as «Nuevo pedido»
 * writes it. The estimated cost travels from the screen, which costs the line
 * with the same estimator as «Nuevo pedido», to six decimals, so the income
 * statement counts it like any other sale. It has to be there, zero included:
 * a sale whose cost nobody stated is the hole this closes.
 *
 * Each line has to take something off the shelf: a variant with a recipe. A
 * variant without one would be delivered without moving anything. An
 * assembled product leaves as itself and one that is not leaves as its parts,
 * as in any delivery. Whether the units are free (not separated for another
 * order) is the plan's to say (ADR-021): the screen offers only those, and
 * reads the plan again right before selling.
 *
 * The customer is `p_customer_id`, or else a new one with `p_customer_name` and
 * `p_customer_phone`, or else the walk-in customer.
 *
 * `p_amount` is what was collected now. Zero is allowed («me paga después»)
 * and the order waits in «Por cobrar». More than the total is refused here,
 * before `record_payment` would name an order that is never going to exist.
 *
 * `p_sold_at` dates the order (its day in the workshop's time zone), the
 * delivery and the payment. Null is now.
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
  p_note text default null
)
returns public.orders
language plpgsql
as $$
declare
  v_when timestamptz := coalesce(p_sold_at, now());
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_day date;
  v_line jsonb;
  v_variant record;
  v_quantity numeric;
  v_price numeric;
  v_cost numeric;
  -- [{"variant", "description", "quantity", "unit_price", "cost"}]
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_customer uuid;
  v_order public.orders;
begin
  if not app.is_member(p_workspace_id) then
    raise exception 'No perteneces a este taller.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;

  if v_amount < 0 then
    raise exception 'Lo cobrado no puede ser negativo.';
  end if;
  if v_amount > 0 and p_account_id is null then
    raise exception 'Elige la cuenta donde entró el dinero, o deja lo cobrado en cero si te paga después.';
  end if;

  -- A few minutes of slack: the phone's clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'La venta no puede tener fecha futura.';
  end if;

  if v_name is null and v_phone is not null then
    raise exception 'Escribe el nombre del cliente para guardar su teléfono.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select v.id, p.name || ' — ' || v.name as label, r.id as recipe_id
      into v_variant
    from public.product_variants v
    join public.catalog_products p on p.id = v.product_id
    -- The recipe `deliver_order` will read: the latest version.
    left join lateral (
      select r.id
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

    v_quantity := (v_line ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'La cantidad de «%» tiene que ser un número entero mayor que cero.', v_variant.label;
    end if;

    v_price := round((v_line ->> 'unit_price')::numeric, 2);
    if v_price is null or v_price < 0 then
      raise exception 'Falta el precio de «%», o es negativo.', v_variant.label;
    end if;

    v_cost := round((v_line ->> 'estimated_unit_cost')::numeric, 6);
    if v_cost is null or v_cost < 0 then
      raise exception 'Falta el costo estimado de «%», o es negativo.', v_variant.label;
    end if;

    -- Price times quantity, line by line: what `order_lines.line_total` will say.
    v_total := v_total + v_price * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant', v_variant.id,
      'description', v_variant.label,
      'quantity', v_quantity,
      'unit_price', v_price,
      'cost', v_cost
    );
  end loop;

  -- Something handed over for nothing is a gift, and a gift has its own kind
  -- of order. Here a zero is far more often a price nobody typed.
  if v_total = 0 then
    raise exception 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
  end if;

  if v_amount > v_total then
    raise exception 'Lo cobrado (S/ %) pasa del total de la venta (S/ %).',
      to_char(v_amount, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
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
  select (v_when at time zone w.timezone)::date into v_day
  from public.workspaces w
  where w.id = p_workspace_id;

  -- Read by the status history trigger, on creation and on delivery alike.
  perform set_config('app.change_reason', 'Venta rápida.', true);

  insert into public.orders (
    workspace_id, number, purpose, customer_id, status, ordered_on, note, total
  ) values (
    p_workspace_id,
    app.next_document_number(p_workspace_id, 'order'),
    'sale',
    v_customer,
    'confirmed',
    v_day,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_total
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
    (l.line ->> 'cost')::numeric
  from jsonb_array_elements(v_lines) with ordinality as l (line, position);

  -- Everything pending goes out. Its refusal says what is short and how much,
  -- and nothing above survives it.
  perform app.deliver_order(v_order.id, null, v_when, 'Venta rápida.');

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

  -- As it ended: delivered, and paid, partly paid or unpaid.
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;

grant execute on function app.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text
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
  p_note text default null
)
returns public.orders
language sql
volatile
as $$
  select app.quick_sale(
    p_workspace_id, p_lines, p_customer_id, p_customer_name, p_customer_phone,
    p_account_id, p_amount, p_payment_method, p_sold_at, p_reference, p_note
  );
$$;

grant execute on function public.quick_sale(
  uuid, jsonb, uuid, text, text, uuid, numeric, public.payment_method, timestamptz, text, text
) to authenticated;
