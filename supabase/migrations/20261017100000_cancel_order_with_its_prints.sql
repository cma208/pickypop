-- Cancelar un pedido decide qué pasa con lo que puso en la cola (E4-01).
--
-- En el segundo recorrido se canceló ORD-2026-0002 y su impresión siguió
-- «Planificada», primera en la cola, enlazada al pedido y con «Iniciar» a
-- mano: cualquiera podía gastar filamento en algo que ya nadie iba a llevarse.
--
-- Lo decidió el dueño: al cancelar, la ficha lista esas impresiones y pregunta
-- si se cancelan también.
--   · Si sí, se cancelan sin tiempo ni costo, porque nunca se imprimieron.
--     Quedan vacíos y no en cero, como una cancelada sin empezar en la cola
--     (E4-02): no hay «Costo real» que mostrar de algo que no pasó.
--   · Si no, quedan en la cola como trabajos sueltos, desligados del pedido.
--     Su costo, si se imprimen, va a la producción no vendida (ADR-023).
--   · Si alguna se está imprimiendo, el pedido no se cancela: ya gastó
--     filamento, y eso se cierra en la cola, donde se dice cuánto y cómo salió.
--
-- Las dos cosas pasan en una sola transacción, en `cancel_order`, y la regla
-- vive en un disparador sobre orders: cancelar por `set_order_status` o con
-- un `update` directo también la respeta, porque esconder un botón no impide
-- llamar a la API. Los disparadores que ya existen sobre orders (lo entregado
-- y lo cobrado no se cancela) siguen mandando: corren en la misma
-- actualización, y si rechazan, nada de lo hecho a las impresiones queda.
--
-- La respuesta vale solo para lo que la persona vio. `cancel_order` recibe
-- las impresiones planificadas que tenía la lista, y si en la cola hay otras
-- (alguien puso una desde Producción mientras tanto, o la ficha no alcanzó a
-- leerlas) no cancela nada y pide volver a elegir: cancelar a ciegas lo que
-- otra persona acaba de poner en la cola es justo lo que no se quiere.

/*
 * How many planned prints, as a person says it: one wording for every
 * message of this rule.
 */
create or replace function app.planned_prints_text(p_count integer)
returns text
language sql
immutable
as $$
  select case
    when p_count = 1 then 'una impresión planificada'
    else p_count || ' impresiones planificadas'
  end;
$$;

grant execute on function app.planned_prints_text(integer) to authenticated;

/*
 * A print on the printer already spent filament, and how much and how it
 * came out is said when it is closed in the queue. Until then the order
 * stays: cancelling it would leave that print without anyone to close it.
 */
create or replace function app.refuse_cancel_while_printing(p_order_id uuid, p_number text)
returns void
language plpgsql
as $$
declare
  v_name text;
  v_printer text;
begin
  select coalesce(nullif(btrim(j.label), ''), l.description), p.name
    into v_name, v_printer
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  join public.printers p on p.id = j.printer_id
  where l.order_id = p_order_id and j.status = 'printing'
  order by j.started_at
  limit 1;

  if found then
    raise exception '«%» se está imprimiendo en % para el pedido %, y ya gastó filamento. Ciérrala en la cola de impresión y después cancela el pedido.',
      v_name, v_printer, p_number;
  end if;
end;
$$;

grant execute on function app.refuse_cancel_while_printing(uuid, text) to authenticated;

/*
 * A cancelled order leaves no live prints behind. A planned one sends the
 * person to the order page, which is where its fate is decided: this
 * trigger does not choose for them.
 */
create or replace function app.guard_cancelled_order_prints()
returns trigger
language plpgsql
as $$
declare
  v_planned integer;
begin
  if new.status <> 'cancelled' or new.status = old.status then
    return new;
  end if;

  perform app.refuse_cancel_while_printing(new.id, new.number);

  select count(*) into v_planned
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = new.id and j.status = 'planned';

  if v_planned > 0 then
    raise exception 'El pedido % tiene % en la cola. Cancélalo desde su ficha, que pregunta si se cancelan también o quedan como trabajos sueltos.',
      new.number, app.planned_prints_text(v_planned);
  end if;

  return new;
end;
$$;

create trigger orders_cancel_leaves_no_prints
  before update of status on public.orders
  for each row execute function app.guard_cancelled_order_prints();

/*
 * Nothing new is printed for a cancelled order, and nothing left planned for
 * one before this rule is started. Closing such a print is allowed: that is
 * how it leaves the queue.
 */
create or replace function app.no_prints_for_cancelled_orders()
returns trigger
language plpgsql
as $$
declare
  v_number text;
begin
  if new.order_line_id is null or new.status not in ('planned', 'printing') then
    return new;
  end if;

  select o.number into v_number
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.id = new.order_line_id and o.status = 'cancelled';

  if found then
    raise exception 'El pedido % está cancelado: ya no se imprime nada para él.', v_number;
  end if;

  return new;
end;
$$;

create trigger print_jobs_not_for_cancelled_orders
  before insert or update of order_line_id, status on public.print_jobs
  for each row execute function app.no_prints_for_cancelled_orders();

/*
 * Cancels the order and settles its planned prints in one transaction.
 *
 * `p_seen_prints` are the planned prints the list showed when the person
 * answered. The answer covers those and nothing else: if the queue holds
 * others now, nothing is touched and the person is asked again.
 *
 * `p_cancel_prints` is that answer: true cancels them, false leaves them in
 * the queue as loose jobs. Both are reasonable, so neither stands in for a
 * missing one: it is required whenever there is something planned, and with
 * nothing planned there is no question to answer.
 *
 * A print left loose keeps its name (the line's, if it had none of its own)
 * and a note of where it came from: without them the queue would read
 * «Impresión sin nombre» and nobody would know why it is there.
 */
create or replace function app.cancel_order(
  p_order_id uuid,
  p_seen_prints uuid[],
  p_cancel_prints boolean default null,
  p_reason text default null
)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
  v_planned uuid[];
  v_seen uuid[];
  v_trace text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No encontramos este pedido.';
  end if;

  -- A «Iniciar» arriving meanwhile waits here, and then finds the print
  -- cancelled or loose, never printing for a cancelled order.
  perform 1
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = p_order_id and j.status in ('planned', 'printing')
  for update of j;

  -- Before comparing lists: a planned print that started meanwhile is
  -- better explained as what it is than as a list that changed.
  perform app.refuse_cancel_while_printing(p_order_id, v_order.number);

  select coalesce(array_agg(j.id order by j.id), '{}')
    into v_planned
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = p_order_id and j.status = 'planned';

  select coalesce(array_agg(distinct s order by s), '{}')
    into v_seen
  from unnest(coalesce(p_seen_prints, '{}')) s;

  if v_planned <> v_seen then
    if cardinality(v_planned) = 0 then
      raise exception 'La cola cambió: el pedido % ya no tiene impresiones planificadas. Revisa la lista y vuelve a elegir.',
        v_order.number;
    end if;
    raise exception 'La cola cambió: el pedido % tiene ahora %. Revisa la lista y vuelve a elegir.',
      v_order.number, app.planned_prints_text(cardinality(v_planned));
  end if;

  if cardinality(v_planned) > 0 and p_cancel_prints is null then
    raise exception 'Di si las impresiones del pedido se cancelan también o quedan en la cola.';
  end if;

  if p_cancel_prints then
    v_trace := format('Se canceló con el pedido %s, sin imprimirse.', v_order.number);

    -- Empty rather than zero, like a print cancelled unstarted from the
    -- queue (E4-02): there is no real cost to show for what never happened.
    update public.print_jobs j
       set status = 'cancelled',
           finished_at = now(),
           actual_time_s = null,
           material_cost = null,
           energy_cost = null,
           machine_cost = null,
           percent_complete = null,
           note = concat_ws(E'\n', nullif(btrim(j.note), ''), v_trace)
     where j.id = any (v_planned);
  elsif not p_cancel_prints then
    v_trace := format('Era del pedido %s, que se canceló.', v_order.number);

    update public.print_jobs j
       set order_line_id = null,
           label = coalesce(nullif(btrim(j.label), ''), l.description),
           note = concat_ws(E'\n', nullif(btrim(j.note), ''), v_trace)
      from public.order_lines l
     where l.id = j.order_line_id
       and j.id = any (v_planned);
  end if;

  -- Through the same function as any status change, so the reason and the
  -- history come out alike. Its triggers judge what is left.
  return app.set_order_status(p_order_id, 'cancelled', p_reason);
end;
$$;

grant execute on function app.cancel_order(uuid, uuid[], boolean, text) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.cancel_order(
  p_order_id uuid,
  p_seen_prints uuid[],
  p_cancel_prints boolean default null,
  p_reason text default null
)
returns public.orders
language sql
volatile
as $$
  select app.cancel_order(p_order_id, p_seen_prints, p_cancel_prints, p_reason);
$$;

grant execute on function public.cancel_order(uuid, uuid[], boolean, text) to authenticated;

comment on function public.cancel_order(uuid, uuid[], boolean, text) is
  'Cancela un pedido y, en la misma transacción, cancela sus impresiones planificadas (p_cancel_prints) o las deja en la cola como trabajos sueltos. Solo actúa si las planificadas son las que la persona vio (p_seen_prints); si no, pide volver a elegir. Se niega si alguna se está imprimiendo.';
