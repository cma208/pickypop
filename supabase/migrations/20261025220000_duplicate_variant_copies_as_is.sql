-- «Duplicar» copia la receta tal como está, también cuando duplica el operador.
--
-- 20261025180000 dejaba que el disparador de las salidas (20261013110000)
-- metiera en la copia las piezas de sus placas, y después quitaba las que el
-- original ya no llevaba con un delete. Pero borrar líneas de una receta es
-- solo del dueño (recipe_items_delete usa is_owner): cuando duplicaba el
-- operador, la seguridad por fila dejaba el delete en cero filas, sin error,
-- y la copia salía con una pieza que el original no lleva. Armar la
-- consumía, y el costo y el plan de la copia eran otros. Nadie se enteraba.
--
-- Ahora la copia no depende de un borrado que alguien puede no tener
-- permitido: mientras se copian las salidas, el disparador no agrega nada, y
-- las líneas de la receta se copian tal cual del original. Fuera de la copia,
-- el disparador hace lo de siempre.

create or replace function app.plate_output_joins_recipe()
returns trigger
language plpgsql
as $$
begin
  -- A copy brings the original's recipe lines as they are, including what
  -- someone took off on purpose: adding them here would put that back.
  if current_setting('app.copying_recipe', true) = 'on' then
    return new;
  end if;

  insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
  select new.workspace_id, rp.recipe_id, new.inventory_item_id, 1
  from public.recipe_plates rp
  where rp.id = new.recipe_plate_id
  on conflict (recipe_id, inventory_item_id) do nothing;
  return new;
end;
$$;

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
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_new_variant uuid;
  v_recipe uuid;
  v_new_recipe uuid;
  v_plate record;
  v_new_plate uuid;
begin
  if v_name = '' then
    raise exception 'Escribe el nombre de la copia.';
  end if;

  select workspace_id, product_id into v_workspace, v_product
  from public.product_variants
  where id = p_variant_id;

  if v_workspace is null then
    raise exception 'Esa variante ya no existe. Recarga la página.';
  end if;

  if exists (
    select 1 from public.product_variants
    where product_id = v_product
      and app.catalog_name_key(name) = app.catalog_name_key(v_name)
  ) then
    raise exception 'Ya hay una variante «%» en este producto. Ponle otro nombre a la copia.', v_name;
  end if;

  insert into public.product_variants (
    workspace_id, product_id, name, options, sku_code, list_price, min_order_units, active, image_path
  )
  select workspace_id, product_id, v_name, options, null, nullif(list_price, 0), min_order_units, active, image_path
  from public.product_variants
  where id = p_variant_id
  returning id into v_new_variant;

  -- El código interno no se copia a propósito: dos cajas del estante con la
  -- misma etiqueta es justo lo que el código existe para evitar.

  select id into v_recipe
  from public.recipes
  where variant_id = p_variant_id
  order by active desc, version desc
  limit 1;

  if v_recipe is not null then
    insert into public.recipes (
      workspace_id, variant_id, version, valid_from, setup_minutes, minutes_per_unit, note, active, assembled
    )
    select workspace_id, v_new_variant, 1, valid_from, setup_minutes, minutes_per_unit, note, active, assembled
    from public.recipes
    where id = v_recipe
    returning id into v_new_recipe;

    -- Transaction-local, and switched off again below, so outputs added later
    -- in the same transaction still join their recipe.
    perform set_config('app.copying_recipe', 'on', true);

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

    perform set_config('app.copying_recipe', 'off', true);

    insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
    select workspace_id, v_new_recipe, inventory_item_id, quantity_per_unit
    from public.recipe_items
    where recipe_id = v_recipe;
  end if;

  -- A price of zero gave the product away and is refused since
  -- 20261025140000: the copy goes without it rather than not at all.
  insert into public.price_tiers (workspace_id, variant_id, min_quantity, unit_price, valid_from, note)
  select workspace_id, v_new_variant, min_quantity, unit_price, valid_from, note
  from public.price_tiers
  where variant_id = p_variant_id
    and unit_price > 0;

  return v_new_variant;
end;
$$;

comment on function app.duplicate_variant(uuid, text) is
  'Copia una variante con su receta (la activa, con cómo se entrega), sus placas, lo que produce cada placa, sus filamentos, sus piezas e insumos tal como están en el original y su escalera de precios. El código interno no se copia.';
