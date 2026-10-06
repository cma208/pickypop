-- Duplicar una variante.
--
-- Dos variantes de la misma botella se diferencian en el color y en poco más,
-- y hoy la segunda obliga a volver a cargar la receta entera: cada placa, cada
-- gramo, cada insumo y la escalera de precios. Es el trabajo que más se repite
-- en el catálogo y el que más fácil sale mal, porque un gramo mal copiado no
-- se nota hasta que el costo miente.
--
-- Va en la base y no en la aplicación porque son seis tablas: a medio copiar
-- queda una variante con media receta, que es peor que no tenerla.

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
        source_file_name, thumbnail_path, slicer_metadata, produces_item_id
      )
      values (
        v_plate.workspace_id, v_new_recipe, v_plate.label, v_plate.plate_index, v_plate.units_per_run,
        v_plate.print_time_s, v_plate.source_file_name, v_plate.thumbnail_path, v_plate.slicer_metadata,
        v_plate.produces_item_id
      )
      returning id into v_new_plate;

      insert into public.recipe_plate_filaments (
        workspace_id, recipe_plate_id, slot, material_id, color_hex, filament_sku_id, grams
      )
      select workspace_id, v_new_plate, slot, material_id, color_hex, filament_sku_id, grams
      from public.recipe_plate_filaments
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

grant execute on function app.duplicate_variant(uuid, text) to authenticated;

comment on function app.duplicate_variant(uuid, text) is
  'Copia una variante con su receta, sus placas, sus filamentos, sus insumos y su escalera de precios. El código interno no se copia.';
