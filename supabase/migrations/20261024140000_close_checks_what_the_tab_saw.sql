-- Cerrar exige lo que vio la pestaña, y lo que entra a producción son números.
--
-- La revisión de los arreglos de la tercera pasada encontró dos huecos.
--
-- 1. **Cerrar no miraba lo que vio la pestaña.** Iniciar ya exigía que el
--    trabajo siguiera «Planificado», pero cerrar no. Desde una pestaña vieja,
--    un trabajo que otra pestaña acababa de iniciar con NEGRO-01 se cerraba
--    como exitoso sin rollos: 9 tapas al estante sin material, y los 15 g que
--    gastó quedaban en el rollo. O se cancelaba sin tiempo mientras seguía
--    imprimiendo, y cuando terminaba sus piezas ya no tenían por dónde entrar,
--    porque lo cerrado no se reabre. Ahora `complete_print_job` recibe el
--    estado en que la pantalla vio el trabajo (`p_expected_status`) y lo exige.
--    Y si la impresión corrió, exige los gramos de cada uno de sus rollos, una
--    sola vez cada uno: un rollo repetido descontaba dos veces.
--
-- 2. **'NaN' pasaba por todas las comparaciones.** `'NaN' < 0` es falso, así
--    que unos gramos 'NaN' llegaban al kardex, un costo 'NaN' a Resultados y
--    un costo negativo subía la utilidad. Como lo cerrado ya no se edita, eso
--    no tenía arreglo. «Contar el estante» y «Armar» tenían el mismo hueco: un
--    conteo de 'NaN' unidades dejaba en el kardex movimientos de NaN a NaN
--    soles. Ahora cada número que entra por estas funciones tiene que ser un
--    número de verdad, dentro de un tope que ningún trabajo real alcanza: los
--    mismos de la pantalla.
--
-- Además, lo que una impresión registra al cerrarse (su tiempo, sus costos,
-- su causa, los gramos reales de sus rollos) lo escribe solo el cierre. Antes
-- el cierre conservaba lo que el trabajo ya tuviera, y por la API se le podía
-- poner a un trabajo abierto un costo de −500 que el cierre heredaba.
--
-- Solo cambian funciones y disparadores. Nada de lo que ya está guardado se
-- vuelve a validar, así que la migración no falla por datos viejos, y una fila
-- vieja con un valor raro se puede seguir cancelando, soltando o renombrando.

-- --------------------------------------------------------- un número de verdad

/*
 * Whether a number is a real one between zero and a bound. 'NaN' is not
 * (PostgreSQL sorts it above every number, so `'NaN' < 0` is false and a
 * plain negative check lets it through), and neither is 'Infinity'.
 */
create or replace function app.within_production_limit(p_value numeric, p_max numeric)
returns boolean
language sql
immutable
as $$
  select p_value is not null
     and p_value <> 'NaN'::numeric
     and p_value between 0 and p_max;
$$;

grant execute on function app.within_production_limit(numeric, numeric) to authenticated;

comment on function app.within_production_limit(numeric, numeric) is
  'Un número de verdad (ni NaN ni infinito) entre cero y el tope. Los topes de producción son los de la pantalla: 100000 g, 100000 min, S/ 100000, 100000 unidades.';

-- ------------------------------------------------------- los rollos de un trabajo

/*
 * Checks the rolls a job is created or started with, before anything is
 * written: each one named once, with grams that are a number no job reaches.
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
    where nullif(r ->> 'estimated_g', '') is not null
      and not app.within_production_limit((r ->> 'estimated_g')::numeric, 100000)
  ) then
    raise exception 'Los gramos estimados de cada rollo tienen que estar entre 0 y 100000.';
  end if;
end;
$$;

-- ------------------------------------------------------------ crear un trabajo
--
-- La de 20261024100000, con un tope para el tiempo estimado: los mismos
-- 100000 minutos que la pantalla.
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
  if p_estimated_time_s is not null and (p_estimated_time_s <= 0 or p_estimated_time_s > 6000000) then
    raise exception 'El tiempo estimado tiene que ser mayor que cero y de 100000 minutos como mucho.';
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

-- ---------------------------------------------------------- el flujo de un trabajo
--
-- La de 20261024100000, y además:
--
-- * por la API, un trabajo nuevo trae un tiempo estimado de 100000 minutos
--   como mucho (solo al crear: uno viejo más largo se sigue pudiendo cancelar)
-- * en un trabajo abierto, lo que registra el cierre (inicio, fin, tiempo
--   real, piezas, causa, porcentaje y costos) lo escriben solo «Iniciar» y
--   «Cerrar…». Cancelar desde la cola sigue pudiendo poner la hora de fin y
--   vaciar lo demás, como hace `cancel_order`.
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
    if auth.uid() is not null and new.estimated_time_s > 6000000 then
      raise exception 'El tiempo estimado tiene que ser de 100000 minutos como mucho.';
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

  if v_by_function then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'planned' then
      raise exception 'Este trabajo ya se inició: no vuelve a la cola. Si no se va a imprimir, ciérralo como «Cancelada».';
    end if;
    if new.status = 'printing' then
      raise exception 'Un trabajo se inicia con «Iniciar», que confirma con qué rollos.';
    end if;
    if new.status in ('success', 'failed') then
      raise exception 'Una impresión se cierra con «Cerrar…», que descuenta el filamento y mete las piezas al estante.';
    end if;
    -- Cancelar desde la cola lo que nunca corrió no mueve nada: así cancela
    -- `cancel_order` las impresiones de su pedido. Pone la hora de fin y deja
    -- vacío lo demás. Lo que corrió gastó algo, y eso lo registra «Cerrar…».
    if old.status = 'printing'
       or new.actual_time_s is not null
       or new.material_cost is not null
       or new.energy_cost is not null
       or new.machine_cost is not null
       or new.started_at is distinct from old.started_at
       or new.units_produced is distinct from old.units_produced
       or (new.failure_cause is not null and new.failure_cause is distinct from old.failure_cause)
       or (new.percent_complete is not null and new.percent_complete is distinct from old.percent_complete) then
      raise exception 'Una impresión que alcanzó a correr se cierra con «Cerrar…», que registra lo que gastó.';
    end if;
    return new;
  end if;

  -- Still open, and not by a function: the name, the note, the estimate and
  -- the links can change. What the close records cannot be written ahead.
  if row(new.started_at, new.finished_at, new.actual_time_s, new.units_produced, new.failure_cause,
         new.percent_complete, new.material_cost, new.energy_cost, new.machine_cost)
     is distinct from
     row(old.started_at, old.finished_at, old.actual_time_s, old.units_produced, old.failure_cause,
         old.percent_complete, old.material_cost, old.energy_cost, old.machine_cost) then
    raise exception 'Lo que pasó en una impresión (cuándo empezó y terminó, su tiempo, sus piezas y sus costos) lo escriben «Iniciar» y «Cerrar…».';
  end if;

  return new;
end;
$$;

-- --------------------------------------------------- los rollos, abiertos o no
--
-- La de 20261024100000, y además, en un trabajo abierto: los gramos estimados
-- tienen que ser un número de 0 a 100000, y los reales los escribe solo el
-- cierre. Solo se mira lo que cambia: un rollo viejo con un valor raro se
-- sigue pudiendo dejar como está.
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

  if tg_op = 'DELETE' then
    return old;
  end if;

  if (tg_op = 'INSERT' or new.estimated_g is distinct from old.estimated_g)
     and not app.within_production_limit(new.estimated_g, 100000) then
    raise exception 'Los gramos estimados de cada rollo tienen que estar entre 0 y 100000.';
  end if;

  if (case when tg_op = 'INSERT' then new.actual_g is not null else new.actual_g is distinct from old.actual_g end)
     and auth.uid() is not null
     and coalesce(current_setting('app.print_job_flow', true), '') <> new.print_job_id::text then
    raise exception 'Los gramos reales de un rollo los escribe «Cerrar…», que también los descuenta del rollo.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------ cerrar una impresión
--
-- La de 20261024100000, con un parámetro más, así que la vieja se suelta: con
-- `create or replace` quedarían dos funciones con el mismo nombre y PostgREST
-- no sabría cuál llamar. Además:
--
-- * `p_expected_status` es el estado en que la pantalla vio el trabajo. Si ya
--   no es ese, el cierre se rechaza y dice qué pasó. Va sin valor por defecto
--   porque quien cierra tiene que haberlo visto.
-- * si la impresión corrió (exitosa, fallida o cancelada con tiempo), el
--   cierre dice los gramos de cada rollo del trabajo, aunque sean cero, y
--   cada rollo una sola vez
-- * gramos, costos, tiempo, porcentaje y piezas tienen que ser números de
--   verdad dentro de su tope
-- * el tiempo, los costos y la causa son los del cierre, no los que el
--   trabajo tuviera de antes

drop function public.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
);
drop function app.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
);

create function app.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_expected_status public.print_job_status,
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
  v_usage_all jsonb := coalesce(p_filament_usage, '[]'::jsonb);
  v_usage jsonb;
  v_spool uuid;
  v_grams numeric;
  v_movement public.stock_movement_type;
  -- [{"item": uuid, "name": text, "planned": n, "units": n}], one per part the plate makes.
  v_outputs jsonb := '[]'::jsonb;
  v_stray boolean;
  v_excess text;
  v_missing text;
  v_total_units numeric;
  v_total_cost numeric;
  v_ran boolean;
begin
  if p_result not in ('success', 'failed', 'cancelled') then
    raise exception 'Una impresión se cierra como exitosa, fallida o cancelada.';
  end if;
  if p_expected_status is null then
    raise exception 'Falta el estado en que viste el trabajo. Recarga la cola y vuelve a cerrarlo.';
  end if;
  if p_percent_complete is not null and not app.within_production_limit(p_percent_complete, 100) then
    raise exception 'El porcentaje completado tiene que estar entre 0 y 100.';
  end if;
  if p_actual_time_s is not null and (p_actual_time_s <= 0 or p_actual_time_s > 6000000) then
    raise exception 'El tiempo real tiene que ser mayor que cero y de 100000 minutos como mucho.';
  end if;
  if exists (
    select 1 from unnest(array[p_material_cost, p_energy_cost, p_machine_cost]) c
    where c is not null and not app.within_production_limit(c, 100000)
  ) then
    raise exception 'Los costos de una impresión tienen que estar entre S/ 0 y S/ 100000.';
  end if;
  if jsonb_typeof(v_usage_all) <> 'array' then
    raise exception 'Los gramos por rollo tienen que venir como una lista.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_usage_all) u where nullif(u ->> 'spool_id', '') is null) then
    raise exception 'Falta el rollo de una de las filas del cierre. Recarga la cola y vuelve a cerrarlo.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_usage_all) u
    where nullif(u ->> 'actual_g', '') is not null
      and not app.within_production_limit((u ->> 'actual_g')::numeric, 100000)
  ) then
    raise exception 'Los gramos de cada rollo tienen que estar entre 0 y 100000.';
  end if;
  if (select count(*) from jsonb_array_elements(v_usage_all))
     <> (select count(distinct u ->> 'spool_id') from jsonb_array_elements(v_usage_all) u) then
    raise exception 'Un mismo rollo aparece dos veces en el cierre: escribe sus gramos en una sola fila.';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'No encontramos este trabajo: puede que ya no esté en la cola. Recarga la página.';
  end if;
  if v_job.status in ('success', 'failed', 'cancelled') then
    raise exception 'Este trabajo ya se cerró como «%», en otra pestaña o desde otro equipo. Recarga la cola para ver cómo quedó.',
      app.print_job_status_label(v_job.status);
  end if;
  if v_job.status <> p_expected_status then
    if v_job.status = 'printing' then
      raise exception 'Este trabajo se inició en otra pestaña o desde otro equipo, con sus rollos. Recarga la cola y ciérralo desde ahí, para que descuente lo que gastó.';
    end if;
    raise exception 'Este trabajo ya no está como lo ves: ahora está «%». Recarga la cola y vuelve a cerrarlo.',
      app.print_job_status_label(v_job.status);
  end if;
  if p_result = 'failed' and p_failure_cause is null then
    raise exception 'Una impresión fallida necesita su causa.';
  end if;

  -- A cancelled print without a time never ran (20261016100000).
  v_ran := p_result <> 'cancelled' or p_actual_time_s is not null;

  -- A print that ran says what each of its rolls gave, zero included: a roll
  -- left out would keep the grams it spent.
  if v_ran then
    select string_agg(coalesce(s.code, 'un rollo sin código'), ', ' order by s.code)
      into v_missing
    from public.print_job_filaments f
    left join public.spools s on s.id = f.spool_id
    where f.print_job_id = p_job_id
      and not exists (
        select 1 from jsonb_array_elements(v_usage_all) u
        where nullif(u ->> 'spool_id', '')::uuid = f.spool_id
      );
    if v_missing is not null then
      raise exception 'Faltan los gramos de %: el cierre dice cuánto gastó cada rollo del trabajo, aunque sea cero. Recarga la cola y vuelve a cerrarlo.', v_missing;
    end if;
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

    if exists (
      select 1 from jsonb_array_elements(v_outputs) t
      where not app.within_production_limit((t ->> 'units')::numeric, 100000)
    ) then
      raise exception 'Las piezas que salieron tienen que ser un número, de cero en adelante.';
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

  -- From here on this function writes the job and its rolls: the triggers
  -- let the close through.
  perform set_config('app.print_job_flow', p_job_id::text, true);

  for v_usage in select value from jsonb_array_elements(v_usage_all) loop
    v_spool := nullif(v_usage ->> 'spool_id', '')::uuid;
    -- To the hundredth, like the job keeps it: the job and the kardex say the same.
    v_grams := round(nullif(v_usage ->> 'actual_g', '')::numeric, 2);

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

  update public.print_jobs
     set status = p_result,
         finished_at = coalesce(finished_at, now()),
         actual_time_s = p_actual_time_s,
         failure_cause = p_failure_cause,
         material_cost = p_material_cost,
         energy_cost = p_energy_cost,
         machine_cost = p_machine_cost,
         units_produced = v_total_units,
         percent_complete = case p_result when 'success' then 100 else p_percent_complete end,
         note = coalesce(nullif(btrim(p_note), ''), note)
   where id = p_job_id
  returning * into v_job;
  perform set_config('app.print_job_flow', '', true);
  if not found then
    -- Row Level Security hides a row it will not let change, without an
    -- error: the screen must not say «hecho» when nothing changed.
    raise exception 'No pudimos cambiar este trabajo: puede que no tengas permiso, o que ya no esté en la cola. Recarga la página.';
  end if;

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

grant execute on function app.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated;

comment on function app.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) is
  'Cierra un trabajo que sigue en el estado en que se vio, en una transacción: el filamento que usó o perdió cada uno de sus rollos (una cancelada solo si corrió), sus costos congelados, hasta dónde llegó y, si salió bien, las piezas enteras que entran al estante.';

-- PostgREST only sees the public schema.
create function public.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_expected_status public.print_job_status,
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
language sql
volatile
as $$
  select app.complete_print_job(
    p_job_id, p_result, p_expected_status, p_actual_time_s, p_filament_usage, p_failure_cause,
    p_material_cost, p_energy_cost, p_machine_cost, p_outputs, p_percent_complete, p_note
  );
$$;

grant execute on function public.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated;

-- ------------------------------------------------------------- armar
--
-- La de 20261024110000_assemble_whole_units, con las unidades como un número
-- de verdad y el tope de la pantalla: 10000 por armado. 'NaN' e 'Infinity' se
-- rechazaban solo porque nunca alcanzaba el stock, con un mensaje que hablaba
-- de «armar NaN unidades».
create or replace function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null
)
returns setof public.stock_movements
language plpgsql
as $$
declare
  v_workspace uuid;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_item uuid;
  v_labor numeric;
begin
  if p_units is null or p_units = 'NaN'::numeric or p_units <= 0 then
    raise exception 'Hay que armar al menos una unidad.';
  end if;
  if p_units > 10000 then
    raise exception 'Se arman hasta 10000 unidades a la vez.';
  end if;
  if p_units <> trunc(p_units) then
    raise exception 'Se arman unidades enteras: escribe cuántas, sin decimales.';
  end if;

  select v.workspace_id, r.id, r.assembled into v_workspace, v_recipe, v_assembled
  from public.product_variants v
  join public.recipes r on r.variant_id = v.id
  where v.id = p_variant_id
  order by r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'Esa variante no tiene receta: no se sabe con qué armarla.';
  end if;
  if not v_assembled then
    raise exception 'Este producto no se arma: se entrega tal como sale de la impresora. Entrégalo desde su pedido.';
  end if;
  if not exists (select 1 from public.recipe_items where recipe_id = v_recipe) then
    raise exception 'La receta de este producto no tiene piezas ni insumos: no hay nada que armar.';
  end if;

  -- Locked until the end, in id order, so two assemblies sharing components
  -- do not wait for each other crosswise.
  perform 1
  from public.inventory_items
  where id in (select inventory_item_id from public.recipe_items where recipe_id = v_recipe)
  order by id
  for update;

  -- First whether there is enough for everything, and only then anything moves.
  select string_agg(
           format('%s (hacen falta %s y hay %s)',
                  i.name,
                  app.tidy_number(ri.quantity_per_unit * p_units),
                  app.tidy_number(coalesce(b.on_hand, 0))),
           '; ' order by i.name)
    into v_shortage
  from public.recipe_items ri
  join public.inventory_items i on i.id = ri.inventory_item_id
  left join public.inventory_balances b on b.inventory_item_id = i.id
  where ri.recipe_id = v_recipe
    and coalesce(b.on_hand, 0) < ri.quantity_per_unit * p_units;

  if v_shortage is not null then
    raise exception 'No alcanza para armar %. Falta: %',
      case when p_units = 1 then '1 unidad' else app.tidy_number(p_units) || ' unidades' end,
      v_shortage;
  end if;

  v_item := app.finished_good_for(p_variant_id);
  -- The work of this assembly: its setup once, its minutes for every unit.
  v_labor := coalesce(app.recipe_labor_cost(v_recipe, p_units, app.workspace_day(v_workspace, now())), 0);

  -- Both halves in one statement: what leaves and what enters. An `insert`
  -- that reads what the previous one returned spreads the cost without
  -- keeping it anywhere in between.
  return query
  with consumed as (
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    select v_workspace, 'consumption', ri.inventory_item_id,
           -(ri.quantity_per_unit * p_units),
           coalesce(ps.cost_per_unit, c.cost_per_unit), 'assembly',
           coalesce(p_note, 'Armado de producto')
    from public.recipe_items ri
    left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
    left join public.part_stock ps on ps.inventory_item_id = ri.inventory_item_id
    where ri.recipe_id = v_recipe
    returning *
  ),
  produced as (
    -- A unit costs what was consumed plus the work, spread over the units:
    -- the rule a print uses for the parts it makes, with the hands added.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
    )
    select v_workspace, 'production', v_item, p_units,
           round((coalesce((select sum(abs(quantity) * coalesce(unit_cost, 0)) from consumed), 0) + v_labor) / p_units, 6),
           'assembly',
           coalesce(p_note, 'Armado de producto')
    returning *
  )
  select * from consumed
  union all
  select * from produced;
end;
$$;

-- ------------------------------------------------------- contar el estante
--
-- La de 20261010160000_shelf_count, con lo contado y el costo como números de
-- verdad y un tope: 100000 unidades y S/ 100000 por unidad. Un conteo de
-- 'NaN' pasaba (`'NaN' < 0` es falso y 'NaN' es igual a su parte entera) y
-- dejaba el saldo del artículo en NaN, que ningún conteo posterior arreglaba.
create or replace function app.count_shelf(p_counts jsonb, p_note text default null)
returns integer
language plpgsql
as $$
declare
  v_entry jsonb;
  v_item uuid;
  v_counted numeric;
  v_given numeric;
  -- [{"item": uuid, "counted": n, "given": n}], one per article counted.
  v_rows jsonb := '[]'::jsonb;
  -- [{"item", "workspace", "name", "diff", "unit_cost"}], only what changes.
  v_moves jsonb;
  v_missing text;
  v_note text := coalesce(nullif(btrim(p_note), ''), 'Conteo del estante');
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'No hay nada contado.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_counts) loop
    v_counted := (v_entry ->> 'counted')::numeric;
    if not app.within_production_limit(v_counted, 100000) or v_counted <> trunc(v_counted) then
      raise exception 'Lo contado tiene que ser un número entero, de 0 a 100000.';
    end if;

    v_given := nullif(v_entry ->> 'unit_cost', '')::numeric;
    if v_given is not null and not app.within_production_limit(v_given, 100000) then
      raise exception 'El costo por unidad tiene que estar entre S/ 0 y S/ 100000.';
    end if;

    if v_entry ? 'variant_id' then
      select id into v_item
      from public.inventory_items
      where product_variant_id = (v_entry ->> 'variant_id')::uuid and kind = 'finished_good';

      if v_item is null then
        -- Nobody has assembled it yet. Counting none of it leaves it that way
        -- instead of creating an empty article.
        continue when v_counted = 0;
        v_item := app.finished_good_for((v_entry ->> 'variant_id')::uuid);
      end if;
    else
      v_item := (v_entry ->> 'inventory_item_id')::uuid;
    end if;

    if v_rows @> jsonb_build_array(jsonb_build_object('item', v_item)) then
      raise exception 'Un mismo artículo aparece dos veces en el conteo.';
    end if;

    v_rows := v_rows || jsonb_build_object('item', v_item, 'counted', v_counted, 'given', v_given);
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_rows) r
    left join public.inventory_items i on i.id = (r ->> 'item')::uuid
    where i.id is null or i.kind not in ('part', 'finished_good')
  ) then
    raise exception 'Aquí solo se cuentan piezas impresas y productos armados.';
  end if;

  -- Locked before reading what is there, in id order, so a delivery or an
  -- assembly running at the same time waits instead of slipping in between.
  perform 1
  from public.inventory_items
  where id in (select (r ->> 'item')::uuid from jsonb_array_elements(v_rows) r)
  order by id
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item', d.item,
           'workspace', d.workspace_id,
           'name', d.name,
           'diff', d.diff,
           'unit_cost', case when d.diff > 0 then coalesce(d.given, d.known) else d.known end
         )), '[]'::jsonb)
    into v_moves
  from (
    select
      i.id as item,
      i.workspace_id,
      i.name,
      (r ->> 'counted')::numeric - coalesce(b.on_hand, 0) as diff,
      (r ->> 'given')::numeric as given,
      case
        when i.kind = 'finished_good'
          then coalesce(app.produced_unit_cost(i.id), app.assembly_unit_cost(i.product_variant_id))
        else ps.cost_per_unit
      end as known
    from jsonb_array_elements(v_rows) r
    join public.inventory_items i on i.id = (r ->> 'item')::uuid
    left join public.inventory_balances b on b.inventory_item_id = i.id
    left join public.part_stock ps on ps.inventory_item_id = i.id
  ) d
  where d.diff <> 0;

  select string_agg(m ->> 'name', ', ' order by m ->> 'name')
    into v_missing
  from jsonb_array_elements(v_moves) m
  where (m ->> 'diff')::numeric > 0 and m ->> 'unit_cost' is null;

  if v_missing is not null then
    raise exception 'No sabemos cuánto costó cada unidad de: %. Escribe un costo aproximado por unidad.', v_missing;
  end if;

  insert into public.stock_movements (
    workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
  )
  select
    (m ->> 'workspace')::uuid,
    case when (m ->> 'diff')::numeric > 0 then 'production' else 'adjustment' end::public.stock_movement_type,
    (m ->> 'item')::uuid,
    (m ->> 'diff')::numeric,
    (m ->> 'unit_cost')::numeric,
    'shelf_count',
    v_note
  from jsonb_array_elements(v_moves) m;

  return jsonb_array_length(v_moves);
end;
$$;
