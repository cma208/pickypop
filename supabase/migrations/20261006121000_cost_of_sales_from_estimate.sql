-- The cost of sales stops being replaced by the cost of one print.
--
-- The income statement used the real cost of an order as soon as it had any
-- print job tied to it. But a print job only knows filament, energy and the
-- machine: the candies, the bottle, the packaging and the labour that the
-- order's estimate does count vanished from the result the moment a single
-- plate was closed. A sale of S/ 85 was reported with S/ 2.70 of cost.
--
-- Each line now counts what its recipe says it costs to make, frozen on the
-- line when the order was taken (`estimated_unit_cost`, the full figure from
-- `calculateBatchCost`). The cost of the prints is used only for a line that
-- has no estimate at all, where it is better than counting nothing.
--
-- This is a stopgap that is honest about what it knows. The real cost of what
-- was sold comes the day delivering an order takes it off the shelf.

create or replace view public.monthly_income_statement with (security_invoker = true) as
with line_costs as (
  select
    l.order_id,
    case
      when l.estimated_unit_cost > 0 then l.estimated_unit_cost * l.quantity
      -- A failed print on a customer's order is a cost of that order too.
      else coalesce((
        select sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0))
        from public.print_jobs j
        where j.order_line_id = l.id
          and j.status in ('success', 'failed')
      ), 0)
    end as cost
  from public.order_lines l
),
order_costs as (
  select
    o.workspace_id,
    date_trunc('month', o.ordered_on::timestamp)::date as month,
    o.total,
    coalesce((select sum(c.cost) from line_costs c where c.order_id = o.id), 0) as cost
  from public.orders o
  where o.purpose = 'sale'
    and o.status <> 'cancelled'
),
sales as (
  select
    workspace_id,
    month,
    sum(total) as sales,
    sum(cost) as cost_of_sales
  from order_costs
  group by workspace_id, month
),
money as (
  select
    t.workspace_id,
    date_trunc('month', t.occurred_at)::date as month,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is null), 0)
      as operating_expenses,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is not null), 0)
      as inventory_purchases,
    coalesce(sum(t.amount) filter (where t.type = 'owner_contribution'), 0) as owner_contributions,
    coalesce(sum(t.amount) filter (where t.type = 'owner_draw'), 0) as owner_draws,
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.order_id is null), 0)
      as other_income
  from public.transactions t
  where t.voided_at is null
  group by t.workspace_id, date_trunc('month', t.occurred_at)::date
)
select
  coalesce(s.workspace_id, m.workspace_id) as workspace_id,
  coalesce(s.month, m.month) as month,
  coalesce(s.sales, 0) as sales,
  coalesce(s.cost_of_sales, 0) as cost_of_sales,
  coalesce(s.sales, 0) - coalesce(s.cost_of_sales, 0) as gross_profit,
  coalesce(m.operating_expenses, 0) as operating_expenses,
  coalesce(s.sales, 0) - coalesce(s.cost_of_sales, 0) - coalesce(m.operating_expenses, 0)
    as net_profit,
  coalesce(m.other_income, 0) as other_income,
  coalesce(m.inventory_purchases, 0) as inventory_purchases,
  coalesce(m.owner_contributions, 0) as owner_contributions,
  coalesce(m.owner_draws, 0) as owner_draws
from sales s
full join money m on m.workspace_id = s.workspace_id and m.month = s.month;

comment on view public.monthly_income_statement is
  'Profitability by month. The cost of sales is what each line''s recipe says it costs to make. Inventory purchases are shown apart: they reach the result through that cost.';
