-- Local development data. Runs with "supabase start" and "supabase db reset".
--
-- Plain SQL only: the CLI sends this file straight to PostgreSQL, so psql
-- meta-commands such as \set are not available. Ids are written as literals.
--
-- It mirrors the real workshop as far as it is known today. What is still a
-- guess is marked with TODO.

insert into public.workspaces (id, name, currency, timezone, tax_regime)
values ('00000000-0000-4000-8000-000000000001', 'Pickypop', 'PEN', 'America/Lima', 'none');

-- Parameters. See docs/02-dominio.md, section 2.2.
insert into public.cost_profiles (
  workspace_id, valid_from, material_waste_rate, failure_rate, labor_rate_per_hour,
  energy_rate_per_kwh, target_margin, min_order_price, rounding_step, igv_rate,
  material_valuation, note
) values (
  '00000000-0000-4000-8000-000000000001', date '2026-09-01', 0.0300, 0.1000, 15.00,
  0.7556, 0.5000, 5.00, 0.50, 0.1800,
  'weighted_avg',
  'Perfil inicial. Luz real (Luz del Sur BT5B) y hora de trabajo derivada del sueldo. TODO: precio mínimo por pedido.'
);

-- ------------------------------------------------------------- filament

insert into public.brands (id, workspace_id, name) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Krear3D');

insert into public.materials (id, workspace_id, code, density_g_cm3, hygroscopic, abrasive) values
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000001', 'PLA', 1.24, false, false);

-- K3D is not in the Bambu profiles, so a sliced file will report it as a
-- generic PLA: spools are matched by colour until tray_info_idx is mapped once.
insert into public.filament_skus (
  id, workspace_id, brand_id, material_id, finish, color_name, color_hex,
  net_weight_g, min_stock_g, replacement_cost_per_kg
) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'K3D', 'Rojo', '#DE4343', 1000, 500, 50.00),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'K3D', 'Rosado', '#F55A74', 1000, 500, 50.00),
  -- The lime green batch came in expensive; reordering it at the same shop
  -- should cost about S/ 60, which is what quotes should assume.
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'K3D', 'Verde lima', '#61C680', 1000, 500, 60.00);

insert into public.suppliers (id, workspace_id, name, note) values
  ('00000000-0000-4000-8000-000000000050', '00000000-0000-4000-8000-000000000001',
   'Tienda local', 'TODO: nombre real de la tienda');

-- Purchase of the red and pink spools, at S/ 50 each.
insert into public.purchases (id, workspace_id, supplier_id, purchased_at, note) values
  ('00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000050', date '2026-09-01', 'Compra inicial');

insert into public.purchase_lines (id, workspace_id, purchase_id, filament_sku_id, quantity, unit_price) values
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000031', 1, 50.00),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000032', 1, 50.00);

-- The lime green spool: a test batch that came in at S/ 75.
insert into public.purchases (id, workspace_id, supplier_id, purchased_at, note) values
  ('00000000-0000-4000-8000-000000000070', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000050', date '2026-09-10', 'Lote de prueba, salió más caro');

insert into public.purchase_lines (id, workspace_id, purchase_id, filament_sku_id, quantity, unit_price) values
  ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000070', '00000000-0000-4000-8000-000000000033', 1, 75.00);

insert into public.spools (
  id, workspace_id, filament_sku_id, purchase_line_id, code, initial_weight_g, unit_cost, status
) values
  ('00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000061',
   'ROJO-01', 1000, 50.00, 'open'),
  ('00000000-0000-4000-8000-000000000082', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000062',
   'ROSA-01', 1000, 50.00, 'open'),
  ('00000000-0000-4000-8000-000000000083', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000071',
   'VERDE-01', 1000, 75.00, 'open');

-- Stock only exists because of its movements.
insert into public.stock_movements (workspace_id, type, spool_id, quantity, unit_cost, source_type, note) values
  ('00000000-0000-4000-8000-000000000001', 'purchase', '00000000-0000-4000-8000-000000000081',
   1000, 0.050, 'purchase', 'Ingreso del rollo'),
  ('00000000-0000-4000-8000-000000000001', 'purchase', '00000000-0000-4000-8000-000000000082',
   1000, 0.050, 'purchase', 'Ingreso del rollo'),
  ('00000000-0000-4000-8000-000000000001', 'purchase', '00000000-0000-4000-8000-000000000083',
   1000, 0.075, 'purchase', 'Ingreso del rollo');

-- ------------------------------------------------------- other supplies

insert into public.inventory_items (
  workspace_id, kind, name, unit, min_stock, perishable, standard_cost, note
) values
  -- S/ 15 a kilo, about 66 g go inside each product: roughly S/ 0.99 a unit.
  ('00000000-0000-4000-8000-000000000001', 'supply', 'Dulces surtidos', 'g', 1000, true, 0.0150,
   'S/ 15.00 el kilo. 66 g por producto. TODO: registrar el vencimiento de cada lote'),
  ('00000000-0000-4000-8000-000000000001', 'packaging', 'Bolsa con etiqueta', 'unidad', 50, false, 0.5000,
   'TODO: costo real, todavía están viendo opciones de empaque'),
  ('00000000-0000-4000-8000-000000000001', 'spare_part', 'Boquilla 0.4 acero', 'unidad', 1, false, null, null);

-- --------------------------------------------------------------- printer

insert into public.assets (id, workspace_id, name, cost, useful_life_hours, note) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000001',
   'Bambu Lab A1 mini + AMS lite', 1500.00, 5000,
   'TODO: vida útil estimada. A 2,000 h al año se cumple en unos 2.5 años');

insert into public.printers (
  id, workspace_id, asset_id, name, model, avg_power_w, initial_hours,
  maintenance_budget_per_year, expected_hours_per_year, note
) values (
  '00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000040', 'A1 mini', 'Bambu Lab A1 mini', 57, 175,
  240.00, 2000.00,
  '57 W es el promedio de la wiki de Bambu. 175 h en 32 días, unas 5.5 h al día.'
);

-- Preventive plan from docs/02-dominio.md, section 2.4.
insert into public.maintenance_plans (workspace_id, printer_id, task, every_hours, every_days, checklist) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
   'Limpiar la placa y retirar la purga', null, 1,
   '["Lavar la placa con agua y jabón neutro", "No tocarla con los dedos", "Botar los restos de purga"]'::jsonb),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
   'Limpieza semanal del hotend, cortador y ventiladores', null, 7,
   '["Retirar restos alrededor del hotend", "Limpiar la zona de purga y el cortador", "Quitar polvo de los ventiladores"]'::jsonb),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
   'Limpiar y lubricar los ejes', 150, null,
   '["Limpiar las guías", "Lubricar según la guía oficial"]'::jsonb),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
   'Revisión mensual', null, 30,
   '["Revisar correas", "Revisar tornillería", "Revisar cables en movimiento", "Limpiar engranajes del extrusor", "Revisar tubos del AMS lite"]'::jsonb),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
   'Renovar la grasa del eje Z', null, 90,
   '["Limpiar el husillo", "Aplicar grasa nueva"]'::jsonb);

-- ------------------------------------------------------------- catalogue
--
-- The potion bottle, as described so far. What is still a guess is marked TODO.

insert into public.catalog_products (
  id, workspace_id, name, slug, description, category, tags, status, bot_visible,
  specs, lead_time_days
) values (
  '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000001',
  'Botella de poción', 'botella-de-pocion',
  'Botella decorativa impresa en 3D que se entrega llena de dulces.',
  'Halloween', '{halloween,regalo,dulces}', 'published', true,
  '{"acabado": "termoformado", "uso": "decorativo", "contenido": "dulces envueltos"}'::jsonb,
  3
);

insert into public.product_variants (
  id, workspace_id, product_id, name, options, list_price, min_order_units
) values
  ('00000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000090', 'Con dulces surtidos',
   '{"relleno": "dulces surtidos"}'::jsonb, 10.00, null),
  -- TODO: precio y relleno reales de la versión premium (entre S/ 15 y S/ 20).
  ('00000000-0000-4000-8000-000000000092', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000090', 'Con chocolates premium',
   '{"relleno": "chocolates"}'::jsonb, 18.00, null);

insert into public.recipes (
  id, workspace_id, variant_id, version, setup_minutes, minutes_per_unit, note
) values (
  '00000000-0000-4000-8000-000000000093', '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000091', 1, 10.00, 5.00,
  'Armado rápido: es termoformado, no hay limpieza. TODO: confirmar los minutos de preparación del lote.'
);

insert into public.recipe_plates (
  id, workspace_id, recipe_id, label, plate_index, units_per_run, print_time_s, source_file_name
) values
  ('00000000-0000-4000-8000-000000000094', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000093', 'Botella', 1, 1, 2586,
   'Thermoformed_potion_bottle_-_Honeycomb_AMS_Love potion.gcode.3mf'),
  -- TODO: datos reales de la placa de tapas; por ahora es un supuesto.
  ('00000000-0000-4000-8000-000000000095', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000093', 'Tapas', 2, 9, 1200, null);

insert into public.recipe_plate_filaments (
  workspace_id, recipe_plate_id, slot, material_id, color_hex, filament_sku_id, grams
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000094', 1,
   '00000000-0000-4000-8000-000000000020', '#F55A74', '00000000-0000-4000-8000-000000000032', 5.69),
  -- TODO: no hay rollo negro registrado todavía, por eso va sin SKU.
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000094', 3,
   '00000000-0000-4000-8000-000000000020', '#000000', null, 4.63),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000094', 4,
   '00000000-0000-4000-8000-000000000020', '#DE4343', '00000000-0000-4000-8000-000000000031', 1.02),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000095', 1,
   '00000000-0000-4000-8000-000000000020', '#000000', null, 15.00);

insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
select '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000093', i.id,
       case i.name when 'Dulces surtidos' then 66 else 1 end
from public.inventory_items i
where i.workspace_id = '00000000-0000-4000-8000-000000000001'
  and i.name in ('Dulces surtidos', 'Bolsa con etiqueta');

-- Unit price by quantity. One-off units are dearer because a whole plate of
-- caps gets printed for them, so they should come out of stock.
insert into public.price_tiers (workspace_id, variant_id, min_quantity, unit_price, note) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000091', 1, 10.00, 'Venta por unidad, desde stock'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000091', 5, 9.00, 'Lote pequeño'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000091', 10, 8.50, 'Lote grande');

-- --------------------------------------------------- local dev account
--
-- Only for local development: in production people sign in with Google and
-- this block never runs, because seeds are not applied to a hosted project.

-- GoTrue reads these token columns as plain strings, so they must be empty
-- text and never NULL, or signing in fails with "Database error querying schema".
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-0000000000aa',
  'authenticated', 'authenticated', 'dev@pickypop.test',
  extensions.crypt('pickypop123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000aa',
  '{"sub":"00000000-0000-4000-8000-0000000000aa","email":"dev@pickypop.test"}'::jsonb,
  'email', now(), now(), now()
);

insert into public.workspace_members (workspace_id, user_id, role, display_name, labor_rate_per_hour)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa',
        'owner', 'Carlos (local)', 15.00);

insert into public.sales_channels (workspace_id, name, commission_rate) values
  ('00000000-0000-4000-8000-000000000001', 'Directo', 0),
  ('00000000-0000-4000-8000-000000000001', 'Instagram', 0);

insert into public.gift_categories (workspace_id, name, treatment) values
  ('00000000-0000-4000-8000-000000000001', 'Empresa', 'marketing'),
  ('00000000-0000-4000-8000-000000000001', 'Personal', 'owner_draw'),
  ('00000000-0000-4000-8000-000000000001', 'Otros', 'other');
