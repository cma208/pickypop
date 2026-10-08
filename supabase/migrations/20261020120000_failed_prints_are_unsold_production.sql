-- A failed print that no estimate pays for is an expense of its month.
--
-- ADR-023 left failed prints of production out of the profit for one reason:
-- the cost of sales was each line's estimate, the estimate carries the failure
-- allowance (production / (1 - rate)), so the cost of sales already paid for
-- them and subtracting them again would count them twice.
--
-- Since 20261020110000 that is no longer so for what is sold off the shelf.
-- Its cost of sales is what left the shelf, and a part is on the shelf at what
-- its successful print cost: the failed tries reach no shelf, no sale and no
-- expense. Left apart, they would vanish from the result, and the profit would
-- be higher by exactly what failed. So, like a mould or a counted loss, they
-- are what was printed and never sold (ADR-023), and subtract in
-- «Producción no vendida».
--
-- Only the failures no estimate pays for:
--
-- * a failed job tied to a line of a live sale whose cost of sales is still
--   its estimate is paid by that estimate's allowance: it stays apart, as
--   before. That is a made-to-order line with an estimate, and also a
--   catalogue line with nothing delivered at a known cost (still pending, or
--   delivered before deliveries existed). The line and its jobs ask
--   `line_costs` the same question, so a failure is never subtracted while
--   the estimate that pays for it is the line's cost.
-- * a failed job of a line that costs its prints is already in its cost of
--   sales (`in_cost_of_sales`), and a tool's or a test's in `tools_and_tests`.
-- * every other failed print of production subtracts: the common pool of the
--   shelf, a catalogue line delivered at what left the shelf, a gift, an
--   order cancelled afterwards.
--
-- The shelf's common pool is printed for no line (ADR-021). While a catalogue
-- line waits to be delivered it carries its estimate, and with it an
-- allowance, and the pool's failures of those days subtract as well: it is
-- the price of using the estimate for what has not left yet, and it ends with
-- the delivery.
--
-- `failed_prints` and `print_cost` do not change: they still hold the month's
-- failures of production against the allowance the prices carry, which says
-- whether the prices cover what fails. The failures that subtract are a new
-- column at the end, `uncovered_failed_prints`, part of `unsold_production`.
-- Every other column keeps its name, type and place.

create or replace view public.monthly_income_statement with (security_invoker = true) as
with delivered as (
  -- What left the shelf for each line, and what it cost. A delivery line with
  -- no cost took nothing off the shelf.
  select
    dl.order_line_id,
    sum(dl.quantity) as units,
    sum(dl.quantity * dl.unit_cost) as cost
  from public.order_delivery_lines dl
  where dl.unit_cost is not null
  group by dl.order_line_id
),
line_costs as (
  select
    l.id,
    l.order_id,
    case
      -- Off the shelf at what it cost; the rest at its estimate.
      when l.variant_id is not null and d.units is not null
        then round(d.cost + greatest(l.quantity - d.units, 0) * coalesce(l.estimated_unit_cost, 0), 2)
      when l.estimated_unit_cost > 0 then round(l.estimated_unit_cost * l.quantity, 2)
      -- A failed print on a customer's order is a cost of that order too.
      else coalesce((
        select sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0))
        from public.print_jobs j
        where j.order_line_id = l.id
          and j.status in ('success', 'failed')
      ), 0)
    end as cost,
    -- The line costs its prints: its jobs are already in the cost of sales.
    not (l.variant_id is not null and d.units is not null)
      and coalesce(l.estimated_unit_cost, 0) <= 0 as from_prints,
    -- The line costs its estimate: its allowance pays for its jobs' failures.
    not (l.variant_id is not null and d.units is not null)
      and l.estimated_unit_cost > 0 as from_estimate
  from public.order_lines l
  left join delivered d on d.order_line_id = l.id
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
    )
    -- Printed for an order that was cancelled afterwards: nobody will pay
    -- for it and it left nothing on the shelf, like a test.
    or (
      j.status = 'success'
      and j.units_produced = 0
      and exists (
        select 1
        from public.order_lines l
        join public.orders o on o.id = l.order_id
        where l.id = j.order_line_id
          and o.status = 'cancelled'
      )
    ) as tool_or_test,
    -- A line that costs its prints (line_costs above) has them in the cost
    -- of sales already, failed ones included.
    exists (
      select 1
      from line_costs c
      join public.orders o on o.id = c.order_id
      where c.id = j.order_line_id
        and c.from_prints
        and o.purpose = 'sale'
        and o.status <> 'cancelled'
    ) as in_cost_of_sales,
    -- A line of a live sale that costs its estimate (line_costs above): the
    -- estimate's allowance pays for this job's failures.
    exists (
      select 1
      from line_costs c
      join public.orders o on o.id = c.order_id
      where c.id = j.order_line_id
        and c.from_estimate
        and o.purpose = 'sale'
        and o.status <> 'cancelled'
    ) as covered_by_estimate
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
    -- Of those, the ones no estimate pays for: printed and never sold.
    coalesce(sum(cost) filter (
      where status = 'failed' and not tool_or_test and not in_cost_of_sales and not covered_by_estimate
    ), 0) as uncovered_failed_prints,
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
    coalesce(p.uncovered_failed_prints, 0) as uncovered_failed_prints,
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
  -- Money in that is neither a sale nor capital is the workshop's too: it
  -- adds, on its own line (E5-01).
  sales - cost_of_sales - operating_expenses
    - tools_and_tests - shelf_count_losses - uncovered_failed_prints
    + other_income as net_profit,
  other_income,
  inventory_purchases,
  owner_contributions,
  owner_draws,
  tools_and_tests + shelf_count_losses + uncovered_failed_prints as unsold_production,
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
  ) as failure_reserve_rate,
  uncovered_failed_prints
from merged;

comment on view public.monthly_income_statement is
  'Profitability by month, in the workshop''s time zone. The cost of sales of a catalogue line is what its delivered units cost when they left the shelf (labour included), plus its pending units at their estimate; a made-to-order line costs its estimate, or else its prints. What was printed and never sold is an expense of its month: moulds, tests and their failed tries, counted losses, and the failed prints no estimate pays for. Other income (money in that is neither a sale nor capital) adds to the net profit on its own line. All failed prints of production are also shown against print_cost and the failure allowance. Inventory purchases are shown apart: they reach the result through the cost of sales.';

comment on column public.monthly_income_statement.cost_of_sales is
  'Catalogue lines: delivered units at what they cost when they left the shelf (order_delivery_lines.unit_cost, labour included since 20261020100000), plus pending units at their estimate, rounded to cents per line. Made-to-order lines: their estimate, or else the real cost of their prints.';

comment on column public.monthly_income_statement.unsold_production is
  'Printed and never sold, subtracted from net_profit: tools_and_tests + shelf_count_losses + uncovered_failed_prints.';

comment on column public.monthly_income_statement.failed_prints is
  'Failed prints of production, held against print_cost and the failure allowance to say whether the prices cover what fails. Those no estimate pays for also subtract, as uncovered_failed_prints. Leaves out the failed tries of tools and tests (they are in tools_and_tests) and those of a line that costs its prints (they are its cost of sales).';

comment on column public.monthly_income_statement.uncovered_failed_prints is
  'Failed prints of production that no estimate pays for: the shelf''s pool, a catalogue line delivered at what left the shelf, a gift, a cancelled order. Part of unsold_production. A failed print of a line of a live sale whose cost of sales is still its estimate is not here: that estimate''s allowance pays for it.';
