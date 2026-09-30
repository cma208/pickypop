-- Local development data. Runs with "supabase db reset".
--
-- It mirrors the real workshop as far as it is known today. Values still
-- pending are marked with TODO so they are easy to find.

-- Fixed ids so that local data is stable between resets.
\set workspace '\'00000000-0000-4000-8000-000000000001\''
\set brand_generic '\'00000000-0000-4000-8000-000000000010\''
\set material_pla '\'00000000-0000-4000-8000-000000000020\''
\set sku_red '\'00000000-0000-4000-8000-000000000031\''
\set sku_pink '\'00000000-0000-4000-8000-000000000032\''
\set sku_lime '\'00000000-0000-4000-8000-000000000033\''
\set asset_printer '\'00000000-0000-4000-8000-000000000040\''
\set printer '\'00000000-0000-4000-8000-000000000041\''

insert into public.workspaces (id, name, currency, timezone, tax_regime)
values (:workspace, 'Pickypop', 'PEN', 'America/Lima', 'none');

-- Parameters. See docs/02-dominio.md, section 2.2.
insert into public.cost_profiles (
  workspace_id, valid_from, material_waste_rate, failure_rate, labor_rate_per_hour,
  energy_rate_per_kwh, target_margin, min_order_price, rounding_step, igv_rate,
  material_valuation, note
) values (
  :workspace, date '2026-09-01', 0.0300, 0.1000, 15.00,
  0.7556, 0.5000, 5.00, 0.50, 0.1800,
  'weighted_avg',
  'Perfil inicial. Luz real (Luz del Sur BT5B). TODO: hora de trabajo y tasa de fallo por confirmar.'
);

-- ------------------------------------------------------------- filament

insert into public.brands (id, workspace_id, name) values
  (:brand_generic, :workspace, 'Genérico'); -- TODO: replace with the real brand

insert into public.materials (id, workspace_id, code, density_g_cm3, hygroscopic, abrasive) values
  (:material_pla, :workspace, 'PLA', 1.24, false, false);

insert into public.filament_skus (
  id, workspace_id, brand_id, material_id, finish, color_name, color_hex,
  net_weight_g, min_stock_g, replacement_cost_per_kg
) values
  (:sku_red, :workspace, :brand_generic, :material_pla, 'Basic', 'Rojo', '#DE4343', 1000, 500, 50.00),
  (:sku_pink, :workspace, :brand_generic, :material_pla, 'Basic', 'Rosado', '#F55A74', 1000, 500, 50.00),
  -- The lime green batch came in expensive; buying it again at the same shop
  -- should cost about S/ 60, which is what quotes should assume.
  (:sku_lime, :workspace, :brand_generic, :material_pla, 'Basic', 'Verde lima', '#61C680', 1000, 500, 60.00);

insert into public.suppliers (workspace_id, name, note)
values (:workspace, 'Tienda local', 'TODO: nombre real de la tienda');

-- Purchase of the red and pink spools, at S/ 50 each.
with purchase as (
  insert into public.purchases (workspace_id, supplier_id, purchased_at, note)
  select :workspace, s.id, date '2026-09-01', 'Compra inicial'
  from public.suppliers s where s.workspace_id = :workspace
  returning id
), lines as (
  insert into public.purchase_lines (workspace_id, purchase_id, filament_sku_id, quantity, unit_price)
  select :workspace, p.id, sku.id, 1, 50.00
  from purchase p cross join (values (:sku_red), (:sku_pink)) as sku(id)
  returning id, filament_sku_id
), created as (
  insert into public.spools (workspace_id, filament_sku_id, purchase_line_id, code, initial_weight_g, unit_cost, status)
  select :workspace, l.filament_sku_id, l.id,
         case when l.filament_sku_id = :sku_red then 'ROJO-01' else 'ROSA-01' end,
         1000, 50.00, 'open'
  from lines l
  returning id
)
insert into public.stock_movements (workspace_id, type, spool_id, quantity, unit_cost, source_type, note)
select :workspace, 'purchase', c.id, 1000, 0.05, 'purchase', 'Ingreso del rollo'
from created c;

-- The lime green spool: a test batch that came in at S/ 75.
with purchase as (
  insert into public.purchases (workspace_id, supplier_id, purchased_at, note)
  select :workspace, s.id, date '2026-09-10', 'Lote de prueba, salió más caro'
  from public.suppliers s where s.workspace_id = :workspace
  returning id
), line as (
  insert into public.purchase_lines (workspace_id, purchase_id, filament_sku_id, quantity, unit_price)
  select :workspace, p.id, :sku_lime, 1, 75.00 from purchase p
  returning id
), created as (
  insert into public.spools (workspace_id, filament_sku_id, purchase_line_id, code, initial_weight_g, unit_cost, status)
  select :workspace, :sku_lime, l.id, 'VERDE-01', 1000, 75.00, 'open' from line l
  returning id
)
insert into public.stock_movements (workspace_id, type, spool_id, quantity, unit_cost, source_type, note)
select :workspace, 'purchase', c.id, 1000, 0.075, 'purchase', 'Ingreso del rollo' from created c;

-- ------------------------------------------------------- other supplies

insert into public.inventory_items (workspace_id, kind, name, unit, min_stock, perishable, note) values
  (:workspace, 'supply', 'Dulces surtidos', 'unidad', 50, true, 'Aproximadamente S/ 1.00 por pieza. TODO: costo y vencimiento reales'),
  (:workspace, 'packaging', 'Bolsa con etiqueta', 'unidad', 50, false, 'TODO: costo real'),
  (:workspace, 'spare_part', 'Boquilla 0.4 acero', 'unidad', 1, false, null);

-- --------------------------------------------------------------- printer

insert into public.assets (id, workspace_id, name, cost, useful_life_hours, note)
values (:asset_printer, :workspace, 'Bambu Lab A1 mini + AMS lite', 1500.00, 5000,
        'TODO: vida útil estimada, por confirmar con el uso real');

insert into public.printers (
  id, workspace_id, asset_id, name, model, avg_power_w, initial_hours,
  maintenance_budget_per_year, expected_hours_per_year, note
) values (
  :printer, :workspace, :asset_printer, 'A1 mini', 'Bambu Lab A1 mini', 57, 175,
  120.00, 500.00,
  '57 W es el promedio de la wiki de Bambu. 175 h ya usadas al registrarla.'
);

-- Preventive plan from docs/02-dominio.md, section 2.4.
insert into public.maintenance_plans (workspace_id, printer_id, task, every_hours, every_days, checklist) values
  (:workspace, :printer, 'Limpiar la placa y retirar la purga', null, 1,
   '["Lavar la placa con agua y jabón neutro", "No tocarla con los dedos", "Botar los restos de purga"]'::jsonb),
  (:workspace, :printer, 'Limpieza semanal del hotend, cortador y ventiladores', null, 7,
   '["Retirar restos alrededor del hotend", "Limpiar la zona de purga y el cortador", "Quitar polvo de los ventiladores"]'::jsonb),
  (:workspace, :printer, 'Limpiar y lubricar los ejes', 150, null,
   '["Limpiar las guías", "Lubricar según la guía oficial"]'::jsonb),
  (:workspace, :printer, 'Revisión mensual', null, 30,
   '["Revisar correas", "Revisar tornillería", "Revisar cables en movimiento", "Limpiar engranajes del extrusor", "Revisar tubos del AMS lite"]'::jsonb),
  (:workspace, :printer, 'Renovar la grasa del eje Z', null, 90,
   '["Limpiar el husillo", "Aplicar grasa nueva"]'::jsonb);
