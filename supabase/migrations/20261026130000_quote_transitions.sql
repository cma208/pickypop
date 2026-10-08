-- Una cotización solo avanza por su camino, y solo la última versión vive
-- (T4-03 y T4-09).
--
-- El estado de una cotización se escribía con un `update` directo, sin nada
-- en la base que lo cuidara. En la tercera pasada, desde una pestaña vieja,
-- una cotización ya aceptada pasó a «Rechazada» con su pedido vivo, y una
-- versión de historial (la 1, cuando la 2 ya tenía pedido) se marcó como
-- enviada y volvió a separar estante durante un día y medio para un trato ya
-- cerrado.
--
-- El camino es borrador → enviada → aceptada, rechazada o vencida. Lo cuida
-- un disparador, así que vale igual para la pantalla, para una pestaña vieja
-- y para quien llame a la API:
--
-- * Una cotización cerrada (aceptada, rechazada o vencida) ya no cambia de
--   estado. Si el cliente vuelve, se hace una versión nueva con los precios
--   de hoy. Si se echa atrás de una aceptada, se cancela su pedido.
-- * Una enviada no vuelve a borrador: para cambiarla, una versión nueva.
-- * Se acepta creando su pedido (`accept_quote`): aceptada sin pedido no.
-- * Solo la última versión de un documento se envía, se acepta o separa: las
--   anteriores quedan como historial. Rechazar una vieja sí se puede, porque
--   solo suelta lo que separaba.
-- * Un documento que ya tiene pedido vivo, en cualquiera de sus versiones,
--   no se vuelve a enviar ni separa: lo que pide ya lo tiene el pedido.
--
-- Y cuando una versión se envía o se acepta, las demás del mismo documento
-- dejan de separar en ese momento. Antes, la versión 1 enviada seguía
-- apartando estante después de enviar la 2, o de aceptarla.
--
-- Lo que ya existe: los separos vivos de versiones viejas, o de documentos
-- que ya tienen pedido, terminan ahora. No se cambia ningún estado: una
-- cotización rechazada con pedido (la de la pasada) queda como está, y solo
-- deja de poder cambiar.

/*
 * The newest version of a quote document.
 */
create or replace function app.latest_quote_version(p_workspace_id uuid, p_number text)
returns integer
language sql
stable
as $$
  select max(q.version)
  from public.quotes q
  where q.workspace_id = p_workspace_id and q.number = p_number;
$$;

grant execute on function app.latest_quote_version(uuid, text) to authenticated;

/*
 * The way a quote moves, and which quote may hold. The messages name what
 * blocks and what to do instead: they reach the person as they are.
 */
create or replace function app.guard_quote_status()
returns trigger
language plpgsql
as $$
declare
  v_latest integer;
  v_order text;
  v_labels constant jsonb := '{"draft": "borrador", "sent": "enviada", "accepted": "aceptada", "rejected": "rechazada", "expired": "vencida"}';
begin
  if new.status is distinct from old.status then
    if old.status = 'accepted' then
      select o.number into v_order
      from public.orders o
      where o.quote_id = old.id and o.status <> 'cancelled'
      order by o.created_at
      limit 1;

      if v_order is not null then
        raise exception 'La cotización % ya se aceptó y tiene el pedido %: no pasa a «%». Si el cliente se echó atrás, cancela el pedido.',
          old.number, v_order, v_labels ->> new.status::text;
      end if;
      raise exception 'La cotización % ya se aceptó: no pasa a «%». Si el cliente pide otra cosa, crea una versión nueva.',
        old.number, v_labels ->> new.status::text;
    end if;

    if old.status in ('rejected', 'expired') then
      raise exception 'La cotización % ya está %: no pasa a «%». Si el cliente la retoma, crea una versión nueva con los precios de hoy.',
        old.number, v_labels ->> old.status::text, v_labels ->> new.status::text;
    end if;

    if new.status = 'draft' then
      raise exception 'Una cotización enviada no vuelve a borrador. Si hay que cambiarla, crea una versión nueva.';
    end if;

    if new.status in ('sent', 'accepted') then
      v_latest := app.latest_quote_version(new.workspace_id, new.number);
      if v_latest > new.version then
        raise exception 'Esta es la versión % de %, y ya existe la versión %: % esa, que es la vigente.',
          new.version, new.number, v_latest,
          case new.status when 'sent' then 'envía' else 'acepta' end;
      end if;
    end if;

    if new.status = 'sent' then
      v_order := app.quote_document_order(new.workspace_id, new.number);
      if v_order is not null then
        raise exception 'La cotización % ya tiene el pedido %: no se vuelve a enviar.', new.number, v_order;
      end if;
    end if;

    -- `accept_quote` creates the order first, in the same transaction.
    if new.status = 'accepted' and not exists (
      select 1 from public.orders o where o.quote_id = new.id and o.status <> 'cancelled'
    ) then
      raise exception 'Una cotización se acepta creando su pedido: usa «El cliente aceptó».';
    end if;
  end if;

  -- A hold that starts or grows, on a quote that should not hold anymore.
  if new.hold_until is distinct from old.hold_until
     and new.hold_until > now()
     and new.hold_until > coalesce(old.hold_until, '-infinity') then
    v_latest := app.latest_quote_version(new.workspace_id, new.number);
    if v_latest > new.version then
      raise exception 'La versión % de % quedó como historial (ya existe la %): no separa nada.',
        new.version, new.number, v_latest;
    end if;
    v_order := app.quote_document_order(new.workspace_id, new.number);
    if v_order is not null then
      raise exception 'La cotización % ya tiene el pedido %: lo que pide ya lo tiene el pedido, no hace falta separarlo.',
        new.number, v_order;
    end if;
  end if;

  return new;
end;
$$;

-- Before `quotes_hold` (triggers run by name): judged before the hold moves.
create trigger quotes_guard_status
  before update of status, hold_until on public.quotes
  for each row execute function app.guard_quote_status();

/*
 * A version sent or accepted is the one that holds from now on: the others
 * of its document let go of what they held.
 */
create or replace function app.release_other_versions()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('sent', 'accepted') and new.status is distinct from old.status then
    update public.quotes q
       set hold_until = now()
     where q.workspace_id = new.workspace_id
       and q.number = new.number
       and q.id <> new.id
       and q.hold_until > now();
  end if;
  return new;
end;
$$;

create trigger quotes_release_other_versions
  after update of status on public.quotes
  for each row execute function app.release_other_versions();

-- What already holds and should not: old versions, and documents with a live order.
update public.quotes q
   set hold_until = now()
 where q.hold_until > now()
   and (
     q.version < app.latest_quote_version(q.workspace_id, q.number)
     or app.quote_document_order(q.workspace_id, q.number) is not null
   );
