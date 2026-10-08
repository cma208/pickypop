-- No se imprime con un rollo agotado o descartado (la otra mitad de T3-07).
--
-- Desde 20261023120000, marcar un rollo «Agotado» o «Descartado» saca del
-- stock lo que tenía, y la pantalla de iniciar ya no lo ofrece. Pero la base
-- lo seguía aceptando: `create_print_job` y `start_print_job` lo ataban a un
-- trabajo (desde una pestaña vieja, o un trabajo que «Por lanzar» encoló con
-- el rollo cuando todavía tenía filamento), y `complete_print_job` le
-- descontaba los gramos otra vez. El kardex quedaba en negativo y Resultados
-- contaba dos veces el mismo filamento: una al marcarlo (ADR-023, punto 7) y
-- otra en el costo de la impresión.
--
-- Ahora la base lo rechaza con un mensaje que dice cuál rollo, en qué estado
-- está y qué hacer, por cualquier camino:
--
-- 1. **Elegirlo** para un trabajo: lo que escriben `create_print_job`,
--    `start_print_job` y la cola al cambiar un rollo (un insert en
--    `print_job_filaments`, o un cambio de su rollo).
-- 2. **Iniciar** un trabajo que ya tenía el rollo atado de antes, y que se
--    agotó o se descartó mientras esperaba en la cola.
-- 3. **Cerrar** con gramos en un rollo así: lo que tenía ya salió del stock.
--    Cero gramos sí pasa (el rollo no da nada). Con la regla 4 solo queda un
--    rollo que se marcó así antes de esta migración, con su impresión en
--    curso: lo que gastó salió del stock al marcarlo, así que se cierra con
--    0 g, y si todavía le queda filamento se pesa después de cerrar.
-- 4. **Marcarlo** «Agotado» o «Descartado» mientras una impresión lo usa. Es
--    lo que pasa con el AMS: el rollo se acaba a mitad de la impresión y se
--    marca antes de cerrarla. Así lo que gastó la impresión salía del stock
--    como pérdida (Resultados) y no en su costo, y el cierre quedaba obligado
--    a decir 0 g. Ahora se cierra primero la impresión con lo que gastó y
--    después se marca el rollo, que saca solo lo que quedaba. El cierre mismo
--    sí puede dejarlo agotado (su consumo lo vacía): eso es cerrar.
--
-- Va en disparadores y no en cada función: así vale también para la cola,
-- que escribe los rollos de un trabajo planificado sin pasar por ellas, y no
-- hace falta recrear las tres. Sin sesión (la semilla, una migración) no se
-- juzga el estado: la historia puede traer un trabajo viejo con un rollo que
-- hoy está agotado.
--
-- Y una cosa más, que estos disparadores pueden ver y la seguridad por fila
-- no: un rollo de otro taller atado a un trabajo se rechaza, y también la
-- fila de un taller atada al trabajo de otro (la llave foránea solo dice que
-- el rollo y el trabajo existen). `complete_print_job` corre como su dueño
-- desde 20261027100000 y escribe todos los rollos de su trabajo: así no
-- escribe la fila de otro taller.

-- ------------------------------------------------------- qué hacer con él

create or replace function app.spent_roll_hint(p_status public.spool_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'empty' then
      'Lo que tenía ya salió del stock cuando se marcó así. Si todavía tiene filamento, pésalo en Filamentos y vuelve a quedar abierto'
    when 'discarded' then
      'Su filamento salió del stock cuando se descartó. Si vuelve a usarse, pésalo en Filamentos y marca «Vuelve a usarse»'
  end;
$$;

grant execute on function app.spent_roll_hint(public.spool_status) to authenticated;

-- ------------------------------------------------- elegirlo y cerrar con él

/*
 * Runs as its owner so it sees a roll wherever it lives: a roll of another
 * workshop is refused, which row level security alone cannot see.
 */
create or replace function app.print_job_roll_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spool public.spools;
  v_code text;
begin
  -- The row, the job and the roll are of one workshop. complete_print_job
  -- runs as its owner and writes every roll of its job.
  if exists (
    select 1 from public.print_jobs j
    where j.id = new.print_job_id and j.workspace_id <> new.workspace_id
  ) then
    raise exception 'Ese trabajo es de otro taller: sus rollos no se cambian desde aquí. Recarga la página.';
  end if;

  select * into v_spool from public.spools s where s.id = new.spool_id;
  if not found then
    -- The foreign key says it.
    return new;
  end if;
  v_code := coalesce(v_spool.code, 'sin código');

  if v_spool.workspace_id <> new.workspace_id then
    raise exception 'El rollo % es de otro taller: elige uno de este. Recarga la página.', v_code;
  end if;

  if auth.uid() is null or v_spool.status not in ('empty', 'discarded') then
    return new;
  end if;

  if tg_op = 'INSERT' or new.spool_id is distinct from old.spool_id then
    raise exception 'No se imprime con el rollo %: está «%». %, y si no, elige otro rollo.',
      v_code, app.spool_status_label(v_spool.status), app.spent_roll_hint(v_spool.status);
  end if;

  if coalesce(new.actual_g, 0) > 0 and new.actual_g is distinct from old.actual_g then
    raise exception 'El rollo % está «%»: lo que tenía salió del stock cuando se marcó así, también lo que gastó esta impresión, y no se descuenta otra vez. Escribe 0 g en ese rollo para cerrar. Si todavía le queda filamento, pésalo en Filamentos después de cerrar.',
      v_code, app.spool_status_label(v_spool.status);
  end if;

  return new;
end;
$$;

create trigger print_job_filaments_roll_in_use
  before insert or update of spool_id, actual_g on public.print_job_filaments
  for each row execute function app.print_job_roll_in_use();

-- ----------------------------------------------- iniciar con lo que ya tenía

/*
 * A job that «Por lanzar» queued with its rolls waits in the queue, and one
 * of them may run out or be thrown away meanwhile. Starting it says which,
 * all of them at once.
 */
create or replace function app.print_job_starts_with_rolls_in_use()
returns trigger
language plpgsql
as $$
declare
  v_spent text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select string_agg(
           format('%s («%s»)', coalesce(s.code, 'sin código'), app.spool_status_label(s.status)),
           ', ' order by s.code)
    into v_spent
  from public.print_job_filaments f
  join public.spools s on s.id = f.spool_id
  where f.print_job_id = new.id
    and s.status in ('empty', 'discarded');

  if v_spent is not null then
    raise exception 'Este trabajo tiene un rollo que ya no se usa: %. Lo que tenía salió del stock cuando se marcó así. Si todavía tiene filamento, pésalo en Filamentos y vuelve a iniciarlo; si no, cancela este trabajo en la cola y lánzalo otra vez con otro rollo. No se inició.',
      v_spent;
  end if;

  return new;
end;
$$;

create trigger print_jobs_start_with_rolls_in_use
  before update of status on public.print_jobs
  for each row
  when (old.status = 'planned' and new.status = 'printing')
  execute function app.print_job_starts_with_rolls_in_use();

-- ------------------------------------------- marcarlo mientras se imprime
--
-- La de 20261023120000_spool_status_moves_stock, que además no deja gastar un
-- rollo que está en la impresora.
create or replace function app.guard_spool_status()
returns trigger
language plpgsql
as $$
declare
  v_printer text;
begin
  if old.status in ('empty', 'discarded')
     and new.status in ('sealed', 'open', 'in_use')
     and app.spool_on_hand(new.id) <= 0 then
    raise exception
      'El rollo % no tiene filamento según sus movimientos, así que no puede volver a «%». Pésalo: si la balanza encuentra filamento, vuelve a quedar abierto.',
      coalesce(new.code, 'sin código'), app.spool_status_label(new.status);
  end if;

  -- A roll in the printer is spent by closing the print, not by marking it:
  -- marked first, what the print used leaves the stock as a loss and the
  -- close has to say 0 g. Inside a close (complete_print_job says so) its
  -- own consumption may empty the roll: that is the print being closed.
  -- Without a session it is not judged, as everywhere in this migration.
  if new.status in ('empty', 'discarded')
     and old.status not in ('empty', 'discarded')
     and auth.uid() is not null
     and coalesce(current_setting('app.print_job_flow', true), '') = '' then
    select coalesce(p.name, 'la impresora') into v_printer
    from public.print_job_filaments f
    join public.print_jobs j on j.id = f.print_job_id
    left join public.printers p on p.id = j.printer_id
    where f.spool_id = new.id
      and j.status = 'printing'
    order by j.started_at
    limit 1;

    if found then
      raise exception 'El rollo % se está imprimiendo en «%»: cierra primero esa impresión en la cola, con lo que gastó, y después márcalo «%». Así lo que gastó queda en la impresión y no como pérdida.',
        coalesce(new.code, 'sin código'), v_printer, app.spool_status_label(new.status);
    end if;
  end if;

  if new.status in ('open', 'in_use') and new.opened_at is null then
    new.opened_at := now();
  end if;

  return new;
end;
$$;
