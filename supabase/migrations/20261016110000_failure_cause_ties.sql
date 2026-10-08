-- La causa más común de falla, sin desempatar por el orden del enum.
--
-- `mode()` devuelve el primer valor que ordena cuando dos causas empatan, y
-- el orden de `print_failure_cause` pone «adhesión» primero. Con una falla
-- por warping y otra por adhesión, Hoy decía «Causa más común: adhesión a la
-- placa» (E4-12): lo decidía el enum, no el taller.
--
-- Ahora es la causa con más fallas, y ninguna cuando empatan: con dos causas
-- igual de frecuentes no hay una que sea la más común. Las columnas son las
-- mismas, con el mismo tipo y en el mismo orden, así que basta con
-- reemplazar la vista.

create or replace view public.failure_stats with (security_invoker = true) as
select
  j.workspace_id,
  j.printer_id,
  count(*) filter (where j.status in ('success', 'failed')) as closed_jobs,
  count(*) filter (where j.status = 'failed') as failed_jobs,
  case
    when count(*) filter (where j.status in ('success', 'failed')) > 0
      then round(
        count(*) filter (where j.status = 'failed')::numeric
        / count(*) filter (where j.status in ('success', 'failed')), 4)
  end as failure_rate,
  (
    -- The causes in first place: one is the answer, two or more are a tie.
    select case when count(*) = 1 then min(ranked.failure_cause) end
    from (
      select f.failure_cause, rank() over (order by count(*) desc) as place
      from public.print_jobs f
      where f.workspace_id = j.workspace_id
        and f.printer_id = j.printer_id
        and f.status = 'failed'
        and f.failure_cause is not null
      group by f.failure_cause
    ) ranked
    where ranked.place = 1
  ) as most_common_cause
from public.print_jobs j
group by j.workspace_id, j.printer_id;

comment on view public.failure_stats is
  'Cuántas impresiones se cierran y cuántas fallan, por impresora, contadas por cantidad y no por costo. most_common_cause queda vacía si dos causas empatan.';
