-- A purchase costs the sum of its lines, each one rounded to the cent.
--
-- `purchase_payment_status` added every line unrounded and rounded once at
-- the end. Everything else rounds each line: `planPurchase` (the preview and
-- the confirmation), `register_purchase` (its cap and the check that the
-- rolls add up) and the movements that value the stock. With one line both
-- ways agree. With two lines of 1000 g at 0.015005 they do not: the preview
-- said S/ 30.02, the stock came in valued at S/ 30.02, and the purchase was
-- paid S/ 30.01, the view's total (review of the tercera pasada, T1-16).
--
-- The rule of the domain is the line one: each money component is rounded
-- to the cent on its own, so the breakdown adds up exactly to the total
-- (AGENTS.md). The view follows it now, and the three numbers are one.
--
-- Purchases already registered: their total moves only when two or more of
-- their lines have fractions of a cent, and then by a cent or two. A paid one
-- may show a cent «por pagar» (or a cent more paid than the total, which
-- the view shows as nothing pending). Their stock was already valued line by
-- line, so the new total is the one that matches their kardex. The notice
-- below says how many there are when this runs, so it can be checked.

do $$
declare
  v_changed integer;
  v_paid_changed integer;
begin
  with totals as (
    select
      p.id,
      round(coalesce(sum(l.quantity * l.unit_price), 0) + p.shipping_cost + p.other_costs, 2) as once,
      coalesce(sum(round(l.quantity * l.unit_price, 2)), 0) + p.shipping_cost + p.other_costs as by_line
    from public.purchases p
    left join public.purchase_lines l on l.purchase_id = p.id
    group by p.id
  )
  select
    count(*) filter (where once <> by_line),
    count(*) filter (where once <> by_line and exists (
      select 1 from public.transactions t
      where t.purchase_id = totals.id and t.type = 'expense' and t.voided_at is null
    ))
  into v_changed, v_paid_changed
  from totals;

  raise notice 'purchase_payment_status: % compras cambian de total al redondear por línea (% con pagos).',
    v_changed, v_paid_changed;
end;
$$;

create or replace view public.purchase_payment_status with (security_invoker = true) as
with totals as (
  select
    p.id as purchase_id,
    p.workspace_id,
    p.purchased_at,
    -- Each line rounded to the cent, then added, the way `planPurchase` and
    -- `register_purchase` add them up.
    coalesce((
      select sum(round(l.quantity * l.unit_price, 2))
      from public.purchase_lines l
      where l.purchase_id = p.id
    ), 0) + p.shipping_cost + p.other_costs as total
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
  'How much of each purchase has been paid and how much is still owed, from the expenses tied to it. The total is the sum of its lines, each rounded to the cent, plus shipping and other costs.';
