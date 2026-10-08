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
-- (AGENTS.md). Purchases registered from now on follow it.
--
-- Purchases already registered keep the total they had. Re-adding them line
-- by line would move the total of the ones with two or more lines in
-- fractions of a cent, by a cent or two, after they were paid: a purchase
-- paid in full at S/ 210.01 would show «Falta S/ 0.01» and could only be
-- closed by inventing a payment of one cent. What was agreed and paid stays
-- as it was. `total_by_line` tells them apart: false for every purchase that
-- exists when this runs, true for every one after.
--
-- Adding the column with a constant default writes no row; changing the
-- default afterwards only touches the purchases to come.

alter table public.purchases
  add column total_by_line boolean not null default false;

alter table public.purchases
  alter column total_by_line set default true;

comment on column public.purchases.total_by_line is
  'Cómo se suma el total de la compra en purchase_payment_status. Verdadero: cada línea redondeada a céntimos y luego sumada, como la vista previa y los movimientos que valorizan el stock. Falso solo en las compras registradas antes de 20261023170000, que conservan el total con que se pagaron: todas las líneas sin redondear y un redondeo al final.';

create or replace view public.purchase_payment_status with (security_invoker = true) as
with totals as (
  select
    p.id as purchase_id,
    p.workspace_id,
    p.purchased_at,
    case
      -- Each line rounded to the cent, then added, the way `planPurchase`
      -- and `register_purchase` add them up.
      when p.total_by_line then
        coalesce((
          select sum(round(l.quantity * l.unit_price, 2))
          from public.purchase_lines l
          where l.purchase_id = p.id
        ), 0) + p.shipping_cost + p.other_costs
      -- A purchase registered before: the total it was paid by, rounded once.
      else
        round(
          coalesce((
            select sum(l.quantity * l.unit_price)
            from public.purchase_lines l
            where l.purchase_id = p.id
          ), 0) + p.shipping_cost + p.other_costs,
          2
        )
    end as total
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
  'How much of each purchase has been paid and how much is still owed, from the expenses tied to it. The total is the sum of its lines, each rounded to the cent, plus shipping and other costs; a purchase registered before 20261023170000 (total_by_line false) keeps the total it was paid by, rounded once at the end.';
