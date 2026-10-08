-- El estante solo se mueve por sus flujos, también en la base (ADR-020 y
-- ADR-025, «Queda abierto»).
--
-- Hasta hoy, un insert directo por la API podía agregar a `stock_movements`
-- una pieza o un producto, o escribir una entrega en `order_deliveries` y
-- `order_delivery_lines`. La política no podía distinguirlo de los flujos:
-- `complete_print_job`, `assemble_product`, `count_shelf` y `deliver_order`
-- eran `security invoker` y escribían por la misma política que un POST a
-- mano. Un operador (o una pestaña con un error) podía poner diez botellas en
-- el estante sin armarlas, o una entrega sin que nada saliera.
--
-- Ahora:
--
-- 1. **Esas cuatro funciones corren como su dueño** (`security definer`, con
--    `search_path` vacío: todo lo que nombran va con su esquema). Al principio
--    cada una exige que quien llama opere en el taller de lo que toca
--    (`app.require_operator`): «Solo lectura» recibe un 42501 con su frase, y
--    alguien de otro taller, el mismo «no encontramos» que recibía antes,
--    cuando la seguridad por fila le escondía la fila. Sin esa comprobación,
--    una función así abriría un hueco entre talleres.
-- 2. **Lo que tocan es de ese taller.** Además de lo que cada función mira al
--    principio, un disparador rechaza cualquier movimiento de stock cuyo rollo
--    o artículo sea de otro taller (`stock_movements_stay_in_their_workshop`):
--    un rollo de otro taller atado a un trabajo, o un artículo ajeno en una
--    receta o una placa, ya no mueve stock ajeno, lo escriba quien lo escriba.
-- 3. **El insert directo en `stock_movements` queda para lo que se mueve a
--    mano**: rollos, insumos, empaques y repuestos, del propio taller
--    (`app.movable_by_hand`). Es lo que escriben `register_purchase`,
--    `weigh_spool`, el cambio de estado del rollo y `move_item_stock`, que
--    siguen siendo `security invoker` y pasan por la política como el
--    operador. Una pieza o un producto entra y sale solo por `complete_print_job`,
--    `assemble_product`, `count_shelf` y `deliver_order`.
-- 4. **Las entregas no se escriben a mano**: `order_deliveries` y
--    `order_delivery_lines` pierden su política de insert y el privilegio, así
--    que la API contesta «permission denied». Solo `deliver_order` entrega.
--
-- `quick_sale` sigue siendo `security invoker`: no escribe el estante ni las
-- entregas por su cuenta, las escribe `deliver_order`, y así el pedido, el
-- cliente y el cobro siguen pasando por la seguridad por fila de quien vende.
--
-- Las funciones se recrean desde su última versión sin cambiar nada de lo
-- que hacen: `complete_print_job` y `assemble_product` de
-- 20261024150000_assembly_once_and_old_tabs, `count_shelf` de
-- 20261024140000_close_checks_what_the_tab_saw y `deliver_order` (cinco
-- argumentos) de 20261026170000_delivery_once. La firma no cambia, así que
-- `create or replace` las deja en su sitio.
--
-- Solo cambian funciones, políticas y un disparador de insert: nada de lo
-- guardado se vuelve a validar, así que la migración no falla por datos viejos.

-- ------------------------------------------------------------ quién opera

/*
 * Refuses, in words, whoever may not write the day to day of a workshop:
 * someone outside it gets `p_not_found` (P0001), as if the row were not there,
 * which is what row level security showed them before, and a «Solo lectura»
 * member gets a 42501 with a sentence of its own (ADR-025, point 6).
 *
 * Without a signed-in person the caller is trusted, as everywhere else in the
 * base area: a migration or the SQL console. An API call always carries a
 * role, so an anonymous one is never taken for the console.
 */
create or replace function app.require_operator(p_workspace uuid, p_not_found text, p_action text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return;
  end if;
  if p_workspace is null or not app.is_member(p_workspace) then
    raise exception '%', p_not_found;
  end if;
  if not app.can_operate(p_workspace) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = format('Solo el dueño o un operador del taller pueden %s: con «Solo lectura» se mira, no se registra.', p_action);
  end if;
end;
$$;

grant execute on function app.require_operator(uuid, text, text) to authenticated, service_role;

comment on function app.require_operator(uuid, text, text) is
  'Al principio de una función que escribe: quien no es del taller recibe el «no encontramos» de esa función (P0001); «Solo lectura», un 42501 con la frase de lo que quiso hacer. Sin sesión (migración, consola) pasa.';

-- ------------------------------------------- lo que se mueve a mano

/*
 * What a direct insert into stock_movements may move: a roll, a supply, a
 * bag or a spare part, of the movement's own workshop. A printed part and an
 * assembled product move only through their flows (ADR-020). Runs as the
 * caller: a roll or an article of another workshop is not even visible.
 */
create or replace function app.movable_by_hand(p_workspace uuid, p_spool_id uuid, p_item_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.spools s
           where s.id = p_spool_id and s.workspace_id = p_workspace
         )
      or exists (
           select 1 from public.inventory_items i
           where i.id = p_item_id
             and i.workspace_id = p_workspace
             and i.kind in ('supply', 'packaging', 'spare_part')
         );
$$;

grant execute on function app.movable_by_hand(uuid, uuid, uuid) to authenticated;

comment on function app.movable_by_hand(uuid, uuid, uuid) is
  'Lo que un insert directo puede mover: un rollo, un insumo, un empaque o un repuesto del propio taller. Las piezas y los productos se mueven solo por sus flujos (ADR-020).';

drop policy if exists stock_movements_insert on public.stock_movements;

create policy stock_movements_insert on public.stock_movements
  for insert to authenticated
  with check (
    app.can_operate(workspace_id)
    and app.movable_by_hand(workspace_id, spool_id, inventory_item_id)
  );

-- ------------------------------------------------- las entregas, sin atajo

drop policy if exists order_deliveries_insert on public.order_deliveries;
drop policy if exists order_delivery_lines_insert on public.order_delivery_lines;

-- Without the privilege the API says «permission denied» out loud, the way it
-- already does for an update or a delete. deliver_order runs as its owner.
revoke insert on public.order_deliveries, public.order_delivery_lines from anon, authenticated, service_role;

-- --------------------------------------------- el stock de cada taller

/*
 * A stock movement belongs to the workshop of what it moves. The foreign key
 * only says the roll or the article exists, in whatever workshop; a roll of
 * another workshop tied to a job, or an article of another one in a recipe or
 * a plate, would otherwise move stock that is not this workshop's. Runs as
 * its owner so it sees the row wherever it lives.
 */
create or replace function app.stock_movement_stays_in_its_workshop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  if new.spool_id is not null then
    select s.workspace_id into v_workspace from public.spools s where s.id = new.spool_id;
  else
    select i.workspace_id into v_workspace from public.inventory_items i where i.id = new.inventory_item_id;
  end if;

  -- Not found is the foreign key's to say.
  if found and v_workspace <> new.workspace_id then
    raise exception 'Ese rollo o artículo es de otro taller: su stock no se mueve desde aquí. Recarga la página.';
  end if;

  return new;
end;
$$;

create trigger stock_movements_stay_in_their_workshop
  before insert on public.stock_movements
  for each row execute function app.stock_movement_stays_in_its_workshop();

-- ------------------------------------------------------ cerrar una impresión
--
-- La de 20261024150000_assembly_once_and_old_tabs, como su dueño y con quién
-- opera al principio.
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
security definer
set search_path = ''
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
  -- Runs as its owner, because it writes the shelf: whoever calls has to
  -- operate in the job's workshop.
  perform app.require_operator(
    (select j.workspace_id from public.print_jobs j where j.id = p_job_id),
    'No encontramos este trabajo: puede que ya no esté en la cola. Recarga la página.',
    'cerrar una impresión'
  );

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


-- ------------------------------------------------------------- armar
--
-- La de 20261024150000_assembly_once_and_old_tabs (con la llave del envío),
-- como su dueño y con quién opera al principio.
create or replace function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null,
  p_request_key uuid default null
)
returns setof public.stock_movements
language plpgsql
security definer
set search_path = ''
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
  -- Runs as its owner, because it writes the shelf: whoever calls has to
  -- operate in the product's workshop.
  perform app.require_operator(
    (select v.workspace_id from public.product_variants v where v.id = p_variant_id),
    'No encontramos ese producto. Recarga la página y vuelve a elegirlo.',
    'armar productos'
  );

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


-- ------------------------------------------------------- contar el estante
--
-- La de 20261024140000_close_checks_what_the_tab_saw, como su dueño, con lo
-- contado de un solo taller y quién opera al principio.
create or replace function app.count_shelf(p_counts jsonb, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
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
  v_workspaces uuid[];
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'No hay nada contado.';
  end if;

  -- Runs as its owner, because it writes the shelf: what it counts is of a
  -- single workshop, where the caller operates. Before anything is read or
  -- written, because a variant counted for the first time creates its
  -- article. What is not found is left to the checks below.
  select array_agg(distinct coalesce(v.workspace_id, i.workspace_id))
    into v_workspaces
  from jsonb_array_elements(p_counts) e
  left join public.product_variants v
    on e ? 'variant_id' and v.id = (e ->> 'variant_id')::uuid
  left join public.inventory_items i
    on not e ? 'variant_id' and i.id = (e ->> 'inventory_item_id')::uuid
  where coalesce(v.workspace_id, i.workspace_id) is not null;

  if cardinality(v_workspaces) > 1 then
    raise exception 'Un conteo es de un solo taller, y en este hay artículos de otro. Recarga la página y vuelve a contar.';
  end if;
  perform app.require_operator(
    v_workspaces[1],
    'No encontramos lo que se contó: puede que ya no exista. Recarga la página y vuelve a contar.',
    'contar el estante'
  );

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


-- ------------------------------------------------------------- entregar
--
-- La de 20261026170000_delivery_once (cinco argumentos, con la llave de la
-- entrega), como su dueño y con quién opera al principio.
create or replace function app.deliver_order(
  p_order_id uuid,
  p_lines jsonb default null,
  p_delivered_at timestamptz default null,
  p_note text default null,
  p_delivery_key uuid default null
)
returns public.order_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_line record;
  v_quantity numeric;
  -- [{"line": uuid, "variant": uuid, "quantity": n}]
  v_requested jsonb := '[]'::jsonb;
  -- [{"line": uuid, "item": uuid, "quantity": n, "valuation": "produced"|"component"}]
  v_needs jsonb := '[]'::jsonb;
  -- {"<line>": labour of that line}, only for what is delivered as its parts.
  v_labor jsonb := '{}'::jsonb;
  v_line_labor numeric;
  v_request jsonb;
  v_recipe uuid;
  v_assembled boolean;
  v_shortage text;
  v_delivery public.order_deliveries;
  v_when timestamptz := coalesce(p_delivered_at, now());
  v_day date;
  v_planned integer;
  v_printing integer;
begin
  -- Runs as its owner, because it writes the deliveries and the shelf:
  -- whoever calls has to operate in the order's workshop.
  perform app.require_operator(
    (select o.workspace_id from public.orders o where o.id = p_order_id),
    'No existe el pedido indicado.',
    'entregar pedidos'
  );

  if p_delivery_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('deliver_order ' || p_delivery_key::text, 0));
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No existe el pedido indicado.';
  end if;

  -- The same delivery asked again: the one it already made, and nothing else.
  -- Before the status, because the first one may have been the last and the
  -- order is delivered by now.
  if p_delivery_key is not null then
    select * into v_delivery
    from public.order_deliveries d
    where d.workspace_id = v_order.workspace_id and d.delivery_key = p_delivery_key;
    if found then
      if v_delivery.order_id <> p_order_id then
        raise exception 'Esa entrega ya se registró en otro pedido. Vuelve a abrir este pedido y anota la entrega otra vez.';
      end if;
      return v_delivery;
    end if;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'El pedido % está cancelado: no hay nada que entregar.', v_order.number;
  end if;
  if v_order.status in ('delivered', 'closed') then
    raise exception 'El pedido % ya se entregó.', v_order.number;
  end if;

  if p_lines is not null and exists (
    select 1 from jsonb_array_elements(p_lines) e
    where not exists (
      select 1 from public.order_lines l
      where l.id = (e ->> 'order_line_id')::uuid and l.order_id = p_order_id
    )
  ) then
    raise exception 'Una de las líneas no es de este pedido.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha de la entrega no es válida.';
  end if;
  -- Stock does not move in the future. A few minutes of slack: the phone's
  -- clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'La entrega no puede tener fecha futura: anótala con el día en que salió.';
  end if;

  v_day := app.workspace_day(v_order.workspace_id, v_when);

  -- What goes out today, line by line, checked against what is still pending.
  for v_line in
    select l.id, l.variant_id, l.description, s.pending
    from public.order_lines l
    join public.order_line_delivery_status s on s.order_line_id = l.id
    where l.order_id = p_order_id
    order by l.position
  loop
    if p_lines is null then
      v_quantity := v_line.pending;
    else
      select (e ->> 'quantity')::numeric into v_quantity
      from jsonb_array_elements(p_lines) e
      where (e ->> 'order_line_id')::uuid = v_line.id;
    end if;

    continue when coalesce(v_quantity, 0) = 0;

    if v_quantity < 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'La cantidad a entregar de «%» tiene que ser un número entero positivo.', v_line.description;
    end if;
    if v_quantity > v_line.pending then
      raise exception 'De «%» quedan % por entregar y se intentó entregar %.',
        v_line.description, app.tidy_number(v_line.pending), app.tidy_number(v_quantity);
    end if;

    -- The last units of a made-to-order line leave once its prints are
    -- closed: what came out of them is said in the queue, and a print left
    -- planned for a delivered line stayed first in the queue (T4-08).
    if v_line.variant_id is null and v_quantity = v_line.pending then
      select count(*) filter (where j.status = 'planned'),
             count(*) filter (where j.status = 'printing')
        into v_planned, v_printing
      from public.print_jobs j
      where j.order_line_id = v_line.id and j.status in ('planned', 'printing');

      if v_printing > 0 then
        raise exception '«%» se está imprimiendo para este pedido. Ciérrala en la cola de impresión con lo que salió, y después entrégala.',
          v_line.description;
      end if;
      if v_planned > 0 then
        raise exception '«%» tiene % en la cola, sin imprimir. Si ya la imprimiste, ciérrala como exitosa en Producción; si no hace falta, cancélala allí. Después entrégala.',
          v_line.description, app.planned_prints_text(v_planned);
      end if;
    end if;

    v_requested := v_requested || jsonb_build_object(
      'line', v_line.id, 'variant', v_line.variant_id, 'quantity', v_quantity
    );
  end loop;

  if jsonb_array_length(v_requested) = 0 then
    raise exception 'No queda nada por entregar en el pedido %.', v_order.number;
  end if;

  -- What each line takes off the shelf.
  for v_request in select value from jsonb_array_elements(v_requested) loop
    continue when v_request ->> 'variant' is null;

    select r.id, r.assembled into v_recipe, v_assembled
    from public.recipes r
    where r.variant_id = (v_request ->> 'variant')::uuid
    order by r.version desc
    limit 1;

    continue when v_recipe is null;

    if v_assembled then
      v_needs := v_needs || jsonb_build_object(
        'line', v_request ->> 'line',
        'item', app.finished_good_for((v_request ->> 'variant')::uuid),
        'quantity', (v_request ->> 'quantity')::numeric,
        'valuation', 'produced'
      );
    else
      select v_needs || coalesce(jsonb_agg(jsonb_build_object(
               'line', v_request ->> 'line',
               'item', ri.inventory_item_id,
               'quantity', ri.quantity_per_unit * (v_request ->> 'quantity')::numeric,
               'valuation', 'component'
             )), '[]'::jsonb)
        into v_needs
      from public.recipe_items ri
      where ri.recipe_id = v_recipe;

      -- Its handling happens now: the minutes per unit assembling would have added.
      v_line_labor := coalesce(app.recipe_unit_labor(v_recipe, (v_request ->> 'quantity')::numeric, v_day), 0);
      if v_line_labor > 0 then
        v_labor := v_labor || jsonb_build_object(v_request ->> 'line', v_line_labor);
      end if;
    end if;
  end loop;

  -- Locked before the check, in id order, so two deliveries (or a delivery and
  -- an assembly) of the same things queue up instead of both passing.
  perform 1
  from public.inventory_items
  where id in (select (n ->> 'item')::uuid from jsonb_array_elements(v_needs) n)
  order by id
  for update;

  select string_agg(
           format('%s (hacen falta %s y hay %s)',
                  i.name, app.tidy_number(x.needed), app.tidy_number(coalesce(b.on_hand, 0))),
           '; ' order by i.name)
    into v_shortage
  from (
    select (n ->> 'item')::uuid as item, sum((n ->> 'quantity')::numeric) as needed
    from jsonb_array_elements(v_needs) n
    group by 1
  ) x
  join public.inventory_items i on i.id = x.item
  left join public.inventory_balances b on b.inventory_item_id = x.item
  where coalesce(b.on_hand, 0) < x.needed;

  if v_shortage is not null then
    raise exception 'No alcanza para entregar. Falta: %. Arma o imprime lo que falta, o entrega una parte.', v_shortage;
  end if;

  insert into public.order_deliveries (workspace_id, order_id, delivered_at, note, delivery_key)
  values (v_order.workspace_id, p_order_id, v_when, nullif(btrim(p_note), ''), p_delivery_key)
  returning * into v_delivery;

  -- What leaves the shelf, valued the way it entered: a finished product at the
  -- average of what it cost to assemble, a part or a supply the way assembling
  -- values it (ADR-016).
  with valued as (
    select
      (n ->> 'line')::uuid as line,
      (n ->> 'item')::uuid as item,
      (n ->> 'quantity')::numeric as quantity,
      case n ->> 'valuation'
        when 'produced' then app.produced_unit_cost((n ->> 'item')::uuid)
        else coalesce(ps.cost_per_unit, c.cost_per_unit)
      end as unit_cost
    from jsonb_array_elements(v_needs) n
    left join public.part_stock ps on ps.inventory_item_id = (n ->> 'item')::uuid
    left join public.inventory_item_costs c on c.inventory_item_id = (n ->> 'item')::uuid
  ),
  moved as (
    insert into public.stock_movements (
      workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    select v_order.workspace_id, v_when, 'delivery', item, -quantity, unit_cost,
           'order_delivery', v_delivery.id, format('Entrega del pedido %s', v_order.number)
    from valued
  )
  -- `moved` runs even though nothing reads it: a data-modifying WITH always does.
  -- A line that took nothing off the shelf keeps a null cost, labour or not:
  -- nothing on the shelf stands for it, and its labour alone would read as
  -- its whole real cost. Resultados keeps it at its estimate.
  insert into public.order_delivery_lines (workspace_id, delivery_id, order_line_id, quantity, unit_cost)
  select
    v_order.workspace_id,
    v_delivery.id,
    (r ->> 'line')::uuid,
    (r ->> 'quantity')::integer,
    (
      select case
               when count(v.item) = 0 then null
               else round(
                 (coalesce(sum(v.quantity * coalesce(v.unit_cost, 0)), 0) + coalesce((v_labor ->> (r ->> 'line'))::numeric, 0))
                 / (r ->> 'quantity')::numeric,
                 6
               )
             end
      from valued v
      where v.line = (r ->> 'line')::uuid
    )
  from jsonb_array_elements(v_requested) r;

  -- A catalogue print still tied to a line that has gone out whole (from
  -- before ADR-021) is no longer this order's: it goes on as a loose print,
  -- the way cancel_order lets go of the prints it does not cancel, and what
  -- it makes reaches the shelf like any other.
  update public.print_jobs j
     set order_line_id = null,
         label = coalesce(nullif(btrim(j.label), ''), l.description),
         note = concat_ws(E'\n', nullif(btrim(j.note), ''),
                          format('Era del pedido %s, que se entregó desde el estante.', v_order.number))
    from public.order_lines l
    join public.order_line_delivery_status s on s.order_line_id = l.id
   where j.order_line_id = l.id
     and l.order_id = p_order_id
     and l.variant_id is not null
     and s.pending = 0
     and j.status in ('planned', 'printing')
     -- Running as its owner, it sees every workshop: only this one's prints.
     and j.workspace_id = v_order.workspace_id;

  -- Nothing left to deliver: the order is delivered. A partial delivery leaves
  -- the order where it was.
  if not exists (
    select 1 from public.order_line_delivery_status
    where order_id = p_order_id and pending > 0
  ) then
    update public.orders set status = 'delivered' where id = p_order_id;
  end if;

  return v_delivery;
end;
$$;


-- --------------------------------------------------------- quién las llama
--
-- Una función que corre como su dueño no queda abierta a quien no ha
-- entrado: sin sesión, la API llega como `anon`. Las de `public` son las que
-- ve PostgREST, y llaman a las de `app`.

revoke execute on function app.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) from public, anon;
revoke execute on function public.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) from public, anon;
grant execute on function app.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated, service_role;
grant execute on function public.complete_print_job(
  uuid, public.print_job_status, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated, service_role;

revoke execute on function app.assemble_product(uuid, numeric, text, uuid) from public, anon;
revoke execute on function public.assemble_product(uuid, numeric, text, uuid) from public, anon;
grant execute on function app.assemble_product(uuid, numeric, text, uuid) to authenticated, service_role;
grant execute on function public.assemble_product(uuid, numeric, text, uuid) to authenticated, service_role;

revoke execute on function app.count_shelf(jsonb, text) from public, anon;
revoke execute on function public.count_shelf(jsonb, text) from public, anon;
grant execute on function app.count_shelf(jsonb, text) to authenticated, service_role;
grant execute on function public.count_shelf(jsonb, text) to authenticated, service_role;

revoke execute on function app.deliver_order(uuid, jsonb, timestamptz, text, uuid) from public, anon;
revoke execute on function public.deliver_order(uuid, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function app.deliver_order(uuid, jsonb, timestamptz, text, uuid) to authenticated, service_role;
grant execute on function public.deliver_order(uuid, jsonb, timestamptz, text, uuid) to authenticated, service_role;
