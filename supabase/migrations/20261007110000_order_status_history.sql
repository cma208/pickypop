-- Un pedido puede retroceder, y cuando retrocede hay que saber por qué.
--
-- La base nunca obligó a avanzar: el candado estaba solo en la pantalla, que
-- ofrecía un único botón "pasar a". Eso no es una regla, es una omisión, y en
-- el taller pasa de verdad —algo se rompe en post-proceso y el pedido vuelve a
-- imprimirse—. Mientras no se pudiera registrar, la salida era editar el
-- estado por detrás y perder el rastro.
--
-- Así que se permite, con dos condiciones: queda registrado quién lo hizo, y
-- un retroceso exige motivo. Lo primero sin lo segundo sería un botón de
-- deshacer; con motivo es un hecho auditable.

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create index order_status_history_order_idx
  on public.order_status_history (order_id, changed_at desc);

comment on table public.order_status_history is
  'Cada cambio de estado de un pedido, con quién lo hizo y el motivo cuando retrocedió. Lo escribe un disparador.';

/*
 * El camino normal de un pedido, numerado. "En espera" y "Cancelado" quedan
 * fuera: no son un paso adelante ni atrás, son salirse del camino, y por eso
 * no tienen número.
 */
create or replace function app.order_status_rank(p_status public.order_status)
returns integer
language sql
immutable
as $$
  select case p_status
           when 'confirmed' then 1
           when 'queued' then 2
           when 'printing' then 3
           when 'post_processing' then 4
           when 'ready' then 5
           when 'delivered' then 6
           when 'closed' then 7
         end;
$$;

grant execute on function app.order_status_rank(public.order_status) to authenticated;

/*
 * Retroceder sin decir por qué no se puede, y la regla vive aquí y no en la
 * pantalla: esconder el botón no impide llamar a la API.
 *
 * El motivo viaja por un ajuste local a la transacción, que pone
 * `app.set_order_status`. Es un dato del cambio, no del pedido, y no tendría
 * sentido como columna.
 */
create or replace function app.guard_order_status_change()
returns trigger
language plpgsql
as $$
declare
  v_from integer := app.order_status_rank(old.status);
  v_to integer := app.order_status_rank(new.status);
begin
  if new.status = old.status then
    return new;
  end if;

  if v_from is not null and v_to is not null and v_to < v_from
     and nullif(btrim(coalesce(current_setting('app.change_reason', true), '')), '') is null then
    raise exception 'Para devolver un pedido a un estado anterior hay que decir por qué.';
  end if;

  return new;
end;
$$;

create trigger orders_guard_status_change
before update of status on public.orders
for each row execute function app.guard_order_status_change();

create or replace function app.log_order_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;

  insert into public.order_status_history (
    workspace_id, order_id, from_status, to_status, changed_by, note
  ) values (
    new.workspace_id, new.id,
    case when tg_op = 'UPDATE' then old.status end,
    new.status, auth.uid(),
    nullif(btrim(coalesce(current_setting('app.change_reason', true), '')), '')
  );

  return null;
end;
$$;

create trigger orders_log_status
after insert or update of status on public.orders
for each row execute function app.log_order_status();

/*
 * La pantalla llama aquí en vez de escribir la columna, porque el motivo no
 * cabe en un `update` de PostgREST.
 */
create or replace function app.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_reason text default null
)
returns public.orders
language plpgsql
as $$
declare
  v_order public.orders;
begin
  perform set_config('app.change_reason', coalesce(btrim(p_reason), ''), true);

  update public.orders
     set status = p_status
   where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'No encontramos este pedido.';
  end if;

  perform set_config('app.change_reason', '', true);

  return v_order;
end;
$$;

create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_reason text default null
)
returns public.orders
language sql
volatile
as $$
  select app.set_order_status(p_order_id, p_status, p_reason);
$$;

grant execute on function app.set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;

select app.apply_workspace_rls('order_status_history');

/*
 * Los pedidos que ya existían estrenan historial con el estado en el que
 * están. Sin esto, un pedido cargado antes de hoy aparecería sin historia y
 * parecería que nunca pasó por ningún sitio.
 */
insert into public.order_status_history (workspace_id, order_id, from_status, to_status, changed_at, note)
select o.workspace_id, o.id, null, o.status, o.created_at,
       'Estado al empezar a llevar el historial.'
from public.orders o;
