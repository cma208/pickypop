-- How late a debt is, counted on the workshop's day (T4-11), and amounts that
-- fit in the messages of a collection (T4-15).
--
-- `receivables` compared the due date with `current_date`, which is the
-- server's day, in UTC. From 19:00 in Lima it is already tomorrow there: what
-- fell due today came out one day late, added up as «Vencido» and showed
-- under «Solo vencidos». The day is now the workshop's (`app.workspace_day`),
-- the same one «Hoy» uses. Same columns, same types: only the day changes.
--
-- `record_payment` formatted its amounts with nine integer digits, and a
-- collection of a thousand million read «S/ #########.##». Twelve digits is
-- more than the column holds. The rest of the function is the one of
-- 20261004130000, as it was.

create or replace view public.receivables with (security_invoker = true) as
select
  s.order_id,
  s.workspace_id,
  s.number,
  s.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  s.status,
  s.payment_status,
  s.ordered_on,
  s.due_date,
  s.total,
  s.paid,
  s.balance,
  s.last_payment_at,
  case
    when s.due_date is not null and s.due_date < d.today
      then d.today - s.due_date
    else 0
  end as days_overdue
from public.order_payment_summary s
cross join lateral (select app.workspace_day(s.workspace_id, now()) as today) d
left join public.customers c on c.id = s.customer_id
-- The goods are already with the customer and the money is not here yet.
where s.status in ('delivered', 'closed')
  and s.balance > 0;

comment on view public.receivables is
  'Delivered orders still owing money, with how late they are on the workshop''s day.';

create or replace function app.record_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_category_id uuid default null,
  p_reference text default null,
  p_note text default null
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
    payment_method, order_id, counterparty, reference, note
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
    coalesce(p_note, format('Cobro del pedido %s', v_order.number))
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;
