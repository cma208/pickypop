-- Un trabajo de impresión solo avanza por su flujo, y cerrado queda como quedó.
--
-- La tercera pasada (T3-01, grave) inició un trabajo en tres pestañas. La
-- segunda no cambió nada (el trabajo ya imprimía), chocó al guardar el rollo
-- y su «deshacer» devolvió el trabajo a «Planificado», sin mirar en qué estado
-- estaba. La tercera hizo lo mismo con el trabajo ya cerrado como exitoso: volvió
-- a la cola con su consumo y sus piezas ya en el kardex, y cerrarlo otra vez
-- habría duplicado las dos cosas. Y cualquier miembro podía, por la API, cambiar
-- el costo o los gramos de un trabajo cerrado (T3-03).
--
-- Lo que la base hace ahora:
--
-- * **Iniciar** es una sola función, `start_print_job`: bloquea el trabajo, exige
--   que siga «Planificado» y guarda sus rollos en la misma transacción. Desde una
--   pestaña vieja contesta qué pasó, y no toca nada.
-- * **Crear** también: `create_print_job` guarda el trabajo y sus rollos juntos,
--   en vez de insertar uno, luego los otros, y borrar a mano si algo fallaba
--   (borrar un trabajo es del dueño, así que al operador le quedaba el trabajo a
--   medias). Lleva una llave de idempotencia: un doble clic, o un reintento tras
--   un corte, devuelve el mismo trabajo y no crea dos (T3-11).
-- * **Un disparador deja pasar solo las transiciones del flujo:** de la cola a
--   imprimir (por `start_print_job`), y de la cola o de imprimir a cerrado (por
--   `complete_print_job`). Un trabajo que imprime no vuelve a la cola. La única
--   excepción es cancelar desde la cola lo que nunca corrió, sin tiempo ni costo:
--   es lo que hace `cancel_order` con las impresiones de un pedido cancelado.
-- * **Cerrado, no se reabre ni se edita** en su tiempo, sus costos, sus piezas ni
--   sus rollos, tampoco por el dueño: ya están en el kardex y en Resultados. El
--   nombre y la nota siguen editables. Y no se borra.
--
-- Las funciones avisan al disparador con una variable de la transacción
-- (`app.print_job_flow`) que lleva el id del trabajo que mueven. PostgREST no
-- expone `set_config`, así que nadie la pone desde afuera.
--
-- Los disparadores miran solo los cambios de aquí en adelante, así que la
-- migración no falla por datos viejos: un nombre larguísimo, unas piezas
-- fraccionarias o un costo raro de antes se quedan como están.

-- ------------------------------------------ lo que una pestaña vieja reabrió
--
-- Un trabajo en la cola con hora de fin ya se cerró una vez: solo el cierre y
-- cancelar un pedido la ponen. Si una pestaña vieja lo devolvió a la cola (T3-01),
-- vuelve a cerrado como estaba, deducido de lo que movió: piezas o consumo es
-- exitoso, merma es fallido, y sin movimientos lo dice su porcentaje o su causa.
-- No borra ni mueve nada del kardex, que ya estaba bien. En la base local no hay
-- ninguno (el de la pasada se reparó a mano); esto es por si en producción sí.
with reopened as (
  select j.id,
         case
           when exists (
             select 1 from public.stock_movements m
             where m.source_type = 'print_job' and m.source_id = j.id and m.type in ('production', 'consumption')
           ) then 'success'
           when j.failure_cause is not null or exists (
             select 1 from public.stock_movements m
             where m.source_type = 'print_job' and m.source_id = j.id and m.type = 'waste'
           ) then 'failed'
           when j.percent_complete = 100 then 'success'
           else 'cancelled'
         end::public.print_job_status as status
  from public.print_jobs j
  where j.status in ('planned', 'printing')
    and j.finished_at is not null
)
update public.print_jobs j
   set status = r.status,
       failure_cause = case when r.status = 'failed' then coalesce(j.failure_cause, 'other') else j.failure_cause end,
       note = concat_ws(E'\n', nullif(btrim(j.note), ''),
                        'Una pestaña vieja lo había devuelto a la cola: volvió a cerrado, como estaba.')
  from reopened r
 where r.id = j.id
   and not (r.status = 'cancelled' and j.actual_time_s is null
            and (coalesce(j.material_cost, 0) <> 0 or coalesce(j.energy_cost, 0) <> 0 or coalesce(j.machine_cost, 0) <> 0));

-- ------------------------------------------------- la llave de un doble envío

alter table public.print_jobs
  add column request_key uuid;

-- Una restricción entera y no un índice parcial: los null no chocan entre sí, y
-- así `on conflict` la puede nombrar.
alter table public.print_jobs
  add constraint print_jobs_workspace_id_request_key_key unique (workspace_id, request_key);

comment on column public.print_jobs.request_key is
  'Llave que pone la pantalla al crear o encolar: el mismo envío dos veces (doble clic, reintento) no crea dos trabajos.';

-- ------------------------------------------------------- cómo se llama cada estado

-- Como lo dice la etiqueta de la tarjeta (produccion.labels.ts), para que el
-- mensaje de la base y la pantalla hablen igual.
create or replace function app.print_job_status_label(p_status public.print_job_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'planned' then 'Planificado'
    when 'printing' then 'Imprimiendo'
    when 'success' then 'Exitoso'
    when 'failed' then 'Fallido'
    when 'cancelled' then 'Cancelado'
  end;
$$;

grant execute on function app.print_job_status_label(public.print_job_status) to authenticated;

-- ---------------------------------------------------------- el flujo de un trabajo

-- Lo bastante para lo que arma la cola con el nombre de una línea y el de su
-- placa; lo que escribe una persona se limita a 200 en la pantalla y en
-- `create_print_job`. Solo se mira al crear: un trabajo viejo con un nombre más
-- largo no deja de poder cancelarse o soltarse de su pedido.
create or replace function app.print_job_follows_its_flow()
returns trigger
language plpgsql
as $$
declare
  v_by_function boolean := coalesce(current_setting('app.print_job_flow', true), '') = new.id::text;
begin
  if tg_op = 'INSERT' then
    if length(btrim(coalesce(new.label, ''))) > 300 then
      raise exception 'El nombre del trabajo es demasiado largo: usa 200 caracteres o menos.';
    end if;
    -- Por la API, un trabajo entra a la cola sin haber corrido. La carga de
    -- datos de prueba y las migraciones (sin nadie que haya entrado) pueden
    -- traer historia.
    if auth.uid() is not null
       and (new.status <> 'planned'
            or new.started_at is not null
            or new.finished_at is not null
            or new.actual_time_s is not null
            or new.units_produced <> 0
            or new.percent_complete is not null
            or new.failure_cause is not null
            or new.material_cost is not null
            or new.energy_cost is not null
            or new.machine_cost is not null) then
      raise exception 'Un trabajo nuevo entra a la cola como «Planificado»: se inicia con «Iniciar» y se cierra con «Cerrar…».';
    end if;
    return new;
  end if;

  if old.status in ('success', 'failed', 'cancelled') then
    if new.status is distinct from old.status then
      raise exception 'Este trabajo ya se cerró como «%»: no se puede reabrir ni cerrar otra vez. Recarga la cola para ver cómo quedó.',
        app.print_job_status_label(old.status);
    end if;
    -- Borrar una línea de pedido o una placa deja el enlace en null (on delete
    -- set null): eso pasa. Apuntarlo a otra cosa, no.
    if row(new.workspace_id, new.printer_id, new.started_at, new.finished_at, new.estimated_time_s,
           new.actual_time_s, new.units_produced, new.failure_cause, new.percent_complete,
           new.material_cost, new.energy_cost, new.machine_cost)
       is distinct from
       row(old.workspace_id, old.printer_id, old.started_at, old.finished_at, old.estimated_time_s,
           old.actual_time_s, old.units_produced, old.failure_cause, old.percent_complete,
           old.material_cost, old.energy_cost, old.machine_cost)
       or (new.order_line_id is distinct from old.order_line_id and new.order_line_id is not null)
       or (new.recipe_plate_id is distinct from old.recipe_plate_id and new.recipe_plate_id is not null) then
      raise exception 'Un trabajo cerrado no se edita: su tiempo, sus costos y sus piezas quedaron fijos al cerrarlo, y ya están en el kardex.';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'planned' then
      raise exception 'Este trabajo ya se inició: no vuelve a la cola. Si no se va a imprimir, ciérralo como «Cancelada».';
    end if;
    if new.status = 'printing' and not v_by_function then
      raise exception 'Un trabajo se inicia con «Iniciar», que confirma con qué rollos.';
    end if;
    if new.status in ('success', 'failed') and not v_by_function then
      raise exception 'Una impresión se cierra con «Cerrar…», que descuenta el filamento y mete las piezas al estante.';
    end if;
    -- Cancelar desde la cola lo que nunca corrió no mueve nada: así cancela
    -- `cancel_order` las impresiones de su pedido. Lo que corrió gastó algo, y
    -- eso lo registra «Cerrar…».
    if new.status = 'cancelled' and not v_by_function
       and (old.status = 'printing'
            or new.actual_time_s is not null
            or new.material_cost is not null
            or new.energy_cost is not null
            or new.machine_cost is not null) then
      raise exception 'Una impresión que alcanzó a correr se cierra con «Cerrar…», que registra lo que gastó.';
    end if;
  end if;

  return new;
end;
$$;

create trigger print_jobs_follow_their_flow
  before insert or update on public.print_jobs
  for each row execute function app.print_job_follows_its_flow();

-- Lo cerrado no se borra. Cuando se borra el taller entero, sus trabajos se van
-- con él: entonces el taller ya no está.
create or replace function app.closed_print_job_is_kept()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('success', 'failed', 'cancelled')
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    raise exception 'Un trabajo cerrado no se borra: lo que gastó y lo que produjo ya están en el kardex y en Resultados.';
  end if;
  return old;
end;
$$;

create trigger print_jobs_closed_are_kept
  before delete on public.print_jobs
  for each row execute function app.closed_print_job_is_kept();

-- Los rollos de un trabajo cerrado tampoco cambian: `actual_g` es lo que salió
-- del kardex. `complete_print_job` los escribe antes de cerrar el trabajo, así
-- que este disparador no lo frena.
create or replace function app.closed_print_job_keeps_its_rolls()
returns trigger
language plpgsql
as $$
declare
  v_jobs uuid[];
begin
  v_jobs := case tg_op
    when 'INSERT' then array[new.print_job_id]
    when 'DELETE' then array[old.print_job_id]
    else array[new.print_job_id, old.print_job_id]
  end;

  if exists (
    select 1
    from public.print_jobs j
    where j.id = any (v_jobs)
      and j.status in ('success', 'failed', 'cancelled')
      and exists (select 1 from public.workspaces w where w.id = j.workspace_id)
  ) then
    raise exception 'Los rollos de un trabajo cerrado no se cambian: lo que gastó ya está en el kardex. Si un rollo no cuadra, pésalo.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger print_job_filaments_closed_are_kept
  before insert or update or delete on public.print_job_filaments
  for each row execute function app.closed_print_job_keeps_its_rolls();

-- ------------------------------------------- una impresora, un trabajo a la vez
--
-- La de 20261010120000_one_print_at_a_time, con otro candado. Bloqueaba la fila
-- de la impresora con `select … for update`, y con seguridad por fila eso exige
-- poder editar la impresora: si editarla queda para el dueño (la configuración
-- es suya, decisión del 2026-10-08), al operador la fila se le esconde en
-- silencio, no hay candado, y dos «Iniciar» a la vez volverían a pasar. Un
-- candado de la transacción por impresora pone en fila lo mismo sin pedir eso.
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

  perform pg_advisory_xact_lock(hashtextextended('print_jobs.printer:' || new.printer_id::text, 0));

  select name into v_printer from public.printers where id = new.printer_id;

  select coalesce(nullif(btrim(label), ''), 'otra placa') into v_other
  from public.print_jobs
  where printer_id = new.printer_id
    and status = 'printing'
    and id <> new.id
  limit 1;

  if found then
    raise exception '% ya está imprimiendo «%». Ciérrala antes de empezar otra.', coalesce(v_printer, 'La impresora'), v_other;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------- los rollos de un trabajo

/*
 * Checks the rolls a job is created or started with, before anything is
 * written: each one named once, with grams that make sense. A roll twice used
 * to reach the unique key and come back as a 23505, which the screen could not
 * tell from other collisions.
 */
create or replace function app.check_job_rolls(p_rolls jsonb)
returns void
language plpgsql
as $$
begin
  if jsonb_typeof(p_rolls) <> 'array' then
    raise exception 'Los rollos tienen que venir como una lista.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rolls) r where nullif(r ->> 'spool_id', '') is null) then
    raise exception 'Elige el rollo de cada fila.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rolls))
     <> (select count(distinct r ->> 'spool_id') from jsonb_array_elements(p_rolls) r) then
    raise exception 'Elegiste el mismo rollo dos veces. Usa una sola fila por rollo.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rolls) r
    where coalesce(nullif(r ->> 'estimated_g', '')::numeric, 0) < 0
  ) then
    raise exception 'Los gramos estimados no pueden ser negativos.';
  end if;
end;
$$;

grant execute on function app.check_job_rolls(jsonb) to authenticated;

-- ------------------------------------------------------------ crear un trabajo

/*
 * Creates a print job and the rolls it will use, in one transaction.
 *
 * `p_filaments` is [{"spool_id": ..., "slot": 1, "estimated_g": 12.5}].
 * `p_request_key` is the screen's key for this submission: sent twice, the
 * second call returns the job the first one created.
 */
create or replace function app.create_print_job(
  p_printer_id uuid,
  p_label text default null,
  p_order_line_id uuid default null,
  p_recipe_plate_id uuid default null,
  p_estimated_time_s integer default null,
  p_note text default null,
  p_filaments jsonb default '[]'::jsonb,
  p_request_key uuid default null
)
returns public.print_jobs
language plpgsql
as $$
declare
  v_workspace uuid;
  v_job public.print_jobs;
  v_label text := nullif(btrim(p_label), '');
  v_rolls jsonb := coalesce(p_filaments, '[]'::jsonb);
begin
  select workspace_id into v_workspace from public.printers where id = p_printer_id;
  if v_workspace is null then
    raise exception 'No encontramos esa impresora. Recarga la página y vuelve a elegirla.';
  end if;

  if p_request_key is not null then
    select * into v_job
    from public.print_jobs
    where workspace_id = v_workspace and request_key = p_request_key;
    if found then
      return v_job;
    end if;
  end if;

  if p_order_line_id is null and v_label is null then
    raise exception 'Describe qué se imprime: no hay pedido que lo explique.';
  end if;
  if length(coalesce(v_label, '')) > 200 then
    raise exception 'Lo que se imprime tiene que caber en 200 caracteres.';
  end if;
  if p_estimated_time_s is not null and p_estimated_time_s <= 0 then
    raise exception 'El tiempo estimado tiene que ser mayor que cero.';
  end if;
  perform app.check_job_rolls(v_rolls);

  begin
    insert into public.print_jobs (
      workspace_id, printer_id, order_line_id, recipe_plate_id, label, estimated_time_s, note, request_key
    )
    values (
      v_workspace, p_printer_id, p_order_line_id, p_recipe_plate_id, v_label, p_estimated_time_s,
      nullif(btrim(p_note), ''), p_request_key
    )
    returning * into v_job;
  exception when unique_violation then
    -- The same submission won the race by a hair: it is the job to return.
    select * into v_job
    from public.print_jobs
    where workspace_id = v_workspace and request_key = p_request_key;
    if not found then
      raise;
    end if;
    return v_job;
  end;

  insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, slot, estimated_g)
  select v_workspace, v_job.id, (r ->> 'spool_id')::uuid, nullif(r ->> 'slot', '')::integer,
         round(coalesce(nullif(r ->> 'estimated_g', '')::numeric, 0), 2)
  from jsonb_array_elements(v_rolls) r;

  return v_job;
end;
$$;

grant execute on function app.create_print_job(uuid, text, uuid, uuid, integer, text, jsonb, uuid) to authenticated;

comment on function app.create_print_job(uuid, text, uuid, uuid, integer, text, jsonb, uuid) is
  'Crea un trabajo planificado con sus rollos, todo o nada. La misma llave dos veces devuelve el mismo trabajo.';

create or replace function public.create_print_job(
  p_printer_id uuid,
  p_label text default null,
  p_order_line_id uuid default null,
  p_recipe_plate_id uuid default null,
  p_estimated_time_s integer default null,
  p_note text default null,
  p_filaments jsonb default '[]'::jsonb,
  p_request_key uuid default null
)
returns public.print_jobs
language sql
volatile
as $$
  select app.create_print_job(
    p_printer_id, p_label, p_order_line_id, p_recipe_plate_id, p_estimated_time_s, p_note, p_filaments, p_request_key
  );
$$;

grant execute on function public.create_print_job(uuid, text, uuid, uuid, integer, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------- iniciar un trabajo

/*
 * Starts a planned job. A job queued from «Por lanzar» has no rolls yet and
 * gets them now (`p_rolls`, same shape as in `create_print_job`); one created
 * with its rolls starts without them.
 *
 * The job is locked and has to be planned: from an old tab the answer says
 * what happened to it instead of changing anything.
 */
create or replace function app.start_print_job(
  p_job_id uuid,
  p_rolls jsonb default '[]'::jsonb
)
returns public.print_jobs
language plpgsql
as $$
declare
  v_job public.print_jobs;
  v_rolls jsonb := coalesce(p_rolls, '[]'::jsonb);
  v_has_rolls boolean;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'No encontramos este trabajo: puede que ya no esté en la cola. Recarga la página.';
  end if;
  if v_job.status = 'printing' then
    raise exception 'Este trabajo ya se inició, en otra pestaña o desde otro equipo. Recarga la cola para verlo imprimiendo.';
  end if;
  if v_job.status <> 'planned' then
    raise exception 'Este trabajo ya se cerró como «%»: no se puede iniciar. Recarga la cola.',
      app.print_job_status_label(v_job.status);
  end if;

  perform app.check_job_rolls(v_rolls);
  select exists (select 1 from public.print_job_filaments where print_job_id = p_job_id) into v_has_rolls;
  if v_has_rolls and jsonb_array_length(v_rolls) > 0 then
    raise exception 'Este trabajo ya tiene sus rollos: inícialo sin elegirlos otra vez.';
  end if;
  if not v_has_rolls and jsonb_array_length(v_rolls) = 0 then
    raise exception 'Elige al menos un rollo: sin él, al cerrar no se descuenta el filamento.';
  end if;

  perform set_config('app.print_job_flow', p_job_id::text, true);
  update public.print_jobs
     set status = 'printing',
         started_at = now()
   where id = p_job_id
  returning * into v_job;
  perform set_config('app.print_job_flow', '', true);

  insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, slot, estimated_g)
  select v_job.workspace_id, p_job_id, (r ->> 'spool_id')::uuid, nullif(r ->> 'slot', '')::integer,
         round(coalesce(nullif(r ->> 'estimated_g', '')::numeric, 0), 2)
  from jsonb_array_elements(v_rolls) r;

  return v_job;
end;
$$;

grant execute on function app.start_print_job(uuid, jsonb) to authenticated;

comment on function app.start_print_job(uuid, jsonb) is
  'Inicia un trabajo planificado y guarda sus rollos, todo o nada. Rechaza un trabajo que ya no está en la cola.';

create or replace function public.start_print_job(
  p_job_id uuid,
  p_rolls jsonb default '[]'::jsonb
)
returns public.print_jobs
language sql
volatile
as $$
  select app.start_print_job(p_job_id, p_rolls);
$$;

grant execute on function public.start_print_job(uuid, jsonb) to authenticated;

-- ------------------------------------------------------ cerrar una impresión
--
-- La de 20261010110000_plate_outputs, con la misma firma, y además:
--
-- * avisa al disparador del flujo que es ella la que cierra;
-- * las piezas salen enteras (T3-04): 6.5 tapas entraban al estante y trababan
--   «Contar el estante», que solo acepta enteros;
-- * los gramos se redondean a centésimas antes de usarlos (T3-18): el trabajo
--   guardaba 50.13 (numeric 10,2) y el kardex −50.126 (numeric 12,3);
-- * un rollo que no es del trabajo se rechaza, en vez de moverse sin quedar en él;
-- * una cancelada que alcanzó a correr registra como merma el filamento que
--   gastó, si quien cierra lo dice (T3-08). Antes nunca movía rollos, una regla
--   de cuando «cancelada» quería decir «nunca empezó». Sin tiempo no corrió, y
--   entonces no puede haber gastado filamento.
create or replace function app.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_actual_time_s integer default null,
  p_filament_usage jsonb default '[]'::jsonb,
  p_failure_cause public.print_failure_cause default null,
  p_material_cost numeric default null,
  p_energy_cost numeric default null,
  p_machine_cost numeric default null,
  p_outputs jsonb default null,
  p_percent_complete numeric default null,
  p_note text default null
)
returns public.print_jobs
language plpgsql
as $$
declare
  v_job public.print_jobs;
  v_usage jsonb;
  v_spool uuid;
  v_grams numeric;
  v_movement public.stock_movement_type;
  -- [{"item": uuid, "name": text, "planned": n, "units": n}], one per part the plate makes.
  v_outputs jsonb := '[]'::jsonb;
  v_stray boolean;
  v_excess text;
  v_total_units numeric;
  v_total_cost numeric;
  v_ran boolean;
begin
  if p_result not in ('success', 'failed', 'cancelled') then
    raise exception 'Una impresión se cierra como exitosa, fallida o cancelada.';
  end if;
  if p_percent_complete is not null and (p_percent_complete < 0 or p_percent_complete > 100) then
    raise exception 'El porcentaje completado tiene que estar entre 0 y 100.';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'No encontramos este trabajo: puede que ya no esté en la cola. Recarga la página.';
  end if;
  if v_job.status in ('success', 'failed', 'cancelled') then
    raise exception 'Este trabajo ya se cerró como «%», en otra pestaña o desde otro equipo. Recarga la cola para ver cómo quedó.',
      app.print_job_status_label(v_job.status);
  end if;
  if p_result = 'failed' and p_failure_cause is null then
    raise exception 'Una impresión fallida necesita su causa.';
  end if;

  -- What really came out, checked against what the plate makes before
  -- anything moves.
  if p_result = 'success' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'item', o.inventory_item_id,
             'name', i.name,
             'planned', o.units_per_run,
             'units', coalesce((
               select (e ->> 'units')::numeric
               from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) e
               where (e ->> 'inventory_item_id')::uuid = o.inventory_item_id
             ), o.units_per_run)
           ) order by o.position, i.name), '[]'::jsonb)
      into v_outputs
    from public.recipe_plate_outputs o
    join public.inventory_items i on i.id = o.inventory_item_id
    where o.recipe_plate_id = v_job.recipe_plate_id;

    select exists (
      select 1
      from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) e
      where not exists (
        select 1 from jsonb_array_elements(v_outputs) t
        where (t ->> 'item')::uuid = (e ->> 'inventory_item_id')::uuid
      )
    ) into v_stray;
    if v_stray then
      raise exception 'Esa pieza no sale de esta placa.';
    end if;

    if exists (select 1 from jsonb_array_elements(v_outputs) t where (t ->> 'units')::numeric < 0) then
      raise exception 'Las piezas que salieron no pueden ser negativas.';
    end if;

    select string_agg(format('%s (dijiste %s)', t ->> 'name', app.tidy_number((t ->> 'units')::numeric)), '; ')
      into v_excess
    from jsonb_array_elements(v_outputs) t
    where (t ->> 'units')::numeric <> trunc((t ->> 'units')::numeric);
    if v_excess is not null then
      raise exception 'Las piezas salen enteras: escribe cuántas salieron, sin decimales. %', v_excess;
    end if;

    select string_agg(format('%s (la placa da %s y dijiste %s)',
                             t ->> 'name',
                             app.tidy_number((t ->> 'planned')::numeric),
                             app.tidy_number((t ->> 'units')::numeric)), '; ')
      into v_excess
    from jsonb_array_elements(v_outputs) t
    where (t ->> 'units')::numeric > (t ->> 'planned')::numeric;
    if v_excess is not null then
      raise exception 'Salieron más piezas de las que tiene la placa: %', v_excess;
    end if;
  end if;

  v_movement := case p_result when 'success' then 'consumption' else 'waste' end;
  -- A cancelled print without a time never ran (20261016100000).
  v_ran := p_result <> 'cancelled' or coalesce(p_actual_time_s, v_job.actual_time_s) is not null;

  for v_usage in select value from jsonb_array_elements(coalesce(p_filament_usage, '[]'::jsonb)) loop
    v_spool := (v_usage ->> 'spool_id')::uuid;
    -- To the hundredth, like the job keeps it: the job and the kardex say the same.
    v_grams := round((v_usage ->> 'actual_g')::numeric, 2);

    if v_grams < 0 then
      raise exception 'Los gramos no pueden ser negativos.';
    end if;
    if not exists (
      select 1 from public.print_job_filaments where print_job_id = p_job_id and spool_id = v_spool
    ) then
      raise exception 'Uno de los rollos no es de este trabajo. Recarga la cola y vuelve a cerrarlo.';
    end if;
    if not v_ran and coalesce(v_grams, 0) > 0 then
      raise exception 'Una impresión cancelada sin tiempo real no gastó filamento. Si alcanzó a imprimir, escribe cuánto tiempo corrió.';
    end if;

    update public.print_job_filaments
       set actual_g = v_grams
     where print_job_id = p_job_id and spool_id = v_spool;

    if coalesce(v_grams, 0) > 0 then
      insert into public.stock_movements (
        workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
      )
      select v_job.workspace_id, v_movement, s.id, -v_grams, s.cost_per_gram, 'print_job', p_job_id,
             case p_result
               when 'success' then 'Consumo de impresión'
               when 'failed' then 'Merma por impresión fallida'
               else 'Merma por impresión cancelada'
             end
      from public.spools s
      where s.id = v_spool;
    end if;
  end loop;

  select coalesce(sum((t ->> 'units')::numeric), 0) into v_total_units
  from jsonb_array_elements(v_outputs) t;

  perform set_config('app.print_job_flow', p_job_id::text, true);
  update public.print_jobs
     set status = p_result,
         finished_at = coalesce(finished_at, now()),
         actual_time_s = coalesce(p_actual_time_s, actual_time_s),
         failure_cause = coalesce(p_failure_cause, failure_cause),
         material_cost = coalesce(p_material_cost, material_cost),
         energy_cost = coalesce(p_energy_cost, energy_cost),
         machine_cost = coalesce(p_machine_cost, machine_cost),
         units_produced = v_total_units,
         percent_complete = case p_result when 'success' then 100 else p_percent_complete end,
         note = coalesce(nullif(btrim(p_note), ''), note)
   where id = p_job_id
  returning * into v_job;
  perform set_config('app.print_job_flow', '', true);

  -- The parts that came out go on the shelf, valued at what the plate cost,
  -- spread over every unit. A part is produced, not bought (ADR-016, ADR-018).
  if v_total_units > 0 then
    v_total_cost := coalesce(v_job.material_cost, 0)
                  + coalesce(v_job.energy_cost, 0)
                  + coalesce(v_job.machine_cost, 0);

    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_job.workspace_id, 'production', (t ->> 'item')::uuid, (t ->> 'units')::numeric,
           round(v_total_cost / v_total_units, 6), 'print_job', p_job_id,
           'Piezas producidas por la impresión'
    from jsonb_array_elements(v_outputs) t
    where (t ->> 'units')::numeric > 0;
  end if;

  return v_job;
end;
$$;

comment on function app.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) is
  'Cierra un trabajo en una transacción: el filamento que usó o perdió (una cancelada solo si corrió), sus costos congelados, hasta dónde llegó y, si salió bien, las piezas enteras que entran al estante.';
