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

-- Acabados de filamento. La migración los siembra para los talleres que ya
-- existen, pero un taller nuevo nace después de que las migraciones corrieron,
-- así que hay que sembrarlos aquí también.
insert into public.filament_finishes (workspace_id, name, abrasive, note) values
  ('00000000-0000-4000-8000-000000000001', 'Básico', false, null),
  ('00000000-0000-4000-8000-000000000001', 'Mate', false, null),
  ('00000000-0000-4000-8000-000000000001', 'Seda', false, 'Brillo satinado. No es abrasivo, aunque lo parezca.'),
  ('00000000-0000-4000-8000-000000000001', 'Translúcido', false, null),
  ('00000000-0000-4000-8000-000000000001', 'Madera', true, 'Lleva partícula de madera: desgasta la boquilla.'),
  ('00000000-0000-4000-8000-000000000001', 'Fibra de carbono', true, 'Muy abrasivo. Boquilla de acero endurecido.'),
  ('00000000-0000-4000-8000-000000000001', 'Metálico', true, 'Lleva partícula metálica: desgasta la boquilla.'),
  ('00000000-0000-4000-8000-000000000001', 'Luminoso', true, 'El fósforo que brilla en la oscuridad raya la boquilla.');

-- K3D is not in the Bambu profiles, so a sliced file will report it as a
-- generic PLA: spools are matched by colour until tray_info_idx is mapped once.
insert into public.filament_skus (
  id, workspace_id, brand_id, material_id, finish_id, color_name, color_hex,
  net_weight_g, min_stock_g, replacement_cost_per_kg
)
select v.id, v.workspace_id, v.brand_id, v.material_id, f.id, v.color_name, v.color_hex,
       v.net_weight_g, v.min_stock_g, v.replacement_cost_per_kg
from public.filament_finishes f,
  (values
  ('00000000-0000-4000-8000-000000000031'::uuid, '00000000-0000-4000-8000-000000000001'::uuid,
   '00000000-0000-4000-8000-000000000010'::uuid, '00000000-0000-4000-8000-000000000020'::uuid,
   'Rojo', '#DE4343', 1000::numeric, 500::numeric, 50.00::numeric),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'Rosado', '#F55A74', 1000, 500, 50.00),
  -- The lime green batch came in expensive; reordering it at the same shop
  -- should cost about S/ 60, which is what quotes should assume.
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'Verde lima', '#61C680', 1000, 500, 60.00),
  ('00000000-0000-4000-8000-000000000034', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020',
   'Negro', '#000000', 1000, 500, 50.00)
  ) as v(id, workspace_id, brand_id, material_id, color_name, color_hex,
         net_weight_g, min_stock_g, replacement_cost_per_kg)
where f.workspace_id = v.workspace_id and f.name = 'Básico';

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
   'VERDE-01', 1000, 75.00, 'open'),
  -- The black spool was already on the shelf before anything was being
  -- recorded, so it has no purchase behind it: it comes in as an opening
  -- balance and its cost is the replacement price until the real one is known.
  ('00000000-0000-4000-8000-000000000084', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000034', null,
   'NEGRO-01', 1000, 50.00, 'open');

-- Stock only exists because of its movements.
--
-- Each one is dated when it actually happened, and in Lima time. Without the
-- date they all landed on "now" and the kardex showed the opening stock as if
-- it had arrived today; without the time zone they land a day early, because
-- midnight UTC is the previous evening here.
insert into public.stock_movements (workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, note) values
  ('00000000-0000-4000-8000-000000000001', timestamp '2026-09-01 10:00' at time zone 'America/Lima',
   'purchase', '00000000-0000-4000-8000-000000000081',
   1000, 0.050, 'purchase', 'Ingreso del rollo'),
  ('00000000-0000-4000-8000-000000000001', timestamp '2026-09-01 10:00' at time zone 'America/Lima',
   'purchase', '00000000-0000-4000-8000-000000000082',
   1000, 0.050, 'purchase', 'Ingreso del rollo'),
  ('00000000-0000-4000-8000-000000000001', timestamp '2026-09-10 10:00' at time zone 'America/Lima',
   'purchase', '00000000-0000-4000-8000-000000000083',
   1000, 0.075, 'purchase', 'Ingreso del rollo'),
  ('00000000-0000-4000-8000-000000000001', timestamp '2026-09-01 10:00' at time zone 'America/Lima',
   'adjustment', '00000000-0000-4000-8000-000000000084',
   1000, 0.050, 'opening_balance',
   'Saldo inicial. TODO: pesar el rollo negro y corregir, y registrar su compra real');

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
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000094', 3,
   '00000000-0000-4000-8000-000000000020', '#000000', '00000000-0000-4000-8000-000000000034', 4.63),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000094', 4,
   '00000000-0000-4000-8000-000000000020', '#DE4343', '00000000-0000-4000-8000-000000000031', 1.02),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000095', 1,
   '00000000-0000-4000-8000-000000000020', '#000000', '00000000-0000-4000-8000-000000000034', 15.00);

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

-- A second local account that is a member but not the owner, to check that
-- what only the owner may do is refused by the database, not just hidden.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-0000000000ab',
  'authenticated', 'authenticated', 'operador@pickypop.test',
  extensions.crypt('pickypop123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000ab',
  '{"sub":"00000000-0000-4000-8000-0000000000ab","email":"operador@pickypop.test"}'::jsonb,
  'email', now(), now(), now()
);

insert into public.workspace_members (workspace_id, user_id, role, display_name)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000ab',
        'operator', 'Operador (local)');

insert into public.sales_channels (workspace_id, name, commission_rate) values
  ('00000000-0000-4000-8000-000000000001', 'Directo', 0),
  ('00000000-0000-4000-8000-000000000001', 'Instagram', 0);

-- «Directo» es el canal de las ventas directas: la Venta rápida lo trae elegido.
insert into public.workshop_settings (workspace_id, default_channel_id)
select c.workspace_id, c.id
from public.sales_channels c
where c.workspace_id = '00000000-0000-4000-8000-000000000001' and c.name = 'Directo'
on conflict (workspace_id) do update set default_channel_id = excluded.default_channel_id;

insert into public.gift_categories (workspace_id, name, treatment) values
  ('00000000-0000-4000-8000-000000000001', 'Empresa', 'marketing'),
  ('00000000-0000-4000-8000-000000000001', 'Personal', 'owner_draw'),
  ('00000000-0000-4000-8000-000000000001', 'Otros', 'other');

-- ---------------------------------------------------------------- finanzas
--
-- Las cuatro formas de cobrar y pagar que usa el taller. El saldo de apertura
-- queda en cero a propósito: es un dato real que todavía no nos pasaron, y
-- poner un número inventado haría que todos los reportes mientan.

insert into public.accounts (
  workspace_id, name, kind, opening_balance, opening_balance_on, default_payment_method, note
) values
  ('00000000-0000-4000-8000-000000000001', 'Efectivo', 'cash', 0, date '2026-09-01', 'cash',
   'TODO: cuánto había en la caja el día que empezaron a registrar'),
  ('00000000-0000-4000-8000-000000000001', 'Yape', 'wallet', 0, date '2026-09-01', 'yape',
   'TODO: saldo inicial'),
  ('00000000-0000-4000-8000-000000000001', 'Plin', 'wallet', 0, date '2026-09-01', 'plin',
   'TODO: saldo inicial'),
  ('00000000-0000-4000-8000-000000000001', 'Cuenta bancaria', 'bank', 0, date '2026-09-01', 'transfer',
   'TODO: banco y saldo inicial');

-- Las dos de ingreso son de ventas: las usan los cobros de pedidos y la Venta
-- rápida, y un ingreso suelto de Caja no puede usarlas.
insert into public.transaction_categories (workspace_id, name, direction, sales) values
  ('00000000-0000-4000-8000-000000000001', 'Venta de productos', 'income', true),
  ('00000000-0000-4000-8000-000000000001', 'Trabajos por encargo', 'income', true),
  ('00000000-0000-4000-8000-000000000001', 'Filamento', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Dulces y empaque', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Repuestos y herramientas', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Mantenimiento', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Envíos', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Comisiones de venta', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Publicidad', 'expense', false),
  ('00000000-0000-4000-8000-000000000001', 'Luz', 'expense', false);

-- =====================================================================
-- DATOS DE DEMOSTRACIÓN
-- =====================================================================
--
-- Todo lo de arriba es el taller real tal como se conoce. Lo de aquí abajo
-- es inventado, y existe para una sola cosa: que al levantar el entorno
-- local se puedan ver **todos** los flujos con datos encima, en vez de
-- pantallas vacías que no enseñan nada y que obligan a cargar a mano lo
-- mismo cada vez.
--
-- Nunca llega a producción: este archivo solo lo corre el CLI en local.
-- Un proyecto alojado arranca con supabase/bootstrap.sql, que no lo incluye.
--
-- **Las fechas son relativas a hoy**, a propósito. Con fechas fijas, a la
-- semana el entorno muestra todo vencido y deja de parecerse a un taller
-- en marcha; peor, deja de ejercitar los avisos de "vence hoy".

-- ------------------------------------------------------------- clientes

insert into public.customers (id, workspace_id, kind, name, doc_type, doc_number, phone, email, note) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   'person', 'Ana Quispe', 'dni', '45872103', '987654321', 'ana.quispe@example.com', 'Compra para cumpleaños.'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   'company', 'Colegio San Martín', 'ruc', '20512345678', '014567890', 'compras@sanmartin.example',
   'Pide por lote y paga por transferencia a 15 días.'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001',
   'person', 'Lucía Ramos', 'dni', '70112233', '999111222', null, null),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001',
   'company', 'Café Lima', 'ruc', '20600112233', '015551234', 'hola@cafelima.example',
   'Recuerdos para sus clientes en fechas especiales.'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001',
   'person', 'Diego Flores', 'none', null, '911222333', null, 'Llegó por Instagram.');

-- --------------------------------------------------------- cotizaciones
--
-- Las tres situaciones en las que vive una cotización: una aceptada que ya
-- es pedido, una enviada esperando respuesta, y un borrador a medio hacer.

insert into public.quotes (
  id, workspace_id, number, version, customer_id, channel_id, status,
  issued_on, valid_until, subtotal, discount, igv, total, note
)
select v.id, '00000000-0000-4000-8000-000000000001', v.number, 1, v.customer_id, c.id, v.status,
       v.issued_on, v.valid_until, v.subtotal, 0, 0, v.subtotal, v.note
from public.sales_channels c,
  (values
  ('00000000-0000-4000-8000-000000000111'::uuid, 'COT-0001', '00000000-0000-4000-8000-000000000102'::uuid,
   'accepted'::public.quote_status, current_date - 25, current_date - 10, 255.00::numeric,
   'Aceptada. Se convirtió en el pedido PED-0001.'),
  ('00000000-0000-4000-8000-000000000112', 'COT-0002', '00000000-0000-4000-8000-000000000104',
   'sent', current_date - 4, current_date + 10, 180.00, 'Enviada por WhatsApp. Sin respuesta todavía.'),
  ('00000000-0000-4000-8000-000000000113', 'COT-0003', '00000000-0000-4000-8000-000000000105',
   'draft', current_date, current_date + 15, 85.00, 'Falta confirmar colores con el cliente.')
  ) as v(id, number, customer_id, status, issued_on, valid_until, subtotal, note)
where c.workspace_id = '00000000-0000-4000-8000-000000000001' and c.name = 'Directo';

insert into public.quote_lines (
  workspace_id, quote_id, position, kind, variant_id, description, quantity,
  setup_minutes, minutes_per_unit, unit_cost, unit_price
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000111', 1, 'catalog',
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 30, 10, 5, 4.22, 8.50),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000112', 1, 'catalog',
   '00000000-0000-4000-8000-000000000092', 'Botella de poción con chocolates premium', 10, 10, 5, 9.10, 18.00),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000113', 1, 'catalog',
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 10, 10, 5, 4.22, 8.50);

-- -------------------------------------------------------------- pedidos
--
-- Uno por cada estado del tablero, para que la pantalla de pedidos y la cola
-- de "Hoy" se vean como se verán de verdad: con cosas atrasadas, cosas de
-- hoy y cosas que todavía no apuran.

insert into public.orders (
  id, workspace_id, number, purpose, gift_category_id, recipient, customer_id,
  channel_id, quote_id, status, ordered_on, due_date, total, note
)
select v.id, '00000000-0000-4000-8000-000000000001', v.number, v.purpose::public.order_purpose,
       case when v.purpose = 'gift' then g.id end, v.recipient, v.customer_id,
       c.id, v.quote_id, v.status::public.order_status, v.ordered_on, v.due_date, v.total, v.note
from public.sales_channels c
  cross join public.gift_categories g,
  (values
  ('00000000-0000-4000-8000-000000000121'::uuid, 'PED-0001', 'sale', null::text,
   '00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000111'::uuid,
   'closed', current_date - 24, current_date - 18, 255.00::numeric, 'Entregado y cobrado completo.'),
  ('00000000-0000-4000-8000-000000000122', 'PED-0002', 'sale', null,
   '00000000-0000-4000-8000-000000000104', null,
   'delivered', current_date - 12, current_date - 8, 90.00, 'Entregado. Quedaron en pagar por transferencia.'),
  ('00000000-0000-4000-8000-000000000123', 'PED-0003', 'sale', null,
   '00000000-0000-4000-8000-000000000101', null,
   'printing', current_date - 6, current_date - 1, 85.00, 'Se atrasó por una impresión fallida.'),
  ('00000000-0000-4000-8000-000000000124', 'PED-0004', 'sale', null,
   '00000000-0000-4000-8000-000000000103', null,
   'queued', current_date - 3, current_date, 42.50, null),
  ('00000000-0000-4000-8000-000000000125', 'PED-0005', 'sale', null,
   '00000000-0000-4000-8000-000000000105', null,
   'confirmed', current_date - 1, current_date + 2, 51.00, null),
  ('00000000-0000-4000-8000-000000000126', 'PED-0006', 'sale', null,
   '00000000-0000-4000-8000-000000000102', null,
   'post_processing', current_date - 5, current_date + 5, 170.00, 'Falta pegar las etiquetas.'),
  ('00000000-0000-4000-8000-000000000127', 'PED-0007', 'sale', null,
   '00000000-0000-4000-8000-000000000101', null,
   'ready', current_date - 4, current_date + 1, 27.00, 'Listo para recoger.'),
  ('00000000-0000-4000-8000-000000000128', 'PED-0008', 'sale', null,
   '00000000-0000-4000-8000-000000000104', null,
   'on_hold', current_date - 9, current_date + 10, 144.00, 'En pausa: el cliente está decidiendo el color.'),
  ('00000000-0000-4000-8000-000000000129', 'PED-0009', 'sale', null,
   '00000000-0000-4000-8000-000000000103', null,
   'cancelled', current_date - 15, current_date - 5, 0.00, 'El cliente se arrepintió antes de imprimir.'),
  ('00000000-0000-4000-8000-00000000012a', 'PED-0010', 'gift', 'Feria del colegio',
   null, null,
   'delivered', current_date - 7, current_date - 7, 0.00, 'Muestras para la feria. No se cobra.')
  ) as v(id, number, purpose, recipient, customer_id, quote_id, status, ordered_on, due_date, total, note)
where c.workspace_id = '00000000-0000-4000-8000-000000000001' and c.name = 'Directo'
  and g.workspace_id = '00000000-0000-4000-8000-000000000001' and g.name = 'Empresa';

insert into public.order_lines (
  workspace_id, order_id, position, variant_id, description, quantity, unit_price, estimated_unit_cost
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000121', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 30, 8.50, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000122', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 10, 9.00, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000123', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 10, 8.50, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000124', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 5, 8.50, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000125', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 6, 8.50, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000126', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 20, 8.50, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000127', 1,
   '00000000-0000-4000-8000-000000000091', 'Botella de poción con dulces surtidos', 3, 9.00, 4.22),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000128', 1,
   '00000000-0000-4000-8000-000000000092', 'Botella de poción con chocolates premium', 8, 18.00, 9.10),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000012a', 1,
   '00000000-0000-4000-8000-000000000091', 'Muestras para la feria', 4, 0.00, 4.22);

-- ---------------------------------------------------------- impresiones
--
-- Una semana de taller: la mayoría salen bien, una falla, y una quedó
-- abierta hace dos días, que es el caso que la cola de "Hoy" tiene que
-- pescar porque su costo todavía no entró a ningún lado.

insert into public.print_jobs (
  id, workspace_id, printer_id, order_line_id, recipe_plate_id, label, status,
  started_at, finished_at, estimated_time_s, actual_time_s, units_produced,
  failure_cause, percent_complete, material_cost, energy_cost, machine_cost, note
)
select v.id, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041',
       l.id, '00000000-0000-4000-8000-000000000094', v.label, v.status::public.print_job_status,
       v.started_at, v.finished_at, v.estimated_time_s, v.actual_time_s, v.units_produced,
       v.failure_cause::public.print_failure_cause, v.percent_complete,
       v.material_cost, v.energy_cost, v.machine_cost, v.note
from (values
  ('00000000-0000-4000-8000-000000000131'::uuid, '00000000-0000-4000-8000-000000000121'::uuid,
   'Botellas 1/3', 'success', now() - interval '20 days', now() - interval '20 days' + interval '43 min',
   2586, 2610, 10::numeric, null::text, 100::numeric, 5.73::numeric, 0.03::numeric, 0.21::numeric, null::text),
  ('00000000-0000-4000-8000-000000000132', '00000000-0000-4000-8000-000000000121',
   'Botellas 2/3', 'success', now() - interval '19 days', now() - interval '19 days' + interval '44 min',
   2586, 2640, 10, null, 100, 5.73, 0.03, 0.21, null),
  ('00000000-0000-4000-8000-000000000133', '00000000-0000-4000-8000-000000000121',
   'Botellas 3/3', 'failed', now() - interval '19 days', now() - interval '19 days' + interval '12 min',
   2586, 720, 0, 'spaghetti', 28, 1.60, 0.01, 0.06,
   'Se despegó de la placa a los 12 minutos. Se volvió a imprimir.'),
  ('00000000-0000-4000-8000-000000000134', '00000000-0000-4000-8000-000000000121',
   'Botellas 3/3 (repetida)', 'success', now() - interval '18 days', now() - interval '18 days' + interval '43 min',
   2586, 2595, 10, null, 100, 5.73, 0.03, 0.21, null),
  ('00000000-0000-4000-8000-000000000135', '00000000-0000-4000-8000-000000000122',
   'Botellas del Café Lima', 'success', now() - interval '11 days', now() - interval '11 days' + interval '45 min',
   2586, 2700, 10, null, 100, 5.73, 0.04, 0.22, null),
  ('00000000-0000-4000-8000-000000000136', '00000000-0000-4000-8000-000000000123',
   'Botellas de Ana', 'failed', now() - interval '4 days', now() - interval '4 days' + interval '25 min',
   2586, 1500, 0, 'clog', 58, 3.20, 0.02, 0.12,
   'Se tapó la boquilla. Hubo que limpiarla antes de seguir.'),
  ('00000000-0000-4000-8000-000000000137', '00000000-0000-4000-8000-000000000123',
   'Botellas de Ana (repetida)', 'printing', now() - interval '2 days', null,
   2586, null, 0, null, 65, 0, 0, 0,
   'Quedó abierta: nadie la cerró al terminar.')
  ) as v(id, order_id, label, status, started_at, finished_at, estimated_time_s,
         actual_time_s, units_produced, failure_cause, percent_complete,
         material_cost, energy_cost, machine_cost, note)
join public.order_lines l on l.order_id = v.order_id and l.position = 1;

-- El filamento que se fue en esas impresiones. El stock no se guarda: sale de
-- aquí. El verde lima queda por debajo de su mínimo a propósito, para que el
-- aviso de bajo stock tenga algo que avisar.

insert into public.stock_movements (workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, note) values
  ('00000000-0000-4000-8000-000000000001', now() - interval '20 days', 'consumption',
   '00000000-0000-4000-8000-000000000082', -114.50, 0.050, 'print_job', 'Botellas 1/3'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '19 days', 'consumption',
   '00000000-0000-4000-8000-000000000082', -114.50, 0.050, 'print_job', 'Botellas 2/3'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '19 days', 'waste',
   '00000000-0000-4000-8000-000000000082', -32.00, 0.050, 'print_job', 'Impresión fallida: se despegó'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '18 days', 'consumption',
   '00000000-0000-4000-8000-000000000082', -114.50, 0.050, 'print_job', 'Botellas 3/3 repetida'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '20 days', 'consumption',
   '00000000-0000-4000-8000-000000000084', -138.90, 0.050, 'print_job', 'Negro de las botellas'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '11 days', 'consumption',
   '00000000-0000-4000-8000-000000000083', -620.00, 0.075, 'print_job',
   'Pedido grande en verde lima: dejó el rollo bajo el mínimo'),
  ('00000000-0000-4000-8000-000000000001', now() - interval '4 days', 'waste',
   '00000000-0000-4000-8000-000000000081', -64.00, 0.050, 'print_job', 'Boquilla tapada: material perdido');

-- ------------------------------------------------------- mantenimiento
--
-- La limpieza diaria se hizo ayer, así que está al día. La semanal se hizo
-- hace nueve días, así que aparece vencida. Es la combinación que hace que
-- la pantalla de impresoras muestre los dos estados a la vez.

insert into public.maintenance_logs (
  workspace_id, printer_id, plan_id, performed_at, printer_hours_at, duration_min, cost, performed_by, checklist_done, note
)
select '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041', p.id,
       v.performed_at, v.hours, v.duration_min, v.cost,
       '00000000-0000-4000-8000-0000000000aa', p.checklist, v.note
from public.maintenance_plans p
join (values
  ('Limpiar la placa y retirar la purga', (now() - interval '1 day')::timestamptz, 182::numeric, 8::numeric, 0::numeric, null::text),
  ('Limpieza semanal del hotend, cortador y ventiladores', (now() - interval '9 days')::timestamptz, 170, 25, 0, null),
  ('Revisión mensual', (now() - interval '20 days')::timestamptz, 158, 40, 0, 'Todo en orden.')
  ) as v(task, performed_at, hours, duration_min, cost, note) on v.task = p.task
where p.workspace_id = '00000000-0000-4000-8000-000000000001';

-- Un incidente real: la boquilla tapada de hace cuatro días, con su repuesto.
insert into public.maintenance_logs (
  workspace_id, printer_id, plan_id, performed_at, printer_hours_at, duration_min, cost, performed_by, note
) values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000041', null,
  now() - interval '4 days', 176, 35, 25.00, '00000000-0000-4000-8000-0000000000aa',
  'Boquilla tapada a mitad de impresión. Se limpió y se dejó una de repuesto lista.'
);

-- ------------------------------------------------------------- insumos
--
-- Una compra real de dulces y bolsas, para que el costo de los insumos salga
-- de una compra y no del costo estándar. Son 2.5 kg a S/ 15 el kilo.

insert into public.purchases (id, workspace_id, supplier_id, purchased_at, shipping_cost, note) values
  ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000050', current_date - 14, 8.00, 'Dulces y empaque del mes');

insert into public.purchase_lines (
  workspace_id, purchase_id, inventory_item_id, description, quantity, unit_price, allocated_extra_cost, expires_on
)
select '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000141', i.id,
       v.description, v.quantity, v.unit_price, v.extra, v.expires_on
from public.inventory_items i
join (values
  ('Dulces surtidos', 'Dulces surtidos, 2.5 kg', 2500::numeric, 0.0150::numeric, 6.00::numeric, (current_date + 120)::date),
  ('Bolsa con etiqueta', 'Bolsas con etiqueta, ciento', 100, 0.5000, 2.00, null)
  ) as v(name, description, quantity, unit_price, extra, expires_on) on v.name = i.name
where i.workspace_id = '00000000-0000-4000-8000-000000000001';

insert into public.stock_movements (workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, note)
select '00000000-0000-4000-8000-000000000001',
       ((current_date - 14)::timestamp + interval '10 hours') at time zone 'America/Lima',
       v.type::public.stock_movement_type,
       i.id, v.quantity, v.unit_cost, v.source, v.note
from public.inventory_items i
join (values
  ('Dulces surtidos', 'purchase', 2500::numeric, 0.0174::numeric, 'purchase', 'Compra del mes'),
  ('Dulces surtidos', 'consumption', -1980, 0.0174, 'order', 'Dulces que se fueron en los pedidos del mes'),
  ('Bolsa con etiqueta', 'purchase', 100, 0.5200, 'purchase', 'Compra del mes'),
  ('Bolsa con etiqueta', 'consumption', -30, 0.5200, 'order', 'Bolsas de los pedidos entregados'),
  ('Boquilla 0.4 acero', 'purchase', 2, 25.00, 'purchase', 'Repuestos en el cajón'),
  ('Boquilla 0.4 acero', 'maintenance', -1, 25.00, 'maintenance', 'Cambio por boquilla tapada')
  ) as v(name, type, quantity, unit_cost, source, note) on v.name = i.name
where i.workspace_id = '00000000-0000-4000-8000-000000000001';

-- ------------------------------------------------------------- finanzas
--
-- El mes en dinero. Incluye a propósito un pedido entregado y sin cobrar
-- (PED-0002), que es lo que alimenta "por cobrar" y la cola de "Hoy", y
-- una transferencia entre cuentas, que es **una sola fila** con dos
-- cuentas y no debe cambiar el total del taller.

insert into public.transactions (
  workspace_id, account_id, counter_account_id, type, category_id, amount,
  occurred_at, payment_method, order_id, purchase_id, counterparty, reference, note
)
select '00000000-0000-4000-8000-000000000001', a.id, b.id, v.type::public.transaction_type,
       cat.id, v.amount, v.occurred_at, v.method::public.payment_method,
       v.order_id, v.purchase_id, v.counterparty, v.reference, v.note
from (values
  -- Con qué arrancaron. Va como aporte de los dueños y no como saldo de
  -- apertura a propósito: el saldo de apertura de las cuentas reales sigue
  -- en cero esperando el dato verdadero, y no se toca desde aquí.
  ('Efectivo', null::text, 'owner_contribution', null::text, 300.00::numeric,
   ((current_date - 32)::timestamp + interval '9 hours') at time zone 'America/Lima', 'cash', null::uuid, null::uuid,
   null::text, null::text, 'Con lo que arrancó la caja.'),
  ('Yape', null, 'owner_contribution', null, 500.00,
   ((current_date - 32)::timestamp + interval '9 hours') at time zone 'America/Lima', 'yape', null, null,
   null, null, 'Aporte inicial para las primeras compras.'),
  -- Cobro completo del pedido del colegio, en dos partes: adelanto y saldo.
  ('Cuenta bancaria', null, 'income', 'Venta de productos', 127.50,
   ((current_date - 24)::timestamp + interval '15 hours') at time zone 'America/Lima', 'transfer', '00000000-0000-4000-8000-000000000121', null,
   'Colegio San Martín', 'Adelanto 50%', null),
  ('Cuenta bancaria', null, 'income', 'Venta de productos', 127.50,
   ((current_date - 17)::timestamp + interval '15 hours') at time zone 'America/Lima', 'transfer', '00000000-0000-4000-8000-000000000121', null,
   'Colegio San Martín', 'Saldo', null),
  -- Pedidos chicos cobrados en el momento.
  ('Yape', null, 'income', 'Venta de productos', 27.00,
   ((current_date - 3)::timestamp + interval '15 hours') at time zone 'America/Lima', 'yape', '00000000-0000-4000-8000-000000000127', null,
   'Ana Quispe', null, 'Pagado al reservar.'),
  ('Efectivo', null, 'income', 'Venta de productos', 42.50,
   ((current_date - 2)::timestamp + interval '15 hours') at time zone 'America/Lima', 'cash', '00000000-0000-4000-8000-000000000124', null,
   'Lucía Ramos', null, null),
  -- Las compras del mes.
  ('Efectivo', null, 'expense', 'Dulces y empaque', 58.00,
   ((current_date - 14)::timestamp + interval '15 hours') at time zone 'America/Lima', 'cash', null, '00000000-0000-4000-8000-000000000141',
   'Tienda local', null, 'Dulces, bolsas y el envío.'),
  ('Yape', null, 'expense', 'Filamento', 100.00,
   ((current_date - 30)::timestamp + interval '15 hours') at time zone 'America/Lima', 'yape', null, '00000000-0000-4000-8000-000000000060',
   'Tienda local', null, 'Rojo y rosado.'),
  ('Yape', null, 'expense', 'Repuestos y herramientas', 50.00,
   ((current_date - 13)::timestamp + interval '15 hours') at time zone 'America/Lima', 'yape', null, null,
   'Tienda local', null, 'Dos boquillas de acero.'),
  ('Efectivo', null, 'expense', 'Luz', 18.00,
   ((current_date - 8)::timestamp + interval '15 hours') at time zone 'America/Lima', 'cash', null, null,
   'Luz del Sur', null, 'Parte de la impresora en el recibo del mes.'),
  ('Yape', null, 'expense', 'Publicidad', 30.00,
   ((current_date - 6)::timestamp + interval '15 hours') at time zone 'America/Lima', 'yape', null, null,
   'Meta', null, 'Publicación promocionada en Instagram.'),
  -- Una transferencia: una fila, dos cuentas, el total del taller no cambia.
  ('Yape', 'Cuenta bancaria', 'transfer', null, 150.00,
   ((current_date - 5)::timestamp + interval '15 hours') at time zone 'America/Lima', 'transfer', null, null,
   null, null, 'Pasar lo acumulado en Yape al banco.'),
  -- Y un retiro de los dueños.
  ('Efectivo', null, 'owner_draw', null, 80.00,
   ((current_date - 2)::timestamp + interval '15 hours') at time zone 'America/Lima', 'cash', null, null,
   null, null, 'Retiro de los dueños.')
  ) as v(account, counter_account, type, category, amount, occurred_at, method,
         order_id, purchase_id, counterparty, reference, note)
join public.accounts a
  on a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.name = v.account
left join public.accounts b
  on b.workspace_id = '00000000-0000-4000-8000-000000000001' and b.name = v.counter_account
left join public.transaction_categories cat
  on cat.workspace_id = '00000000-0000-4000-8000-000000000001' and cat.name = v.category;

-- -------------------------------------------------------------- tratos
--
-- Las oportunidades que agrupan lo de arriba. Cubren las seis etapas para que
-- el tablero no se vea con una sola columna poblada, y enganchan a mano las
-- cotizaciones y los pedidos que ya existen.
--
-- `cerrado` NO se siembra a mano aunque exista la etapa: lo pone el disparador
-- cuando todos los pedidos del trato están entregados y cobrados. Sembrarlo
-- sería mentirle a la regla que justamente queremos ver funcionando.

insert into public.opportunities (
  id, workspace_id, customer_id, title, stage, owner, expected_close, note, blocked_reason, blocked_at
) values
  ('00000000-0000-4000-8000-000000000151', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000102', 'Recuerdos para la promoción del colegio',
   'won', '00000000-0000-4000-8000-0000000000aa', current_date - 18,
   'Cerraron por el lote de 30. Repiten el año que viene.', null, null),
  ('00000000-0000-4000-8000-000000000152', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000104', 'Detalles para los clientes del café',
   'quoted', '00000000-0000-4000-8000-0000000000aa', current_date + 12,
   'Mandada por WhatsApp. Sin respuesta todavía.', null, null),
  ('00000000-0000-4000-8000-000000000153', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000105', 'Pedido grande de Diego',
   'negotiating', '00000000-0000-4000-8000-0000000000aa', current_date + 7,
   'Quiere 40 unidades pero está viendo el presupuesto.',
   'Esperando el adelanto del 50 %', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000154', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'Cumpleaños de la sobrina de Ana',
   'new', '00000000-0000-4000-8000-0000000000aa', current_date + 20,
   'Escribió por Instagram. Falta que mande las fotos de referencia.', null, null),
  ('00000000-0000-4000-8000-000000000155', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000103', 'Souvenirs para el matrimonio',
   'lost', '00000000-0000-4000-8000-0000000000aa', current_date - 5,
   'Se fue con otro proveedor por precio. Vale la pena revisar la escalera.', null, null);

update public.quotes set opportunity_id = '00000000-0000-4000-8000-000000000151'
 where id = '00000000-0000-4000-8000-000000000111';
update public.quotes set opportunity_id = '00000000-0000-4000-8000-000000000152'
 where id = '00000000-0000-4000-8000-000000000112';
update public.quotes set opportunity_id = '00000000-0000-4000-8000-000000000153'
 where id = '00000000-0000-4000-8000-000000000113';

update public.orders set opportunity_id = '00000000-0000-4000-8000-000000000151'
 where number = 'PED-0001';
-- Los dos del café, no el del colegio: un trato con un pedido de otro cliente
-- es un dato que se contradice solo y enseña mal.
update public.orders set opportunity_id = '00000000-0000-4000-8000-000000000152'
 where number in ('PED-0002', 'PED-0008');

-- ------------------------------------------------------ piezas impresas
--
-- Las dos piezas de la botella de poción. Son artículos de inventario como
-- los dulces: lo único que las distingue es que no se compran, se imprimen.
--
-- Con esto la placa de nueve tapas deja de cargarle su costo entero a la
-- primera venta: las nueve entran al estante y cada botella armada consume
-- una sola.

insert into public.inventory_items (
  id, workspace_id, kind, name, unit, min_stock, perishable, standard_cost, note
) values
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000001',
   'part', 'Botella impresa', 'unidad', 5, false, null,
   'Sale de la placa 1 de la receta. Una por producto.'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000001',
   'part', 'Tapa impresa', 'unidad', 10, false, null,
   'Salen nueve por corrida. Por eso vender una suelta sin stock es caro.');

-- Lo que sale de cada placa, con las mismas unidades por corrida que ya tiene.
insert into public.recipe_plate_outputs (workspace_id, recipe_plate_id, inventory_item_id, units_per_run)
select workspace_id, id, '00000000-0000-4000-8000-000000000161'::uuid, units_per_run
from public.recipe_plates where id = '00000000-0000-4000-8000-000000000094'
union all
select workspace_id, id, '00000000-0000-4000-8000-000000000162'::uuid, units_per_run
from public.recipe_plates where id = '00000000-0000-4000-8000-000000000095';

-- La receta consume una de cada una por unidad armada. Desde 20261013110000
-- guardar lo que sale de una placa ya mete la pieza en la receta, una por
-- producto, así que esto solo confirma la cantidad: sin el «on conflict» la
-- semilla chocaba con lo que acababa de poner el disparador y no cargaba.
insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000093',
   '00000000-0000-4000-8000-000000000161', 1),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000093',
   '00000000-0000-4000-8000-000000000162', 1)
on conflict (recipe_id, inventory_item_id) do update set quantity_per_unit = excluded.quantity_per_unit;

-- Lo que las impresiones del mes dejaron en el estante. Sobran tapas respecto
-- de las botellas, que es exactamente lo que pasa cuando una placa rinde nueve.
-- Entran como producción, no como compra: una pieza impresa no se compra.
insert into public.stock_movements (workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, note) values
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 18)::timestamp + interval '11 hours') at time zone 'America/Lima',
   'production', '00000000-0000-4000-8000-000000000161', 30, 0.597, 'print_job', 'Botellas del pedido del colegio'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 18)::timestamp + interval '12 hours') at time zone 'America/Lima',
   'production', '00000000-0000-4000-8000-000000000162', 45, 0.131, 'print_job', 'Cinco corridas de nueve tapas'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 17)::timestamp + interval '10 hours') at time zone 'America/Lima',
   'consumption', '00000000-0000-4000-8000-000000000161', -30, 0.597, 'assembly', 'Armado del pedido del colegio'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 17)::timestamp + interval '10 hours') at time zone 'America/Lima',
   'consumption', '00000000-0000-4000-8000-000000000162', -30, 0.131, 'assembly', 'Armado del pedido del colegio'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 11)::timestamp + interval '11 hours') at time zone 'America/Lima',
   'production', '00000000-0000-4000-8000-000000000161', 18, 0.612, 'print_job', 'Botellas del Café Lima'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 10)::timestamp + interval '10 hours') at time zone 'America/Lima',
   'consumption', '00000000-0000-4000-8000-000000000161', -10, 0.612, 'assembly', 'Armado del Café Lima'),
  ('00000000-0000-4000-8000-000000000001',
   ((current_date - 10)::timestamp + interval '10 hours') at time zone 'America/Lima',
   'consumption', '00000000-0000-4000-8000-000000000162', -10, 0.131, 'assembly', 'Armado del Café Lima');
