-- The cost of an order line is the cost of its batch, to the cent.
--
-- A quote for two skulls costs S/ 15.69 as one batch. The line kept only the
-- cost per unit, rounded to cents (7.85), and everything after it multiplied:
-- the order, its estimate and the income statement said S/ 15.70. A cent is
-- small, but two screens answering differently to the same question is what
-- AGENTS.md forbids.
--
-- The cost per unit is now kept to six decimals, like every other unit cost in
-- the system (7.845), so that times the quantity it gives back the batch to
-- the cent. The views round each line to cents before adding, which is what
-- the screens already do.
--
-- Lines saved before this keep their two decimals: the batch they came from
-- was not stored, and there is nothing to recover it from.
--
-- A view blocks altering the columns it reads, so both are dropped and made
-- again around the change, with the same definitions.

drop view public.monthly_income_statement;
drop view public.order_production_summary;

alter table public.quote_lines alter column unit_cost type numeric(14, 6);
alter table public.order_lines alter column estimated_unit_cost type numeric(14, 6);

comment on column public.quote_lines.unit_cost is
  'Cost of one unit: the batch cost over its units, to six decimals so that times the quantity it gives back the batch to the cent.';
comment on column public.order_lines.estimated_unit_cost is
  'Cost of one unit when the order was taken, to six decimals. A line costs round(estimated_unit_cost * quantity, 2).';

create view public.order_production_summary with (security_invoker = true) as
select
  o.id as order_id,
  o.workspace_id,
  o.number,
  o.purpose,
  o.status,
  coalesce(jobs.jobs, 0::bigint) as jobs,
  coalesce(jobs.successful_jobs, 0::bigint) as successful_jobs,
  coalesce(jobs.failed_jobs, 0::bigint) as failed_jobs,
  coalesce(jobs.printed_hours, 0::numeric) as printed_hours,
  coalesce(jobs.real_production_cost, 0::numeric) as real_production_cost,
  coalesce(lines.estimated_cost, 0::numeric) as estimated_cost,
  o.total as sold_for,
  coalesce(shipped.units, 0::bigint) as delivered_units,
  coalesce(shipped.cost, 0::numeric) as delivered_cost
from public.orders o
left join lateral (
  select coalesce(sum(round(l.estimated_unit_cost * l.quantity::numeric, 2)), 0::numeric) as estimated_cost
  from public.order_lines l
  where l.order_id = o.id
) lines on true
left join lateral (
  select
    count(j.id) as jobs,
    count(j.id) filter (where j.status = 'success') as successful_jobs,
    count(j.id) filter (where j.status = 'failed') as failed_jobs,
    round(coalesce(sum(j.actual_time_s) filter (where j.status = 'success'), 0::bigint)::numeric / 3600.0, 2) as printed_hours,
    coalesce(sum(coalesce(j.material_cost, 0::numeric) + coalesce(j.energy_cost, 0::numeric) + coalesce(j.machine_cost, 0::numeric)), 0::numeric) as real_production_cost
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = o.id
) jobs on true
left join lateral (
  select sum(dl.quantity)::bigint as units, round(sum(dl.quantity * dl.unit_cost), 2) as cost
  from public.order_deliveries d
  join public.order_delivery_lines dl on dl.delivery_id = d.id
  where d.order_id = o.id and dl.unit_cost is not null
) shipped on true;

comment on view public.order_production_summary is
  'Estimated against real, per order: the loop that recalibrates the calculator.';

create view public.monthly_income_statement with (security_invoker = true) as
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
