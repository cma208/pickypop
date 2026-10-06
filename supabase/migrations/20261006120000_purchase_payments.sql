-- Paying for a purchase.
--
-- Until now registering a purchase put stock on the shelf and nothing else:
-- the money that left to pay for it was never written, and Caja had no way to
-- tie an expense to a purchase. So either the account looked richer than it
-- was, or the payment was noted by hand in Caja, counted as an operating
-- expense, and the month's profit came out lower than it really was — the
-- income statement keeps purchases apart precisely because they reach the
-- result through the cost of sales.
--
-- A purchase can also be paid later, or in parts: what is still owed is
-- derived from the expenses tied to it, never stored.

create view public.purchase_payment_status with (security_invoker = true) as
with totals as (
  select
    p.id as purchase_id,
    p.workspace_id,
    p.purchased_at,
    -- Rounded once, at the end, the way the purchase screen adds it up
    -- (`sumMoney` over every line plus shipping and other costs).
    round(
      coalesce((
        select sum(l.quantity * l.unit_price)
        from public.purchase_lines l
        where l.purchase_id = p.id
      ), 0) + p.shipping_cost + p.other_costs,
      2
    ) as total
  from public.purchases p
),
paid as (
  select t.purchase_id, sum(t.amount) as paid, max(t.occurred_at) as last_paid_at
  from public.transactions t
  where t.purchase_id is not null
    and t.type = 'expense'
    and t.voided_at is null
  group by t.purchase_id
)
select
  totals.purchase_id,
  totals.workspace_id,
  totals.total,
  coalesce(paid.paid, 0) as paid,
  greatest(totals.total - coalesce(paid.paid, 0), 0) as pending,
  paid.last_paid_at
from totals
left join paid on paid.purchase_id = totals.purchase_id;

comment on view public.purchase_payment_status is
  'How much of each purchase has been paid and how much is still owed, from the expenses tied to it.';

/*
 * Records money paid for a purchase, in one transaction.
 *
 * The purchase row is locked first, so two people paying the same purchase at
 * the same time cannot both pass the overpayment check. Runs as the caller, so
 * the usual access rules apply. Mirrors `app.record_payment`, its twin for
 * money coming in.
 */
create or replace function app.record_purchase_payment(
  p_purchase_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_note text default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_purchase public.purchases;
  v_account public.accounts;
  v_amount numeric(12, 2);
  v_total numeric;
  v_paid numeric;
  v_method public.payment_method;
  v_transaction public.transactions;
begin
  -- Rounded up front: the check has to judge the amount that will be stored.
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'El monto del pago tiene que ser mayor que cero.';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'No existe la compra indicada.';
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
      to_char(v_total, 'FM999999990.00'),
      to_char(v_paid, 'FM999999990.00'),
      to_char(v_total - v_paid, 'FM999999990.00'),
      to_char(v_amount, 'FM999999990.00');
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
    coalesce(p_occurred_at, now()),
    v_method,
    p_purchase_id,
    (select s.name from public.suppliers s where s.id = v_purchase.supplier_id),
    coalesce(p_reference, v_purchase.document_ref),
    coalesce(p_note, format('Pago de la compra del %s', to_char(v_purchase.purchased_at, 'DD/MM/YYYY')))
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

grant execute on function app.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.record_purchase_payment(
  p_purchase_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_note text default null
)
returns public.transactions
language sql
volatile
as $$
  select app.record_purchase_payment(
    p_purchase_id, p_account_id, p_amount, p_payment_method,
    p_occurred_at, p_reference, p_note
  );
$$;

grant execute on function public.record_purchase_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, text, text
) to authenticated;
