-- Failed prints are measured against what was printed to produce (E3-02).
--
-- Resultados holds the month's failed prints against the failure allowance
-- the prices carry. The allowance is charged on each unit costed through a
-- recipe (production / (1 - rate), packages/domain/src/cost.ts), so the fair
-- comparison is failures over the printing that pays that allowance, with the
-- failures themselves inside it: F / (S + F) against the rate.
--
-- `print_cost` added up every finished job, the mould included. In the walk
-- through from scratch a S/ 7.72 mould made 0.28 of failures read as 2.84 %
-- against a 10 % allowance, and the screen said the allowance was enough. Over
-- the three plates of parts and the failure it was 13 %: it was not.
--
-- Two kinds of job do not pay the allowance and leave the denominator:
--   * tools and tests: a job of no order that puts nothing on the shelf.
--     Finished, they are already an expense of the month in «Producción no
--     vendida» (ADR-023). Failed, they are the same tool or test tried once
--     more: no order and no part was waiting on them (no plate, or a plate
--     with no parts, would have left nothing either), and no allowance pays
--     for them. Left in `failed_prints`, a failed S/ 0.40 test reads as a
--     failure of production and can tip the verdict to «súbela» on a month
--     whose production stayed under the rate. So they add to
--     `tools_and_tests`, and subtract from the net profit like the tool they
--     were trying to make, and leave `failed_prints` and `print_cost`.
--   * jobs on a made-to-order line with no estimate. That line takes the real
--     cost of its prints, failed ones included, as its cost of sales, so its
--     failures are not in `failed_prints` either, and its successes must not
--     dilute the ones that are.
--
-- Every column keeps its name, type and place: only what `print_cost`,
-- `failed_prints` and `tools_and_tests` add up changes. The view is the one
-- from 20261013130000_line_cost_keeps_the_batch.

create or replace view public.monthly_income_statement with (security_invoker = true) as
with line_costs as (
  select
    l.order_id,
    case
      when l.estimated_unit_cost > 0 then round(l.estimated_unit_cost * l.quantity, 2)
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
    -- A mould, a jig, a test: a job of no order that puts nothing on the
    -- shelf. Finished, it left nothing there. Failed, it had nothing to leave:
    -- no plate, or a plate with no parts. A job that did put parts there
    -- passed its cost to them, and it reaches the result when they are sold.
    (
      j.order_line_id is null
      and case
        when j.status = 'success' then j.units_produced = 0
        else not exists (
          select 1 from public.recipe_plate_outputs o where o.recipe_plate_id = j.recipe_plate_id
        )
      end
    ) as tool_or_test,
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
    -- What the failure allowance pays for: the printing to produce, failures
    -- included, without tools, tests or lines that carry their own real cost.
    coalesce(sum(cost) filter (where not tool_or_test and not in_cost_of_sales), 0) as print_cost,
    coalesce(sum(cost) filter (where status = 'failed' and not tool_or_test and not in_cost_of_sales), 0)
      as failed_prints,
    -- A tool's failed tries are part of what the tool cost.
    coalesce(sum(cost) filter (where tool_or_test), 0) as tools_and_tests
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
  'Profitability by month, in the workshop''s time zone. The cost of sales is what each line''s recipe says it costs to make. What was printed and never sold (moulds, tests and their failed tries, counted losses) is an expense of its month. Failed prints of production are shown apart: the failure allowance in the cost of sales pays for them, and print_cost is what they are measured against (the printing to produce, without tools, tests or lines that carry their own real cost). Inventory purchases are shown apart: they reach the result through the cost of sales.';

comment on column public.monthly_income_statement.tools_and_tests is
  'Jobs of no order that put nothing on the shelf: moulds, jigs and tests, at their real cost. Their failed tries count here too (no plate, or a plate with no parts): no failure allowance pays for them.';

comment on column public.monthly_income_statement.failed_prints is
  'Failed prints of production: what the failure allowance pays for. Leaves out the failed tries of tools and tests (they are in tools_and_tests) and those of a line with no estimate (they are its cost of sales).';

comment on column public.monthly_income_statement.print_cost is
  'Printing to produce in the month, failures included: what the failure allowance pays for. Leaves out tools and tests (they are unsold production) and the jobs of a line with no estimate (their real cost is its cost of sales).';
