-- Lo que sale de una placa, y cuántas piezas salieron de verdad.
--
-- Dos cosas que estaban mal juntas:
--
-- 1. **Una placa podía producir una sola pieza.** `recipe_plates.produces_item_id`
--    guardaba un artículo y `units_per_run` un número. Pero una placa real del
--    taller lleva siete tapas y siete cuerpos a la vez (la placa 6 de la
--    calavera, comprobado en el archivo laminado del dueño), y no había forma
--    de cargarla. Ahora una placa tiene una lista de lo que produce.
--
-- 2. **Cerrar una impresión metía la placa completa al estante.** La pantalla
--    guardaba cuántas piezas salieron *después* de llamar a
--    `complete_print_job`, que leía el número antes de que existiera: lo
--    encontraba en cero y usaba el rendimiento entero. Salían 7 tapas de 9 y
--    entraban 9, con el costo repartido entre 9. Ahora la función recibe lo
--    que salió, el porcentaje y la nota en una sola llamada, y es lo único que
--    escribe el cierre.
--
-- `units_per_run` de la placa se queda con lo que siempre significó para el
-- costeo: cuántos productos terminados aporta una corrida. Lo que entra al
-- estante es otra pregunta, y la contesta la lista nueva.

-- ------------------------------------------------- lo que produce cada placa

create table public.recipe_plate_outputs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipe_plate_id uuid not null references public.recipe_plates (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  -- Cuántas de esta pieza salen de una corrida de la placa.
  units_per_run numeric(10, 3) not null check (units_per_run > 0),
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_plate_id, inventory_item_id)
);

create index recipe_plate_outputs_item_idx on public.recipe_plate_outputs (inventory_item_id);

comment on table public.recipe_plate_outputs is
  'Las piezas que salen de una corrida de una placa. Una placa puede producir varias distintas.';

-- La pieza tiene que ser una pieza y del mismo taller, o una placa estaría
-- produciendo inventario ajeno, o "produciendo" dulces.
create or replace function app.check_plate_output()
returns trigger
language plpgsql
as $$
declare
  v_kind public.inventory_item_kind;
  v_item_workspace uuid;
  v_plate_workspace uuid;
begin
  select kind, workspace_id into v_kind, v_item_workspace
  from public.inventory_items where id = new.inventory_item_id;

  select workspace_id into v_plate_workspace
  from public.recipe_plates where id = new.recipe_plate_id;

  if v_item_workspace is distinct from new.workspace_id
     or v_plate_workspace is distinct from new.workspace_id then
    raise exception 'la pieza o la placa son de otro taller';
  end if;
  if v_kind <> 'part' then
    raise exception 'una placa solo puede producir artículos de tipo pieza';
  end if;

  return new;
end;
$$;

create trigger recipe_plate_outputs_are_ours
  before insert or update of inventory_item_id, recipe_plate_id, workspace_id on public.recipe_plate_outputs
  for each row execute function app.check_plate_output();

select app.apply_workspace_rls('recipe_plate_outputs');
select app.add_updated_at_trigger('recipe_plate_outputs');

-- Lo que ya estaba cargado pasa a la lista, tal cual.
insert into public.recipe_plate_outputs (workspace_id, recipe_plate_id, inventory_item_id, units_per_run)
select workspace_id, id, produces_item_id, units_per_run
from public.recipe_plates
where produces_item_id is not null;

-- --------------------------------------------- duplicar copia lo que produce

create or replace function app.duplicate_variant(
  p_variant_id uuid,
  p_name text
)
returns uuid
language plpgsql
as $$
declare
  v_workspace uuid;
  v_product uuid;
  v_new_variant uuid;
  v_recipe uuid;
  v_new_recipe uuid;
  v_plate record;
  v_new_plate uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'hay que ponerle un nombre a la copia';
  end if;

  select workspace_id, product_id into v_workspace, v_product
  from public.product_variants
  where id = p_variant_id;

  if v_workspace is null then
    raise exception 'esa variante no existe';
  end if;

  insert into public.product_variants (
    workspace_id, product_id, name, options, sku_code, list_price, min_order_units, active, image_path
  )
  select workspace_id, product_id, btrim(p_name), options, null, list_price, min_order_units, active, image_path
  from public.product_variants
  where id = p_variant_id
  returning id into v_new_variant;

  -- El código interno no se copia a propósito: dos cajas del estante con la
  -- misma etiqueta es justo lo que el código existe para evitar.

  select id into v_recipe
  from public.recipes
  where variant_id = p_variant_id
  order by version desc
  limit 1;

  if v_recipe is not null then
    insert into public.recipes (
      workspace_id, variant_id, version, valid_from, setup_minutes, minutes_per_unit, note, active
    )
    select workspace_id, v_new_variant, 1, valid_from, setup_minutes, minutes_per_unit, note, active
    from public.recipes
    where id = v_recipe
    returning id into v_new_recipe;

    for v_plate in
      select * from public.recipe_plates where recipe_id = v_recipe order by plate_index
    loop
      insert into public.recipe_plates (
        workspace_id, recipe_id, label, plate_index, units_per_run, print_time_s,
        source_file_name, thumbnail_path, slicer_metadata
      )
      values (
        v_plate.workspace_id, v_new_recipe, v_plate.label, v_plate.plate_index, v_plate.units_per_run,
        v_plate.print_time_s, v_plate.source_file_name, v_plate.thumbnail_path, v_plate.slicer_metadata
      )
      returning id into v_new_plate;

      insert into public.recipe_plate_filaments (
        workspace_id, recipe_plate_id, slot, material_id, color_hex, filament_sku_id, grams
      )
      select workspace_id, v_new_plate, slot, material_id, color_hex, filament_sku_id, grams
      from public.recipe_plate_filaments
      where recipe_plate_id = v_plate.id;

      insert into public.recipe_plate_outputs (
        workspace_id, recipe_plate_id, inventory_item_id, units_per_run, position
      )
      select workspace_id, v_new_plate, inventory_item_id, units_per_run, position
      from public.recipe_plate_outputs
      where recipe_plate_id = v_plate.id;
    end loop;

    insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
    select workspace_id, v_new_recipe, inventory_item_id, quantity_per_unit
    from public.recipe_items
    where recipe_id = v_recipe;
  end if;

  insert into public.price_tiers (workspace_id, variant_id, min_quantity, unit_price, valid_from, note)
  select workspace_id, v_new_variant, min_quantity, unit_price, valid_from, note
  from public.price_tiers
  where variant_id = p_variant_id;

  return v_new_variant;
end;
$$;

comment on function app.duplicate_variant(uuid, text) is
  'Copia una variante con su receta, sus placas, lo que produce cada placa, sus filamentos, sus insumos y su escalera de precios. El código interno no se copia.';

-- ------------------------------------------------------ cerrar una impresión
--
-- La firma cambia, así que la vieja se suelta: con `create or replace` quedarían
-- dos funciones con el mismo nombre y PostgREST no sabría cuál llamar.

drop function public.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause, numeric, numeric, numeric
);
drop function app.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause, numeric, numeric, numeric
);

/*
 * Closes a print job in one transaction: the filament it used (or wasted), its
 * frozen costs, how far it got, and — when it went well — the parts that came
 * out of it, which go on the shelf.
 *
 * `p_outputs` is what really came out: [{"inventory_item_id": ..., "units": 7}].
 * Left out, every part of the plate counts at its full yield. A part the plate
 * does not make, or more of one than it makes, is refused: it is a typo, and a
 * typo here becomes stock that does not exist.
 *
 * The plate's cost is split evenly among every unit that came out, whatever
 * part it is. The slicer file does not say how many grams each object weighs,
 * and for a product made of one of each part the split does not change what
 * the product costs.
 */
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
begin
  if p_result not in ('success', 'failed', 'cancelled') then
    raise exception 'a job can only be closed as success, failed or cancelled';
  end if;
  if p_percent_complete is not null and (p_percent_complete < 0 or p_percent_complete > 100) then
    raise exception 'El porcentaje completado tiene que estar entre 0 y 100.';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'print job % not found', p_job_id;
  end if;
  if v_job.status in ('success', 'failed', 'cancelled') then
    raise exception 'Esta impresión ya estaba cerrada.';
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

  for v_usage in select value from jsonb_array_elements(p_filament_usage) loop
    v_spool := (v_usage ->> 'spool_id')::uuid;
    v_grams := (v_usage ->> 'actual_g')::numeric;

    update public.print_job_filaments
       set actual_g = v_grams
     where print_job_id = p_job_id and spool_id = v_spool;

    -- A cancelled job that never printed does not move anything.
    if p_result <> 'cancelled' and coalesce(v_grams, 0) > 0 then
      insert into public.stock_movements (
        workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
      )
      select v_job.workspace_id, v_movement, s.id, -v_grams, s.cost_per_gram, 'print_job', p_job_id,
             case when p_result = 'success' then 'Consumo de impresión'
                  else 'Merma por impresión fallida' end
      from public.spools s
      where s.id = v_spool;
    end if;
  end loop;

  select coalesce(sum((t ->> 'units')::numeric), 0) into v_total_units
  from jsonb_array_elements(v_outputs) t;

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
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated;

-- PostgREST only sees the public schema.
create or replace function public.complete_print_job(
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
language sql
volatile
as $$
  select app.complete_print_job(
    p_job_id, p_result, p_actual_time_s, p_filament_usage, p_failure_cause,
    p_material_cost, p_energy_cost, p_machine_cost, p_outputs, p_percent_complete, p_note
  );
$$;

grant execute on function public.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause,
  numeric, numeric, numeric, jsonb, numeric, text
) to authenticated;

-- ------------------------------------------- la columna vieja ya no la lee nadie

drop trigger recipe_plates_part_is_ours on public.recipe_plates;
drop function app.check_plate_part_workspace();
alter table public.recipe_plates drop column produces_item_id;
