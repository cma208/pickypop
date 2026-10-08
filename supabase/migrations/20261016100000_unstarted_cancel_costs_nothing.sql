-- Una impresión cancelada antes de empezar no tiene tiempo real ni costo.
--
-- El cierre proponía los minutos estimados también para «Cancelada», y un
-- trabajo que nadie inició quedó con 1200 s reales y S/ 0.15 de luz y
-- máquina (E4-02): el historial decía «20 min reales · Costo real: S/ 0.15»
-- de una placa que no se imprimió, y el pedido sumaba ese costo al suyo. La
-- pantalla ya no lo manda, y la base lo rechaza, porque `complete_print_job`
-- se puede llamar sin pasar por la pantalla.
--
-- «No empezó» es `started_at` vacío, que es lo que llena «Iniciar». Una
-- impresión exitosa o fallida cerrada sin iniciarla sí se imprimió, y
-- conserva su tiempo y su costo. Una cancelada a medias también: lo que
-- alcanzó a imprimir gastó máquina y luz.

-- Lo que ya se guardó así se limpia. Ese tiempo era el estimado copiado como
-- real, y los costos salían de él. Quedan vacíos y no en cero, igual que
-- quedan ahora al cerrarla: no hay «Costo real» que mostrar de algo que no
-- pasó. Material no había, porque cancelar no descuenta rollos.
update public.print_jobs
   set actual_time_s = null,
       material_cost = null,
       energy_cost = null,
       machine_cost = null
 where status = 'cancelled'
   and started_at is null
   and (actual_time_s is not null
        or material_cost is not null
        or energy_cost is not null
        or machine_cost is not null);

-- Solo juzga el paso a cancelada: así nada de lo ya cerrado queda trabado si
-- otra cosa toca la fila después.
create or replace function app.unstarted_cancel_costs_nothing()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled'
     and (tg_op = 'INSERT' or old.status <> 'cancelled')
     and new.started_at is null
     and (new.actual_time_s is not null
          or coalesce(new.material_cost, 0) <> 0
          or coalesce(new.energy_cost, 0) <> 0
          or coalesce(new.machine_cost, 0) <> 0) then
    raise exception 'Una impresión que no llegó a empezar no tiene tiempo real ni costo. Ciérrala cancelada sin tiempo o, si se imprimió, iníciala primero.';
  end if;
  return new;
end;
$$;

create trigger print_jobs_unstarted_cancel_costs_nothing
  before insert or update of status on public.print_jobs
  for each row execute function app.unstarted_cancel_costs_nothing();
