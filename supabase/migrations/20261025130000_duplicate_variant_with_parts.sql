-- «Duplicar» con placas que sacan piezas, y la copia se entrega como el original (T2-05, T2-06).
--
-- 1. Desde 20261013110000, guardar lo que sale de una placa mete esa pieza en
--    la receta, una por producto. `duplicate_variant` copiaba primero las
--    salidas (el disparador ya ponía las piezas) y después las líneas de la
--    receta, que chocaban con las que acababan de entrar: 23505, y no se
--    copiaba nada. Fallaba justo con la variante principal del taller.
--    Ahora las líneas copiadas pisan las que puso el disparador, para que la
--    copia lleve lo que pedía el original (dos ganchos, si eran dos).
--
-- 2. La copia no traía `assembled`, que nace en true: un llavero que «sale tal
--    cual» se copiaba como «se arma», y para entregarlo había que armarlo.
--
-- Además copia la receta que la pantalla muestra (la activa de versión más
-- alta), y un nombre repetido se dice con palabras antes de chocar con el
-- índice.

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

    -- The outputs above already put their parts in, one per product. What the
    -- original asks for wins: it may take two of a part.
    insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
    select workspace_id, v_new_recipe, inventory_item_id, quantity_per_unit
    from public.recipe_items
    where recipe_id = v_recipe
    on conflict (recipe_id, inventory_item_id)
      do update set quantity_per_unit = excluded.quantity_per_unit;
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
  'Copia una variante con su receta (la activa, con cómo se entrega), sus placas, lo que produce cada placa, sus filamentos, sus piezas e insumos y su escalera de precios. El código interno no se copia.';
