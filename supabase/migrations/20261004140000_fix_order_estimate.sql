-- The estimate of an order was multiplied by its number of plates.
--
-- `order_production_summary` joined order lines to print jobs and then summed
-- both in the same query. A line printed across three plates therefore had its
-- estimated cost counted three times, while the real cost, which belongs to
-- the jobs, was right. The one view whose job is to compare the estimate
-- against reality was the one lying, and always in the same direction: orders
-- looked wildly over-estimated, which is an argument for lowering prices.
--
-- Products here normally take several plates (the bottle on one, its caps on
-- another), so this hit almost every real order. Each side is now counted in
-- its own aggregate before they meet.

create or replace view public.order_production_summary with (security_invoker = true) as
select
  o.id as order_id,
  o.workspace_id,
  o.number,
  o.purpose,
  o.status,
  coalesce(jobs.jobs, 0) as jobs,
  coalesce(jobs.successful_jobs, 0) as successful_jobs,
  coalesce(jobs.failed_jobs, 0) as failed_jobs,
  coalesce(jobs.printed_hours, 0) as printed_hours,
  coalesce(jobs.real_production_cost, 0) as real_production_cost,
  coalesce(lines.estimated_cost, 0) as estimated_cost,
  o.total as sold_for
from public.orders o
left join lateral (
  select coalesce(sum(l.estimated_unit_cost * l.quantity), 0) as estimated_cost
  from public.order_lines l
  where l.order_id = o.id
) as lines on true
left join lateral (
  select
    count(j.id) as jobs,
    count(j.id) filter (where j.status = 'success') as successful_jobs,
    count(j.id) filter (where j.status = 'failed') as failed_jobs,
    round(coalesce(sum(j.actual_time_s) filter (where j.status = 'success'), 0) / 3600.0, 2)
      as printed_hours,
    coalesce(
      sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0)),
      0
    ) as real_production_cost
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = o.id
) as jobs on true;

comment on view public.order_production_summary is
  'Estimated against real, per order: the loop that recalibrates the calculator.';
