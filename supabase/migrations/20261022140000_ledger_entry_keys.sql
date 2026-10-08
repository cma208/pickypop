-- One movement, one key: a resent request does not record money twice.
--
-- Caja and the collection of an order already refuse a second click while
-- the first is saving. That does not cover a request the browser sends again
-- on its own after a lost answer: the third pass watched it resend the same
-- POST three and four times (ADR-024). For the quick sale a key already holds
-- it (`orders.quick_sale_key`); the other two ways money comes in or out get
-- the same.
--
-- * `transactions.entry_key`, unique per workshop. The screen sends one with
--   each movement and keeps it while nothing in the form changes. Optional:
--   whatever writes without one (a migration, a purchase payment) is not
--   affected.
-- * Caja inserts with «on conflict do nothing» on it: a repeated request
--   leaves the first movement and adds nothing.
-- * `record_payment` takes the key (`p_key`, last and optional, so every call
--   that already exists still resolves). With it, a collection already
--   written under that key in the workshop is returned as it is, after the
--   order's lock, so two requests at once cannot both write. The signature
--   changes, so the old function is dropped first: two versions side by side
--   would make the API's call ambiguous.
-- * Its amounts are formatted with twelve integer digits, more than the
--   column holds: with nine, a collection of a thousand million read
--   «S/ #########.##» (T4-15). The rest of the function is the one of
--   20261004130000, as it was.

alter table public.transactions
  add column entry_key uuid,
  add constraint transactions_workspace_entry_key_key unique (workspace_id, entry_key);

comment on column public.transactions.entry_key is
  'Llave que manda la pantalla con cada movimiento: la misma llave dos veces es el mismo movimiento, y la segunda no escribe nada. Opcional.';

drop function public.record_payment(uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text);
drop function app.record_payment(uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text);

create function app.record_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_category_id uuid default null,
  p_reference text default null,
  p_note text default null,
  p_key uuid default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_order public.orders;
  v_account public.accounts;
  v_amount numeric(12, 2);
  v_paid numeric;
  v_method public.payment_method;
  v_transaction public.transactions;
begin
  -- Rounded up front: the check has to judge the amount that will be stored.
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No existe el pedido solicitado.';
  end if;

  -- After the lock: a second request with the same key waits for the first
  -- and then finds what it wrote.
  if p_key is not null then
    select * into v_transaction
    from public.transactions t
    where t.workspace_id = v_order.workspace_id and t.entry_key = p_key;
    if found then
      return v_transaction;
    end if;
  end if;

  if v_order.purpose <> 'sale' then
    raise exception 'El pedido % no es una venta, así que no se cobra.', v_order.number;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido % está cancelado y no admite cobros.', v_order.number;
  end if;

  select * into v_account from public.accounts where id = p_account_id;
  if not found then
    raise exception 'No existe la cuenta indicada para el cobro.';
  end if;
  if v_account.workspace_id <> v_order.workspace_id then
    raise exception 'La cuenta % pertenece a otro taller.', v_account.name;
  end if;
  if not v_account.active then
    raise exception 'La cuenta % está desactivada.', v_account.name;
  end if;

  v_method := coalesce(p_payment_method, v_account.default_payment_method);
  if v_method is null then
    raise exception 'Falta el medio de pago: la cuenta % no tiene uno por defecto.', v_account.name;
  end if;

  v_paid := app.order_amount_paid(p_order_id);
  if v_paid + v_amount > v_order.total then
    raise exception
      'El cobro excede el saldo del pedido %: el total es S/ %, ya se cobró S/ %, queda pendiente S/ % y se intentó cobrar S/ %.',
      v_order.number,
      to_char(v_order.total, 'FM999999999990.00'),
      to_char(v_paid, 'FM999999999990.00'),
      to_char(v_order.total - v_paid, 'FM999999999990.00'),
      to_char(v_amount, 'FM999999999990.00');
  end if;

  insert into public.transactions (
    workspace_id, account_id, type, category_id, amount, occurred_at,
    payment_method, order_id, counterparty, reference, note, entry_key
  )
  values (
    v_order.workspace_id,
    p_account_id,
    'income',
    p_category_id,
    v_amount,
    coalesce(p_occurred_at, now()),
    v_method,
    p_order_id,
    (select c.name from public.customers c where c.id = v_order.customer_id),
    p_reference,
    coalesce(p_note, format('Cobro del pedido %s', v_order.number)),
    p_key
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

grant execute on function app.record_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text, uuid
) to authenticated;

-- The browser only reaches the "public" schema (see 20260930030000).
create function public.record_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_category_id uuid default null,
  p_reference text default null,
  p_note text default null,
  p_key uuid default null
)
returns public.transactions
language sql
volatile
as $$
  select app.record_payment(
    p_order_id, p_account_id, p_amount, p_payment_method,
    p_occurred_at, p_category_id, p_reference, p_note, p_key
  );
$$;

grant execute on function public.record_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text, uuid
) to authenticated;
