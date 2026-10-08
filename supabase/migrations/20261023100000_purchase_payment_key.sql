-- Paying a purchase once, however many times the button is pressed.
--
-- A double click on «Registrar pago» wrote the payment twice, 3 ms apart: the
-- purchase of S/ 170 ended up with S/ 120 paid instead of S/ 60. The
-- overpayment check only stops the second one when the sum passes what is
-- owed (tercera pasada, T1-01). The screen now ignores the second click, but
-- a phone that sends the request, loses the answer and sends it again has no
-- screen to stop it.
--
-- So the request carries a key, like `quick_sale`: asked again with the same
-- key, the function returns the payment it already wrote and writes nothing.
-- The key lives in a table of its own, beside `transactions`, which belongs
-- to the finance module.
--
-- Two more things change while the function is recreated:
--
-- * A payment dated in the future is refused (T1-09). It lowered today's
--   balance and landed the purchase in a month that has not happened. A few
--   minutes of slack, like `quick_sale`: the phone's clock is not the server's.
-- * The amounts in the overpayment message are formatted with room for large
--   numbers. 'FM999999990.00' printed ######### past a hundred million.

create table public.purchase_payment_requests (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  request_key uuid not null,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_key)
);

comment on table public.purchase_payment_requests is
  'La llave con que se pidió cada pago de compra. Si el mismo pedido llega dos veces (doble clic, la respuesta se perdió y se reintentó), record_purchase_payment devuelve el pago que ya escribió en vez de escribir otro.';

select app.apply_workspace_rls('purchase_payment_requests');

-- The signature gains a parameter: the old one has to go, or PostgREST would
-- see two candidates for the same call.
drop function public.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text
);
drop function app.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text
);

/*
 * Records money paid for a purchase, in one transaction.
 *
 * The purchase row is locked first, so two people paying the same purchase at
 * the same time cannot both pass the overpayment check. Runs as the caller, so
 * the usual access rules apply. Mirrors `app.record_payment`, its twin for
 * money coming in.
 *
 * `p_payment_key` names the request. Asked again with the same key, the
 * function returns the payment it wrote the first time and does nothing else:
 * the lock makes a second call that arrives while the first is still running
 * wait for it, and then find its payment.
 */
create function app.record_purchase_payment(
  p_purchase_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_payment_key uuid default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_purchase public.purchases;
  v_account public.accounts;
  v_amount numeric(12, 2);
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_total numeric;
  v_paid numeric;
  v_method public.payment_method;
  v_transaction public.transactions;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'No existe la compra indicada.';
  end if;

  -- The same payment asked again: the one already written, and nothing else.
  if p_payment_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('purchase_payment ' || p_payment_key::text, 0));
    select t.* into v_transaction
    from public.purchase_payment_requests r
    join public.transactions t on t.id = r.transaction_id
    where r.workspace_id = v_purchase.workspace_id and r.request_key = p_payment_key;
    if found then
      return v_transaction;
    end if;
  end if;

  -- Rounded up front: the check has to judge the amount that will be stored.
  if p_amount is null or p_amount = 'NaN'::numeric then
    raise exception 'Indica cuánto pagaste.';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 then
    raise exception 'El monto mínimo de un pago es S/ 0.01.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha del pago no es válida.';
  end if;
  if v_when > now() + interval '5 minutes' then
    raise exception 'El pago no puede tener fecha futura.';
  end if;

  select * into v_account from public.accounts where id = p_account_id;
  if not found then
    raise exception 'No existe la cuenta indicada para el pago.';
  end if;
  if v_account.workspace_id <> v_purchase.workspace_id then
    raise exception 'La cuenta % pertenece a otro taller.', v_account.name;
  end if;
  if not v_account.active then
    raise exception 'La cuenta % está desactivada.', v_account.name;
  end if;

  v_method := coalesce(p_payment_method, v_account.default_payment_method);
  if v_method is null then
    raise exception 'Falta el medio de pago: la cuenta % no tiene uno por defecto.', v_account.name;
  end if;

  select s.total, s.paid into v_total, v_paid
  from public.purchase_payment_status s
  where s.purchase_id = p_purchase_id;

  if v_paid + v_amount > v_total then
    raise exception
      'El pago excede lo que falta pagar de la compra: el total es S/ %, ya se pagó S/ %, queda S/ % y se intentó pagar S/ %.',
      to_char(v_total, 'FM999999999990.00'),
      to_char(v_paid, 'FM999999999990.00'),
      to_char(v_total - v_paid, 'FM999999999990.00'),
      to_char(v_amount, 'FM999999999990.00');
  end if;

  insert into public.transactions (
    workspace_id, account_id, type, amount, occurred_at,
    payment_method, purchase_id, counterparty, reference, note
  )
  values (
    v_purchase.workspace_id,
    p_account_id,
    'expense',
    v_amount,
    v_when,
    v_method,
    p_purchase_id,
    (select s.name from public.suppliers s where s.id = v_purchase.supplier_id),
    coalesce(nullif(btrim(p_reference), ''), v_purchase.document_ref),
    coalesce(
      nullif(btrim(p_note), ''),
      format('Pago de la compra del %s', to_char(v_purchase.purchased_at, 'DD/MM/YYYY'))
    )
  )
  returning * into v_transaction;

  if p_payment_key is not null then
    insert into public.purchase_payment_requests (workspace_id, request_key, transaction_id)
    values (v_purchase.workspace_id, p_payment_key, v_transaction.id);
  end if;

  return v_transaction;
end;
$$;

grant execute on function app.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text, uuid
) to authenticated;

-- PostgREST only sees the public schema.
create function public.record_purchase_payment(
  p_purchase_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_payment_key uuid default null
)
returns public.transactions
language sql
volatile
as $$
  select app.record_purchase_payment(
    p_purchase_id, p_account_id, p_amount, p_payment_method,
    p_occurred_at, p_reference, p_note, p_payment_key
  );
$$;

grant execute on function public.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text, uuid
) to authenticated;
