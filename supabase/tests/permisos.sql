-- Prueba de permisos (ADR-025): quién puede qué, tabla por tabla.
--
-- Se corre con psql sobre cualquier base local que tenga las migraciones:
--
--   docker exec -i supabase_db_pickypop psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/permisos.sql
--
-- Todo pasa dentro de `begin … rollback`: crea su propio taller con un dueño,
-- un operador, alguien de solo lectura y un extraño, y no deja rastro. Si algo
-- no coincide con la matriz, termina con una excepción que nombra la tabla, la
-- operación y la persona. Si todo coincide, dice «permisos: todo coincide».
--
-- Dos partes:
--
-- 1. **La matriz entera**, para todas las tablas de `public`: evalúa las
--    políticas de cada tabla y operación como cada persona, y mira los
--    privilegios de la tabla. Una tabla nueva cae sola en «el día a día»; si
--    tiene que ser solo del dueño o un libro, va en su lista de abajo.
-- 2. **Casos de verdad**, con filas reales y como `authenticated`: lo que
--    encontraron los recorridos (cambiar el monto de un cobro, desanular,
--    borrar stock, que el operador cambie el horario…), las fotos de
--    `storage.objects`, y las reglas que no son de políticas (versiones de
--    parámetros, el último dueño, la impresora en un solo paso, los nombres
--    que solo cambian en mayúsculas, nada de mantenimientos ni incidentes
--    futuros).
-- 3. **El estante solo se mueve por sus flujos** (ADR-020): un insert directo
--    no agrega una pieza ni un producto a `stock_movements` ni escribe una
--    entrega, y los flujos que sí lo hacen (`complete_print_job`,
--    `assemble_product`, `count_shelf`, `deliver_order`, `quick_sale`) siguen
--    funcionando para el operador. Corren como su dueño, así que cada una
--    exige el rol al principio: «Solo lectura» recibe su 42501 con frase y
--    alguien de otro taller, el «no encontramos» de siempre. Lo mismo para las
--    funciones de compras y la numeración. Un rollo o un insumo tampoco se
--    mueve con un insert directo: solo por la compra, el pesaje, el estado
--    del rollo y `move_item_stock`, que siguen funcionando para el operador.
-- 4. **Lo de un taller apunta solo a lo de su taller** (ADR-025, punto 10):
--    alguien de otro taller no cuelga una línea en la receta o el pedido de
--    este, ni una receta en su producto; una fila de antes de la red no se lee
--    desde las funciones que corren como su dueño; y toda llave entre tablas
--    de un taller tiene su guardia.
--
-- Lo que no prueba: el renombre de los gemelos que ya existían
-- (20261021130000) corre una sola vez, al migrar, y sobre una base ya migrada
-- no queda nada que renombrar.

begin;

-- ------------------------------------------------------------ las personas

insert into auth.users (id, email, aud, role) values
  ('00000000-7e57-4000-8000-0000000000a1', 'permisos-dueno@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-7e57-4000-8000-0000000000a2', 'permisos-operador@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-7e57-4000-8000-0000000000a3', 'permisos-lector@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-7e57-4000-8000-0000000000a4', 'permisos-extrano@prueba.test', 'authenticated', 'authenticated');

insert into public.workspaces (id, name) values
  ('00000000-7e57-4000-8000-000000000001', 'Taller de prueba de permisos');

insert into public.workspace_members (workspace_id, user_id, role, display_name) values
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-0000000000a1', 'owner', 'Dueño'),
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-0000000000a2', 'operator', 'Operador'),
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-0000000000a3', 'viewer', 'Lector');

-- Un rollo, antes de la matriz: con él se mide la política de insert de
-- `stock_movements`, que solo deja mover a mano rollos, insumos, empaques y
-- repuestos del propio taller.
insert into public.brands (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000401', '00000000-7e57-4000-8000-000000000001', 'Krear3D');

insert into public.materials (id, workspace_id, code) values
  ('00000000-7e57-4000-8000-000000000411', '00000000-7e57-4000-8000-000000000001', 'PLA');

insert into public.filament_skus (id, workspace_id, brand_id, material_id, color_name) values
  ('00000000-7e57-4000-8000-000000000421', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000401', '00000000-7e57-4000-8000-000000000411', 'Negro');

insert into public.spools (id, workspace_id, filament_sku_id, code, initial_weight_g, unit_cost, status) values
  ('00000000-7e57-4000-8000-000000000451', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000421', 'PLA-NEGRO-01', 1000, 60, 'open'),
  ('00000000-7e57-4000-8000-000000000452', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000421', 'PLA-NEGRO-02', 1000, 60, 'open');

-- --------------------------------------------------------------- helpers

-- What the owner decided (2026-10-08). Everything not listed here is the day
-- to day: owner and operator write, only the owner deletes.
create function pg_temp.owner_tables() returns text[] language sql immutable as $$
  select array[
    'accounts', 'assets', 'cost_profiles', 'gift_categories', 'maintenance_plans',
    'printer_components', 'printers', 'sales_channels', 'transaction_categories', 'workshop_settings'
  ]
$$;

create function pg_temp.ledgers() returns text[] language sql immutable as $$
  select array['order_deliveries', 'order_delivery_lines', 'stock_movements', 'transactions']
$$;

-- Tables that, like a ledger, are only appended to, without being one: an
-- idempotency key names one payment or one movement for good
-- (order_payment_keys, from ventas; purchase_payment_requests and
-- item_movement_requests, from compras). Whether the service key keeps its
-- rights on them is up to the area that owns them; here only the API roles
-- of a person are checked. A table that is not there yet is simply not in
-- the loop.
create function pg_temp.append_only() returns text[] language sql immutable as $$
  select array['item_movement_requests', 'order_payment_keys', 'purchase_payment_requests']
$$;

create function pg_temp.expected(p_table text, p_cmd text, p_who text) returns boolean
language sql immutable as $$
  select case
    when p_who = 'anon' then false
    when p_who = 'outsider' then p_table = 'workspaces' and p_cmd = 'INSERT'
    when p_cmd = 'SELECT' then true
    when p_table = 'workspaces' then p_cmd = 'INSERT' or (p_cmd = 'UPDATE' and p_who = 'owner')
    when p_table = 'workspace_members' then p_who = 'owner'
    when p_table = 'document_counters' then false
    -- Una entrega solo la escribe deliver_order (ADR-020): nadie la agrega a mano.
    when p_table in ('order_deliveries', 'order_delivery_lines') then false
    -- Un movimiento de stock, tampoco: lo escriben sus flujos, que se prueban
    -- abajo con filas reales (ADR-025, punto 9).
    when p_table = 'stock_movements' and p_cmd = 'INSERT' then false
    when p_table = any (pg_temp.owner_tables()) then p_who = 'owner'
    when p_table = any (pg_temp.ledgers() || pg_temp.append_only()) then p_cmd = 'INSERT' and p_who in ('owner', 'operator')
    when p_cmd = 'DELETE' then p_who = 'owner'
    else p_who in ('owner', 'operator')
  end
$$;

create function pg_temp.person(p_who text) returns uuid language sql immutable as $$
  select case p_who
    when 'owner' then '00000000-7e57-4000-8000-0000000000a1'::uuid
    when 'operator' then '00000000-7e57-4000-8000-0000000000a2'::uuid
    when 'viewer' then '00000000-7e57-4000-8000-0000000000a3'::uuid
    when 'outsider' then '00000000-7e57-4000-8000-0000000000a4'::uuid
  end
$$;

create function pg_temp.label(p_who text) returns text language sql immutable as $$
  select case p_who
    when 'owner' then 'dueño' when 'operator' then 'operador' when 'viewer' then 'solo lectura'
    when 'outsider' then 'alguien de otro taller' else 'sin sesión'
  end
$$;

create function pg_temp.fail(p_message text) returns void language sql as $$
  select set_config('permisos.fallas', current_setting('permisos.fallas', true) || E'\n  - ' || p_message, true)
$$;

-- One policy expression, evaluated against a row of this workshop: the
-- policies here only look at the workshop, and the row has nulls elsewhere.
-- A stock movement names what it moves: the roll of this workshop, which may
-- be moved by hand. Parts and products are tried with real rows below.
create function pg_temp.holds(p_table text, p_expression text) returns boolean language plpgsql as $$
declare
  v_result boolean;
begin
  execute format(
    'select (%s) from (select (jsonb_populate_record(null::public.%I, $1)).*) as %I',
    p_expression, p_table, p_table
  )
  into v_result
  using jsonb_build_object('workspace_id', '00000000-7e57-4000-8000-000000000001', 'id', '00000000-7e57-4000-8000-000000000001')
     || case when p_table = 'stock_movements'
             then jsonb_build_object('spool_id', '00000000-7e57-4000-8000-000000000451')
             else '{}'::jsonb end;
  return coalesce(v_result, false);
end;
$$;

-- Whether this person can run this command on this table at all: the table
-- privilege first, then the policies the way PostgreSQL combines them.
create function pg_temp.can(p_table text, p_cmd text, p_who text) returns boolean language plpgsql as $$
declare
  v_role text := case when p_who = 'anon' then 'anon' else 'authenticated' end;
  v_policy record;
  v_permissive_using boolean := false;
  v_permissive_check boolean := false;
  v_restrictive boolean := true;
  v_using boolean;
  v_check boolean;
begin
  if not has_table_privilege(v_role, format('public.%I', p_table), p_cmd) then
    return false;
  end if;

  perform set_config(
    'request.jwt.claims',
    case when p_who = 'anon' then '{"role":"anon"}'
         else json_build_object('sub', pg_temp.person(p_who), 'role', 'authenticated')::text end,
    true
  );

  for v_policy in
    select p.qual, p.with_check, p.permissive
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = p_table
      and p.cmd in (p_cmd, 'ALL')
      and (v_role = any (p.roles) or 'public' = any (p.roles))
  loop
    v_using := case when p_cmd = 'INSERT' then true else pg_temp.holds(p_table, coalesce(v_policy.qual, 'true')) end;
    v_check := case when p_cmd in ('INSERT', 'UPDATE')
                    then pg_temp.holds(p_table, coalesce(v_policy.with_check, v_policy.qual, 'true'))
                    else true end;
    if v_policy.permissive = 'PERMISSIVE' then
      v_permissive_using := v_permissive_using or v_using;
      v_permissive_check := v_permissive_check or v_check;
    else
      v_restrictive := v_restrictive and v_using and v_check;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_permissive_using and v_permissive_check and v_restrictive;
end;
$$;

-- Runs one statement as a person, through RLS, and always undoes it. Answers
-- `ok:<rows>` or `error:<sqlstate>:<message>`.
create function pg_temp.attempt(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v_rows bigint;
  v_result text;
begin
  begin
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', pg_temp.person(p_who), 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_result := 'ok:' || v_rows;
    raise exception using errcode = 'PT999', message = 'deshacer';
  exception
    when sqlstate 'PT999' then null;
    when others then v_result := 'error:' || sqlstate || ':' || sqlerrm;
  end;
  return v_result;
end;
$$;

create function pg_temp.expect(p_case text, p_who text, p_sql text, p_expected text) returns void
language plpgsql as $$
declare
  v_actual text := pg_temp.attempt(p_who, p_sql);
begin
  if v_actual is null or v_actual not like p_expected || '%' then
    perform pg_temp.fail(format('%s · %s: se esperaba %s y dio %s', p_case, pg_temp.label(p_who), p_expected, v_actual));
  end if;
end;
$$;

select set_config('permisos.fallas', '', true);

-- ------------------------------------------------- 1. la matriz entera

do $$
declare
  v_table text;
  v_cmd text;
  v_who text;
  v_expected boolean;
  v_actual boolean;
  v_role text;
  v_privilege text;
begin
  for v_table in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', v_table)::regclass) then
      perform pg_temp.fail(format('%s: no tiene seguridad por fila', v_table));
      continue;
    end if;

    foreach v_cmd in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      foreach v_who in array array['owner', 'operator', 'viewer', 'outsider', 'anon'] loop
        v_expected := pg_temp.expected(v_table, v_cmd, v_who);
        v_actual := pg_temp.can(v_table, v_cmd, v_who);
        if v_actual is distinct from v_expected then
          perform pg_temp.fail(format(
            '%s · %s · %s: %s', v_table, v_cmd, pg_temp.label(v_who),
            case when v_actual then 'puede y no debería' else 'no puede y debería' end
          ));
        end if;
      end loop;
    end loop;
  end loop;

  -- Ni siquiera la llave de servicio cambia un libro: se anula o se corrige
  -- con otro movimiento. Y una entrega no se agrega a mano: la escribe
  -- deliver_order, que corre como su dueño.
  foreach v_table in array pg_temp.ledgers() loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['UPDATE', 'DELETE', 'TRUNCATE', 'INSERT'] loop
        continue when v_privilege = 'INSERT' and v_table not in ('order_deliveries', 'order_delivery_lines');
        if has_table_privilege(v_role, format('public.%I', v_table), v_privilege) then
          perform pg_temp.fail(format('%s · %s · rol %s: tiene el privilegio', v_table, v_privilege, v_role));
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

-- --------------------------------------------- 2. casos de verdad: datos

insert into public.workshop_settings (workspace_id) values ('00000000-7e57-4000-8000-000000000001');

insert into public.cost_profiles (
  id, workspace_id, valid_from, labor_rate_per_hour, energy_rate_per_kwh, target_margin
) values
  ('00000000-7e57-4000-8000-000000000101', '00000000-7e57-4000-8000-000000000001',
   app.workspace_day('00000000-7e57-4000-8000-000000000001', now()) - 10, 15, 0.75, 0.5),
  ('00000000-7e57-4000-8000-000000000102', '00000000-7e57-4000-8000-000000000001',
   app.workspace_day('00000000-7e57-4000-8000-000000000001', now()) + 5, 16, 0.75, 0.5);

insert into public.accounts (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000201', '00000000-7e57-4000-8000-000000000001', 'Efectivo');

insert into public.transaction_categories (id, workspace_id, name, direction) values
  ('00000000-7e57-4000-8000-000000000211', '00000000-7e57-4000-8000-000000000001', 'Reembolsos', 'income'),
  ('00000000-7e57-4000-8000-000000000212', '00000000-7e57-4000-8000-000000000001', 'Compra de insumos', 'expense');

insert into public.transactions (
  id, workspace_id, account_id, type, category_id, amount, payment_method, occurred_at, void_reason, voided_at
) values
  ('00000000-7e57-4000-8000-000000000221', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000201', 'income', '00000000-7e57-4000-8000-000000000211',
   10, 'cash', now(), null, null),
  ('00000000-7e57-4000-8000-000000000222', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000201', 'expense', '00000000-7e57-4000-8000-000000000212',
   5, 'cash', now(), 'Se anotó dos veces', now());

insert into public.sales_channels (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000301', '00000000-7e57-4000-8000-000000000001', 'Instagram');

insert into public.gift_categories (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000311', '00000000-7e57-4000-8000-000000000001', 'Clientes');

insert into public.inventory_items (id, workspace_id, kind, name) values
  ('00000000-7e57-4000-8000-000000000431', '00000000-7e57-4000-8000-000000000001', 'supply', 'Cinta doble faz'),
  ('00000000-7e57-4000-8000-000000000432', '00000000-7e57-4000-8000-000000000001', 'supply', 'Sin historial');

insert into public.stock_movements (id, workspace_id, inventory_item_id, type, quantity, unit_cost) values
  ('00000000-7e57-4000-8000-000000000441', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000431', 'purchase', 5, 1.20);

insert into public.assets (id, workspace_id, name, cost, useful_life_hours) values
  ('00000000-7e57-4000-8000-000000000501', '00000000-7e57-4000-8000-000000000001', 'Impresora A1 mini', 1500, 5000);

insert into public.printers (id, workspace_id, asset_id, name, avg_power_w) values
  ('00000000-7e57-4000-8000-000000000511', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000501', 'A1 mini', 57);

insert into public.customers (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000601', '00000000-7e57-4000-8000-000000000001', 'Cliente de prueba');

-- Una foto ya subida, para reemplazarla y borrarla (las fotos van bajo la
-- carpeta del taller, en el bucket «media»).
insert into storage.objects (bucket_id, name) values
  ('media', '00000000-7e57-4000-8000-000000000001/permisos-ya-subida.webp');

-- El estante (ADR-020): una pieza, un empaque y un producto armado con su
-- receta, una placa que da la pieza, un trabajo imprimiéndose con su rollo,
-- un pedido de catálogo y una compra por pagar. Lo que ya hay se escribe sin
-- sesión, como lo haría una migración.
insert into public.inventory_items (id, workspace_id, kind, name) values
  ('00000000-7e57-4000-8000-000000000464', '00000000-7e57-4000-8000-000000000001', 'part', 'Tapa roja'),
  ('00000000-7e57-4000-8000-000000000465', '00000000-7e57-4000-8000-000000000001', 'packaging', 'Bolsa');

insert into public.catalog_products (id, workspace_id, name, slug, status) values
  ('00000000-7e57-4000-8000-000000000461', '00000000-7e57-4000-8000-000000000001',
   'Botella de prueba', 'botella-de-prueba-permisos', 'published');

insert into public.product_variants (id, workspace_id, product_id, name, list_price, active) values
  ('00000000-7e57-4000-8000-000000000462', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000461', 'Roja', 20, true);

insert into public.recipes (id, workspace_id, variant_id, version, assembled) values
  ('00000000-7e57-4000-8000-000000000463', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000462', 1, true);

insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000463',
   '00000000-7e57-4000-8000-000000000464', 1),
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000463',
   '00000000-7e57-4000-8000-000000000465', 1);

insert into public.inventory_items (id, workspace_id, kind, name, product_variant_id) values
  ('00000000-7e57-4000-8000-000000000466', '00000000-7e57-4000-8000-000000000001',
   'finished_good', 'Botella roja armada', '00000000-7e57-4000-8000-000000000462');

insert into public.recipe_plates (id, workspace_id, recipe_id, units_per_run, print_time_s) values
  ('00000000-7e57-4000-8000-000000000467', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000463', 9, 3600);

insert into public.recipe_plate_outputs (workspace_id, recipe_plate_id, inventory_item_id, units_per_run) values
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000467',
   '00000000-7e57-4000-8000-000000000464', 9);

insert into public.inventory_items (id, workspace_id, kind, name) values
  ('00000000-7e57-4000-8000-000000000468', '00000000-7e57-4000-8000-000000000001', 'supply', 'Imán');

insert into public.stock_movements (workspace_id, type, spool_id, inventory_item_id, quantity, unit_cost) values
  ('00000000-7e57-4000-8000-000000000001', 'purchase', '00000000-7e57-4000-8000-000000000451', null, 1000, 0.06),
  ('00000000-7e57-4000-8000-000000000001', 'purchase', '00000000-7e57-4000-8000-000000000452', null, 1000, 0.06),
  ('00000000-7e57-4000-8000-000000000001', 'purchase', null, '00000000-7e57-4000-8000-000000000468', 20, 0.5),
  ('00000000-7e57-4000-8000-000000000001', 'production', null, '00000000-7e57-4000-8000-000000000464', 5, 1),
  ('00000000-7e57-4000-8000-000000000001', 'purchase', null, '00000000-7e57-4000-8000-000000000465', 10, 0.5),
  ('00000000-7e57-4000-8000-000000000001', 'production', null, '00000000-7e57-4000-8000-000000000466', 3, 8);

insert into public.print_jobs (id, workspace_id, printer_id, recipe_plate_id, label, status, started_at) values
  ('00000000-7e57-4000-8000-000000000481', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000511', '00000000-7e57-4000-8000-000000000467',
   'Tapas rojas', 'printing', now() - interval '1 hour');

insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, estimated_g) values
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000481',
   '00000000-7e57-4000-8000-000000000451', 12);

insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total) values
  ('00000000-7e57-4000-8000-000000000471', '00000000-7e57-4000-8000-000000000001',
   'ORD-PERMISOS-1', 'sale', '00000000-7e57-4000-8000-000000000601', 'confirmed', 20);

insert into public.order_lines (id, workspace_id, order_id, position, variant_id, description, quantity, unit_price) values
  ('00000000-7e57-4000-8000-000000000472', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000471', 1, '00000000-7e57-4000-8000-000000000462',
   'Botella de prueba — Roja', 1, 20);

insert into public.purchases (id, workspace_id) values
  ('00000000-7e57-4000-8000-000000000491', '00000000-7e57-4000-8000-000000000001');

insert into public.purchase_lines (workspace_id, purchase_id, inventory_item_id, quantity, unit_price) values
  ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000491',
   '00000000-7e57-4000-8000-000000000465', 2, 5);

-- Otro taller, con su pieza: lo de uno no se cuenta ni se mueve desde el otro.
insert into public.workspaces (id, name) values
  ('00000000-7e57-4000-8000-000000000002', 'Otro taller de prueba de permisos');

insert into public.inventory_items (id, workspace_id, kind, name) values
  ('00000000-7e57-4000-8000-000000000495', '00000000-7e57-4000-8000-000000000002', 'part', 'Tapa de otro taller');

-- Quien entra como «alguien de otro taller» es dueño de ese otro taller: lo
-- que puede hacer desde el suyo es lo que se prueba en la parte 4. Su
-- catálogo tiene un producto armado con su receta, y una compra.
insert into public.workspace_members (workspace_id, user_id, role, display_name) values
  ('00000000-7e57-4000-8000-000000000002', '00000000-7e57-4000-8000-0000000000a4', 'owner', 'Dueño del otro taller');

insert into public.catalog_products (id, workspace_id, name, slug, status) values
  ('00000000-7e57-4000-8000-000000000496', '00000000-7e57-4000-8000-000000000002',
   'Caja del otro taller', 'caja-del-otro-taller-permisos', 'published');

insert into public.product_variants (id, workspace_id, product_id, name, list_price, active) values
  ('00000000-7e57-4000-8000-000000000497', '00000000-7e57-4000-8000-000000000002',
   '00000000-7e57-4000-8000-000000000496', 'Azul', 20, true);

insert into public.recipes (id, workspace_id, variant_id, version, assembled) values
  ('00000000-7e57-4000-8000-000000000498', '00000000-7e57-4000-8000-000000000002',
   '00000000-7e57-4000-8000-000000000497', 1, true);

insert into public.purchases (id, workspace_id) values
  ('00000000-7e57-4000-8000-000000000499', '00000000-7e57-4000-8000-000000000002');

-- ------------------------------------------- 2. casos de verdad: pruebas

do $$
declare
  c_ws constant text := '''00000000-7e57-4000-8000-000000000001''';
  c_income constant text := '''00000000-7e57-4000-8000-000000000221''';
  c_voided constant text := '''00000000-7e57-4000-8000-000000000222''';
  c_movement constant text := '''00000000-7e57-4000-8000-000000000441''';
  c_printer constant text := '''00000000-7e57-4000-8000-000000000511''';
  c_owner constant text := '''00000000-7e57-4000-8000-0000000000a1''';
  c_photo constant text := '''00000000-7e57-4000-8000-000000000001/permisos-ya-subida.webp''';
begin
  -- El libro de dinero (T1-02, T5-01): nadie edita, desanula ni borra.
  perform pg_temp.expect('Cambiar el monto de un cobro', 'operator',
    'update public.transactions set amount = 999.99 where id = ' || c_income, 'error:42501');
  perform pg_temp.expect('Cambiar el monto de un cobro', 'owner',
    'update public.transactions set amount = 999.99 where id = ' || c_income, 'error:42501');
  perform pg_temp.expect('Desanular un movimiento', 'owner',
    'update public.transactions set voided_at = null, void_reason = null where id = ' || c_voided, 'error:42501');
  perform pg_temp.expect('Borrar un movimiento de dinero', 'owner',
    'delete from public.transactions where id = ' || c_income, 'error:42501');
  perform pg_temp.expect('Anotar un egreso en Caja', 'operator',
    'insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method) values ('
    || c_ws || ', ''00000000-7e57-4000-8000-000000000201'', ''expense'', ''00000000-7e57-4000-8000-000000000212'', 3, ''cash'')',
    'ok:1');
  perform pg_temp.expect('Anotar un egreso en Caja', 'viewer',
    'insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method) values ('
    || c_ws || ', ''00000000-7e57-4000-8000-000000000201'', ''expense'', ''00000000-7e57-4000-8000-000000000212'', 3, ''cash'')',
    'error:42501');

  -- El kardex (T3-03): se corrige con otro movimiento, nunca se reescribe.
  perform pg_temp.expect('Cambiar la cantidad de un movimiento de stock', 'operator',
    'update public.stock_movements set quantity = 500 where id = ' || c_movement, 'error:42501');
  perform pg_temp.expect('Borrar un movimiento de stock', 'owner',
    'delete from public.stock_movements where id = ' || c_movement, 'error:42501');
  perform pg_temp.expect('Borrar un artículo con historial de stock', 'owner',
    'delete from public.inventory_items where id = ''00000000-7e57-4000-8000-000000000431''', 'error:P0001');
  perform pg_temp.expect('Borrar un artículo sin historial', 'owner',
    'delete from public.inventory_items where id = ''00000000-7e57-4000-8000-000000000432''', 'ok:1');
  perform pg_temp.expect('Corregir el stock con un ajuste a mano', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity) values ('
    || c_ws || ', ''00000000-7e57-4000-8000-000000000431'', ''adjustment'', -1)', 'error:42501');
  perform pg_temp.expect('Corregir el stock con un conteo', 'operator',
    'select public.move_item_stock(''00000000-7e57-4000-8000-000000000431'', ''count'', 4)', 'ok:1');
  perform pg_temp.expect('Cambiar una entrega', 'owner',
    'update public.order_deliveries set workspace_id = workspace_id where workspace_id = ' || c_ws, 'error:42501');
  perform pg_temp.expect('Borrar una línea de entrega', 'owner',
    'delete from public.order_delivery_lines where workspace_id = ' || c_ws, 'error:42501');

  -- La configuración (T1-13): la ve el operador, la cambia el dueño.
  perform pg_temp.expect('Crear una versión de los parámetros de costo', 'operator',
    'insert into public.cost_profiles (workspace_id, valid_from, labor_rate_per_hour, energy_rate_per_kwh, target_margin) values ('
    || c_ws || ', app.workspace_day(' || c_ws || ', now()) + 20, 15, 0.75, 0.5)', 'error:42501');
  perform pg_temp.expect('Crear una versión de los parámetros de costo', 'owner',
    'insert into public.cost_profiles (workspace_id, valid_from, labor_rate_per_hour, energy_rate_per_kwh, target_margin) values ('
    || c_ws || ', app.workspace_day(' || c_ws || ', now()) + 20, 15, 0.75, 0.5)', 'ok:1');
  perform pg_temp.expect('Cambiar el horario', 'operator',
    'update public.workshop_settings set print_first_start = ''07:00'' where workspace_id = ' || c_ws, 'error:42501');
  perform pg_temp.expect('Cambiar el horario', 'owner',
    'update public.workshop_settings set print_first_start = ''07:00'' where workspace_id = ' || c_ws, 'ok:1');
  perform pg_temp.expect('Crear un canal de venta', 'operator',
    'insert into public.sales_channels (workspace_id, name) values (' || c_ws || ', ''Feria'')', 'error:42501');
  perform pg_temp.expect('Crear un canal de venta', 'owner',
    'insert into public.sales_channels (workspace_id, name) values (' || c_ws || ', ''Feria'')', 'ok:1');
  perform pg_temp.expect('Cambiar el saldo de apertura de una cuenta', 'operator',
    'update public.accounts set opening_balance = 1000 where workspace_id = ' || c_ws, 'error:42501');
  perform pg_temp.expect('Cambiar el saldo de apertura de una cuenta', 'owner',
    'update public.accounts set opening_balance = 1000 where workspace_id = ' || c_ws, 'ok:1');
  perform pg_temp.expect('Crear una categoría de dinero', 'operator',
    'insert into public.transaction_categories (workspace_id, name, direction) values (' || c_ws || ', ''Publicidad'', ''expense'')',
    'error:42501');
  perform pg_temp.expect('Renombrar una categoría de regalo', 'operator',
    'update public.gift_categories set name = ''Familia'' where workspace_id = ' || c_ws, 'error:42501');
  perform pg_temp.expect('Renombrar la impresora', 'operator',
    'update public.printers set name = ''Otra'' where id = ' || c_printer, 'error:42501');
  perform pg_temp.expect('Renombrar la impresora', 'owner',
    'update public.printers set name = ''Otra'' where id = ' || c_printer, 'ok:1');
  -- Los planes de mantenimiento son configuración de la impresora: los
  -- decide el dueño. Registrar lo que se hizo es del día a día (abajo).
  perform pg_temp.expect('Crear un plan de mantenimiento', 'operator',
    'insert into public.maintenance_plans (workspace_id, printer_id, task, every_hours) values ('
    || c_ws || ', ' || c_printer || ', ''Limpiar la placa'', 50)', 'error:42501');
  perform pg_temp.expect('Crear un plan de mantenimiento', 'owner',
    'insert into public.maintenance_plans (workspace_id, printer_id, task, every_hours) values ('
    || c_ws || ', ' || c_printer || ', ''Limpiar la placa'', 50)', 'ok:1');
  perform pg_temp.expect('Instalar un componente', 'operator',
    'insert into public.printer_components (workspace_id, printer_id, kind) values ('
    || c_ws || ', ' || c_printer || ', ''nozzle'')', 'error:42501');
  -- Producción bloquea la fila de la impresora al iniciar un trabajo
  -- (one_print_at_a_time): el operador tiene que poder hacerlo.
  perform pg_temp.expect('Bloquear la impresora al iniciar un trabajo', 'operator',
    'select 1 from public.printers where id = ' || c_printer || ' for update', 'ok:1');

  -- El día a día: el operador escribe, el de solo lectura no, y borrar
  -- sigue siendo del dueño.
  perform pg_temp.expect('Crear un cliente', 'operator',
    'insert into public.customers (workspace_id, name) values (' || c_ws || ', ''Otra clienta'')', 'ok:1');
  perform pg_temp.expect('Crear un cliente', 'viewer',
    'insert into public.customers (workspace_id, name) values (' || c_ws || ', ''Otra clienta'')', 'error:42501');
  perform pg_temp.expect('Renombrar un cliente', 'viewer',
    'update public.customers set name = ''Otro'' where workspace_id = ' || c_ws, 'error:42501');
  perform pg_temp.expect('Borrar un cliente', 'operator',
    'delete from public.customers where workspace_id = ' || c_ws, 'ok:0');
  perform pg_temp.expect('Renombrar un insumo', 'operator',
    'update public.inventory_items set name = ''Cinta doble contacto'' where id = ''00000000-7e57-4000-8000-000000000431''', 'ok:1');

  -- Las versiones de los parámetros (T1-14): la programada se corrige o se
  -- quita; la que ya rige no se toca, y ninguna empieza en el pasado.
  perform pg_temp.expect('Corregir una versión programada', 'owner',
    'update public.cost_profiles set labor_rate_per_hour = 15 where id = ''00000000-7e57-4000-8000-000000000102''', 'ok:1');
  perform pg_temp.expect('Quitar una versión programada', 'owner',
    'delete from public.cost_profiles where id = ''00000000-7e57-4000-8000-000000000102''', 'ok:1');
  perform pg_temp.expect('Quitar una versión programada', 'operator',
    'delete from public.cost_profiles where id = ''00000000-7e57-4000-8000-000000000102''', 'ok:0');
  perform pg_temp.expect('Corregir la versión que rige', 'owner',
    'update public.cost_profiles set labor_rate_per_hour = 150 where id = ''00000000-7e57-4000-8000-000000000101''', 'error:P0001');
  perform pg_temp.expect('Quitar la versión que rige', 'owner',
    'delete from public.cost_profiles where id = ''00000000-7e57-4000-8000-000000000101''', 'error:P0001');
  perform pg_temp.expect('Crear una versión que empieza ayer', 'owner',
    'insert into public.cost_profiles (workspace_id, valid_from, labor_rate_per_hour, energy_rate_per_kwh, target_margin) values ('
    || c_ws || ', app.workspace_day(' || c_ws || ', now()) - 1, 15, 0.75, 0.5)', 'error:P0001');
  perform pg_temp.expect('Mover una versión programada al pasado', 'owner',
    'update public.cost_profiles set valid_from = app.workspace_day(' || c_ws
    || ', now()) - 1 where id = ''00000000-7e57-4000-8000-000000000102''', 'error:P0001');

  -- Miembros: el taller nunca se queda sin dueño.
  perform pg_temp.expect('Quitarse el rol de dueño siendo el único', 'owner',
    'update public.workspace_members set role = ''operator'' where user_id = ' || c_owner, 'error:P0001');
  perform pg_temp.expect('Salir del taller siendo el único dueño', 'owner',
    'delete from public.workspace_members where user_id = ' || c_owner, 'error:P0001');
  perform pg_temp.expect('Hacerse dueño', 'operator',
    'update public.workspace_members set role = ''owner'' where user_id = ''00000000-7e57-4000-8000-0000000000a2''', 'ok:0');

  -- La impresora se guarda entera o no se guarda (T1-07).
  perform pg_temp.expect('Guardar la impresora', 'operator',
    'select public.save_printer(p_printer_id => ' || c_printer || ', p_name => ''A1 mini'', p_initial_hours => 0, '
    || 'p_avg_power_w => 57, p_maintenance_budget_per_year => 240, p_expected_hours_per_year => 2000, '
    || 'p_asset_cost => 2000, p_useful_life_hours => 5000)',
    'error:42501:Solo el dueño');
  perform pg_temp.expect('Guardar la impresora con una potencia imposible', 'owner',
    'select public.save_printer(p_printer_id => ' || c_printer || ', p_name => ''A1 mini'', p_initial_hours => 0, '
    || 'p_avg_power_w => 10000000, p_maintenance_budget_per_year => 240, p_expected_hours_per_year => 2000, '
    || 'p_asset_cost => 2000, p_useful_life_hours => 5000)',
    'error:22003');
  perform pg_temp.expect('Guardar la impresora', 'owner',
    'select public.save_printer(p_printer_id => ' || c_printer || ', p_name => ''A1 mini'', p_initial_hours => 0, '
    || 'p_avg_power_w => 60, p_maintenance_budget_per_year => 240, p_expected_hours_per_year => 2000, '
    || 'p_asset_cost => 1800, p_useful_life_hours => 5000)',
    'ok:1');
  perform pg_temp.expect('Registrar otra impresora', 'owner',
    'select public.save_printer(p_workspace_id => ' || c_ws || ', p_name => ''P1S'', p_model => ''Bambu Lab P1S'', '
    || 'p_initial_hours => 0, p_avg_power_w => 120, p_maintenance_budget_per_year => 300, '
    || 'p_expected_hours_per_year => 2000, p_asset_cost => 3500, p_useful_life_hours => 6000)',
    'ok:1');

  -- Las fotos (storage.objects, bucket «media»): sube, reemplaza y borra
  -- quien opera; el de solo lectura solo mira. Supabase solo deja borrar
  -- desde su API de Storage, que avisa con storage.allow_delete_query: la
  -- prueba hace lo mismo, para medir la política y no esa protección.
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.expect('Subir una foto', 'operator',
    'insert into storage.objects (bucket_id, name) values (''media'', ''00000000-7e57-4000-8000-000000000001/permisos-nueva.webp'')',
    'ok:1');
  perform pg_temp.expect('Subir una foto', 'viewer',
    'insert into storage.objects (bucket_id, name) values (''media'', ''00000000-7e57-4000-8000-000000000001/permisos-nueva.webp'')',
    'error:42501');
  perform pg_temp.expect('Subir una foto a otro taller', 'outsider',
    'insert into storage.objects (bucket_id, name) values (''media'', ''00000000-7e57-4000-8000-000000000001/permisos-nueva.webp'')',
    'error:42501');
  perform pg_temp.expect('Reemplazar una foto', 'operator',
    'update storage.objects set metadata = ''{}'' where bucket_id = ''media'' and name = ' || c_photo, 'ok:1');
  perform pg_temp.expect('Reemplazar una foto', 'viewer',
    'update storage.objects set metadata = ''{}'' where bucket_id = ''media'' and name = ' || c_photo, 'error:42501');
  perform pg_temp.expect('Ver una foto', 'viewer',
    'select 1 from storage.objects where bucket_id = ''media'' and name = ' || c_photo, 'ok:1');
  perform pg_temp.expect('Ver una foto de otro taller', 'outsider',
    'select 1 from storage.objects where bucket_id = ''media'' and name = ' || c_photo, 'ok:0');
  perform pg_temp.expect('Borrar una foto', 'operator',
    'delete from storage.objects where bucket_id = ''media'' and name = ' || c_photo, 'ok:1');
  perform pg_temp.expect('Borrar una foto', 'viewer',
    'delete from storage.objects where bucket_id = ''media'' and name = ' || c_photo, 'ok:0');

  -- Mantenimiento, incidentes y componentes registran lo que ya pasó: nada
  -- con fecha futura.
  perform pg_temp.expect('Registrar un mantenimiento', 'operator',
    'insert into public.maintenance_logs (workspace_id, printer_id, performed_at) values ('
    || c_ws || ', ' || c_printer || ', now() - interval ''1 hour'')', 'ok:1');
  perform pg_temp.expect('Registrar un mantenimiento para mañana', 'operator',
    'insert into public.maintenance_logs (workspace_id, printer_id, performed_at) values ('
    || c_ws || ', ' || c_printer || ', now() + interval ''1 day'')', 'error:P0001');
  perform pg_temp.expect('Registrar un incidente', 'operator',
    'insert into public.incidents (workspace_id, printer_id, symptom, occurred_at) values ('
    || c_ws || ', ' || c_printer || ', ''Se despegó la placa'', now() - interval ''1 hour'')', 'ok:1');
  perform pg_temp.expect('Registrar un incidente para mañana', 'operator',
    'insert into public.incidents (workspace_id, printer_id, symptom, occurred_at) values ('
    || c_ws || ', ' || c_printer || ', ''Se despegó la placa'', now() + interval ''1 day'')', 'error:P0001');
  perform pg_temp.expect('Resolver un incidente mañana', 'operator',
    'insert into public.incidents (workspace_id, printer_id, symptom, occurred_at, resolved_at) values ('
    || c_ws || ', ' || c_printer || ', ''Se despegó la placa'', now() - interval ''1 hour'', now() + interval ''1 day'')',
    'error:P0001');
  perform pg_temp.expect('Instalar un componente', 'owner',
    'insert into public.printer_components (workspace_id, printer_id, kind, installed_on) values ('
    || c_ws || ', ' || c_printer || ', ''nozzle'', app.workspace_day(' || c_ws || ', now()))', 'ok:1');
  perform pg_temp.expect('Instalar un componente mañana', 'owner',
    'insert into public.printer_components (workspace_id, printer_id, kind, installed_on) values ('
    || c_ws || ', ' || c_printer || ', ''nozzle'', app.workspace_day(' || c_ws || ', now()) + 1)', 'error:P0001');

  -- Los nombres no se repiten por cambiar mayúsculas o espacios (T1-11).
  perform pg_temp.expect('Canal «instagram» junto a «Instagram»', 'owner',
    'insert into public.sales_channels (workspace_id, name) values (' || c_ws || ', ''instagram'')', 'error:23505');
  perform pg_temp.expect('Cuenta « efectivo » junto a «Efectivo»', 'owner',
    'insert into public.accounts (workspace_id, name) values (' || c_ws || ', '' efectivo '')', 'error:23505');
  perform pg_temp.expect('Categoría de egreso en minúsculas', 'owner',
    'insert into public.transaction_categories (workspace_id, name, direction) values (' || c_ws || ', ''compra de insumos'', ''expense'')',
    'error:23505');
  perform pg_temp.expect('El mismo nombre en la otra dirección', 'owner',
    'insert into public.transaction_categories (workspace_id, name, direction) values (' || c_ws || ', ''compra de insumos'', ''income'')',
    'ok:1');
  perform pg_temp.expect('Marca en mayúsculas', 'operator',
    'insert into public.brands (workspace_id, name) values (' || c_ws || ', ''KREAR3D'')', 'error:23505');
  perform pg_temp.expect('Impresora en minúsculas', 'owner',
    'insert into public.printers (workspace_id, name) values (' || c_ws || ', ''a1 mini'')', 'error:23505');
  perform pg_temp.expect('Insumo en mayúsculas', 'operator',
    'insert into public.inventory_items (workspace_id, kind, name) values (' || c_ws || ', ''supply'', ''CINTA DOBLE FAZ'')', 'error:23505');
  perform pg_temp.expect('Filamento «negro» junto a «Negro»', 'operator',
    'insert into public.filament_skus (workspace_id, brand_id, material_id, color_name) values (' || c_ws
    || ', ''00000000-7e57-4000-8000-000000000401'', ''00000000-7e57-4000-8000-000000000411'', ''negro'')', 'error:23505');
  perform pg_temp.expect('Categoría de regalo en minúsculas', 'owner',
    'insert into public.gift_categories (workspace_id, name) values (' || c_ws || ', ''clientes'')', 'error:23505');
end;
$$;

-- ------------------------------------- 3. el estante solo se mueve por sus flujos

do $$
declare
  c_ws constant text := '''00000000-7e57-4000-8000-000000000001''';
  c_spool constant text := '''00000000-7e57-4000-8000-000000000451''';
  c_part constant text := '''00000000-7e57-4000-8000-000000000464''';
  c_bag constant text := '''00000000-7e57-4000-8000-000000000465''';
  c_product constant text := '''00000000-7e57-4000-8000-000000000466''';
  c_order constant text := '''00000000-7e57-4000-8000-000000000471''';
  c_foreign_part constant text := '''00000000-7e57-4000-8000-000000000495''';
  v_flows constant text[] := array[
    'select public.complete_print_job(p_job_id => ''00000000-7e57-4000-8000-000000000481'', p_result => ''success'', '
      || 'p_expected_status => ''printing'', p_actual_time_s => 3600, '
      || 'p_filament_usage => ''[{"spool_id": "00000000-7e57-4000-8000-000000000451", "actual_g": 12}]'', '
      || 'p_material_cost => 0.72, p_energy_cost => 0.1, p_machine_cost => 0.5)',
    'select * from public.assemble_product(''00000000-7e57-4000-8000-000000000462'', 2, null, ''00000000-7e57-4000-8000-0000000004b1'')',
    'select public.count_shelf(''[{"inventory_item_id": "00000000-7e57-4000-8000-000000000464", "counted": 4}]'')',
    'select public.deliver_order(''00000000-7e57-4000-8000-000000000471'')',
    'select public.quick_sale(''00000000-7e57-4000-8000-000000000001'', '
      || '''[{"variant_id": "00000000-7e57-4000-8000-000000000462", "quantity": 1, "unit_price": 20}]'', '
      || '''00000000-7e57-4000-8000-000000000601'')'
  ];
  v_names constant text[] := array['Cerrar una impresión', 'Armar', 'Contar el estante', 'Entregar un pedido', 'Vender en la Venta rápida'];
  v_i integer;
begin
  -- Por la API no entra al estante una pieza ni un producto, ni siquiera
  -- con el dueño: entran imprimiendo, armando o contando, y salen entregando.
  perform pg_temp.expect('Meter una pieza al estante a mano', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity, unit_cost) values ('
    || c_ws || ', ' || c_part || ', ''production'', 10, 1)', 'error:42501');
  perform pg_temp.expect('Meter una pieza al estante a mano', 'owner',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity, unit_cost) values ('
    || c_ws || ', ' || c_part || ', ''production'', 10, 1)', 'error:42501');
  perform pg_temp.expect('Sacar un producto del estante a mano', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity) values ('
    || c_ws || ', ' || c_product || ', ''delivery'', -1)', 'error:42501');
  perform pg_temp.expect('Mover a mano una pieza de otro taller', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity) values ('
    || c_ws || ', ' || c_foreign_part || ', ''adjustment'', 1)', 'error:P0001:Ese rollo o artículo es de otro taller');
  -- Ni un rollo ni un empaque: también se mueven solo por sus flujos (la
  -- compra, el pesaje, el estado del rollo, move_item_stock), que se prueban
  -- abajo. Un insert directo fabricaba en Resultados una pérdida o una
  -- ganancia con el costo que quisiera.
  perform pg_temp.expect('Ajustar un rollo a mano', 'operator',
    'insert into public.stock_movements (workspace_id, spool_id, type, quantity) values ('
    || c_ws || ', ' || c_spool || ', ''adjustment'', -5)', 'error:42501');
  perform pg_temp.expect('Ajustar un empaque a mano', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity) values ('
    || c_ws || ', ' || c_bag || ', ''adjustment'', -1)', 'error:42501');
  perform pg_temp.expect('Fabricar a mano una ganancia en Resultados', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity, unit_cost, source_type, source_id) values ('
    || c_ws || ', ' || c_bag || ', ''adjustment'', 1, 50000, ''manual'', ' || c_bag || ')', 'error:42501');
  perform pg_temp.expect('Fabricar a mano un pesaje', 'owner',
    'insert into public.stock_movements (workspace_id, spool_id, type, quantity, unit_cost, source_type, source_id) values ('
    || c_ws || ', ' || c_spool || ', ''adjustment'', -500, 0.06, ''weighing'', ' || c_spool || ')', 'error:42501');
  -- Una entrega la escribe deliver_order, nadie más.
  perform pg_temp.expect('Escribir una entrega a mano', 'owner',
    'insert into public.order_deliveries (workspace_id, order_id) values (' || c_ws || ', ' || c_order || ')',
    'error:42501');
  perform pg_temp.expect('Escribir una línea de entrega a mano', 'operator',
    'insert into public.order_delivery_lines (workspace_id, delivery_id, order_line_id, quantity) values ('
    || c_ws || ', gen_random_uuid(), ''00000000-7e57-4000-8000-000000000472'', 1)', 'error:42501');

  -- Los flujos siguen funcionando para el operador y el dueño. «Solo
  -- lectura» recibe su frase, y alguien de otro taller, el «no encontramos»
  -- de siempre.
  for v_i in 1 .. array_length(v_flows, 1) loop
    perform pg_temp.expect(v_names[v_i], 'operator', v_flows[v_i], 'ok:');
    perform pg_temp.expect(v_names[v_i], 'owner', v_flows[v_i], 'ok:');
    perform pg_temp.expect(v_names[v_i], 'viewer', v_flows[v_i], 'error:42501:Solo el dueño o un operador del taller pueden');
    perform pg_temp.expect(v_names[v_i], 'outsider', v_flows[v_i], 'error:P0001:');
  end loop;

  perform pg_temp.expect('Contar una pieza de otro taller', 'operator',
    'select public.count_shelf(''[{"inventory_item_id": "00000000-7e57-4000-8000-000000000495", "counted": 4}]'')',
    'error:P0001:No encontramos lo que se contó');
  perform pg_temp.expect('Contar a la vez lo de dos talleres', 'operator',
    'select public.count_shelf(''[{"inventory_item_id": "00000000-7e57-4000-8000-000000000464", "counted": 4}, '
    || '{"inventory_item_id": "00000000-7e57-4000-8000-000000000495", "counted": 4}]'')',
    'error:P0001:Un conteo es de un solo taller');


  -- Compras y numeración: el rol se pregunta al principio, y el operador
  -- sigue pudiendo todo.
  perform pg_temp.expect('Pedir un número de pedido', 'operator',
    'select public.next_document_number(' || c_ws || ', ''order'')', 'ok:1');
  perform pg_temp.expect('Pedir un número de pedido', 'viewer',
    'select public.next_document_number(' || c_ws || ', ''order'')', 'error:42501:Solo el dueño o un operador');
  perform pg_temp.expect('Pedir un número de pedido', 'outsider',
    'select public.next_document_number(' || c_ws || ', ''order'')', 'error:P0001:No perteneces a este taller');
  -- Un rollo y un empaque: los movimientos que escribe pasan por la
  -- política como el operador, porque se mueven a mano.
  perform pg_temp.expect('Registrar una compra', 'operator',
    'select public.register_purchase(' || c_ws || ', ''[{"inventory_item_id": "00000000-7e57-4000-8000-000000000465", '
    || '"quantity": 4, "unit_price": 0.5, "allocated_extra_cost": 0, "unit_cost": 0.5}, '
    || '{"filament_sku_id": "00000000-7e57-4000-8000-000000000421", "quantity": 1, "unit_price": 60, '
    || '"allocated_extra_cost": 0, "unit_costs": [60]}]'')', 'ok:1');
  perform pg_temp.expect('Registrar una compra', 'viewer',
    'select public.register_purchase(' || c_ws || ', ''[{"inventory_item_id": "00000000-7e57-4000-8000-000000000465", '
    || '"quantity": 4, "unit_price": 0.5, "allocated_extra_cost": 0, "unit_cost": 0.5}]'')',
    'error:42501:Solo el dueño o un operador');
  perform pg_temp.expect('Pagar una compra', 'operator',
    'select public.record_purchase_payment(''00000000-7e57-4000-8000-000000000491'', '
    || '''00000000-7e57-4000-8000-000000000201'', 5, ''cash'')', 'ok:1');
  perform pg_temp.expect('Pagar una compra', 'viewer',
    'select public.record_purchase_payment(''00000000-7e57-4000-8000-000000000491'', '
    || '''00000000-7e57-4000-8000-000000000201'', 5, ''cash'')', 'error:42501:Solo el dueño o un operador');
  perform pg_temp.expect('Pagar una compra', 'outsider',
    'select public.record_purchase_payment(''00000000-7e57-4000-8000-000000000491'', '
    || '''00000000-7e57-4000-8000-000000000201'', 5, ''cash'')', 'error:P0001:No existe la compra indicada');
  perform pg_temp.expect('Pesar un rollo', 'operator',
    'select public.weigh_spool(' || c_spool || ', 1100, 200)', 'ok:1');
  perform pg_temp.expect('Pesar un rollo', 'viewer',
    'select public.weigh_spool(' || c_spool || ', 1100, 200)', 'error:42501:Solo el dueño o un operador');
  perform pg_temp.expect('Cambiar el estado de un rollo', 'operator',
    'select public.set_spool_status(' || c_spool || ', ''in_use'')', 'ok:1');
  -- Marcarlo agotado saca lo que tenía: el movimiento lo escribe su flujo.
  perform pg_temp.expect('Marcar agotado un rollo con filamento', 'operator',
    'select public.set_spool_status(''00000000-7e57-4000-8000-000000000452'', ''empty'')', 'ok:1');
  perform pg_temp.expect('Registrar una compra', 'owner',
    'select public.register_purchase(' || c_ws || ', ''[{"filament_sku_id": "00000000-7e57-4000-8000-000000000421", '
    || '"quantity": 1, "unit_price": 60, "allocated_extra_cost": 0, "unit_costs": [60]}]'')', 'ok:1');
  perform pg_temp.expect('Cambiar el estado de un rollo', 'viewer',
    'select public.set_spool_status(' || c_spool || ', ''in_use'')', 'error:42501:Solo el dueño o un operador');
  perform pg_temp.expect('Cambiar el estado de un rollo', 'outsider',
    'select public.set_spool_status(' || c_spool || ', ''in_use'')', 'error:P0001:No existe el rollo indicado');
  perform pg_temp.expect('Mover un empaque', 'operator',
    'select public.move_item_stock(' || c_bag || ', ''in'', 1)', 'ok:1');
  perform pg_temp.expect('Sacar un empaque por merma', 'operator',
    'select public.move_item_stock(' || c_bag || ', ''out'', 1, ''waste'')', 'ok:1');
  perform pg_temp.expect('Mover un empaque', 'viewer',
    'select public.move_item_stock(' || c_bag || ', ''in'', 1)', 'error:42501:Solo el dueño o un operador');
end;
$$;

-- Los flujos dicen que escriben solo mientras escriben: al volver, un insert
-- directo en la misma transacción ya no pasa.
select pg_temp.expect('Un insert directo después de un pesaje', 'operator', $q$do $x$
  begin
    perform public.weigh_spool('00000000-7e57-4000-8000-000000000451', 1100, 200);
    insert into public.stock_movements (workspace_id, spool_id, type, quantity)
    values ('00000000-7e57-4000-8000-000000000001', '00000000-7e57-4000-8000-000000000451', 'adjustment', -5);
  end $x$$q$, 'error:42501');

-- Lo que el estante tiene es de su taller, lo escriba quien lo escriba: ni
-- la consola deja un movimiento de un taller sobre la pieza de otro.
do $$
begin
  begin
    insert into public.stock_movements (workspace_id, type, inventory_item_id, quantity)
    values ('00000000-7e57-4000-8000-000000000001', 'adjustment', '00000000-7e57-4000-8000-000000000495', 1);
    perform pg_temp.fail('Un movimiento de stock sobre la pieza de otro taller: pasó');
  exception when sqlstate 'P0001' then null;
  end;
  -- Ni un rollo de un taller atado al trabajo de otro: cerrar ese trabajo
  -- corre como su dueño y escribe todos sus rollos.
  begin
    insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, estimated_g)
    values ('00000000-7e57-4000-8000-000000000002', '00000000-7e57-4000-8000-000000000481',
            '00000000-7e57-4000-8000-000000000451', 5);
    perform pg_temp.fail('Un rollo de otro taller atado a un trabajo: pasó');
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;

-- Las funciones que escriben el estante corren como su dueño, con el
-- search_path fijo, y no las llama quien no entró.
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'complete_print_job', 'assemble_product', 'count_shelf', 'deliver_order', 'points_within_its_workshop'
  ] loop
    if not exists (
      select 1 from pg_proc p
      where p.pronamespace = 'app'::regnamespace and p.proname = v_name
        and p.prosecdef and p.proconfig @> array['search_path=""']
    ) then
      perform pg_temp.fail(format('app.%s no corre como su dueño con search_path fijo', v_name));
    end if;
    if exists (
      select 1 from pg_proc p
      where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace) and p.proname = v_name
        and has_function_privilege('anon', p.oid, 'execute')
    ) then
      perform pg_temp.fail(format('%s: la puede llamar alguien sin sesión', v_name));
    end if;
  end loop;
end;
$$;

-- ------------------------------------- 4. lo de un taller apunta a lo suyo

do $$
declare
  c_ws2 constant text := '''00000000-7e57-4000-8000-000000000002''';
begin
  -- Desde su taller, el dueño de otro no cuelga nada de lo de este: ni una
  -- línea en su receta, ni una receta en su producto, ni una línea en su
  -- pedido, ni el producto terminado de su variante; tampoco usa en lo suyo
  -- un artículo de este (lo que pasó en la revisión con los imanes).
  perform pg_temp.expect('Colgar una línea en la receta de otro taller', 'outsider',
    'insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values ('
    || c_ws2 || ', ''00000000-7e57-4000-8000-000000000463'', ''00000000-7e57-4000-8000-000000000495'', 5)',
    'error:P0001:Esa receta es de otro taller');
  perform pg_temp.expect('Usar en la receta propia un artículo de otro taller', 'outsider',
    'insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values ('
    || c_ws2 || ', ''00000000-7e57-4000-8000-000000000498'', ''00000000-7e57-4000-8000-000000000468'', 5)',
    'error:P0001:Ese artículo es de otro taller');
  perform pg_temp.expect('Darle una receta al producto de otro taller', 'outsider',
    'insert into public.recipes (workspace_id, variant_id, version, assembled, active) values ('
    || c_ws2 || ', ''00000000-7e57-4000-8000-000000000462'', 2, true, true)',
    'error:P0001:Ese producto es de otro taller');
  perform pg_temp.expect('Colgar una línea en el pedido de otro taller', 'outsider',
    'insert into public.order_lines (workspace_id, order_id, position, description, quantity, unit_price) values ('
    || c_ws2 || ', ''00000000-7e57-4000-8000-000000000471'', 9, ''Colgada'', 1, 1)',
    'error:P0001:Ese pedido es de otro taller');
  perform pg_temp.expect('Crear el producto terminado de otra variante', 'outsider',
    'insert into public.inventory_items (workspace_id, kind, name, product_variant_id) values ('
    || c_ws2 || ', ''finished_good'', ''Botella ajena'', ''00000000-7e57-4000-8000-000000000462'')',
    'error:P0001:Ese producto es de otro taller');
  perform pg_temp.expect('Comprar para lo de otro taller', 'outsider',
    'insert into public.purchase_lines (workspace_id, purchase_id, inventory_item_id, quantity, unit_price) values ('
    || c_ws2 || ', ''00000000-7e57-4000-8000-000000000499'', ''00000000-7e57-4000-8000-000000000468'', 1, 99999)',
    'error:P0001:Ese artículo es de otro taller');
  -- Ni mover una fila propia hacia lo de otro: cambiar la llave también se mira.
  perform pg_temp.expect('Pasar la receta propia a un producto de otro taller', 'outsider',
    'update public.recipes set variant_id = ''00000000-7e57-4000-8000-000000000462'' '
    || 'where id = ''00000000-7e57-4000-8000-000000000498''',
    'error:P0001:Ese producto es de otro taller');
  -- Y la consola tampoco: la red vale para quien escriba.
  begin
    insert into public.order_lines (workspace_id, order_id, position, description, quantity, unit_price)
    values ('00000000-7e57-4000-8000-000000000002', '00000000-7e57-4000-8000-000000000471', 9, 'Colgada', 1, 1);
    perform pg_temp.fail('Una línea de otro taller en un pedido, desde la consola: pasó');
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;

-- Una fila de antes de la red (aquí se mete apagándola un momento): las
-- funciones que corren como su dueño no la leen. Es el caso de la revisión:
-- con la línea ajena, armar aquí gastaba cinco imanes, y armar allá decía
-- cuántos imanes hay aquí.
alter table public.recipe_items disable trigger recipe_items_same_workshop;
insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values
  ('00000000-7e57-4000-8000-000000000002', '00000000-7e57-4000-8000-000000000463',
   '00000000-7e57-4000-8000-000000000468', 5),
  ('00000000-7e57-4000-8000-000000000002', '00000000-7e57-4000-8000-000000000498',
   '00000000-7e57-4000-8000-000000000468', 1);
alter table public.recipe_items enable trigger recipe_items_same_workshop;

select pg_temp.expect('Armar con una línea ajena colgada en la receta', 'operator', $q$do $x$
  declare n integer;
  begin
    perform public.assemble_product('00000000-7e57-4000-8000-000000000462', 1);
    select count(*) into n from public.stock_movements
    where inventory_item_id = '00000000-7e57-4000-8000-000000000468' and source_type = 'assembly';
    if n <> 0 then raise exception 'armar gastó imanes: % movimientos', n; end if;
  end $x$$q$, 'ok:');

select pg_temp.expect('Armar en el otro taller con un artículo de este', 'outsider', $q$
  select * from public.assemble_product('00000000-7e57-4000-8000-000000000497', 10000)
  $q$, 'error:P0001:Ese rollo o artículo es de otro taller');

do $$
begin
  if pg_temp.attempt('outsider', $q$select * from public.assemble_product('00000000-7e57-4000-8000-000000000497', 10000)$q$)
     like '%Imán%' then
    perform pg_temp.fail('Armar en el otro taller dice cuántos imanes hay en este');
  end if;
end;
$$;

-- Toda llave entre dos tablas de un taller tiene su guardia: la red, una
-- llave que lleva el taller, o el disparador propio de la tabla. Una tabla
-- nueva que apunte a otra sin ninguna hace fallar esta prueba.
do $$
declare
  v_relation record;
begin
  for v_relation in
    select cc.relname as child, ca.attname as column_name, pc.relname as parent
    from pg_constraint c
    join pg_class cc on cc.oid = c.conrelid
    join pg_class pc on pc.oid = c.confrelid
    cross join lateral unnest(c.conkey, c.confkey) as k (child_attnum, parent_attnum)
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = k.child_attnum
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and pc.relnamespace = 'public'::regnamespace
      and pa.attname = 'id'
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'workspace_id')
      and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'workspace_id')
      and not exists (
        select 1 from unnest(c.confkey) as r (attnum)
        join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = r.attnum
        where ra.attname = 'workspace_id'
      )
  loop
    continue when exists (
      select 1 from pg_trigger t
      where t.tgrelid = format('public.%I', v_relation.child)::regclass
        and t.tgfoid = 'app.points_within_its_workshop'::regproc
        and t.tgenabled <> 'D'
        and v_relation.column_name = any (string_to_array(encode(t.tgargs, 'escape'), '\000'))
    );
    -- Guarded elsewhere: a key with the workshop, or a trigger of the table.
    continue when (v_relation.child, v_relation.column_name) in (
      ('transactions', 'account_id'), ('transactions', 'counter_account_id'),
      ('transactions', 'category_id'), ('transactions', 'order_id'), ('transactions', 'purchase_id'),
      ('stock_movements', 'inventory_item_id'), ('stock_movements', 'spool_id'),
      ('print_job_filaments', 'print_job_id'), ('print_job_filaments', 'spool_id'),
      ('recipe_plate_outputs', 'inventory_item_id'), ('recipe_plate_outputs', 'recipe_plate_id')
    );
    perform pg_temp.fail(format('%s.%s apunta a %s sin mirar de qué taller es', v_relation.child, v_relation.column_name, v_relation.parent));
  end loop;
end;
$$;

-- ------------------------------------------------------------- veredicto

do $$
begin
  if current_setting('permisos.fallas', true) <> '' then
    raise exception 'Permisos que no coinciden con la matriz (ADR-025):%', current_setting('permisos.fallas', true);
  end if;
  raise notice 'permisos: todo coincide';
end;
$$;

rollback;
