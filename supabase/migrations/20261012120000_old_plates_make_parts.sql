-- Las recetas cargadas antes de las piezas impresas pasan a decir qué sacan.
--
-- Hasta ADR-019 una placa decía solo cuántos productos salían por corrida, y
-- el costeo entendía que cada unidad vendida se lleva una corrida dividida
-- entre esos productos: una botella de la placa de botellas y una tapa de la
-- de tapas. Las piezas impresas llegaron después, y con ellas
-- `recipe_plate_outputs`. A una receta vieja nadie le dijo qué pieza sale de
-- cada placa, y sin eso:
--
--   - el plan cree que no hay nada que imprimir y promete en una hora lo que
--     lleva siete,
--   - cerrar la impresión no deja nada en el estante,
--   - y «Armar» no tiene piezas que consumir.
--
-- Esto escribe lo que la receta ya quería decir: cada placa vieja produce su
-- pieza, tantas por corrida como productos decía, y la receta lleva una de
-- cada pieza por unidad. Es exactamente lo que el costeo venía suponiendo.
--
-- Dos variantes que imprimen la misma placa (la misma botella, rellena de
-- dulces o de chocolates) comparten la pieza: es la misma en el estante. Se
-- reconoce por ser del mismo producto, con la misma etiqueta, el mismo
-- rendimiento, el mismo tiempo y los mismos filamentos. Una variante de otro
-- color tiene otros filamentos, y por eso su pieza es otra.
--
-- Una receta que ya lista alguna pieza impresa se armó a mano con el modelo
-- nuevo, y no se toca.

do $$
declare
  v_plate record;
  v_part uuid;
  v_name text;
  -- Signature of the plate -> the part made for it. A jsonb, not a temporary
  -- table: the hosted project does not let a migration rely on one.
  v_parts jsonb := '{}'::jsonb;
begin
  for v_plate in
    select
      rp.id,
      rp.workspace_id,
      rp.recipe_id,
      rp.units_per_run,
      coalesce(nullif(btrim(rp.label), ''), 'Placa ' || rp.plate_index) as label,
      p.name as product_name,
      v.name as variant_name,
      concat_ws(
        '|',
        p.id,
        lower(coalesce(nullif(btrim(rp.label), ''), 'Placa ' || rp.plate_index)),
        rp.units_per_run,
        rp.print_time_s,
        (
          select string_agg(concat_ws(':', f.slot, f.filament_sku_id, f.material_id, lower(f.color_hex), f.grams), ',' order by f.slot)
          from public.recipe_plate_filaments f
          where f.recipe_plate_id = rp.id
        )
      ) as signature
    from public.recipe_plates rp
    join public.recipes r on r.id = rp.recipe_id and r.active
    join public.product_variants v on v.id = r.variant_id
    join public.catalog_products p on p.id = v.product_id
    where rp.units_per_run > 0
      and not exists (
        select 1 from public.recipe_plate_outputs o where o.recipe_plate_id = rp.id
      )
      and not exists (
        select 1
        from public.recipe_items ri
        join public.inventory_items i on i.id = ri.inventory_item_id
        where ri.recipe_id = rp.recipe_id and i.kind = 'part'
      )
    order by p.name, v.name, rp.plate_index
  loop
    v_part := (v_parts ->> v_plate.signature)::uuid;

    if v_part is null then
      -- "Botella de poción — Tapas". Only when another part already has that
      -- name does the variant go in it too.
      v_name := v_plate.product_name || ' — ' || v_plate.label;
      if exists (
        select 1 from public.inventory_items
        where workspace_id = v_plate.workspace_id and kind = 'part' and name = v_name
      ) then
        v_name := v_plate.product_name || ' · ' || v_plate.variant_name || ' — ' || v_plate.label;
      end if;
      if exists (
        select 1 from public.inventory_items
        where workspace_id = v_plate.workspace_id and kind = 'part' and name = v_name
      ) then
        v_name := v_name || ' (' || left(v_plate.id::text, 4) || ')';
      end if;

      insert into public.inventory_items (workspace_id, kind, name, unit, note)
      values (
        v_plate.workspace_id, 'part', v_name, 'unidad',
        'Creada al publicar las piezas impresas, desde la placa «' || v_plate.label
          || '» de la receta. Cámbiale el nombre y ponle su foto si hace falta.'
      )
      returning id into v_part;

      v_parts := v_parts || jsonb_build_object(v_plate.signature, v_part);
    end if;

    insert into public.recipe_plate_outputs (workspace_id, recipe_plate_id, inventory_item_id, units_per_run)
    values (v_plate.workspace_id, v_plate.id, v_part, v_plate.units_per_run);

    insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
    values (v_plate.workspace_id, v_plate.recipe_id, v_part, 1)
    on conflict (recipe_id, inventory_item_id) do nothing;
  end loop;
end;
$$;
