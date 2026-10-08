-- Una impresión cancelada que corrió es un intento fallido también en la
-- ficha del pedido.
--
-- Desde 20261024120000 Resultados la cuenta como una fallida (ADR-023, punto
-- 6), y desde 20261024150000 también `failure_stats`, la tasa de fallas del
-- tablero. Pero `order_production_summary`, el «Estimado contra real» de la
-- ficha del pedido, contaba en `failed_jobs` solo las de estado 'failed'.
-- Un trabajo cancelado a la media hora, que gastó filamento, luz y máquina,
-- sumaba su costo en `real_production_cost` y no aparecía entre «fallidos»:
-- «2 trabajos (1 exitoso, 0 fallidos)», con el costo de los dos.
--
-- Ahora la cuenta igual que las otras dos: entre las fallidas si corrió (si
-- tiene tiempo real), y fuera si nunca corrió. Las columnas son las mismas,
-- con el mismo nombre, tipo y orden. Es la vista de
-- 20261020110000_cost_of_sales_from_the_shelf con ese cambio.

create or replace view public.order_production_summary with (security_invoker = true) as
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
    -- A print cancelled after it ran is a failed try, as in failure_stats and
    -- Resultados (ADR-023, point 6). One cancelled without time never ran.
    count(j.id) filter (
      where j.status = 'failed' or (j.status = 'cancelled' and j.actual_time_s is not null)
    ) as failed_jobs,
    round(coalesce(sum(j.actual_time_s) filter (where j.status = 'success'), 0::bigint)::numeric / 3600.0, 2) as printed_hours,
    coalesce(sum(coalesce(j.material_cost, 0::numeric) + coalesce(j.energy_cost, 0::numeric) + coalesce(j.machine_cost, 0::numeric)), 0::numeric) as real_production_cost
  from public.print_jobs j
  join public.order_lines l on l.id = j.order_line_id
  where l.order_id = o.id
) jobs on true
left join lateral (
  select sum(per_line.units)::bigint as units, sum(round(per_line.cost, 2)) as cost
  from (
    select sum(dl.quantity) as units, sum(dl.quantity * dl.unit_cost) as cost
    from public.order_deliveries d
    join public.order_delivery_lines dl on dl.delivery_id = d.id
    where d.order_id = o.id and dl.unit_cost is not null
    group by dl.order_line_id
  ) per_line
) shipped on true;

comment on view public.order_production_summary is
  'Estimated against real, per order: the loop that recalibrates the calculator. failed_jobs counts the failed prints and the cancelled ones that ran, as failure_stats and monthly_income_statement do. delivered_cost is what left the shelf, rounded to cents per line like the cost of sales in monthly_income_statement.';
