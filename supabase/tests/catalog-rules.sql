-- Las reglas del catálogo, probadas como el dueño y como el operador, con la
-- seguridad por fila de verdad.
--
-- La prueba de sintaxis no ve nada de esto, y un error de permisos pasa
-- todos los tests: «Duplicar» dejaba en la copia del operador una pieza que el
-- original no lleva, porque el borrado que la quitaba lo filtraba la
-- seguridad por fila sin error.
--
-- Corre sobre la base local con supabase/seed.sql cargado. Cada prueba va en
-- su propia transacción y se deshace: no deja datos.
--
--   docker exec -i supabase_db_pickypop psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/catalog-rules.sql
--
-- Una regla rota corta el script con «not ok N - …». Si pasan todas, cada una
-- imprime «ok N - …» (la salida es TAP, la que entiende pg_prove).

select '1..9' as plan;

-- 1. Duplicar como operador copia la receta tal como está.
begin;
set local role authenticated;
do $$
declare
  v_copy uuid;
  v_items text;
begin
  -- The owner takes the cap off the recipe (plate 2 also prints caps for
  -- another product) and asks for two bottles per unit.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
  delete from public.recipe_items
  where recipe_id = '00000000-0000-4000-8000-000000000093'
    and inventory_item_id = '00000000-0000-4000-8000-000000000162';
  update public.recipe_items set quantity_per_unit = 2
  where recipe_id = '00000000-0000-4000-8000-000000000093'
    and inventory_item_id = '00000000-0000-4000-8000-000000000161';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  v_copy := public.duplicate_variant('00000000-0000-4000-8000-000000000091', 'Copia del operador');

  select string_agg(i.name || ' x' || ri.quantity_per_unit::float8, ', ' order by i.name)
  into v_items
  from public.recipe_items ri
  join public.recipes r on r.id = ri.recipe_id
  join public.inventory_items i on i.id = ri.inventory_item_id
  where r.variant_id = v_copy;

  if v_items is distinct from 'Bolsa con etiqueta x1, Botella impresa x2, Dulces surtidos x66' then
    raise exception 'not ok 1 - la copia del operador lleva: %', v_items;
  end if;
end;
$$;
select 'ok 1 - Duplicar, como operador, copia la receta tal como está, sin la pieza que se le quitó' as result;
rollback;

-- 2. Duplicar como dueño: placas que sacan piezas y cómo se entrega.
begin;
set local role authenticated;
do $$
declare
  v_copy uuid;
  v_items integer;
  v_outputs integer;
  v_assembled boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
  v_copy := public.duplicate_variant('00000000-0000-4000-8000-000000000091', 'Copia del dueño');

  select r.assembled,
    (select count(*) from public.recipe_items ri where ri.recipe_id = r.id),
    (select count(*) from public.recipe_plate_outputs o join public.recipe_plates p on p.id = o.recipe_plate_id where p.recipe_id = r.id)
  into v_assembled, v_items, v_outputs
  from public.recipes r
  where r.variant_id = v_copy;

  if v_items <> 4 or v_outputs <> 2 or v_assembled is distinct from true then
    raise exception 'not ok 2 - la copia: % líneas, % salidas, armada %', v_items, v_outputs, v_assembled;
  end if;
end;
$$;
select 'ok 2 - Duplicar, como dueño, copia las placas con sus piezas y cómo se entrega' as result;
rollback;

-- 3. Una variante usada en un documento no se borra, ni por su producto.
begin;
set local role authenticated;
do $$
declare
  v_message text;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
  begin
    delete from public.catalog_products where id = '00000000-0000-4000-8000-000000000090';
  exception when sqlstate 'P0001' then
    v_message := sqlerrm;
  end;

  if v_message is null or v_message not like 'No se puede eliminar la variante%' then
    raise exception 'not ok 3 - borrar el producto dijo: %', coalesce(v_message, 'nada, y lo borró');
  end if;
end;
$$;
select 'ok 3 - Una variante en cotizaciones y pedidos no se borra, tampoco al borrar su producto' as result;
rollback;

-- 4. Una sola receta activa por variante, creada en un paso.
begin;
set local role authenticated;
do $$
declare
  v_message text;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  perform public.create_recipe('00000000-0000-4000-8000-000000000092');
  begin
    perform public.create_recipe('00000000-0000-4000-8000-000000000092');
  exception when sqlstate 'P0001' then
    v_message := sqlerrm;
  end;

  if v_message is null then
    raise exception 'not ok 4 - la segunda receta también se creó';
  end if;
  if (select count(*) from public.recipes where variant_id = '00000000-0000-4000-8000-000000000092' and active) <> 1 then
    raise exception 'not ok 4 - la variante quedó con otra cantidad de recetas activas';
  end if;
end;
$$;
select 'ok 4 - Crear receta dos veces, como operador, deja una sola activa' as result;
rollback;

-- 5. Las piezas se cuentan enteras; los insumos, no.
begin;
set local role authenticated;
do $$
declare
  v_refused integer := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  begin
    update public.recipe_plate_outputs set units_per_run = 1.5
    where recipe_plate_id = '00000000-0000-4000-8000-000000000094';
  exception when sqlstate 'P0001' then
    v_refused := v_refused + 1;
  end;
  begin
    update public.recipe_items set quantity_per_unit = 2.5
    where recipe_id = '00000000-0000-4000-8000-000000000093'
      and inventory_item_id = '00000000-0000-4000-8000-000000000161';
  exception when sqlstate 'P0001' then
    v_refused := v_refused + 1;
  end;
  update public.recipe_items ri set quantity_per_unit = 66.5
  from public.inventory_items i
  where i.id = ri.inventory_item_id
    and ri.recipe_id = '00000000-0000-4000-8000-000000000093'
    and i.name = 'Dulces surtidos';

  if v_refused <> 2 then
    raise exception 'not ok 5 - se rechazaron % de 2 fracciones de pieza', v_refused;
  end if;
end;
$$;
select 'ok 5 - Media pieza por corrida o por unidad se rechaza; 66.5 g de dulces, no' as result;
rollback;

-- 6. Un precio de cero regala el producto.
begin;
set local role authenticated;
do $$
declare
  v_refused integer := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  begin
    insert into public.price_tiers (workspace_id, variant_id, min_quantity, unit_price)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000091', 50, 0);
  exception when sqlstate 'P0001' then
    v_refused := v_refused + 1;
  end;
  begin
    update public.product_variants set list_price = 0 where id = '00000000-0000-4000-8000-000000000091';
  exception when sqlstate 'P0001' then
    v_refused := v_refused + 1;
  end;

  if v_refused <> 2 then
    raise exception 'not ok 6 - se rechazaron % de 2 precios en cero', v_refused;
  end if;
end;
$$;
select 'ok 6 - Un escalón o un precio de lista a S/ 0.00 se rechaza' as result;
rollback;

-- 7. Un escalón rige desde el día del taller, no desde el de Greenwich.
begin;
set local role authenticated;
do $$
declare
  v_from date;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  insert into public.price_tiers (workspace_id, variant_id, min_quantity, unit_price)
  values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000091', 50, 9)
  returning valid_from into v_from;

  if v_from is distinct from app.workspace_day('00000000-0000-4000-8000-000000000001', now()) then
    raise exception 'not ok 7 - el escalón rige desde %', v_from;
  end if;
end;
$$;
select 'ok 7 - Un escalón sin fecha rige desde hoy en el taller' as result;
rollback;

-- 8. Importar placas es todo o nada, también para el operador.
begin;
set local role authenticated;
do $$
declare
  v_message text;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  begin
    perform public.import_plates(
      '00000000-0000-4000-8000-000000000093', 3,
      '[{"key": "nueva:1", "name": "Pieza que no debe quedar"}]',
      '[{"label": "Bien", "units_per_run": 7, "print_time_s": 3600, "slicer_metadata": {}, "filaments": [],
         "outputs": [{"inventory_item_id": "nueva:1", "units_per_run": 7}]},
        {"label": "Mal", "units_per_run": 1, "print_time_s": 1800, "slicer_metadata": {}, "filaments": [],
         "outputs": [{"inventory_item_id": "nueva:1", "units_per_run": 1.5}]}]'
    );
  exception when others then
    v_message := sqlerrm;
  end;

  if v_message is null then
    raise exception 'not ok 8 - la segunda placa, con media pieza, se guardó';
  end if;
  if exists (select 1 from public.inventory_items where name = 'Pieza que no debe quedar')
    or exists (select 1 from public.recipe_plates where recipe_id = '00000000-0000-4000-8000-000000000093' and plate_index >= 3) then
    raise exception 'not ok 8 - quedaron restos de una importación que falló';
  end if;
end;
$$;
select 'ok 8 - Una importación que falla en la segunda placa no deja piezas ni placas' as result;
rollback;

-- 9. Antes de desactivar, la pantalla sabe qué queda abierto.
begin;
set local role authenticated;
do $$
declare
  v_usage jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ab","role":"authenticated"}', true);
  v_usage := public.variant_usage('00000000-0000-4000-8000-000000000091');

  if (v_usage ->> 'open_quotes')::integer <> 1 or (v_usage ->> 'quotes')::integer <> 2 then
    raise exception 'not ok 9 - variant_usage dijo %', v_usage;
  end if;
end;
$$;
select 'ok 9 - variant_usage cuenta las cotizaciones abiertas de la variante' as result;
rollback;
