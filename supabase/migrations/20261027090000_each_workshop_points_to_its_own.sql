-- Lo de un taller apunta solo a lo de su taller (ADR-025, punto 10).
--
-- Una llave foránea solo dice que la fila a la que apunta existe, en el
-- taller que sea. La política de cada tabla mira el taller de la fila que se
-- escribe, no el de la fila a la que apunta. Así, alguien de otro taller (y
-- cualquiera que se registre puede crear uno) podía colgar por la API una
-- línea de su taller en la receta de este, un pedido suyo en la oportunidad
-- de este, una línea en el pedido de este. Mientras todo corría con la
-- seguridad por fila de quien llama, este taller no veía esas filas y no
-- pasaba nada. Desde 20261027100000, `complete_print_job`, `assemble_product`,
-- `count_shelf` y `deliver_order` corren como su dueño: ven todas las filas,
-- y lo mismo los disparadores y las vistas que se ejecutan dentro de ellas.
-- La revisión lo probó: una línea de receta colgada desde otro taller hacía
-- que armar aquí gastara cinco imanes de más.
--
-- Por eso esta migración va antes que esa, en el mismo despliegue:
--
-- 1. **Primero mira lo que ya hay.** Si alguna fila apunta a algo de otro
--    taller, se detiene y dice cuáles, sin cambiar nada: con esas filas, las
--    funciones que corren como su dueño no son seguras, y es mejor que la
--    aplicación siga como estaba hasta revisarlas. En la base local y en la
--    semilla no hay ninguna.
-- 2. **Después, una red para lo que venga.** Un disparador en cada tabla que
--    apunta a otra rechaza la fila cuyo destino es de otro taller, la escriba
--    quien la escriba, consola incluida (`app.points_within_its_workshop`).
--    Con eso, todo lo que una función lee siguiendo una llave es de su taller.
--
-- Lo que ya se vigilaba en otro sitio no lleva este disparador:
--
-- * `stock_movements` (rollo y artículo): `stock_movements_stay_in_their_workshop`,
--   en 20261027100000.
-- * `print_job_filaments` (trabajo y rollo): `print_job_filaments_roll_in_use`,
--   en 20261027130000.
-- * `recipe_plate_outputs` (placa y pieza): `check_plate_output`, desde
--   20261010110000.
-- * `transactions`: las cuentas tienen llaves que llevan el taller, y la
--   categoría, el pedido y la compra los revisa `guard_ledger_entry`. Su
--   mantenimiento (`maintenance_log_id`) sí lleva este disparador.
--
-- `supabase/tests/permisos.sql` comprueba que toda llave entre tablas de un
-- taller tenga su guardia: una tabla nueva que apunte a otra sin ella hace
-- fallar la prueba.
--
-- Solo agrega una función y disparadores de insert y de cambio de las llaves:
-- nada de lo guardado se vuelve a escribir.

-- ------------------------------------------------------ lo que ya existe

do $$
declare
  v_relation record;
  v_count bigint;
  v_found text := '';
begin
  -- Every key between two tables of a workshop that does not carry the
  -- workshop itself: those already keep both rows in one.
  for v_relation in
    select format('%I.%I', cn.nspname, cc.relname) as child,
           format('%I.%I', pn.nspname, pc.relname) as parent,
           cc.relname as child_name,
           pc.relname as parent_name,
           ca.attname as column_name
    from pg_constraint c
    join pg_class cc on cc.oid = c.conrelid
    join pg_namespace cn on cn.oid = cc.relnamespace
    join pg_class pc on pc.oid = c.confrelid
    join pg_namespace pn on pn.oid = pc.relnamespace
    cross join lateral unnest(c.conkey, c.confkey) as k (child_attnum, parent_attnum)
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = k.child_attnum
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum
    where c.contype = 'f'
      and cn.nspname = 'public'
      and pn.nspname = 'public'
      and pa.attname = 'id'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'workspace_id' and not a.attisdropped
      )
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.confrelid and a.attname = 'workspace_id' and not a.attisdropped
      )
      and not exists (
        select 1
        from unnest(c.confkey) as r (attnum)
        join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = r.attnum
        where ra.attname = 'workspace_id'
      )
    order by 3, 5
  loop
    execute format(
      'select count(*) from %s x join %s p on p.id = x.%I where p.workspace_id <> x.workspace_id',
      v_relation.child, v_relation.parent, v_relation.column_name
    ) into v_count;

    if v_count > 0 then
      v_found := v_found || format(E'\n  %s.%s → %s: %s',
        v_relation.child_name, v_relation.column_name, v_relation.parent_name,
        case when v_count = 1 then '1 fila' else v_count || ' filas' end);
    end if;
  end loop;

  if v_found <> '' then
    raise exception using
      message = format(
        'Hay filas que apuntan a algo de otro taller, y con ellas esta migración no sigue (no cambió nada):%s',
        v_found
      ),
      hint = 'Ninguna pantalla escribe filas así: alguien las agregó por la API desde otro taller. '
          || 'Para ver las de cada renglón (tabla.columna → destino): select x.* from public.<tabla> x '
          || 'join public.<destino> p on p.id = x.<columna> where p.workspace_id <> x.workspace_id. '
          || 'Revísalas y bórralas desde la consola SQL, y vuelve a migrar.';
  end if;
end;
$$;

-- ------------------------------------------------------- lo que venga

/*
 * What a row of a given table is called, to name it in a refusal.
 */
create or replace function app.table_noun(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_table
    when 'assets' then 'Ese activo'
    when 'brands' then 'Esa marca'
    when 'catalog_products' then 'Ese producto del catálogo'
    when 'customers' then 'Ese cliente'
    when 'filament_finishes' then 'Ese acabado'
    when 'filament_skus' then 'Ese filamento'
    when 'gift_categories' then 'Esa categoría de regalo'
    when 'inventory_items' then 'Ese artículo'
    when 'maintenance_logs' then 'Ese mantenimiento'
    when 'maintenance_plans' then 'Ese plan de mantenimiento'
    when 'materials' then 'Ese material'
    when 'opportunities' then 'Esa oportunidad'
    when 'order_deliveries' then 'Esa entrega'
    when 'order_lines' then 'Esa línea de pedido'
    when 'orders' then 'Ese pedido'
    when 'print_jobs' then 'Ese trabajo de impresión'
    when 'printers' then 'Esa impresora'
    when 'product_variants' then 'Ese producto'
    when 'purchase_lines' then 'Esa línea de compra'
    when 'purchases' then 'Esa compra'
    when 'quote_lines' then 'Esa línea de cotización'
    when 'quote_requests' then 'Esa solicitud de cotización'
    when 'quotes' then 'Esa cotización'
    when 'recipe_plates' then 'Esa placa'
    when 'recipes' then 'Esa receta'
    when 'sales_channels' then 'Ese canal de venta'
    when 'suppliers' then 'Ese proveedor'
    when 'transaction_categories' then 'Esa categoría'
    when 'transactions' then 'Ese movimiento de dinero'
    else 'Eso'
  end;
$$;

/*
 * A row points only to rows of its own workshop. The trigger gets its keys as
 * pairs of arguments: the column, and the table it points to. Runs as its
 * owner, so it sees the row pointed to wherever it lives: under row level
 * security a row of another workshop would look like one that does not exist.
 * One that does not exist is the foreign key's to say.
 */
create or replace function app.points_within_its_workshop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_i integer := 0;
  v_value text;
  v_workspace uuid;
begin
  while v_i < tg_nargs loop
    v_value := v_row ->> tg_argv[v_i];

    if v_value is not null then
      execute format('select p.workspace_id from public.%I p where p.id = $1', tg_argv[v_i + 1])
        into v_workspace
        using v_value::uuid;

      if v_workspace <> new.workspace_id then
        raise exception '% es de otro taller: aquí solo se usa lo de este taller. Recarga la página y vuelve a elegirlo.',
          app.table_noun(tg_argv[v_i + 1]);
      end if;
    end if;

    v_i := v_i + 2;
  end loop;

  return new;
end;
$$;

revoke execute on function app.points_within_its_workshop() from public, anon;

comment on function app.points_within_its_workshop() is
  'Disparador: la fila apunta solo a filas de su taller. Recibe pares de argumentos (columna, tabla a la que apunta). Corre como su dueño para ver la fila de destino donde esté.';

-- Inventory and filament.
create trigger filament_skus_same_workshop
  before insert or update of workspace_id, brand_id, finish_id, material_id on public.filament_skus
  for each row execute function app.points_within_its_workshop(
    'brand_id', 'brands', 'finish_id', 'filament_finishes', 'material_id', 'materials');

create trigger inventory_items_same_workshop
  before insert or update of workspace_id, product_variant_id on public.inventory_items
  for each row execute function app.points_within_its_workshop('product_variant_id', 'product_variants');

create trigger item_movement_requests_same_workshop
  before insert or update of workspace_id, inventory_item_id on public.item_movement_requests
  for each row execute function app.points_within_its_workshop('inventory_item_id', 'inventory_items');

create trigger purchases_same_workshop
  before insert or update of workspace_id, supplier_id on public.purchases
  for each row execute function app.points_within_its_workshop('supplier_id', 'suppliers');

create trigger purchase_lines_same_workshop
  before insert or update of workspace_id, purchase_id, filament_sku_id, inventory_item_id on public.purchase_lines
  for each row execute function app.points_within_its_workshop(
    'purchase_id', 'purchases', 'filament_sku_id', 'filament_skus', 'inventory_item_id', 'inventory_items');

create trigger purchase_payment_requests_same_workshop
  before insert or update of workspace_id, transaction_id on public.purchase_payment_requests
  for each row execute function app.points_within_its_workshop('transaction_id', 'transactions');

create trigger spools_same_workshop
  before insert or update of workspace_id, filament_sku_id, purchase_line_id on public.spools
  for each row execute function app.points_within_its_workshop(
    'filament_sku_id', 'filament_skus', 'purchase_line_id', 'purchase_lines');

-- Printers and their upkeep.
create trigger printers_same_workshop
  before insert or update of workspace_id, asset_id on public.printers
  for each row execute function app.points_within_its_workshop('asset_id', 'assets');

create trigger printer_components_same_workshop
  before insert or update of workspace_id, printer_id on public.printer_components
  for each row execute function app.points_within_its_workshop('printer_id', 'printers');

create trigger maintenance_plans_same_workshop
  before insert or update of workspace_id, printer_id on public.maintenance_plans
  for each row execute function app.points_within_its_workshop('printer_id', 'printers');

create trigger maintenance_logs_same_workshop
  before insert or update of workspace_id, plan_id, printer_id on public.maintenance_logs
  for each row execute function app.points_within_its_workshop(
    'plan_id', 'maintenance_plans', 'printer_id', 'printers');

create trigger incidents_same_workshop
  before insert or update of workspace_id, print_job_id, printer_id on public.incidents
  for each row execute function app.points_within_its_workshop(
    'print_job_id', 'print_jobs', 'printer_id', 'printers');

-- The catalogue and its recipes.
create trigger product_variants_same_workshop
  before insert or update of workspace_id, product_id on public.product_variants
  for each row execute function app.points_within_its_workshop('product_id', 'catalog_products');

create trigger product_media_same_workshop
  before insert or update of workspace_id, product_id, variant_id on public.product_media
  for each row execute function app.points_within_its_workshop(
    'product_id', 'catalog_products', 'variant_id', 'product_variants');

create trigger price_tiers_same_workshop
  before insert or update of workspace_id, variant_id on public.price_tiers
  for each row execute function app.points_within_its_workshop('variant_id', 'product_variants');

create trigger recipes_same_workshop
  before insert or update of workspace_id, variant_id on public.recipes
  for each row execute function app.points_within_its_workshop('variant_id', 'product_variants');

create trigger recipe_items_same_workshop
  before insert or update of workspace_id, recipe_id, inventory_item_id on public.recipe_items
  for each row execute function app.points_within_its_workshop(
    'recipe_id', 'recipes', 'inventory_item_id', 'inventory_items');

create trigger recipe_plates_same_workshop
  before insert or update of workspace_id, recipe_id on public.recipe_plates
  for each row execute function app.points_within_its_workshop('recipe_id', 'recipes');

create trigger recipe_plate_filaments_same_workshop
  before insert or update of workspace_id, recipe_plate_id, filament_sku_id, material_id on public.recipe_plate_filaments
  for each row execute function app.points_within_its_workshop(
    'recipe_plate_id', 'recipe_plates', 'filament_sku_id', 'filament_skus', 'material_id', 'materials');

-- Sales.
create trigger opportunities_same_workshop
  before insert or update of workspace_id, customer_id on public.opportunities
  for each row execute function app.points_within_its_workshop('customer_id', 'customers');

create trigger opportunity_stage_history_same_workshop
  before insert or update of workspace_id, opportunity_id on public.opportunity_stage_history
  for each row execute function app.points_within_its_workshop('opportunity_id', 'opportunities');

create trigger quote_requests_same_workshop
  before insert or update of workspace_id, channel_id, customer_id on public.quote_requests
  for each row execute function app.points_within_its_workshop(
    'channel_id', 'sales_channels', 'customer_id', 'customers');

create trigger quotes_same_workshop
  before insert or update of workspace_id, channel_id, customer_id, opportunity_id, parent_quote_id, request_id on public.quotes
  for each row execute function app.points_within_its_workshop(
    'channel_id', 'sales_channels', 'customer_id', 'customers', 'opportunity_id', 'opportunities',
    'parent_quote_id', 'quotes', 'request_id', 'quote_requests');

create trigger quote_lines_same_workshop
  before insert or update of workspace_id, quote_id, variant_id on public.quote_lines
  for each row execute function app.points_within_its_workshop(
    'quote_id', 'quotes', 'variant_id', 'product_variants');

create trigger orders_same_workshop
  before insert or update of workspace_id, channel_id, customer_id, gift_category_id, opportunity_id, quote_id on public.orders
  for each row execute function app.points_within_its_workshop(
    'channel_id', 'sales_channels', 'customer_id', 'customers', 'gift_category_id', 'gift_categories',
    'opportunity_id', 'opportunities', 'quote_id', 'quotes');

create trigger order_lines_same_workshop
  before insert or update of workspace_id, order_id, quote_line_id, variant_id on public.order_lines
  for each row execute function app.points_within_its_workshop(
    'order_id', 'orders', 'quote_line_id', 'quote_lines', 'variant_id', 'product_variants');

create trigger order_status_history_same_workshop
  before insert or update of workspace_id, order_id on public.order_status_history
  for each row execute function app.points_within_its_workshop('order_id', 'orders');

create trigger order_priority_changes_same_workshop
  before insert or update of workspace_id, order_id on public.order_priority_changes
  for each row execute function app.points_within_its_workshop('order_id', 'orders');

create trigger order_payment_keys_same_workshop
  before insert or update of workspace_id, order_id, transaction_id on public.order_payment_keys
  for each row execute function app.points_within_its_workshop(
    'order_id', 'orders', 'transaction_id', 'transactions');

create trigger order_deliveries_same_workshop
  before insert or update of workspace_id, order_id on public.order_deliveries
  for each row execute function app.points_within_its_workshop('order_id', 'orders');

create trigger order_delivery_lines_same_workshop
  before insert or update of workspace_id, delivery_id, order_line_id on public.order_delivery_lines
  for each row execute function app.points_within_its_workshop(
    'delivery_id', 'order_deliveries', 'order_line_id', 'order_lines');

-- Production.
create trigger print_jobs_same_workshop
  before insert or update of workspace_id, order_line_id, printer_id, recipe_plate_id on public.print_jobs
  for each row execute function app.points_within_its_workshop(
    'order_line_id', 'order_lines', 'printer_id', 'printers', 'recipe_plate_id', 'recipe_plates');

-- Money and settings.
create trigger transactions_same_workshop
  before insert or update of workspace_id, maintenance_log_id on public.transactions
  for each row execute function app.points_within_its_workshop('maintenance_log_id', 'maintenance_logs');

create trigger workshop_settings_same_workshop
  before insert or update of workspace_id, order_payment_category_id, purchase_payment_category_id on public.workshop_settings
  for each row execute function app.points_within_its_workshop(
    'order_payment_category_id', 'transaction_categories', 'purchase_payment_category_id', 'transaction_categories');
