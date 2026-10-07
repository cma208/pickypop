-- La cuenta única guarda solo decisiones (ADR-021).
--
-- De quién es cada unidad del estante, qué imprimir y para cuándo se calcula
-- en cada lectura, en un solo sitio (`packages/domain`, `plan`). Lo que no se
-- puede calcular son las decisiones de una persona, y eso es lo que se guarda:
--
-- * quién va primero: `orders.priority_at`, y en una proforma `quotes.held_at`;
-- * hasta cuándo dura un separo: `quotes.hold_until` y `orders.hold_until`;
-- * el horario de impresión del taller y el plazo por defecto de un separo.
--
-- Un separo vencido no se libera escribiendo nada: el plan deja de contarlo
-- porque `hold_until` ya pasó. Por eso los movimientos `reservation` y
-- `release` quedan prohibidos: si alguien volviera a escribirlos, el saldo
-- "disponible" de las vistas viejas se separaría del plan en silencio.

-- ------------------------------------------------------------ el horario

create table public.workshop_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  -- Una placa puede empezar desde aquí...
  print_first_start time not null default '06:00',
  -- ...hasta aquí...
  print_last_start time not null default '23:00',
  -- ...y tiene que haber terminado antes de esto. '24:00' es medianoche.
  print_end_by time not null default '24:00',
  -- Mientras no haya impresiones suficientes para medir el cambio de placa.
  changeover_default_minutes integer not null default 15 check (changeover_default_minutes >= 0),
  -- Un separo vence a esta hora, tantos días después de hecho.
  hold_default_days integer not null default 1 check (hold_default_days >= 0),
  hold_default_time time not null default '23:00',
  updated_at timestamptz not null default now(),
  check (print_first_start < print_last_start),
  check (print_last_start <= print_end_by)
);

select app.apply_workspace_rls('workshop_settings');
select app.add_updated_at_trigger('workshop_settings');

comment on table public.workshop_settings is
  'El horario de impresión y el plazo de un separo. Una fila por taller; sin fila valen los valores por defecto.';

insert into public.workshop_settings (workspace_id)
select id from public.workspaces
on conflict do nothing;

-- El horario del taller, con sus valores por defecto si todavía no tiene
-- fila. Es una función y no una vista: una vista que expone `workspaces.id`
-- le aparece a PostgREST como relación de todas las tablas del taller.
create or replace function app.workshop_schedule(p_workspace_id uuid)
returns table (
  timezone text,
  print_first_start time,
  print_last_start time,
  print_end_by time,
  changeover_default_minutes integer,
  hold_default_days integer,
  hold_default_time time
)
language sql
stable
as $$
  select
    w.timezone,
    coalesce(s.print_first_start, '06:00'::time),
    coalesce(s.print_last_start, '23:00'::time),
    coalesce(s.print_end_by, '24:00'::time),
    coalesce(s.changeover_default_minutes, 15),
    coalesce(s.hold_default_days, 1),
    coalesce(s.hold_default_time, '23:00'::time)
  from public.workspaces w
  left join public.workshop_settings s on s.workspace_id = w.id
  where w.id = p_workspace_id;
$$;

grant execute on function app.workshop_schedule(uuid) to authenticated;

-- Hasta cuándo dura un separo hecho ahora: por defecto, las 23:00 del día
-- siguiente en la hora del taller. Se muestra siempre como fecha y hora.
create or replace function app.default_hold_until(p_workspace_id uuid, p_from timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select ((p_from at time zone s.timezone)::date + s.hold_default_days + s.hold_default_time)
         at time zone s.timezone
  from app.workshop_schedule(p_workspace_id) s;
$$;

grant execute on function app.default_hold_until(uuid, timestamptz) to authenticated;

-- ------------------------------------------------------ quién va primero

alter table public.orders add column priority_at timestamptz;
alter table public.orders add column hold_until timestamptz;

-- Los pedidos que ya existen van en el orden en que se crearon, y los que
-- nacieron en el mismo instante, por número: dos pedidos empatados harían
-- que pasar delante de uno salte también al otro.
update public.orders o
   set priority_at = o.created_at + ranked.offset_ms * interval '1 millisecond'
  from (
    select id, row_number() over (partition by workspace_id, created_at order by number) - 1 as offset_ms
    from public.orders
  ) ranked
 where ranked.id = o.id;

alter table public.orders alter column priority_at set default now();
alter table public.orders alter column priority_at set not null;

create index orders_priority_idx on public.orders (workspace_id, priority_at);

-- Un pedido que ya estaba en espera no tenía plazo. Recibe el de siempre,
-- contado desde hoy, para que nadie pierda lo suyo el día que esto se publica.
update public.orders
   set hold_until = app.default_hold_until(workspace_id)
 where status = 'on_hold' and hold_until is null;

comment on column public.orders.priority_at is
  'Quién va primero en el reparto del estante y de la cola: el más temprano. Nace al confirmar (o con el separo de su proforma) y se cambia a mano con «Pasar adelante».';
comment on column public.orders.hold_until is
  'Solo para un pedido en espera: hasta cuándo conserva lo que tiene separado y su lugar en la fila.';

alter table public.quotes add column held_at timestamptz;
alter table public.quotes add column hold_until timestamptz;

comment on column public.quotes.held_at is
  'Cuándo la proforma separó lo que pide. Es su lugar en la fila: si se acepta con el separo vigente, el pedido lo hereda.';
comment on column public.quotes.hold_until is
  'Hasta cuándo dura el separo. Vencido, la proforma deja de apartar sin que nadie escriba nada.';

-- Un separo nace al enviar la proforma, no en el borrador: cotizar para
-- probar no puede frenar el estante. Termina cuando la proforma se cierra.
-- Volver a separar después de que venció es empezar de nuevo, atrás de la fila.
create or replace function app.quote_hold()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' and new.hold_until is null then
    new.held_at := now();
    new.hold_until := app.default_hold_until(new.workspace_id);
  elsif new.status in ('accepted', 'rejected', 'expired') and new.hold_until > now() then
    new.hold_until := now();
  end if;

  if new.hold_until is distinct from old.hold_until
     and new.hold_until > now()
     and (old.hold_until is null or old.hold_until <= now()) then
    if new.status <> 'sent' then
      raise exception 'Solo una cotización enviada puede separar.';
    end if;
    new.held_at := now();
  end if;

  return new;
end;
$$;

create trigger quotes_hold
before update on public.quotes
for each row execute function app.quote_hold();

-- Un pedido en espera conserva su lugar mientras dura su separo. Si se retoma
-- con el separo vencido, lo suyo ya pasó a los demás y entra a la fila ahora.
create or replace function app.order_hold()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'on_hold' and old.status <> 'on_hold' then
    if new.hold_until is not distinct from old.hold_until or new.hold_until is null then
      new.hold_until := app.default_hold_until(new.workspace_id);
    end if;
  elsif old.status = 'on_hold' and new.status <> 'on_hold' then
    if old.hold_until is null or old.hold_until <= now() then
      new.priority_at := now();
    end if;
    new.hold_until := null;
  elsif new.hold_until is distinct from old.hold_until then
    if new.status <> 'on_hold' then
      raise exception 'Solo un pedido en espera tiene separo: uno confirmado ya tiene su lugar.';
    end if;
    if new.hold_until > now() and (old.hold_until is null or old.hold_until <= now()) then
      new.priority_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_hold
before update on public.orders
for each row execute function app.order_hold();

/*
 * Changes until when a hold lasts: a concrete day and hour, or now to let go
 * of it at once. A moment already past counts as now.
 */
create or replace function app.set_quote_hold(p_quote_id uuid, p_until timestamptz)
returns public.quotes
language plpgsql
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'No encontramos esta cotización.';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Solo una cotización enviada puede separar, y esta está %.',
      case v_quote.status
        when 'draft' then 'en borrador'
        when 'accepted' then 'aceptada'
        when 'rejected' then 'rechazada'
        else 'vencida'
      end;
  end if;

  update public.quotes
     set hold_until = greatest(coalesce(p_until, now()), now())
   where id = p_quote_id
  returning * into v_quote;

  if not found then
    raise exception 'No encontramos esta cotización.';
  end if;
  return v_quote;
end;
$$;

create or replace function app.set_order_hold(p_order_id uuid, p_until timestamptz)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
begin
  update public.orders
     set hold_until = greatest(coalesce(p_until, now()), now())
   where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'No encontramos este pedido.';
  end if;
  return v_order;
end;
$$;

grant execute on function app.set_quote_hold(uuid, timestamptz) to authenticated;
grant execute on function app.set_order_hold(uuid, timestamptz) to authenticated;

create or replace function public.set_quote_hold(p_quote_id uuid, p_until timestamptz)
returns public.quotes
language sql
volatile
as $$
  select app.set_quote_hold(p_quote_id, p_until);
$$;

create or replace function public.set_order_hold(p_order_id uuid, p_until timestamptz)
returns public.orders
language sql
volatile
as $$
  select app.set_order_hold(p_order_id, p_until);
$$;

grant execute on function public.set_quote_hold(uuid, timestamptz) to authenticated;
grant execute on function public.set_order_hold(uuid, timestamptz) to authenticated;

-- ------------------------------------------------------- pasar adelante

-- Cada vez que una persona cambia quién va primero, con lo que vio al hacerlo.
create table public.order_priority_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_priority_at timestamptz not null,
  to_priority_at timestamptz not null,
  -- A quién pasó: un pedido o una proforma con separo, y cómo se llamaba.
  passed_kind text not null check (passed_kind in ('order', 'quote')),
  passed_id uuid not null,
  passed_label text not null,
  reason text not null check (btrim(reason) <> ''),
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index order_priority_changes_order_idx on public.order_priority_changes (order_id, changed_at desc);

select app.apply_workspace_rls('order_priority_changes');

comment on table public.order_priority_changes is
  'Quién pasó adelante a quién, cuándo y por qué. El reparto cambia solo; esto deja el rastro.';

/*
 * Puts an order right before another order, or before a quote's hold. It is
 * never refused: the owner decided the person may choose, after seeing who
 * held first. The screen shows that warning; this keeps the record.
 */
create or replace function app.prioritize_order(
  p_order_id uuid,
  p_before_kind text,
  p_before_id uuid,
  p_reason text
)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
  v_target timestamptz;
  v_label text;
  v_previous timestamptz;
  v_new timestamptz;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Para pasar un pedido adelante hay que decir por qué.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No encontramos este pedido.';
  end if;
  if v_order.status in ('delivered', 'closed', 'cancelled') then
    raise exception 'El pedido % ya no espera nada: no hay a quién pasar.', v_order.number;
  end if;

  if p_before_kind = 'order' then
    select o.priority_at, o.number || coalesce(' · ' || c.name, '')
      into v_target, v_label
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    where o.id = p_before_id;
  elsif p_before_kind = 'quote' then
    select q.held_at, q.number || coalesce(' · ' || c.name, '')
      into v_target, v_label
    from public.quotes q
    left join public.customers c on c.id = q.customer_id
    where q.id = p_before_id and q.held_at is not null;
  else
    raise exception 'Solo se puede pasar a un pedido o a una proforma con separo.';
  end if;

  if v_target is null then
    raise exception 'No encontramos a quién pasar.';
  end if;

  if v_target <= v_order.priority_at then
    -- Halfway between the one right before the target and the target, so it
    -- lands just in front without jumping anybody else.
    select max(p) into v_previous
    from (
      select priority_at as p from public.orders
       where workspace_id = v_order.workspace_id and id <> p_order_id and priority_at < v_target
      union all
      select held_at from public.quotes
       where workspace_id = v_order.workspace_id and held_at < v_target
    ) earlier;

    v_new := v_target - least(interval '1 second', coalesce((v_target - v_previous) / 2, interval '1 second'));

    insert into public.order_priority_changes (
      workspace_id, order_id, from_priority_at, to_priority_at, passed_kind, passed_id, passed_label, reason
    ) values (
      v_order.workspace_id, p_order_id, v_order.priority_at, v_new, p_before_kind, p_before_id, v_label, btrim(p_reason)
    );

    update public.orders set priority_at = v_new where id = p_order_id returning * into v_order;
  end if;

  return v_order;
end;
$$;

grant execute on function app.prioritize_order(uuid, text, uuid, text) to authenticated;

create or replace function public.prioritize_order(
  p_order_id uuid,
  p_before_kind text,
  p_before_id uuid,
  p_reason text
)
returns public.orders
language sql
volatile
as $$
  select app.prioritize_order(p_order_id, p_before_kind, p_before_id, p_reason);
$$;

grant execute on function public.prioritize_order(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------- el cambio de placa, medido

-- El cambio de placa no se configura: lo hace otra persona y sus tiempos
-- varían. Se mide entre el fin estimado de una impresión (inicio más el
-- tiempo del archivo) y el inicio de la siguiente en la misma impresora. El
-- cierre no sirve: se registra cuando alguien lo ve, no cuando terminó. Una
-- pausa de más de tres horas no es un cambio de placa: es la noche, o no
-- había nada que imprimir.
create or replace view public.changeover_estimate with (security_invoker = true) as
with gaps as (
  select
    j.workspace_id,
    extract(epoch from (
      lead(j.started_at) over (partition by j.printer_id order by j.started_at)
      - (j.started_at + make_interval(secs => j.estimated_time_s))
    )) / 60 as minutes
  from public.print_jobs j
  where j.started_at is not null and j.estimated_time_s is not null
)
select
  g.workspace_id,
  count(*)::integer as samples,
  -- Lo que se cumple tres de cada cuatro veces: prometer con el promedio
  -- sería fallar la mitad.
  round(percentile_cont(0.75) within group (order by g.minutes)::numeric, 1) as p75_minutes
from gaps g
where g.minutes between 0 and 180
group by g.workspace_id;

comment on view public.changeover_estimate is
  'Minutos entre el fin estimado de una impresión y el inicio de la siguiente, medidos. Se promete con el percentil 75.';

-- ------------------------------------------- las reservas no se escriben

alter table public.stock_movements
  add constraint stock_movements_no_reservations
  check (type not in ('reservation', 'release')) not valid;

comment on constraint stock_movements_no_reservations on public.stock_movements is
  'Lo separado se calcula (ADR-021). Escribir reservas haría que el disponible de las vistas viejas mintiera.';
