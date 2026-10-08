-- Arranque de un taller en un proyecto de Supabase recién creado.
--
-- `seed.sql` solo corre en local: un proyecto alojado nace con las tablas
-- vacías, y sin un taller ni una membresía la aplicación no deja entrar a
-- nadie. Este archivo crea lo mínimo para empezar a trabajar.
--
-- CÓMO SE USA
--   1. Crea tu usuario en el panel de Supabase (Authentication → Users → Add
--      user), o acepta la invitación si alguien ya te invitó.
--   2. Cambia el correo de la línea de abajo por el tuyo.
--   3. Pega todo esto en el SQL Editor del panel y ejecútalo.
--
-- Se puede volver a ejecutar sin romper nada: lo que ya existe se respeta,
-- aunque alguien lo haya renombrado cambiando mayúsculas o espacios («PLIN»,
-- «krear3d»): para la base es el mismo nombre (T1-11), así que cada insert
-- usa «on conflict do nothing» sin nombrar la llave, y cada búsqueda compara
-- sin mayúsculas.
-- Carga solo configuración y datos de referencia. El stock, el catálogo y los
-- pedidos los cargas tú desde la aplicación.

do $$
declare
  -- ⬇️ EL ÚNICO VALOR QUE TIENES QUE CAMBIAR
  owner_email constant text := 'carlosmachicad@gmail.com';

  owner_id uuid;
  shop_id uuid;
  brand_id uuid;
  pla_id uuid;
  plain_id uuid;
begin
  select id into owner_id from auth.users where email = owner_email;
  if owner_id is null then
    raise exception
      'No existe un usuario con el correo %. Créalo primero en Authentication → Users.',
      owner_email;
  end if;

  -- ------------------------------------------------------------ el taller

  select id into shop_id from public.workspaces where name = 'Pickypop';

  if shop_id is null then
    insert into public.workspaces (name, currency, timezone, tax_regime, created_by)
    values ('Pickypop', 'PEN', 'America/Lima', 'none', owner_id)
    returning id into shop_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, display_name, labor_rate_per_hour)
  values (shop_id, owner_id, 'owner', split_part(owner_email, '@', 1), 15.00)
  on conflict (workspace_id, user_id) do update set role = 'owner';

  -- ------------------------------------------------- parámetros de costo
  --
  -- Los valores comprobados hasta hoy. Los provisionales están anotados: se
  -- cambian creando una versión nueva desde Configuración, nunca editando
  -- esta, para que las cotizaciones ya emitidas no se muevan.

  -- Solo si no hay ninguno: correr esto otro día no debe crear una versión
  -- nueva a tus espaldas, porque una versión nueva cambia cómo se cotiza.
  if not exists (select 1 from public.cost_profiles where workspace_id = shop_id) then
    insert into public.cost_profiles (
      workspace_id, valid_from, material_waste_rate, failure_rate, labor_rate_per_hour,
      energy_rate_per_kwh, target_margin, min_order_price, rounding_step, igv_rate,
      material_valuation, note
    )
    values (
      shop_id, current_date, 0.0300, 0.1000, 15.00,
      0.7556, 0.5000, 5.00, 0.50, 0.1800,
      'weighted_avg',
      'Perfil inicial. Luz de Luz del Sur BT5B y hora de trabajo derivada del sueldo. '
      || 'Pendiente: confirmar el precio mínimo por pedido.'
    );
  end if;

  -- ---------------------------------------------------- dónde está la plata
  --
  -- El saldo de apertura queda en cero: es un dato real que hay que poner,
  -- y un número inventado haría mentir a todos los reportes.

  insert into public.accounts (workspace_id, name, kind, opening_balance, default_payment_method, note)
  values
    (shop_id, 'Efectivo', 'cash', 0, 'cash', 'Pendiente: cuánto había en la caja al empezar'),
    (shop_id, 'Yape', 'wallet', 0, 'yape', 'Pendiente: saldo inicial'),
    (shop_id, 'Plin', 'wallet', 0, 'plin', 'Pendiente: saldo inicial'),
    (shop_id, 'Cuenta bancaria', 'bank', 0, 'transfer', 'Pendiente: banco y saldo inicial')
  on conflict do nothing;

  -- Las dos de ingreso son de ventas: las usan los cobros de pedidos y la
  -- Venta rápida, y un ingreso suelto de Caja no puede usarlas.
  insert into public.transaction_categories (workspace_id, name, direction, sales)
  values
    (shop_id, 'Venta de productos', 'income', true),
    (shop_id, 'Trabajos por encargo', 'income', true),
    (shop_id, 'Filamento', 'expense', false),
    (shop_id, 'Dulces y empaque', 'expense', false),
    (shop_id, 'Repuestos y herramientas', 'expense', false),
    (shop_id, 'Mantenimiento', 'expense', false),
    (shop_id, 'Envíos', 'expense', false),
    (shop_id, 'Comisiones de venta', 'expense', false),
    (shop_id, 'Publicidad', 'expense', false),
    (shop_id, 'Luz', 'expense', false)
  on conflict do nothing;

  insert into public.sales_channels (workspace_id, name, commission_rate)
  values (shop_id, 'Directo', 0), (shop_id, 'Instagram', 0)
  on conflict do nothing;

  -- «Directo» es el canal de las ventas directas: la Venta rápida lo trae
  -- elegido. Si el dueño ya eligió otro, se respeta.
  insert into public.workshop_settings (workspace_id, default_channel_id)
  select shop_id, c.id
  from public.sales_channels c
  where c.workspace_id = shop_id and lower(btrim(c.name)) = lower('Directo') and c.active
  on conflict (workspace_id) do update
    set default_channel_id = coalesce(public.workshop_settings.default_channel_id, excluded.default_channel_id);

  insert into public.gift_categories (workspace_id, name, treatment)
  values
    (shop_id, 'Empresa', 'marketing'),
    (shop_id, 'Personal', 'owner_draw'),
    (shop_id, 'Otros', 'other')
  on conflict do nothing;

  -- --------------------------------------------------- material de siempre
  --
  -- Los cuatro colores de K3D que ya se usan. Los rollos concretos y sus
  -- compras se cargan desde Inventario, porque son movimientos con fecha y
  -- precio, no configuración.

  insert into public.brands (workspace_id, name) values (shop_id, 'Krear3D')
  on conflict do nothing;
  select id into brand_id from public.brands
   where workspace_id = shop_id and lower(btrim(name)) = lower('Krear3D');

  insert into public.materials (workspace_id, code, density_g_cm3, hygroscopic, abrasive)
  values (shop_id, 'PLA', 1.24, false, false)
  on conflict do nothing;
  select id into pla_id from public.materials
   where workspace_id = shop_id and lower(btrim(code)) = lower('PLA');

  insert into public.filament_finishes (workspace_id, name, abrasive, note) values
    (shop_id, 'Básico', false, null),
    (shop_id, 'Mate', false, null),
    (shop_id, 'Seda', false, 'Brillo satinado. No es abrasivo, aunque lo parezca.'),
    (shop_id, 'Translúcido', false, null),
    (shop_id, 'Madera', true, 'Lleva partícula de madera: desgasta la boquilla.'),
    (shop_id, 'Fibra de carbono', true, 'Muy abrasivo. Boquilla de acero endurecido.'),
    (shop_id, 'Metálico', true, 'Lleva partícula metálica: desgasta la boquilla.'),
    (shop_id, 'Luminoso', true, 'El fósforo que brilla en la oscuridad raya la boquilla.')
  on conflict do nothing;
  select id into plain_id from public.filament_finishes
   where workspace_id = shop_id and lower(btrim(name)) = lower('Básico');

  insert into public.filament_skus (
    workspace_id, brand_id, material_id, finish_id, color_name, color_hex,
    net_weight_g, min_stock_g, replacement_cost_per_kg
  )
  values
    (shop_id, brand_id, pla_id, plain_id, 'Rojo', '#DE4343', 1000, 500, 50.00),
    (shop_id, brand_id, pla_id, plain_id, 'Rosado', '#F55A74', 1000, 500, 50.00),
    (shop_id, brand_id, pla_id, plain_id, 'Verde lima', '#61C680', 1000, 500, 60.00),
    (shop_id, brand_id, pla_id, plain_id, 'Negro', '#000000', 1000, 500, 50.00)
  on conflict do nothing;

  raise notice 'Taller listo. Entra a la aplicación con %.', owner_email;
end;
$$;
