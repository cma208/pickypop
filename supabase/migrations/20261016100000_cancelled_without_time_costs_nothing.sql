-- Una impresión cancelada sin tiempo real no cuesta nada.
--
-- El cierre proponía los minutos estimados también para «Cancelada», y un
-- trabajo que nadie inició quedó con 1200 s reales y S/ 0.15 de luz y
-- máquina (E4-02): el historial decía «20 min reales · Costo real: S/ 0.15»
-- de una placa que no se imprimió, y el pedido sumaba ese costo al suyo. Con
-- el campo vacío era igual: el costo caía al estimado.
--
-- Ahora el cierre de una cancelada pide el tiempo que alcanzó a imprimir y lo
-- deja vacío. Si se escribe, se cobran máquina y luz por ese tiempo, haya o
-- no pulsado alguien «Iniciar»: una placa lanzada en la impresora sin pasar
-- por la app y parada a la mitad gastó máquina igual. Si no, no corrió, y no
-- hay costo. Esa es la regla que guarda la base, porque `complete_print_job`
-- y la tabla se pueden llamar sin pasar por la pantalla.

-- Lo que ya se guardó mal se limpia, y solo eso. Quedan vacíos y no en cero,
-- igual que quedan ahora al cerrarla: no hay «Costo real» que mostrar de algo
-- que no pasó. Material no había, porque cancelar no descuenta rollos.
--
-- 1. Costo sin tiempo: salía del estimado, porque no había otro.
update public.print_jobs
   set material_cost = null,
       energy_cost = null,
       machine_cost = null
 where status = 'cancelled'
   and actual_time_s is null
   and (material_cost is not null
        or energy_cost is not null
        or machine_cost is not null);

-- 2. Tiempo de un trabajo que nadie inició igual a lo que el cierre proponía:
-- los minutos enteros del estimado, nunca menos de uno. Es la precarga que
-- se guardó como real. Un tiempo distinto lo escribió una persona, que sabía
-- cuánto corrió, y se queda con su costo.
update public.print_jobs
   set actual_time_s = null,
       material_cost = null,
       energy_cost = null,
       machine_cost = null
 where status = 'cancelled'
   and started_at is null
   and estimated_time_s > 0
   and actual_time_s = greatest(1, round(estimated_time_s / 60.0)) * 60;

-- Juzga toda fila cancelada en cualquier cambio de su tiempo o su costo, no
-- solo el paso a cancelada: si no, la regla se saltaba con un PATCH que no
-- tocara el estado. Después de la limpieza no queda ninguna fila en falta,
-- así que no traba nada de lo ya cerrado.
create or replace function app.cancelled_without_time_costs_nothing()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled'
     and new.actual_time_s is null
     and (coalesce(new.material_cost, 0) <> 0
          or coalesce(new.energy_cost, 0) <> 0
          or coalesce(new.machine_cost, 0) <> 0) then
    raise exception 'Una impresión cancelada sin tiempo real no tiene costo. Si alcanzó a imprimir, escribe cuánto tiempo corrió.';
  end if;
  return new;
end;
$$;

create trigger print_jobs_cancelled_without_time_costs_nothing
  before insert or update of status, actual_time_s, material_cost, energy_cost, machine_cost on public.print_jobs
  for each row execute function app.cancelled_without_time_costs_nothing();
