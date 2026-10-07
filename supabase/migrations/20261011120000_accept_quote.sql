-- «El cliente aceptó» crea el pedido.
--
-- Hasta hoy aceptar solo cambiaba el estado de la cotización, y el pedido se
-- volvía a escribir a mano en «Pedido nuevo»: otra vez el cliente, cada línea
-- y cada precio. Una pieza a medida ni siquiera cabía, porque el pedido
-- exigía una variante del catálogo (P4 del barrido). Esta función hace las dos
-- cosas en una sola transacción: crea el pedido con las líneas de la
-- cotización, con sus precios y costos congelados, y cierra la cotización.
--
-- El pedido sale igual que uno escrito a mano con los mismos datos:
--
-- * el número sale del mismo contador de documentos, y nace confirmado.
-- * el total es la suma de las líneas, precio por cantidad, como lo suma
--   «Pedido nuevo».
-- * el descuento de la cotización no se resta otra vez. Es lo que la escalera
--   ya rebajó del precio unitario, que se copia tal cual: restarlo sería
--   cobrar el descuento dos veces.
-- * no hay IGV aparte. El precio de la cotización ya lo trae dentro, igual
--   que el de un pedido escrito a mano, y el pedido no tiene dónde guardarlo.
--
-- Y el costo estimado de cada línea es el de la cotización, no el de hoy:
-- contra ese costo se fijó el precio que el cliente aceptó.

/*
 * Accepts a sent quote and creates its order, all or nothing.
 *
 * The order keeps the customer, channel and deal of the quote, and its lines
 * keep the quote line they came from. A catalog line keeps its variant. A
 * custom piece or a service has none, so delivering it takes nothing off the
 * shelf.
 *
 * Who goes first: if the quote was still holding what it asks for, the order
 * inherits its place in the line (`held_at`). If the hold had expired, what it
 * held may already belong to somebody else, so the order joins at the end.
 *
 * A quote without a customer takes the one given here, because a sale needs
 * someone to sell to. A quote that already has one keeps it.
 */
create or replace function app.accept_quote(
  p_quote_id uuid,
  p_due_date date default null,
  p_note text default null,
  p_customer_id uuid default null
)
returns public.orders
language plpgsql
as $$
declare
  v_quote public.quotes;
  v_taken text;
  v_customer uuid;
  v_today date;
  v_priority timestamptz;
  v_total numeric;
  v_order public.orders;
begin
  -- Every version of the document, so two versions accepted at the same time
  -- queue up instead of creating two orders.
  perform 1
  from public.quotes q
  where (q.workspace_id, q.number) = (
    select workspace_id, number from public.quotes where id = p_quote_id
  )
  order by q.version
  for update;

  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'No encontramos esta cotización.';
  end if;

  -- Any version counts: a new version of an accepted quote is the same deal,
  -- and a second order would make the workshop produce it twice. A cancelled
  -- order does not count, so the customer can come back to it.
  select o.number
         || case when q.version <> v_quote.version then format(' (de la versión %s)', q.version) else '' end
    into v_taken
  from public.orders o
  join public.quotes q on q.id = o.quote_id
  where q.workspace_id = v_quote.workspace_id
    and q.number = v_quote.number
    and o.status <> 'cancelled'
  order by o.created_at
  limit 1;

  if v_taken is not null then
    raise exception 'La cotización % ya tiene el pedido %. Ábrelo en lugar de crear otro.',
      v_quote.number, v_taken;
  end if;

  -- What the screen offers: a draft was not offered to anybody yet, and a
  -- closed quote already has its answer.
  if v_quote.status <> 'sent' then
    raise exception 'Solo se acepta una cotización enviada, y % está %.',
      v_quote.number,
      case v_quote.status
        when 'draft' then 'en borrador: márcala como enviada primero'
        when 'accepted' then 'aceptada'
        when 'rejected' then 'rechazada'
        else 'vencida'
      end;
  end if;

  v_customer := coalesce(v_quote.customer_id, p_customer_id);
  if v_customer is null then
    raise exception 'La cotización % no tiene cliente, y un pedido de venta lo necesita. Elige quién la aceptó.',
      v_quote.number;
  end if;

  select round(sum(l.unit_price * l.quantity), 2) into v_total
  from public.quote_lines l
  where l.quote_id = p_quote_id;

  if v_total is null then
    raise exception 'La cotización % no tiene líneas: no hay nada que pedir.', v_quote.number;
  end if;

  -- Today in the workshop, not in UTC: after 19:00 in Lima it is already
  -- tomorrow in UTC, and the order would be dated a day late.
  select (now() at time zone coalesce(w.timezone, 'America/Lima'))::date into v_today
  from public.workspaces w
  where w.id = v_quote.workspace_id;
  v_today := coalesce(v_today, (now() at time zone 'America/Lima')::date);

  if p_due_date is not null and p_due_date < v_today then
    raise exception 'La fecha de entrega (%) ya pasó. Elige hoy o un día después.',
      to_char(p_due_date, 'DD/MM/YYYY');
  end if;

  -- Read before the quote changes state: accepting it cuts its hold short.
  v_priority := case
                  when v_quote.held_at is not null and v_quote.hold_until > now() then v_quote.held_at
                  else now()
                end;

  -- The status history says where the order came from.
  perform set_config('app.change_reason', format('El cliente aceptó la cotización %s.', v_quote.number), true);

  insert into public.orders (
    workspace_id, number, purpose, customer_id, channel_id, opportunity_id, quote_id,
    status, ordered_on, due_date, note, priority_at, total
  ) values (
    v_quote.workspace_id,
    app.next_document_number(v_quote.workspace_id, 'order'),
    'sale',
    v_customer,
    v_quote.channel_id,
    v_quote.opportunity_id,
    v_quote.id,
    'confirmed',
    v_today,
    p_due_date,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_priority,
    v_total
  )
  returning * into v_order;

  perform set_config('app.change_reason', '', true);

  insert into public.order_lines (
    workspace_id, order_id, position, variant_id, quote_line_id,
    description, quantity, unit_price, estimated_unit_cost
  )
  select
    v_quote.workspace_id,
    v_order.id,
    row_number() over (order by l.position),
    case when l.kind = 'catalog' then l.variant_id end,
    l.id,
    l.description,
    l.quantity,
    l.unit_price,
    l.unit_cost
  from public.quote_lines l
  where l.quote_id = p_quote_id;

  update public.quotes
     set status = 'accepted',
         customer_id = v_customer
   where id = p_quote_id;

  return v_order;
end;
$$;

grant execute on function app.accept_quote(uuid, date, text, uuid) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.accept_quote(
  p_quote_id uuid,
  p_due_date date default null,
  p_note text default null,
  p_customer_id uuid default null
)
returns public.orders
language sql
volatile
as $$
  select app.accept_quote(p_quote_id, p_due_date, p_note, p_customer_id);
$$;

grant execute on function public.accept_quote(uuid, date, text, uuid) to authenticated;

-- Hasta cuándo separaría una proforma que se envía ahora. El borrador lo dice
-- antes de enviarse, y lo lee de la misma regla que usa el disparador, en vez
-- de repetirla en el navegador.
create or replace function public.default_hold_until(p_workspace_id uuid)
returns timestamptz
language sql
stable
as $$
  select app.default_hold_until(p_workspace_id);
$$;

grant execute on function public.default_hold_until(uuid) to authenticated;
