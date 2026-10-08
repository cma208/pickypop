-- Cancelar un pedido ya cancelado dice eso, y lo cobrado se anula con el
-- dueño (T4-21 y los permisos del 2026-10-08).
--
-- En la tercera pasada se canceló el mismo pedido en dos pestañas. La
-- segunda dijo «La cola cambió: el pedido ya no tiene impresiones
-- planificadas», con el pedido todavía «Confirmado» en pantalla, y al pulsar
-- otra vez dijo que se canceló. La razón real era otra: ya estaba cancelado.
-- `cancel_order` comparaba las impresiones antes de mirar el estado. Ahora
-- mira primero si el pedido ya está cancelado o entregado, y lo dice.
--
-- Y el aviso de un pedido con cobros (`guard_settled_order`) mandaba a
-- anular en Caja. Desde el 2026-10-08 anular es solo del dueño (ADR-025): al
-- operador le dice que se lo pida. El monto va con el formato que no se
-- convierte en ######### con cifras grandes.
--
-- Las dos funciones son las de 20261017100000_cancel_order_with_its_prints y
-- 20261013100000_settled_orders_stay_settled, con eso cambiado.

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

  -- Another tab, or another device, settled it already. Said before the
  -- prints are compared, which read as «la cola cambió» (T4-21).
  if v_order.status = 'cancelled' then
    raise exception 'El pedido % ya estaba cancelado: lo cancelaron desde otra pestaña o desde otro equipo.',
      v_order.number;
  end if;
  if v_order.status in ('delivered', 'closed') then
    raise exception 'El pedido % ya se entregó: no puede cancelarse.', v_order.number;
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


create or replace function app.guard_settled_order()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('delivered', 'closed') and new.status not in ('delivered', 'closed') then
    raise exception 'El pedido % ya se entregó: no puede volver atrás ni cancelarse.', new.number;
  end if;

  if new.status = 'cancelled' then
    if exists (
      select 1
      from public.order_delivery_lines l
      join public.order_deliveries d on d.id = l.delivery_id
      where d.order_id = new.id and l.quantity > 0
    ) then
      raise exception 'El pedido % ya tiene entregas: lo entregado salió del estante y un pedido así no se cancela.', new.number;
    end if;

    select coalesce(sum(t.amount), 0) into v_paid
    from public.transactions t
    where t.order_id = new.id and t.type = 'income' and t.voided_at is null;

    if v_paid > 0 then
      if app.is_owner(new.workspace_id) then
        raise exception 'El pedido % tiene cobros por S/ %: anúlalos en Caja antes de cancelarlo, para que la plata y el pedido digan lo mismo.',
          new.number, to_char(v_paid, 'FM999999999990.00');
      end if;
      raise exception 'El pedido % tiene cobros por S/ %. Anular un cobro es solo del dueño: pídele que los anule en Caja, y después se cancela el pedido.',
        new.number, to_char(v_paid, 'FM999999999990.00');
    end if;
  end if;

  return new;
end;
$$;
