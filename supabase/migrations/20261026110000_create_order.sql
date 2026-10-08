-- «Nuevo pedido» se guarda entero o no se guarda (T4-02), una sola vez
-- (T4-04), y una venta no suma S/ 0 (T4-16).
--
-- La pantalla hacía tres llamadas: pedía el número, insertaba el pedido y
-- después las líneas. En la tercera pasada, una cantidad de 3 000 000 000
-- hizo fallar las líneas: el número ORD-2026-0007 ya se había gastado, y el
-- pedido se borraba a mano después. Con el operador ni eso, porque borrar un
-- pedido es del dueño y el borrado no miraba su resultado: quedaba una venta
-- confirmada de S/ 3 000 000 000 sin líneas, que Resultados sumaba.
--
-- `create_order` hace todo en una transacción: el número, la cabecera y las
-- líneas. Si algo falla, no queda nada, ni siquiera el número.
--
-- * Viaja con una llave, como la Venta rápida: la pantalla la crea para cada
--   pedido y la conserva mientras no cambie nada. Pedida otra vez con la
--   misma llave (un doble clic, una respuesta perdida), la función devuelve
--   el pedido que ya hizo. Así un doble clic ya no crea ORD-0005 y ORD-0006
--   iguales, que se producían dos veces.
-- * Cantidades y precios son números JSON y se revisan contra lo que caben
--   las columnas, con un mensaje que dice qué línea, en vez del «integer out
--   of range» que nadie entiende.
-- * Una línea de catálogo lleva el nombre que le da la base, «Producto —
--   variante», y tiene que estar a la venta: una variante desactivada (la
--   herramienta «Molde de calavera», T4-19) o de un producto archivado se
--   rechaza.
-- * Una venta que suma S/ 0 se rechaza con el texto de la Venta rápida: algo
--   entregado por nada es un regalo, y casi siempre es un precio que nadie
--   escribió.
-- * El día del pedido es el del taller, no el de UTC.

alter table public.orders add column create_key uuid;

create unique index orders_one_per_create_key
  on public.orders (workspace_id, create_key)
  where create_key is not null;

comment on column public.orders.create_key is
  'La llave con que «Nuevo pedido» pidió crear el pedido: la misma llave otra vez devuelve este pedido en lugar de crear otro (create_order).';

/*
 * Creates an order with its lines in one transaction, once per key.
 *
 * `p_lines` is [{"variant_id", "description", "quantity", "unit_price",
 * "estimated_unit_cost"}]. A line with a variant is from the catalogue and
 * is named by the database. Without one it is made to order and needs its
 * description. The price only counts on a sale: anything else is worth zero.
 * The cost is the estimate the screen worked out (the recipe for a catalogue
 * line, the person's for a made-to-order one), or zero when there is none.
 *
 * A sale needs its customer (and the walk-in customer is refused by
 * `walk_in_buys_on_the_spot`), a gift its category.
 */
create or replace function app.create_order(
  p_workspace_id uuid,
  p_purpose public.order_purpose,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_gift_category_id uuid default null,
  p_recipient text default null,
  p_due_date date default null,
  p_note text default null,
  p_create_key uuid default null
)
returns public.orders
language plpgsql
as $$
declare
  -- What the columns can hold: numeric(12, 2) for money, numeric(14, 6) for a
  -- unit cost, integer for a quantity.
  c_money_ceiling constant numeric := 1e10;
  c_cost_ceiling constant numeric := 1e8;
  c_units_ceiling constant numeric := 2147483647;
  v_sale boolean := p_purpose = 'sale';
  v_line jsonb;
  v_position integer := 0;
  v_variant record;
  v_variant_id uuid;
  v_name text;
  v_quantity numeric;
  v_price numeric;
  v_cost numeric;
  -- [{"variant", "description", "quantity", "unit_price", "cost"}]
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_order public.orders;
begin
  if not app.is_member(p_workspace_id) then
    raise exception 'No perteneces a este taller.';
  end if;

  -- The same order asked again: the one it already made, and nothing else.
  if p_create_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('create_order ' || p_create_key::text, 0));
    select * into v_order
    from public.orders o
    where o.workspace_id = p_workspace_id and o.create_key = p_create_key;
    if found then
      return v_order;
    end if;
  end if;

  if p_purpose is null then
    raise exception 'Elige para qué es el pedido: una venta, para el taller o un regalo.';
  end if;

  if v_sale then
    if p_customer_id is null then
      raise exception 'Una venta necesita un cliente. Elígelo o créalo.';
    end if;
    perform 1 from public.customers c where c.id = p_customer_id and c.workspace_id = p_workspace_id;
    if not found then
      raise exception 'No encontramos ese cliente en este taller.';
    end if;
  elsif p_purpose = 'gift' then
    if p_gift_category_id is null then
      raise exception 'Un regalo necesita su categoría: define cómo se cuenta en las finanzas.';
    end if;
    perform 1 from public.gift_categories g where g.id = p_gift_category_id and g.workspace_id = p_workspace_id;
    if not found then
      raise exception 'Esa categoría de regalo no es de este taller.';
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos una línea al pedido.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    v_variant_id := nullif(btrim(coalesce(v_line ->> 'variant_id', '')), '')::uuid;

    if v_variant_id is not null then
      select p.name || ' — ' || v.name as label, v.active, p.status::text as product_status
        into v_variant
      from public.product_variants v
      join public.catalog_products p on p.id = v.product_id
      where v.id = v_variant_id and v.workspace_id = p_workspace_id;

      if not found then
        raise exception 'Uno de los productos no es de este taller o ya no existe.';
      end if;
      if not v_variant.active or v_variant.product_status = 'archived' then
        raise exception '«%» ya no se vende: está desactivado en el catálogo. Quítalo del pedido.', v_variant.label;
      end if;
      v_name := v_variant.label;
    else
      v_name := nullif(btrim(coalesce(v_line ->> 'description', '')), '');
      if v_name is null then
        raise exception 'La línea % es a medida y no dice qué es. Escríbelo: así se reconoce en el pedido y al entregarla.',
          v_position;
      end if;
    end if;

    -- A string would let "NaN" through, which compares greater than everything.
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

    if not v_sale then
      v_price := 0;
    elsif jsonb_typeof(v_line -> 'unit_price') is distinct from 'number' then
      raise exception 'Falta el precio de «%», o es negativo.', v_name;
    else
      v_price := round((v_line ->> 'unit_price')::numeric, 2);
      if v_price < 0 then
        raise exception 'Falta el precio de «%», o es negativo.', v_name;
      end if;
      if v_price >= c_money_ceiling then
        raise exception 'El precio de «%» es demasiado grande: revísalo.', v_name;
      end if;
    end if;

    if v_line -> 'estimated_unit_cost' is null or jsonb_typeof(v_line -> 'estimated_unit_cost') = 'null' then
      v_cost := 0;
    elsif jsonb_typeof(v_line -> 'estimated_unit_cost') <> 'number' then
      raise exception 'El costo estimado de «%» tiene que ser un monto en soles.', v_name;
    else
      v_cost := round((v_line ->> 'estimated_unit_cost')::numeric, 6);
      if v_cost < 0 then
        raise exception 'El costo estimado de «%» no puede ser negativo.', v_name;
      end if;
      if v_cost >= c_cost_ceiling then
        raise exception 'El costo estimado de «%» es demasiado grande: revísalo.', v_name;
      end if;
    end if;

    -- Price times quantity, line by line: what `order_lines.line_total` will say.
    v_total := v_total + v_price * v_quantity;
    if v_total >= c_money_ceiling then
      raise exception 'El pedido suma demasiado: revisa los precios y las cantidades.';
    end if;

    v_lines := v_lines || jsonb_build_object(
      'variant', v_variant_id,
      'description', v_name,
      -- As an integer already: "2.0" would not cast to the column.
      'quantity', v_quantity::integer,
      'unit_price', v_price,
      'cost', v_cost
    );
  end loop;

  -- Something handed over for nothing is a gift, and a gift has its own kind
  -- of order. Here a zero is far more often a price nobody typed.
  if v_sale and v_total = 0 then
    raise exception 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
  end if;

  insert into public.orders (
    workspace_id, number, purpose, customer_id, gift_category_id, recipient,
    status, ordered_on, due_date, note, total, create_key
  ) values (
    p_workspace_id,
    app.next_document_number(p_workspace_id, 'order'),
    p_purpose,
    case when v_sale then p_customer_id end,
    case when p_purpose = 'gift' then p_gift_category_id end,
    case when v_sale then null else nullif(btrim(coalesce(p_recipient, '')), '') end,
    'confirmed',
    -- The workshop's day: the column's default is the UTC day, which after
    -- 19:00 in Lima is already tomorrow.
    app.workspace_day(p_workspace_id, now()),
    p_due_date,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_total,
    p_create_key
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

  return v_order;
end;
$$;

grant execute on function app.create_order(
  uuid, public.order_purpose, jsonb, uuid, uuid, text, date, text, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.create_order(
  p_workspace_id uuid,
  p_purpose public.order_purpose,
  p_lines jsonb,
  p_customer_id uuid default null,
  p_gift_category_id uuid default null,
  p_recipient text default null,
  p_due_date date default null,
  p_note text default null,
  p_create_key uuid default null
)
returns public.orders
language sql
volatile
as $$
  select app.create_order(
    p_workspace_id, p_purpose, p_lines, p_customer_id, p_gift_category_id,
    p_recipient, p_due_date, p_note, p_create_key
  );
$$;

grant execute on function public.create_order(
  uuid, public.order_purpose, jsonb, uuid, uuid, text, date, text, uuid
) to authenticated;

comment on function public.create_order(uuid, public.order_purpose, jsonb, uuid, uuid, text, date, text, uuid) is
  'Crea un pedido con sus líneas en una sola transacción: número, cabecera y líneas, o nada. La misma llave (p_create_key) devuelve el pedido que ya hizo. Una venta de S/ 0 se rechaza.';
