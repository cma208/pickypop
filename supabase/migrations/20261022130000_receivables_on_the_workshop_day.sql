-- How late a debt is, counted on the workshop's day (T4-11).
--
-- `receivables` compared the due date with `current_date`, which is the
-- server's day, in UTC. From 19:00 in Lima it is already tomorrow there: what
-- fell due today came out one day late, added up as «Vencido» and showed
-- under «Solo vencidos». The day is now the workshop's (`app.workspace_day`),
-- the same one «Hoy» uses. Same columns, same types: only the day changes.

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
