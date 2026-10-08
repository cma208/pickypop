-- Armar una sola vez por envío, la pestaña con la aplicación anterior, y lo
-- que falla según el tablero y según Resultados.
--
-- La revisión de los arreglos de la tercera pasada encontró:
--
-- 1. **Armar no tenía llave.** Con el Wi-Fi del taller, «Sí, armar 3» llegaba
--    a la base, la respuesta se perdía y la pantalla decía que no se pudo. Al
--    pulsar otra vez se armaban 6, y se consumían piezas para 6. Ahora
--    `assemble_product` recibe la llave del envío (`p_request_key`): la misma
--    llave otra vez devuelve lo que ya armó, sin mover nada. La llave queda en
--    `stock_movements.source_id` de los movimientos del armado, que antes iba
--    vacío: es el id del armado, y une lo que salió con lo que entró. Sin
--    llave arma como siempre, para la pantalla anterior.
-- 2. **La pestaña con la aplicación anterior** no podía cerrar: PostgREST no
--    encontraba la función de antes y la pantalla pedía reintentar sin fin.
--    `p_expected_status` lleva ahora un valor por defecto, así esa llamada
--    llega a `complete_print_job`, que le pide recargar sin mover nada. Lo
--    sigue exigiendo: solo cambia el mensaje. Iniciar desde esa pestaña dice
--    lo mismo.
-- 3. **Iniciar y cerrar decían «hecho» aunque el trabajo no cambiara.** La
--    comprobación iba después de un `perform`, que vuelve a poner FOUND en
--    verdadero, así que nunca se ejecutaba. Ahora va justo después del update.
-- 4. **`failure_stats` cuenta las canceladas que corrieron** como intentos
--    fallidos, igual que Resultados desde 20261024120000. Antes el tablero
--    decía 0 % de fallas el mes en que Resultados restaba sus costos.
--
-- Solo cambian funciones, un disparador y una vista: nada de lo guardado se
-- vuelve a validar, así que la migración no falla por datos viejos.

-- ------------------------------------------------------------- armar
--
-- La de 20261024140000, con la llave del envío. Cambia la firma, así que la
-- anterior se suelta: con `create or replace` quedarían dos funciones con el
-- mismo nombre, y la llamada sin llave no sabría a cuál ir.

drop function public.assemble_product(uuid, numeric, text);
drop function app.assemble_product(uuid, numeric, text);

create function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null,
  p_request_key uuid default null
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
  v_done_variant uuid;
  v_done_units numeric;
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

  select workspace_id into v_workspace from public.product_variants where id = p_variant_id;
  if v_workspace is null then
    raise exception 'No encontramos ese producto. Recarga la página y vuelve a elegirlo.';
  end if;

  -- The same submission again (a retry after the answer was lost, a second
  -- tab sending what the first did): what it assembled the first time, and
  -- nothing moves. The lock puts two of them in line, and the second one
  -- reads what the first committed.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('assemble_product:' || p_request_key::text, 0));

    select i.product_variant_id, m.quantity
      into v_done_variant, v_done_units
    from public.stock_movements m
    join public.inventory_items i on i.id = m.inventory_item_id
    where m.workspace_id = v_workspace
      and m.source_type = 'assembly'
      and m.source_id = p_request_key
      and m.type = 'production';

    if found then
      if v_done_variant is distinct from p_variant_id or v_done_units <> p_units then
        raise exception 'Ese armado ya se registró con otro producto u otra cantidad. Recarga la página y vuelve a armar.';
      end if;
      return query
      select m.*
      from public.stock_movements m
      where m.workspace_id = v_workspace
        and m.source_type = 'assembly'
        and m.source_id = p_request_key
      order by m.type = 'production', m.inventory_item_id;
      return;
    end if;
  end if;

  select r.id, r.assembled into v_recipe, v_assembled
  from public.recipes r
  where r.variant_id = p_variant_id
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
  -- keeping it anywhere in between. Both carry the key as the assembly's id.
  return query
  with consumed as (
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_workspace, 'consumption', ri.inventory_item_id,
           -(ri.quantity_per_unit * p_units),
           coalesce(ps.cost_per_unit, c.cost_per_unit), 'assembly', p_request_key,
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
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_workspace, 'production', v_item, p_units,
           round((coalesce((select sum(abs(quantity) * coalesce(unit_cost, 0)) from consumed), 0) + v_labor) / p_units, 6),
           'assembly', p_request_key,
           coalesce(p_note, 'Armado de producto')
    returning *
  )
  select * from consumed
  union all
  select * from produced;
end;
$$;

grant execute on function app.assemble_product(uuid, numeric, text, uuid) to authenticated;

comment on function app.assemble_product(uuid, numeric, text, uuid) is
  'Arma unidades enteras de un producto: consume su receta y lo mete al estante, todo o nada. La misma llave otra vez devuelve lo que ya armó, sin mover nada.';

-- PostgREST only sees the public schema.
create function public.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null,
  p_request_key uuid default null
)
returns setof public.stock_movements
language sql
volatile
as $$
  select * from app.assemble_product(p_variant_id, p_units, p_note, p_request_key);
$$;

grant execute on function public.assemble_product(uuid, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------- iniciar un trabajo
--
-- La de 20261024100000, con la comprobación de que el trabajo cambió justo
-- después del update.
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
  -- Right after the update: any later statement, a PERFORM included, sets
  -- FOUND again. An update that changed no row comes back without an error,
  -- and the screen must not say «hecho» when nothing changed.
  if not found then
    raise exception 'No pudimos cambiar este trabajo: puede que no tengas permiso, o que ya no esté en la cola. Recarga la página.';
  end if;
  perform set_config('app.print_job_flow', '', true);

  insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, slot, estimated_g)
  select v_job.workspace_id, p_job_id, (r ->> 'spool_id')::uuid, nullif(r ->> 'slot', '')::integer,
         round(coalesce(nullif(r ->> 'estimated_g', '')::numeric, 0), 2)
  from jsonb_array_elements(v_rolls) r;

  return v_job;
end;
$$;

-- ------------------------------------------------------ cerrar una impresión
--
-- La de 20261024140000, con la comprobación de que el trabajo cambió justo
-- después del update, y `p_expected_status` con un valor por defecto: así la
-- pantalla anterior, que no lo manda, llega hasta aquí y lee que tiene que
-- recargar, en vez de un «no existe la función» que se volvía «inténtalo de
-- nuevo». Sin él no se cierra nada, igual que antes.
create or replace function app.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_expected_status public.print_job_status default null,
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
  -- Only the screen before this one leaves it out (it did not know it).
  if p_expected_status is null then
    raise exception 'La aplicación se actualizó mientras la tenías abierta: recarga la página y vuelve a cerrar la impresión. No se movió nada.';
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
  -- Right after the update: any later statement, a PERFORM included, sets
  -- FOUND again. An update that changed no row comes back without an error,
  -- and the screen must not say «hecho» when nothing changed.
  if not found then
    raise exception 'No pudimos cambiar este trabajo: puede que no tengas permiso, o que ya no esté en la cola. Recarga la página.';
  end if;
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

create or replace function public.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_expected_status public.print_job_status default null,
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

-- ---------------------------------------------------------- el flujo de un trabajo
--
-- La de 20261024140000. Solo cambia el mensaje de iniciar a mano: la pantalla
-- anterior iniciaba así, y quien lo lee acaba de pulsar «Iniciar».
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
      -- The screen before start_print_job started a job this way: if that is
      -- who asks, the person did press «Iniciar».
      raise exception 'Un trabajo se inicia con «Iniciar», que confirma con qué rollos. Si lo acabas de pulsar, la aplicación se actualizó mientras la tenías abierta: recarga la página y vuelve a pulsarlo. No se movió nada.';
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

-- ------------------------------------------------------------- cuánto falla
--
-- La de 20261016110000_failure_cause_ties, con las mismas columnas en el
-- mismo orden. Una cancelada que corrió es un intento fallido (ADR-023, punto
-- 6): cuenta entre las cerradas y entre las fallidas, como en Resultados. No
-- tiene causa, así que no cambia la más común. Una cancelada sin tiempo nunca
-- corrió y no cuenta.
create or replace view public.failure_stats with (security_invoker = true) as
select
  j.workspace_id,
  j.printer_id,
  count(*) filter (where j.tried) as closed_jobs,
  count(*) filter (where j.failed) as failed_jobs,
  case
    when count(*) filter (where j.tried) > 0
      then round(count(*) filter (where j.failed)::numeric / count(*) filter (where j.tried), 4)
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
from (
  select
    p.workspace_id,
    p.printer_id,
    p.status in ('success', 'failed') or (p.status = 'cancelled' and p.actual_time_s is not null) as tried,
    p.status = 'failed' or (p.status = 'cancelled' and p.actual_time_s is not null) as failed
  from public.print_jobs p
) j
group by j.workspace_id, j.printer_id;

comment on view public.failure_stats is
  'Cuántas impresiones se intentan y cuántas fallan, por impresora, contadas por cantidad y no por costo. Una cancelada que alcanzó a correr cuenta como intento fallido, igual que en Resultados; una cancelada sin tiempo no cuenta. most_common_cause queda vacía si dos causas empatan.';
