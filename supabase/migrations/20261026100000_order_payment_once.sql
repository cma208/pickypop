-- Un cobro se registra una vez aunque se pida dos (T4-01), y no lleva fecha
-- futura (T4-06).
--
-- En la tercera pasada, un doble clic en «Registrar cobro» guardó dos cobros
-- de S/ 5 a 0.7 ms uno del otro: la cuenta subió S/ 10 y la ficha dijo que el
-- cliente debía S/ 2.99 cuando debía S/ 7.99. `record_payment` aceptó los dos
-- porque juntos no pasaban el total. La pantalla ya corta el segundo clic,
-- pero un clic no es lo único que repite un pedido: el navegador reenvía un
-- POST cuya respuesta se perdió, y una pestaña vieja manda lo mismo otra vez.
--
-- Así que el cobro de un pedido viaja con una llave, como la Venta rápida
-- (`orders.quick_sale_key`, ADR-024). La pantalla la crea al abrir el
-- formulario y la conserva hasta que el cobro se registra. Pedido otra vez
-- con la misma llave, `collect_order_payment` devuelve el movimiento que ya
-- hizo y no hace nada más. Un candado por llave hace esperar a la segunda
-- llamada que llega mientras la primera corre, y después la encuentra.
--
-- La llave no va en `transactions`: esa tabla es de finanzas, que la cierra
-- a cualquier cambio después de registrada (un cobro no se edita, se anula),
-- y la llave tendría que escribirse después de que `record_payment` inserta.
-- Vive en una tabla propia, que solo crece: ni se edita ni se borra.
--
-- Y la fecha: `record_payment` no la miraba, y un cobro fechado en 2027 ya
-- entraba hoy al saldo y abría un mes 2027 en Resultados. Se rechaza lo
-- futuro con el mismo margen de la Venta rápida, cinco minutos, porque el
-- reloj del teléfono no es el del servidor. Lo pasado sí vale: anotar un
-- cobro de otro día es parte del trabajo.

create table public.order_payment_keys (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  payment_key uuid not null,
  order_id uuid not null references public.orders (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, payment_key)
);

create index order_payment_keys_transaction_idx on public.order_payment_keys (transaction_id);

comment on table public.order_payment_keys is
  'La llave con que la ficha del pedido pidió cada cobro: la misma llave otra vez devuelve el cobro que ya se hizo (collect_order_payment). Solo crece.';

select app.apply_workspace_rls('order_payment_keys');

-- A key names one payment for good: nobody rewrites or removes it.
revoke update, delete on public.order_payment_keys from anon, authenticated;

/*
 * Collects money for an order, once per key, through `record_payment`.
 *
 * `p_payment_key` names this payment. Asked again with the same key, the
 * function returns the movement it made and does nothing else. Null works as
 * before, without that protection, for whoever calls it without a key.
 *
 * `p_occurred_at` cannot be in the future: a payment dated next year would
 * be in the balance today. Null is now.
 *
 * Everything else (the amount, the overpayment, the account, the method) is
 * `record_payment`'s to judge, with its own messages.
 */
create or replace function app.collect_order_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_payment_key uuid default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_workspace uuid;
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_key_order uuid;
  v_key_transaction uuid;
  v_transaction public.transactions;
begin
  select o.workspace_id into v_workspace from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'No existe el pedido solicitado.';
  end if;

  -- The same payment asked again: the movement it already made, and nothing else.
  if p_payment_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('order payment ' || p_payment_key::text, 0));

    select k.order_id, k.transaction_id into v_key_order, v_key_transaction
    from public.order_payment_keys k
    where k.workspace_id = v_workspace and k.payment_key = p_payment_key;

    if v_key_order is not null then
      if v_key_order <> p_order_id then
        raise exception 'Este cobro ya se registró en otro pedido. Recarga la pantalla y vuelve a intentarlo.';
      end if;
      select * into v_transaction from public.transactions t where t.id = v_key_transaction;
      return v_transaction;
    end if;
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha del cobro no es válida.';
  end if;
  -- A few minutes of slack: the phone's clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'El cobro no puede tener fecha futura. Anótalo con la fecha en que entró el dinero.';
  end if;

  v_transaction := app.record_payment(
    p_order_id, p_account_id, p_amount, p_payment_method, v_when, null, p_reference, null
  );

  if p_payment_key is not null then
    insert into public.order_payment_keys (workspace_id, payment_key, order_id, transaction_id)
    values (v_workspace, p_payment_key, p_order_id, v_transaction.id);
  end if;

  return v_transaction;
end;
$$;

grant execute on function app.collect_order_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.collect_order_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_payment_key uuid default null
)
returns public.transactions
language sql
volatile
as $$
  select app.collect_order_payment(
    p_order_id, p_account_id, p_amount, p_payment_method, p_occurred_at, p_reference, p_payment_key
  );
$$;

grant execute on function public.collect_order_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, uuid
) to authenticated;

comment on function public.collect_order_payment(uuid, uuid, numeric, public.payment_method, timestamptz, text, uuid) is
  'Cobra un pedido por record_payment, una sola vez por llave (p_payment_key): la misma llave devuelve el cobro que ya se hizo. Rechaza la fecha futura.';
