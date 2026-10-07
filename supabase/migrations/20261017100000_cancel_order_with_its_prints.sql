-- Cancelar un pedido decide qué pasa con lo que puso en la cola (E4-01).
--
-- En el segundo recorrido se canceló ORD-2026-0002 y su impresión siguió
-- «Planificada», primera en la cola, enlazada al pedido y con «Iniciar» a
-- mano: cualquiera podía gastar filamento en algo que ya nadie iba a llevarse.
--
-- Lo decidió el dueño: al cancelar, la ficha lista esas impresiones y pregunta
-- si se cancelan también.
--   · Si sí, se cancelan sin tiempo ni costo, porque nunca se imprimieron.
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

/*
 * Un pedido cancelado no deja impresiones vivas. Una que se imprime manda a
 * cerrarla en la cola. Una planificada manda a la ficha, que es donde se
 * decide qué pasa con ella: este disparador no elige por la persona.
 */
create or replace function app.guard_cancelled_order_prints()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_printer text;
  v_planned integer;
begin
  if new.status <> 'cancelled' or new.status = old.status then
    return new;
  end if;

  select coalesce(nullif(btrim(j.label), ''), l.description), p.name
    into v_name, v_printer
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  join public.printers p on p.id = j.printer_id
  where l.order_id = new.id and j.status = 'printing'
  order by j.started_at
  limit 1;

  if found then
    raise exception '«%» se está imprimiendo en % para el pedido %, y ya gastó filamento. Ciérrala en la cola de impresión y después cancela el pedido.',
      v_name, v_printer, new.number;
  end if;

  select count(*) into v_planned
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = new.id and j.status = 'planned';

  if v_planned > 0 then
    raise exception 'El pedido % tiene % en la cola. Cancélalo desde su ficha, que pregunta si se cancelan también o quedan como trabajos sueltos.',
      new.number,
      case when v_planned = 1 then 'una impresión planificada'
           else v_planned || ' impresiones planificadas' end;
  end if;

  return new;
end;
$$;

create trigger orders_cancel_leaves_no_prints
  before update of status on public.orders
  for each row execute function app.guard_cancelled_order_prints();

/*
 * Nada nuevo se imprime para un pedido cancelado, ni se arranca lo que
 * quedó planificado para él antes de esta regla. Cerrar una impresión así
 * sí se puede: es como se saca de la cola.
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
 * Cancela el pedido y trata sus impresiones planificadas en una transacción.
 *
 * `p_cancel_prints` es la respuesta de la persona: true las cancela, false
 * las deja en la cola como trabajos sueltos. Es obligatorio, porque las dos
 * respuestas son razonables y ninguna es un buen valor por defecto.
 *
 * Una impresión que queda suelta conserva su nombre (el de la línea, si no
 * tenía uno propio) y una nota de dónde venía: sin eso, en la cola se leería
 * «Impresión sin nombre» y nadie sabría por qué está ahí.
 */
create or replace function app.cancel_order(
  p_order_id uuid,
  p_cancel_prints boolean,
  p_reason text default null
)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
  v_trace text;
begin
  if p_cancel_prints is null then
    raise exception 'Di si las impresiones del pedido se cancelan también o quedan en la cola.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No encontramos este pedido.';
  end if;

  -- Un «Iniciar» que llegue mientras tanto espera aquí, y después encuentra
  -- la impresión cancelada o suelta, nunca imprimiendo para un pedido
  -- cancelado.
  perform 1
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = p_order_id and j.status in ('planned', 'printing')
  for update of j;

  if p_cancel_prints then
    v_trace := format('Se canceló con el pedido %s, sin imprimirse.', v_order.number);

    update public.print_jobs j
       set status = 'cancelled',
           finished_at = now(),
           actual_time_s = null,
           material_cost = 0,
           energy_cost = 0,
           machine_cost = 0,
           percent_complete = null,
           note = concat_ws(E'\n', nullif(btrim(j.note), ''), v_trace)
      from public.order_lines l
     where l.id = j.order_line_id
       and l.order_id = p_order_id
       and j.status = 'planned';
  else
    v_trace := format('Era del pedido %s, que se canceló.', v_order.number);

    update public.print_jobs j
       set order_line_id = null,
           label = coalesce(nullif(btrim(j.label), ''), l.description),
           note = concat_ws(E'\n', nullif(btrim(j.note), ''), v_trace)
      from public.order_lines l
     where l.id = j.order_line_id
       and l.order_id = p_order_id
       and j.status = 'planned';
  end if;

  -- Por la misma función que cualquier cambio de estado, para que el motivo
  -- y el historial salgan igual. Sus disparadores juzgan lo que quedó.
  return app.set_order_status(p_order_id, 'cancelled', p_reason);
end;
$$;

grant execute on function app.cancel_order(uuid, boolean, text) to authenticated;

-- PostgREST solo ve el esquema public.
create or replace function public.cancel_order(
  p_order_id uuid,
  p_cancel_prints boolean,
  p_reason text default null
)
returns public.orders
language sql
volatile
as $$
  select app.cancel_order(p_order_id, p_cancel_prints, p_reason);
$$;

grant execute on function public.cancel_order(uuid, boolean, text) to authenticated;

comment on function public.cancel_order(uuid, boolean, text) is
  'Cancela un pedido y, en la misma transacción, cancela sus impresiones planificadas (p_cancel_prints) o las deja en la cola como trabajos sueltos. Se niega si alguna se está imprimiendo.';
