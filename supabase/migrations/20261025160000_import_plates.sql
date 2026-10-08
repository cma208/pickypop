-- Importar placas de un archivo laminado, todo o nada (E2-03, T2-03).
--
-- La importación creaba las piezas nuevas una por una, después cada placa con
-- sus filamentos y sus salidas, en llamadas separadas. Si algo fallaba a medio
-- camino quedaban placas sueltas, y las piezas recién creadas se intentaban
-- borrar desde la pantalla, cosa que solo puede el dueño: al operador se le
-- quedaban en el inventario, sin placa y sin foto.
--
-- Ahora es una sola función. Las piezas que la persona nombró durante la
-- revisión llegan con un id provisional («nueva:1») y aquí se crean de verdad
-- y se cambian en las salidas y en lo que dijo el archivo. Si cualquier cosa
-- falla, no queda nada: ni piezas, ni placas.

/*
 * p_new_parts: [{"key": "nueva:1", "name": "Tapa de calavera"}]
 * p_plates: [{
 *   "label", "units_per_run", "print_time_s", "source_file_name",
 *   "thumbnail_path", "slicer_metadata",
 *   "filaments": [{"slot", "material_id", "color_hex", "filament_sku_id", "grams"}],
 *   "outputs": [{"inventory_item_id", "units_per_run"}]
 * }]
 * The plates take the numbers from p_first_index on. Returns
 * {"created": plates, "parts_created": parts}.
 */
create or replace function app.import_plates(
  p_recipe_id uuid,
  p_first_index integer,
  p_new_parts jsonb,
  p_plates jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_workspace uuid;
  v_part jsonb;
  v_name text;
  v_part_id uuid;
  v_existing record;
  -- Provisional id -> real id, as quoted JSON strings, ready to swap in text.
  v_swaps jsonb := '{}'::jsonb;
  v_swap record;
  v_plate jsonb;
  v_text text;
  v_position integer;
  v_index integer;
  v_plate_id uuid;
  v_taken integer;
  v_parts_created integer := 0;
begin
  if jsonb_typeof(p_plates) is distinct from 'array' or jsonb_array_length(p_plates) = 0 then
    raise exception 'No hay placas para guardar.';
  end if;

  -- The recipe row is the lock: two imports into the same recipe wait for
  -- each other instead of fighting over the plate numbers.
  select workspace_id into v_workspace
  from public.recipes
  where id = p_recipe_id
  for update;

  if v_workspace is null then
    raise exception 'Esa receta ya no existe. Recarga la página.';
  end if;

  select min(plate_index) into v_taken
  from public.recipe_plates
  where recipe_id = p_recipe_id
    and plate_index between p_first_index and p_first_index + jsonb_array_length(p_plates) - 1;
  if v_taken is not null then
    raise exception 'La receta cambió mientras revisabas: ya tiene una placa %. Recarga la página y vuelve a cargar el archivo.', v_taken;
  end if;

  for v_part in select value from jsonb_array_elements(coalesce(p_new_parts, '[]'::jsonb)) loop
    v_name := btrim(regexp_replace(coalesce(v_part ->> 'name', ''), '\s+', ' ', 'g'));
    if v_name = '' then
      raise exception 'Una pieza nueva no tiene nombre.';
    end if;

    select id, active, name into v_existing
    from public.inventory_items
    where workspace_id = v_workspace
      and kind = 'part'
      and lower(btrim(name)) = lower(v_name)
    limit 1;

    if v_existing.id is not null and not v_existing.active then
      raise exception 'Ya hay una pieza «%», desactivada. Vuelve a activarla en Inventario › Piezas impresas, o ponle otro nombre a la nueva.', v_existing.name;
    end if;

    if v_existing.id is not null then
      -- Created a moment ago, in another tab: the same name is the same part.
      v_part_id := v_existing.id;
    else
      insert into public.inventory_items (workspace_id, kind, name, unit)
      values (v_workspace, 'part', v_name, 'unidad')
      returning id into v_part_id;
      v_parts_created := v_parts_created + 1;
    end if;

    v_swaps := v_swaps || jsonb_build_object(to_jsonb(v_part ->> 'key')::text, to_jsonb(v_part_id::text)::text);
  end loop;

  v_index := p_first_index;
  for v_plate in select value from jsonb_array_elements(p_plates) loop
    -- The provisional ids are swapped wherever they appear: in the outputs and
    -- in what the file said each object was.
    v_text := v_plate::text;
    for v_swap in select key, value from jsonb_each_text(v_swaps) loop
      v_text := replace(v_text, v_swap.key, v_swap.value);
    end loop;
    v_plate := v_text::jsonb;

    insert into public.recipe_plates (
      workspace_id, recipe_id, plate_index, label, units_per_run, print_time_s,
      source_file_name, thumbnail_path, slicer_metadata
    )
    values (
      v_workspace,
      p_recipe_id,
      v_index,
      nullif(btrim(v_plate ->> 'label'), ''),
      (v_plate ->> 'units_per_run')::numeric,
      (v_plate ->> 'print_time_s')::integer,
      v_plate ->> 'source_file_name',
      v_plate ->> 'thumbnail_path',
      coalesce(v_plate -> 'slicer_metadata', '{}'::jsonb)
    )
    returning id into v_plate_id;

    insert into public.recipe_plate_filaments (
      workspace_id, recipe_plate_id, slot, material_id, color_hex, filament_sku_id, grams
    )
    select v_workspace, v_plate_id, (f ->> 'slot')::integer, nullif(f ->> 'material_id', '')::uuid,
           f ->> 'color_hex', nullif(f ->> 'filament_sku_id', '')::uuid, (f ->> 'grams')::numeric
    from jsonb_array_elements(coalesce(v_plate -> 'filaments', '[]'::jsonb)) f;

    v_position := 0;
    for v_part in select value from jsonb_array_elements(coalesce(v_plate -> 'outputs', '[]'::jsonb)) loop
      v_position := v_position + 1;
      insert into public.recipe_plate_outputs (
        workspace_id, recipe_plate_id, inventory_item_id, units_per_run, position
      )
      values (
        v_workspace, v_plate_id, (v_part ->> 'inventory_item_id')::uuid,
        (v_part ->> 'units_per_run')::numeric, v_position
      );
    end loop;

    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('created', jsonb_array_length(p_plates), 'parts_created', v_parts_created);
end;
$$;

grant execute on function app.import_plates(uuid, integer, jsonb, jsonb) to authenticated;

create or replace function public.import_plates(
  p_recipe_id uuid,
  p_first_index integer,
  p_new_parts jsonb,
  p_plates jsonb
)
returns jsonb
language sql
volatile
as $$
  select app.import_plates(p_recipe_id, p_first_index, p_new_parts, p_plates);
$$;

grant execute on function public.import_plates(uuid, integer, jsonb, jsonb) to authenticated;

comment on function app.import_plates(uuid, integer, jsonb, jsonb) is
  'Guarda las placas revisadas de un archivo laminado, con las piezas nuevas que se nombraron al revisarlo, sus filamentos y lo que sale de cada una. Todo o nada.';
