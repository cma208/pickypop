-- Un trato con un cliente no es una cotización, y tampoco es un pedido.
--
-- El dueño lo describió así: conversa una vez con el cliente, le manda dos o
-- tres cotizaciones, y al final se concretan una o varias, cada una con su
-- fecha de entrega. Hoy eso no tiene dónde vivir: `quotes` cuelga del cliente
-- y `orders` de la cotización, y nada los agrupa.
--
-- Son dos tuberías distintas y conviene que sigan separadas. La comercial es
-- esta: cliente → oportunidad → cotización → pedido. La del taller ya existe y
-- es `orders.status`. Mezclarlas en un solo tablero es lo que vuelve confusos
-- a los sistemas de este tamaño.
--
-- Las etapas se acordaron con el dueño y son estas seis. Los identificadores
-- van en inglés, como todo el esquema; lo que ve el usuario va en español y
-- vive en el frontend.

create type public.opportunity_stage as enum (
  'new', 'quoted', 'negotiating', 'won', 'closed', 'lost'
);

comment on type public.opportunity_stage is
  'Etapas comerciales: Nuevo, Cotizado, Negociando, Ganado, Cerrado y Perdido.';

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  stage public.opportunity_stage not null default 'new',
  -- Quién lleva el trato. Son dos personas, pero conviene saber de quién es.
  owner uuid references auth.users (id) on delete set null,
  expected_close date,
  note text,
  /*
   * "Esperando adelanto" no es una columna del tablero.
   *
   * Las compras grandes llevan adelanto y las chicas no, así que una columna
   * estaría vacía la mayor parte del tiempo y empujaría a mover la tarjeta
   * fuera de la etapa en la que de verdad está. Es una marca que puede
   * convivir con cualquier etapa, y siempre dice por qué.
   */
  blocked_reason text check (blocked_reason is null or length(btrim(blocked_reason)) > 0),
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint opportunities_block_is_dated check ((blocked_reason is null) = (blocked_at is null))
);

create index opportunities_stage_idx on public.opportunities (workspace_id, stage);
create index opportunities_customer_idx on public.opportunities (customer_id);

comment on table public.opportunities is
  'Un trato con un cliente: agrupa las cotizaciones que se le mandaron y los pedidos que salieron de ahí.';

comment on column public.opportunities.stage is
  'La etapa "closed" la pone el disparador cuando los pedidos están entregados y cobrados. Escribirla a mano no sirve de nada.';

/*
 * Quién movió la tarjeta, cuándo y por qué.
 *
 * Lo escribe un disparador y no la aplicación, para que no dependa de que
 * alguien se acuerde: cualquier camino que cambie la etapa —el tablero, un
 * pedido que se cobró, una corrección por SQL— deja su rastro igual.
 */
create table public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  from_stage public.opportunity_stage,
  to_stage public.opportunity_stage not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create index opportunity_stage_history_opportunity_idx
  on public.opportunity_stage_history (opportunity_id, changed_at desc);

-- Las dos referencias son opcionales a propósito: una venta de mostrador no
-- pasa por ningún trato, y obligarla a inventarse uno sería papeleo inútil.
alter table public.quotes
  add column opportunity_id uuid references public.opportunities (id) on delete set null;
alter table public.orders
  add column opportunity_id uuid references public.opportunities (id) on delete set null;

create index quotes_opportunity_idx on public.quotes (opportunity_id);
create index orders_opportunity_idx on public.orders (opportunity_id);

-- ------------------------------------------------- cuándo está cerrado

/*
 * Un trato está liquidado cuando todo lo que se prometió ya salió y ya se
 * cobró. Un pedido cancelado no cuenta: no se entrega ni se cobra. Un regalo
 * o un pedido de uso propio tampoco se cobra, y por eso su `payment_status`
 * es `not_applicable`.
 *
 * Sin pedidos no hay nada liquidado: un trato recién creado no está cerrado,
 * está empezando.
 */
create or replace function app.opportunity_is_settled(p_opportunity uuid)
returns boolean
language sql
stable
as $$
  select exists (
      select 1 from public.orders o
       where o.opportunity_id = p_opportunity and o.status <> 'cancelled'
    )
    and not exists (
      select 1 from public.orders o
       where o.opportunity_id = p_opportunity
         and o.status <> 'cancelled'
         and (o.status not in ('delivered', 'closed')
              or o.payment_status not in ('paid', 'not_applicable'))
    );
$$;

comment on function app.opportunity_is_settled(uuid) is
  'Todos los pedidos del trato entregados y cobrados. Es la única definición de "cerrado".';

/*
 * La etapa se corrige sola antes de guardarse.
 *
 * Es la misma regla que rige los saldos: no se guarda lo que se puede
 * derivar. "Cerrado" no se mueve a mano, y "Ganado" significa que el trato se
 * convirtió en pedido, así que ninguno de los dos depende de que alguien
 * arrastre la tarjeta al sitio correcto.
 *
 * Si alguien suelta la tarjeta en "Cerrado" antes de tiempo, vuelve de donde
 * vino en vez de rechazarse: en un tablero, ver la tarjeta regresar dice más
 * que un mensaje de error, y el tablero además no ofrece esa columna.
 *
 * "Perdido" es la única etapa que la máquina nunca toca. Es la decisión de
 * una persona y no se deduce de ningún dato.
 */
create or replace function app.normalize_opportunity_stage()
returns trigger
language plpgsql
as $$
declare
  v_has_orders boolean;
begin
  if new.stage = 'lost' then
    return new;
  end if;

  if app.opportunity_is_settled(new.id) then
    new.stage := 'closed';
    return new;
  end if;

  -- Ya no está liquidado (se anuló un cobro, o entró otro pedido al trato).
  if new.stage = 'closed' then
    new.stage := case when tg_op = 'UPDATE' then old.stage else 'new' end;
  end if;

  select exists (
    select 1 from public.orders o
     where o.opportunity_id = new.id and o.status <> 'cancelled'
  ) into v_has_orders;

  if v_has_orders and new.stage in ('new', 'quoted', 'negotiating') then
    new.stage := 'won';
  end if;

  return new;
end;
$$;

create trigger opportunities_normalize_stage
before insert or update on public.opportunities
for each row execute function app.normalize_opportunity_stage();

/*
 * El motivo de un movimiento viaja por un ajuste de la transacción, no por una
 * columna: es un dato del cambio, no del trato. Lo pone la función
 * `set_opportunity_stage` y lo lee este disparador. Como es local a la
 * transacción, cada petición empieza sin él.
 */
create or replace function app.log_opportunity_stage()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then
    return null;
  end if;

  insert into public.opportunity_stage_history (
    workspace_id, opportunity_id, from_stage, to_stage, changed_by, note
  ) values (
    new.workspace_id, new.id,
    case when tg_op = 'UPDATE' then old.stage end,
    new.stage, auth.uid(),
    nullif(btrim(coalesce(current_setting('app.change_reason', true), '')), '')
  );

  return null;
end;
$$;

create trigger opportunities_log_stage
after insert or update on public.opportunities
for each row execute function app.log_opportunity_stage();

/*
 * Un pedido que nace, que se entrega, que se cobra o que se cancela mueve el
 * trato al que pertenece. La escritura es un no-op a propósito: lo que importa
 * es que vuelva a correr el disparador de arriba, que es quien sabe la regla.
 * Es el mismo patrón con el que `orders.payment_status` sigue a los cobros.
 *
 * Mira los dos lados: un pedido que se pasa de un trato a otro deja dos
 * tarjetas por recalcular.
 */
create or replace function app.refresh_opportunity_of_order()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'INSERT' and old.opportunity_id is not null then
    update public.opportunities set stage = stage where id = old.opportunity_id;
  end if;

  if tg_op <> 'DELETE' and new.opportunity_id is not null
     and (tg_op <> 'UPDATE' or new.opportunity_id is distinct from old.opportunity_id) then
    update public.opportunities set stage = stage where id = new.opportunity_id;
  end if;

  return null;
end;
$$;

create trigger orders_refresh_opportunity
after insert or delete on public.orders
for each row execute function app.refresh_opportunity_of_order();

-- Separado del anterior para que solo corra cuando cambie algo que importe:
-- el estado, el cobro o a qué trato pertenece.
create trigger orders_refresh_opportunity_on_change
after update of status, payment_status, opportunity_id on public.orders
for each row execute function app.refresh_opportunity_of_order();

-- ------------------------------------------------------ mover la tarjeta

/*
 * Mover una tarjeta con su motivo. La aplicación llama aquí en vez de escribir
 * la columna, porque el motivo no cabe en un `update` de PostgREST: viaja por
 * el ajuste de transacción que lee el disparador del historial.
 */
create or replace function app.set_opportunity_stage(
  p_opportunity uuid,
  p_stage public.opportunity_stage,
  p_reason text default null
)
returns public.opportunities
language plpgsql
as $$
declare
  v_opportunity public.opportunities;
begin
  if p_stage = 'closed' then
    raise exception 'Un trato llega a "Cerrado" solo cuando todos sus pedidos están entregados y cobrados. No se mueve a mano.';
  end if;

  perform set_config('app.change_reason', coalesce(btrim(p_reason), ''), true);

  update public.opportunities
     set stage = p_stage
   where id = p_opportunity
  returning * into v_opportunity;

  if not found then
    raise exception 'No encontramos este trato.';
  end if;

  perform set_config('app.change_reason', '', true);

  return v_opportunity;
end;
$$;

create or replace function public.set_opportunity_stage(
  p_opportunity uuid,
  p_stage public.opportunity_stage,
  p_reason text default null
)
returns public.opportunities
language sql
volatile
as $$
  select app.set_opportunity_stage(p_opportunity, p_stage, p_reason);
$$;

grant execute on function app.set_opportunity_stage(uuid, public.opportunity_stage, text) to authenticated;
grant execute on function public.set_opportunity_stage(uuid, public.opportunity_stage, text) to authenticated;

-- ------------------------------------------------------------- el tablero

/*
 * Todo lo que necesita una tarjeta, resuelto en la base.
 *
 * "Días sin movimiento" es la pregunta que el dueño hace mirando el tablero,
 * y un trato se mueve de varias maneras: cambiando de etapa, recibiendo otra
 * cotización o convirtiéndose en pedido. Por eso no sale de `updated_at`: esa
 * columna la toca también el recálculo automático de la etapa, y un trato
 * olvidado parecería recién atendido.
 */
create view public.opportunity_board with (security_invoker = true) as
select
  o.id as opportunity_id,
  o.workspace_id,
  o.title,
  o.stage,
  o.customer_id,
  c.name as customer_name,
  o.owner,
  m.display_name as owner_name,
  o.expected_close,
  o.note,
  o.blocked_reason,
  o.blocked_at,
  o.created_at,
  q.quotes,
  coalesce(q.quoted_total, 0) as quoted_total,
  d.orders,
  coalesce(d.ordered_total, 0) as ordered_total,
  -- Lo que vale el trato: lo pedido cuando ya hay pedidos, y lo cotizado
  -- mientras tanto. Sumar los dos contaría dos veces la misma venta.
  case when coalesce(d.orders, 0) > 0 then coalesce(d.ordered_total, 0)
       else coalesce(q.quoted_total, 0) end as amount,
  coalesce(d.open_orders, 0) as open_orders,
  coalesce(d.owing_orders, 0) as owing_orders,
  greatest(
    o.created_at,
    coalesce(h.last_change_at, o.created_at),
    coalesce(q.last_quote_at, o.created_at),
    coalesce(d.last_order_at, o.created_at)
  ) as last_activity_at
from public.opportunities o
left join public.customers c on c.id = o.customer_id
left join public.workspace_members m
  on m.user_id = o.owner and m.workspace_id = o.workspace_id
left join lateral (
  select max(sh.changed_at) as last_change_at
  from public.opportunity_stage_history sh
  where sh.opportunity_id = o.id
) as h on true
left join lateral (
  select
    count(*) as quotes,
    sum(x.total) filter (where x.status <> 'rejected') as quoted_total,
    max(greatest(x.created_at, x.updated_at)) as last_quote_at
  from public.quotes x
  where x.opportunity_id = o.id
) as q on true
left join lateral (
  select
    count(*) as orders,
    sum(x.total) filter (where x.status <> 'cancelled') as ordered_total,
    count(*) filter (
      where x.status <> 'cancelled' and x.status not in ('delivered', 'closed')
    ) as open_orders,
    count(*) filter (
      where x.status <> 'cancelled' and x.payment_status not in ('paid', 'not_applicable')
    ) as owing_orders,
    max(greatest(x.created_at, x.updated_at)) as last_order_at
  from public.orders x
  where x.opportunity_id = o.id
) as d on true;

comment on view public.opportunity_board is
  'Una fila por trato con lo que muestra su tarjeta: cliente, monto, cuántos pedidos faltan por entregar y por cobrar, y cuándo se movió por última vez.';

-- ------------------------------------------------------ la ficha del cliente

/*
 * La relación con un cliente en una fila: cuánto nos ha comprado, cuánto debe
 * y cuándo fue la última vez. Las cuentas salen de `order_payment_summary`,
 * que ya es el sitio donde vive el cobro de un pedido; repetirlas aquí sería
 * la cuarta pantalla con su propia aritmética.
 */
create view public.customer_history with (security_invoker = true) as
select
  c.id as customer_id,
  c.workspace_id,
  c.name,
  coalesce(s.orders, 0) as orders,
  coalesce(s.sold, 0) as sold,
  coalesce(s.paid, 0) as paid,
  coalesce(s.balance, 0) as balance,
  s.last_order_on,
  coalesce(d.opportunities, 0) as opportunities,
  coalesce(d.open_opportunities, 0) as open_opportunities,
  coalesce(d.won_opportunities, 0) as won_opportunities
from public.customers c
left join lateral (
  select
    count(*) as orders,
    sum(x.total) as sold,
    sum(x.paid) as paid,
    sum(x.balance) as balance,
    max(x.ordered_on) as last_order_on
  from public.order_payment_summary x
  where x.customer_id = c.id and x.status <> 'cancelled'
) as s on true
left join lateral (
  select
    count(*) as opportunities,
    count(*) filter (where x.stage in ('new', 'quoted', 'negotiating', 'won')) as open_opportunities,
    count(*) filter (where x.stage in ('won', 'closed')) as won_opportunities
  from public.opportunities x
  where x.customer_id = c.id
) as d on true;

comment on view public.customer_history is
  'Un cliente y su relación: pedidos, cuánto compró, cuánto debe y cuántos tratos tiene abiertos.';

-- Qué le hemos vendido a cada cliente, agrupado por producto.
create view public.customer_purchases with (security_invoker = true) as
select
  o.workspace_id,
  o.customer_id,
  l.variant_id,
  l.description,
  sum(l.quantity)::integer as quantity,
  sum(l.line_total) as total,
  max(o.ordered_on) as last_ordered_on
from public.orders o
join public.order_lines l on l.order_id = o.id
where o.purpose = 'sale' and o.status <> 'cancelled' and o.customer_id is not null
group by o.workspace_id, o.customer_id, l.variant_id, l.description;

comment on view public.customer_purchases is
  'Lo que cada cliente ha comprado, sumado por producto.';

select app.apply_workspace_rls('opportunities');
select app.apply_workspace_rls('opportunity_stage_history');

select app.add_updated_at_trigger('opportunities');
