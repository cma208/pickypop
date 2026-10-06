-- Una impresora imprime una placa a la vez.
--
-- Nada lo impedía: la misma A1 mini podía tener dos trabajos "Imprimiendo",
-- y entonces el tiempo de la cola, el avance de cada trabajo y las horas de la
-- máquina mentían a la vez. El barrido lo encontró dos veces, una leyendo el
-- código y otra usando la aplicación.
--
-- Es un disparador y no un índice único porque un índice fallaría al crearse
-- si en producción ya hubiera dos trabajos imprimiendo en la misma máquina; el
-- disparador solo juzga lo que se intenta de aquí en adelante.

create or replace function app.one_print_at_a_time()
returns trigger
language plpgsql
as $$
declare
  v_printer text;
  v_other text;
begin
  if new.status <> 'printing' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'printing' and old.printer_id = new.printer_id then
    return new;
  end if;

  -- Bloquear la impresora pone en fila a dos "Iniciar" pulsados a la vez, que
  -- si no pasarían los dos esta revisión.
  select name into v_printer from public.printers where id = new.printer_id for update;

  select coalesce(nullif(btrim(label), ''), 'otra placa') into v_other
  from public.print_jobs
  where printer_id = new.printer_id
    and status = 'printing'
    and id <> new.id
  limit 1;

  if found then
    raise exception '% ya está imprimiendo «%». Ciérrala antes de empezar otra.', v_printer, v_other;
  end if;

  return new;
end;
$$;

create trigger print_jobs_one_at_a_time
  before insert or update of status, printer_id on public.print_jobs
  for each row execute function app.one_print_at_a_time();
