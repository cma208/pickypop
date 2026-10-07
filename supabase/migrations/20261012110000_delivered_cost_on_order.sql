-- Lo que costó lo entregado, a la vista del pedido (ADR-022).
--
-- Cada entrega guarda lo que costó cada unidad que salió del estante, al
-- promedio de lo que había (ADR-020). Con «Por lanzar» (ADR-021) las placas
-- de catálogo se imprimen en bolsa común, sin atarse a un pedido, así que las
-- impresiones ligadas ya no dicen cuánto costó una venta de catálogo: lo dice
-- la entrega. Aquí se suma al «estimado contra real» del pedido.
--
-- El costo de ventas de Resultados NO cambia: sigue siendo el estimado de la
-- receta (ADR-019), que incluye la mano de obra de armar y empacar. Lo que
-- sale del estante no la incluye, porque armar valoriza solo lo que consume.
-- Pasar el costo de ventas a lo entregado volvería a sacar la mano de obra,
-- que es justo lo que el arreglo P2 corrigió: es una decisión del dueño.
-- Mientras tanto la bolsa común no lo rompe, porque toda línea de catálogo
-- lleva su estimado y no depende de las impresiones ligadas.

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
  select coalesce(sum(l.estimated_unit_cost * l.quantity::numeric), 0::numeric) as estimated_cost
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
