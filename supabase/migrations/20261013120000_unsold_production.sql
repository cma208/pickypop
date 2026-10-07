-- What is printed and never sold reaches the result (ADR-023).
--
-- A mould, a test print or a part that was missing when the shelf was counted
-- cost filament, power and machine time, and no order will ever carry that
-- cost. The income statement did not see them at all: S/ 7.72 of mould and a
-- missing back part left the month exactly as profitable as before.
--
-- They are now an expense of the month they happened in, at what they really
-- cost: the job's own material, energy and machine, and the counted loss at
-- what each unit was worth on the shelf.
--
-- Failed prints are reported apart and not subtracted. The recipe already
-- charges a failure allowance on every unit sold, so a failure is paid by the
-- cost of sales. Subtracting it again would count it twice. What the owner
-- needs is the comparison: how much failed against the allowance the prices
-- carry, so the view also gives what was printed and the allowance in force.
--
-- The months follow the workshop's clock. They were cut in UTC, which put a
-- payment made on the evening of the 31st into the next month.

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
    date_trunc('month', t.occurred_at at time zone w.timezone)::date as month,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is null), 0)
      as operating_expenses,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is not null), 0)
      as inventory_purchases,
    coalesce(sum(t.amount) filter (where t.type = 'owner_contribution'), 0) as owner_contributions,
    coalesce(sum(t.amount) filter (where t.type = 'owner_draw'), 0) as owner_draws,
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.order_id is null), 0)
      as other_income
  from public.transactions t
  join public.workspaces w on w.id = t.workspace_id
  where t.voided_at is null
  group by t.workspace_id, 2
),
jobs as (
  select
    j.workspace_id,
    date_trunc('month', j.finished_at at time zone w.timezone)::date as month,
    j.status,
    coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0) as cost,
    j.units_produced,
    j.order_line_id,
    -- A line with no estimate takes the cost of its prints, failed ones
    -- included (line_costs above), so that failure is already in the result.
    exists (
      select 1
      from public.order_lines l
      join public.orders o on o.id = l.order_id
      where l.id = j.order_line_id
        and coalesce(l.estimated_unit_cost, 0) <= 0
        and o.purpose = 'sale'
        and o.status <> 'cancelled'
    ) as in_cost_of_sales
  from public.print_jobs j
  join public.workspaces w on w.id = j.workspace_id
  where j.status in ('success', 'failed')
    and j.finished_at is not null
),
printing as (
  select
    workspace_id,
    month,
    sum(cost) as print_cost,
    coalesce(sum(cost) filter (where status = 'failed' and not in_cost_of_sales), 0) as failed_prints,
    -- A finished job that put nothing on the shelf and belongs to no order: a
    -- mould, a jig, a test. A job that did put parts there passed its cost to
    -- them, and it reaches the result when they are sold.
    coalesce(sum(cost) filter (
      where status = 'success' and units_produced = 0 and order_line_id is null
    ), 0) as tools_and_tests
  from jobs
  group by workspace_id, month
),
counts as (
  -- What the count found missing, less what it found over, at what a unit
  -- was worth on the shelf. Positive is a loss.
  select
    m.workspace_id,
    date_trunc('month', m.occurred_at at time zone w.timezone)::date as month,
    round(-sum(m.quantity * coalesce(m.unit_cost, 0)), 2) as shelf_count_losses
  from public.stock_movements m
  join public.workspaces w on w.id = m.workspace_id
  where m.source_type = 'shelf_count'
  group by m.workspace_id, 2
),
months as (
  select workspace_id, month from sales
  union
  select workspace_id, month from money
  union
  select workspace_id, month from printing
  union
  select workspace_id, month from counts
),
merged as (
  select
    k.workspace_id,
    k.month,
    coalesce(s.sales, 0) as sales,
    coalesce(s.cost_of_sales, 0) as cost_of_sales,
    coalesce(m.operating_expenses, 0) as operating_expenses,
    coalesce(m.other_income, 0) as other_income,
    coalesce(m.inventory_purchases, 0) as inventory_purchases,
    coalesce(m.owner_contributions, 0) as owner_contributions,
    coalesce(m.owner_draws, 0) as owner_draws,
    coalesce(p.tools_and_tests, 0) as tools_and_tests,
    coalesce(c.shelf_count_losses, 0) as shelf_count_losses,
    coalesce(p.failed_prints, 0) as failed_prints,
    coalesce(p.print_cost, 0) as print_cost
  from months k
  left join sales s on s.workspace_id = k.workspace_id and s.month = k.month
  left join money m on m.workspace_id = k.workspace_id and m.month = k.month
  left join printing p on p.workspace_id = k.workspace_id and p.month = k.month
  left join counts c on c.workspace_id = k.workspace_id and c.month = k.month
)
select
  workspace_id,
  month,
  sales,
  cost_of_sales,
  sales - cost_of_sales as gross_profit,
  operating_expenses,
  sales - cost_of_sales - operating_expenses - tools_and_tests - shelf_count_losses as net_profit,
  other_income,
  inventory_purchases,
  owner_contributions,
  owner_draws,
  tools_and_tests + shelf_count_losses as unsold_production,
  tools_and_tests,
  shelf_count_losses,
  failed_prints,
  print_cost,
  -- The allowance the prices carried that month: the profile in force on its last day.
  (
    select p.failure_rate
    from public.cost_profiles p
    where p.workspace_id = merged.workspace_id
      and p.valid_from < merged.month + interval '1 month'
    order by p.valid_from desc
    limit 1
  ) as failure_reserve_rate
from merged;

comment on view public.monthly_income_statement is
  'Profitability by month, in the workshop''s time zone. The cost of sales is what each line''s recipe says it costs to make. What was printed and never sold (moulds, tests, counted losses) is an expense of its month. Failed prints are shown apart: the failure allowance in the cost of sales pays for them. Inventory purchases are shown apart: they reach the result through the cost of sales.';
