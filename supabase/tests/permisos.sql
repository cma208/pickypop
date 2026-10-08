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
--    borrar stock, que el operador cambie el horario…) y las reglas que no son
--    de políticas (versiones de parámetros, el último dueño, la impresora en
--    un solo paso, los nombres que solo cambian en mayúsculas).

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

create function pg_temp.expected(p_table text, p_cmd text, p_who text) returns boolean
language sql immutable as $$
  select case
    when p_who = 'anon' then false
    when p_who = 'outsider' then p_table = 'workspaces' and p_cmd = 'INSERT'
    when p_cmd = 'SELECT' then true
    when p_table = 'workspaces' then p_cmd = 'INSERT' or (p_cmd = 'UPDATE' and p_who = 'owner')
    when p_table = 'workspace_members' then p_who = 'owner'
    when p_table = 'document_counters' then false
    when p_table = any (pg_temp.owner_tables()) then p_who = 'owner'
    when p_table = any (pg_temp.ledgers()) then p_cmd = 'INSERT' and p_who in ('owner', 'operator')
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
create function pg_temp.holds(p_table text, p_expression text) returns boolean language plpgsql as $$
declare
  v_result boolean;
begin
  execute format(
    'select (%s) from (select (jsonb_populate_record(null::public.%I, $1)).*) as %I',
    p_expression, p_table, p_table
  )
  into v_result
  using jsonb_build_object('workspace_id', '00000000-7e57-4000-8000-000000000001', 'id', '00000000-7e57-4000-8000-000000000001');
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
  -- con otro movimiento.
  foreach v_table in array pg_temp.ledgers() loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
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

insert into public.brands (id, workspace_id, name) values
  ('00000000-7e57-4000-8000-000000000401', '00000000-7e57-4000-8000-000000000001', 'Krear3D');

insert into public.materials (id, workspace_id, code) values
  ('00000000-7e57-4000-8000-000000000411', '00000000-7e57-4000-8000-000000000001', 'PLA');

insert into public.filament_skus (id, workspace_id, brand_id, material_id, color_name) values
  ('00000000-7e57-4000-8000-000000000421', '00000000-7e57-4000-8000-000000000001',
   '00000000-7e57-4000-8000-000000000401', '00000000-7e57-4000-8000-000000000411', 'Negro');

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

-- ------------------------------------------- 2. casos de verdad: pruebas

do $$
declare
  c_ws constant text := '''00000000-7e57-4000-8000-000000000001''';
  c_income constant text := '''00000000-7e57-4000-8000-000000000221''';
  c_voided constant text := '''00000000-7e57-4000-8000-000000000222''';
  c_movement constant text := '''00000000-7e57-4000-8000-000000000441''';
  c_printer constant text := '''00000000-7e57-4000-8000-000000000511''';
  c_owner constant text := '''00000000-7e57-4000-8000-0000000000a1''';
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
  perform pg_temp.expect('Corregir el stock con un ajuste', 'operator',
    'insert into public.stock_movements (workspace_id, inventory_item_id, type, quantity) values ('
    || c_ws || ', ''00000000-7e57-4000-8000-000000000431'', ''adjustment'', -1)', 'ok:1');
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
    'error:P0001');
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
