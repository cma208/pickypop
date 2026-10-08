-- Prueba de las reglas de ventas en la base (los hallazgos de ventas de la tercera pasada).
--
-- Se corre con psql sobre cualquier base local que tenga las migraciones:
--
--   docker exec -i supabase_db_pickypop psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/ventas.sql
--
-- Todo pasa dentro de `begin … rollback`: crea su propio taller, con un dueño y
-- un operador, su catálogo, pedidos y cotizaciones, y no deja rastro. Cada
-- caso corre como esa persona, con seguridad por fila, y se deshace solo. Si
-- algo no da lo esperado, termina con una excepción que nombra cada caso que
-- falló. Si todo coincide, dice «ventas: todo coincide».
--
-- Lo que prueba, cada cosa con el caso que la encontró:
--
-- * Un envío repetido hace una sola cosa: el cobro (T4-01), el pedido (T4-04),
--   la cotización (T4-02) y la entrega, cada uno por su llave.
-- * Crear un pedido y guardar una cotización son una sola transacción, con
--   lo que la pantalla también revisa: enteros, nada de S/ 0, nada inactivo
--   (T4-02, T4-16, T4-19), y la cotización siempre con cliente.
-- * Una cotización solo avanza por su camino y solo su última versión vive
--   (T4-03, T4-09). Una versión vieja enviada sigue separando hasta que la
--   nueva sale, y solo puede soltar.
-- * «Cliente al paso» es el cliente genérico y no puede deber (T4-05).
-- * Un cobro y una entrega no llevan fecha futura (T4-06).
-- * Lo hecho a medida no termina de entregarse con su impresión en la cola, y
--   una impresión de catálogo atada a una línea entregada se suelta (T4-08).
-- * Cancelar lo cancelado lo dice, y al operador le dice que anular es del
--   dueño (T4-21).
--
-- Los rechazos escritos para una persona son P0001.

begin;

-- --------------------------------------------------------------- helpers

create function pg_temp.id(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-7e17-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

create function pg_temp.person(p_who text) returns uuid language sql immutable as $$
  select case p_who when 'owner' then pg_temp.id(901) when 'operator' then pg_temp.id(902) end
$$;

create function pg_temp.label(p_who text) returns text language sql immutable as $$
  select case p_who when 'owner' then 'dueño' when 'operator' then 'operador' else p_who end
$$;

create function pg_temp.fail(p_message text) returns void language sql as $$
  select set_config('ventas.fallas', current_setting('ventas.fallas', true) || E'\n  - ' || p_message, true)
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

-- `p_expected` is a LIKE pattern for the start of the answer.
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

-- The same case for both, owner and operator: selling is the operator's day.
create function pg_temp.expect_both(p_case text, p_sql text, p_expected text) returns void
language plpgsql as $$
begin
  perform pg_temp.expect(p_case, 'owner', p_sql, p_expected);
  perform pg_temp.expect(p_case, 'operator', p_sql, p_expected);
end;
$$;

-- Fills %1$s, %2$s… with the ids of the numbers given, so each case reads short.
create function pg_temp.q(p_sql text, variadic p_ids integer[]) returns text language plpgsql as $$
declare
  v_sql text := p_sql;
  v_i integer;
begin
  for v_i in reverse array_length(p_ids, 1) .. 1 loop
    v_sql := replace(v_sql, '#' || v_i, quote_literal(pg_temp.id(p_ids[v_i])));
  end loop;
  return v_sql;
end;
$$;

select set_config('ventas.fallas', '', true);

-- ---------------------------------------------------------------- el taller

insert into auth.users (id, email, aud, role) values
  (pg_temp.id(901), 'ventas-dueno@prueba.test', 'authenticated', 'authenticated'),
  (pg_temp.id(902), 'ventas-operador@prueba.test', 'authenticated', 'authenticated');

insert into public.workspaces (id, name) values (pg_temp.id(1), 'Taller de prueba de ventas');

insert into public.workspace_members (workspace_id, user_id, role, display_name) values
  (pg_temp.id(1), pg_temp.id(901), 'owner', 'Dueño'),
  (pg_temp.id(1), pg_temp.id(902), 'operator', 'Operador');

insert into public.sales_channels (id, workspace_id, name) values (pg_temp.id(101), pg_temp.id(1), 'Tienda');

insert into public.transaction_categories (id, workspace_id, name, direction, sales, active) values
  (pg_temp.id(211), pg_temp.id(1), 'Venta de productos', 'income', true, true);

insert into public.workshop_settings (workspace_id, default_channel_id, order_payment_category_id)
values (pg_temp.id(1), pg_temp.id(101), pg_temp.id(211))
on conflict (workspace_id) do update
  set default_channel_id = excluded.default_channel_id,
      order_payment_category_id = excluded.order_payment_category_id;

insert into public.accounts (id, workspace_id, name, opening_balance, opening_balance_on, active, default_payment_method)
values (pg_temp.id(201), pg_temp.id(1), 'Efectivo', 0, app.workspace_day(pg_temp.id(1), now()) - 30, true, 'cash');

insert into public.customers (id, workspace_id, name) values (pg_temp.id(301), pg_temp.id(1), 'Ana Prueba');

-- The workshop may already have its «Clientes varios».
insert into public.customers (id, workspace_id, name, walk_in)
select pg_temp.id(302), pg_temp.id(1), 'Clientes varios', true
where not exists (select 1 from public.customers c where c.workspace_id = pg_temp.id(1) and c.walk_in);

-- ---------------------------------------------------------------- el catálogo

insert into public.catalog_products (id, workspace_id, name, slug, status) values
  (pg_temp.id(501), pg_temp.id(1), 'Botella de poción', 'botella-de-pocion-prueba', 'published');

insert into public.product_variants (id, workspace_id, product_id, name, list_price, active) values
  (pg_temp.id(511), pg_temp.id(1), pg_temp.id(501), 'Roja', 20, true),
  (pg_temp.id(512), pg_temp.id(1), pg_temp.id(501), 'Molde de prueba', null, false);

insert into public.inventory_items (id, workspace_id, kind, name, unit, product_variant_id) values
  (pg_temp.id(521), pg_temp.id(1), 'finished_good', 'Botella roja armada', 'unidad', pg_temp.id(511));

insert into public.recipes (id, workspace_id, variant_id, version, assembled) values
  (pg_temp.id(531), pg_temp.id(1), pg_temp.id(511), 1, true);

-- Ten on the shelf, written without a session as a migration would.
insert into public.stock_movements (workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, note)
values (pg_temp.id(1), now() - interval '2 days', 'production', pg_temp.id(521), 10, 5, 'Prueba de ventas');

insert into public.printers (id, workspace_id, name) values (pg_temp.id(601), pg_temp.id(1), 'A1 mini de prueba');

-- ---------------------------------------------------------------- pedidos

insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total) values
  -- A catalogue line, with prints tied to it from before ADR-021.
  (pg_temp.id(701), pg_temp.id(1), 'VEN-0001', 'sale', pg_temp.id(301), 'confirmed', 40),
  -- A made-to-order line with its print planned.
  (pg_temp.id(702), pg_temp.id(1), 'VEN-0002', 'sale', pg_temp.id(301), 'confirmed', 20),
  -- A made-to-order line with nothing in the queue.
  (pg_temp.id(703), pg_temp.id(1), 'VEN-0003', 'sale', pg_temp.id(301), 'confirmed', 10),
  -- To collect.
  (pg_temp.id(704), pg_temp.id(1), 'VEN-0004', 'sale', pg_temp.id(301), 'confirmed', 12.99),
  -- Already cancelled.
  (pg_temp.id(705), pg_temp.id(1), 'VEN-0005', 'sale', pg_temp.id(301), 'cancelled', 10),
  -- With money collected.
  (pg_temp.id(706), pg_temp.id(1), 'VEN-0006', 'sale', pg_temp.id(301), 'confirmed', 20);

insert into public.order_lines (id, workspace_id, order_id, position, variant_id, description, quantity, unit_price) values
  (pg_temp.id(711), pg_temp.id(1), pg_temp.id(701), 1, pg_temp.id(511), 'Botella de poción — Roja', 2, 20),
  (pg_temp.id(712), pg_temp.id(1), pg_temp.id(702), 1, null, 'Llavero con nombre', 2, 10),
  (pg_temp.id(713), pg_temp.id(1), pg_temp.id(703), 1, null, 'Placa grabada', 1, 10),
  (pg_temp.id(714), pg_temp.id(1), pg_temp.id(704), 1, null, 'Servicio', 1, 12.99),
  (pg_temp.id(715), pg_temp.id(1), pg_temp.id(705), 1, null, 'Tapa', 1, 10),
  (pg_temp.id(716), pg_temp.id(1), pg_temp.id(706), 1, null, 'Tapa', 2, 10);

insert into public.print_jobs (id, workspace_id, printer_id, order_line_id, status, label) values
  (pg_temp.id(721), pg_temp.id(1), pg_temp.id(601), pg_temp.id(711), 'planned', null),
  (pg_temp.id(722), pg_temp.id(1), pg_temp.id(601), pg_temp.id(712), 'planned', null);

insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method, order_id, occurred_at)
values (pg_temp.id(1), pg_temp.id(201), 'income', pg_temp.id(211), 5, 'cash', pg_temp.id(706), now() - interval '1 hour');

-- ---------------------------------------------------------------- cotizaciones

insert into public.quotes (id, workspace_id, number, version, status, customer_id, total, subtotal, hold_until) values
  -- Accepted, with its order.
  (pg_temp.id(801), pg_temp.id(1), 'VCT-0001', 1, 'accepted', pg_temp.id(301), 20, 20, null),
  -- v1 sent and holding, v2 a draft: the customer asked for changes.
  (pg_temp.id(802), pg_temp.id(1), 'VCT-0002', 1, 'sent', pg_temp.id(301), 20, 20, now() + interval '1 day'),
  (pg_temp.id(803), pg_temp.id(1), 'VCT-0002', 2, 'draft', pg_temp.id(301), 25, 25, null),
  -- Two drafts.
  (pg_temp.id(804), pg_temp.id(1), 'VCT-0003', 1, 'draft', pg_temp.id(301), 20, 20, null),
  (pg_temp.id(805), pg_temp.id(1), 'VCT-0003', 2, 'draft', pg_temp.id(301), 20, 20, null),
  -- Sent, without an order.
  (pg_temp.id(806), pg_temp.id(1), 'VCT-0004', 1, 'sent', pg_temp.id(301), 20, 20, null),
  -- Old data: v1 has the order, v2 was sent after it.
  (pg_temp.id(807), pg_temp.id(1), 'VCT-0005', 1, 'accepted', pg_temp.id(301), 20, 20, null),
  (pg_temp.id(808), pg_temp.id(1), 'VCT-0005', 2, 'sent', pg_temp.id(301), 20, 20, null);

insert into public.quote_lines (workspace_id, quote_id, position, kind, description, quantity, unit_price)
select pg_temp.id(1), q.id, 1, 'custom', 'Llavero', 2, 10
from public.quotes q
where q.workspace_id = pg_temp.id(1);

insert into public.orders (id, workspace_id, number, purpose, customer_id, quote_id, status, total) values
  (pg_temp.id(731), pg_temp.id(1), 'VEN-0031', 'sale', pg_temp.id(301), pg_temp.id(801), 'confirmed', 20),
  (pg_temp.id(732), pg_temp.id(1), 'VEN-0032', 'sale', pg_temp.id(301), pg_temp.id(807), 'confirmed', 20);

-- ====================================================== una vez por llave

select pg_temp.expect_both('El mismo cobro dos veces con la misma llave (T4-01)', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.collect_order_payment(#1, #2, 5, 'cash', null, null, #3)).id;
    b := (public.collect_order_payment(#1, #2, 5, 'cash', null, null, #3)).id;
    select count(*) into n from public.transactions where order_id = #1;
    if a is distinct from b or n <> 1 then raise exception 'dos cobros: % filas', n; end if;
    perform public.collect_order_payment(#1, #2, 5, 'cash', null, null, #4);
    select count(*) into n from public.transactions where order_id = #1;
    if n <> 2 then raise exception 'otra llave no cobró: % filas', n; end if;
  end $x$$q$, 704, 201, 951, 952), 'ok:');

select pg_temp.expect('La llave de un cobro usada en otro pedido', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.collect_order_payment(#1, #2, 5, 'cash', null, null, #4);
    perform public.collect_order_payment(#3, #2, 5, 'cash', null, null, #4);
  end $x$$q$, 704, 201, 706, 953), 'error:P0001:Este cobro ya se registró en otro pedido');

select pg_temp.expect_both('Un cobro con fecha de 2027 (T4-06)', pg_temp.q($q$
  select public.collect_order_payment(#1, #2, 5, 'cash', now() + interval '1 year', null, #3)
  $q$, 704, 201, 954), 'error:P0001:El cobro no puede tener fecha futura');

select pg_temp.expect('Un cobro con el reloj del teléfono un minuto adelantado', 'operator', pg_temp.q($q$
  select public.collect_order_payment(#1, #2, 5, 'cash', now() + interval '1 minute', null, #3)
  $q$, 704, 201, 955), 'ok:1');

select pg_temp.expect_both('El mismo pedido dos veces con la misma llave (T4-04)', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.create_order(#1, 'sale', '[{"description": "Llavero", "quantity": 3, "unit_price": 4}]', #2, null, null, null, null, #3)).id;
    b := (public.create_order(#1, 'sale', '[{"description": "Llavero", "quantity": 3, "unit_price": 4}]', #2, null, null, null, null, #3)).id;
    select count(*) into n from public.orders where create_key = #3;
    if a is distinct from b or n <> 1 then raise exception 'dos pedidos: % filas', n; end if;
    select count(*) into n from public.order_lines where order_id = a;
    if n <> 1 then raise exception 'el pedido quedó con % líneas', n; end if;
  end $x$$q$, 1, 301, 956), 'ok:');

select pg_temp.expect_both('La misma cotización dos veces con la misma llave (T4-02)', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.save_quote(#1, #2, '[{"description": "Llavero", "quantity": 2, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]',
          null, null, null, null, '{}', 20, 0, 0, 20, null, #3)).id;
    b := (public.save_quote(#1, #2, '[{"description": "Llavero", "quantity": 2, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]',
          null, null, null, null, '{}', 20, 0, 0, 20, null, #3)).id;
    select count(*) into n from public.quotes where save_key = #3;
    if a is distinct from b or n <> 1 then raise exception 'dos cotizaciones: % filas', n; end if;
    select count(*) into n from public.quote_lines where quote_id = a;
    if n <> 1 then raise exception 'la cotización quedó con % líneas', n; end if;
  end $x$$q$, 1, 301, 957), 'ok:');

select pg_temp.expect_both('La misma entrega dos veces con la misma llave, aunque fue la última', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.deliver_order(#1, ('[{"order_line_id": "' || #2 || '", "quantity": 1}]')::jsonb, null, null, #3)).id;
    b := (public.deliver_order(#1, ('[{"order_line_id": "' || #2 || '", "quantity": 1}]')::jsonb, null, null, #3)).id;
    select count(*) into n from public.order_deliveries where order_id = #1;
    if a is distinct from b or n <> 1 then raise exception 'dos entregas: % filas', n; end if;
    if (select status from public.orders where id = #1) <> 'delivered' then raise exception 'el pedido no quedó entregado'; end if;
  end $x$$q$, 703, 713, 958), 'ok:');

select pg_temp.expect('La llave de una entrega usada en otro pedido', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.deliver_order(#1, null, null, null, #3);
    perform public.deliver_order(#2, null, null, null, #3);
  end $x$$q$, 703, 701, 959), 'error:P0001:Esa entrega ya se registró en otro pedido');

-- ====================================================== crear un pedido

select pg_temp.expect_both('Una venta de S/ 0 (T4-16)', pg_temp.q($q$
  select public.create_order(#1, 'sale', '[{"description": "Llavero", "quantity": 1, "unit_price": 0}]', #2)
  $q$, 1, 301), 'error:P0001:La venta suma S/ 0.00');

select pg_temp.expect('Una variante desactivada (T4-19)', 'operator', pg_temp.q($q$
  select public.create_order(#1, 'sale', ('[{"variant_id": "' || #3 || '", "description": "Molde", "quantity": 1, "unit_price": 5}]')::jsonb, #2)
  $q$, 1, 301, 512), 'error:P0001:«Botella de poción — Molde de prueba» ya no se vende');

select pg_temp.expect('Media unidad', 'operator', pg_temp.q($q$
  select public.create_order(#1, 'sale', '[{"description": "Llavero", "quantity": 1.5, "unit_price": 4}]', #2)
  $q$, 1, 301), 'error:P0001:La cantidad de «Llavero» tiene que ser un número entero');

select pg_temp.expect('Tres mil millones de unidades no gastan un número', 'operator', pg_temp.q($q$do $x$
  declare n integer;
  begin
    begin
      perform public.create_order(#1, 'sale', '[{"description": "Llavero", "quantity": 3000000000, "unit_price": 4}]', #2);
      raise exception 'se creó';
    exception when sqlstate 'P0001' then
      if sqlerrm not like 'La cantidad de «Llavero» es demasiado grande%' then raise; end if;
    end;
    select count(*) into n from public.orders where workspace_id = #1 and number like 'ORD-%';
    if n <> 0 then raise exception 'quedaron % pedidos a medias', n; end if;
  end $x$$q$, 1, 301), 'ok:');

-- ====================================================== guardar una cotización

select pg_temp.expect_both('Una cotización sin cliente', pg_temp.q($q$
  select public.save_quote(#1, null, '[{"description": "Llavero", "quantity": 1, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]')
  $q$, 1), 'error:P0001:Elige el cliente de la cotización');

select pg_temp.expect('Una cotización para «Clientes varios»', 'operator', format($q$
  select public.save_quote(%L, (select id from public.customers where workspace_id = %L and walk_in),
    '[{"description": "Llavero", "quantity": 1, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]')
  $q$, pg_temp.id(1), pg_temp.id(1)), 'error:P0001:«Clientes varios» es el cliente de las ventas rápidas');

select pg_temp.expect('Una versión nueva de un documento con pedido', 'operator', pg_temp.q($q$
  select public.save_quote(#1, #2, '[{"description": "Llavero", "quantity": 1, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]',
    null, null, null, null, '{}', 10, 0, 0, 10, #3)
  $q$, 1, 301, 801), 'error:P0001:La cotización VCT-0001 ya tiene el pedido VEN-0031');

select pg_temp.expect('Una versión nueva desde la versión vieja se numera después de la última', 'operator', pg_temp.q($q$do $x$
  declare v integer;
  begin
    v := (public.save_quote(#1, #2, '[{"description": "Llavero", "quantity": 1, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]',
          null, null, null, null, '{}', 10, 0, 0, 10, #3)).version;
    if v <> 3 then raise exception 'quedó como versión %', v; end if;
  end $x$$q$, 1, 301, 802), 'ok:');

select pg_temp.expect('Una cotización con media unidad', 'operator', pg_temp.q($q$
  select public.save_quote(#1, #2, '[{"description": "Llavero", "quantity": 0.5, "unit_cost": 3, "unit_price": 10, "setup_minutes": 0, "minutes_per_unit": 0}]')
  $q$, 1, 301), 'error:P0001:La cantidad de «Llavero» tiene que ser un número entero');

-- ====================================================== el camino de una cotización

select pg_temp.expect_both('Una aceptada con pedido pasa a rechazada (T4-03)', pg_temp.q($q$
  update public.quotes set status = 'rejected' where id = #1
  $q$, 801), 'error:P0001:La cotización VCT-0001 ya se aceptó y tiene el pedido VEN-0031');

select pg_temp.expect('Una enviada vuelve a borrador', 'operator', pg_temp.q($q$
  update public.quotes set status = 'draft' where id = #1
  $q$, 806), 'error:P0001:Una cotización enviada no vuelve a borrador');

select pg_temp.expect('Se acepta sin crear el pedido', 'operator', pg_temp.q($q$
  update public.quotes set status = 'accepted' where id = #1
  $q$, 806), 'error:P0001:Una cotización se acepta creando su pedido');

select pg_temp.expect('Se rechaza una enviada', 'operator', pg_temp.q($q$
  update public.quotes set status = 'rejected' where id = #1
  $q$, 806), 'ok:1');

select pg_temp.expect_both('Se envía la versión vieja de un documento (T4-09)', pg_temp.q($q$
  update public.quotes set status = 'sent' where id = #1
  $q$, 804), 'error:P0001:Esta es la versión 1 de VCT-0003, y ya existe la versión 2');

select pg_temp.expect('La versión vieja enviada alarga su separo', 'operator', pg_temp.q($q$
  select public.set_quote_hold(#1, now() + interval '3 days')
  $q$, 802), 'error:P0001:La versión 1 de VCT-0002 quedó como historial');

select pg_temp.expect('La versión vieja enviada suelta su separo', 'operator', pg_temp.q($q$
  select public.set_quote_hold(#1, now() - interval '1 day')
  $q$, 802), 'ok:1');

select pg_temp.expect('Enviar la nueva suelta el separo de la vieja', 'operator', pg_temp.q($q$do $x$
  begin
    update public.quotes set status = 'sent' where id = #2;
    if (select hold_until > now() from public.quotes where id = #1) then raise exception 'la versión 1 sigue separando'; end if;
  end $x$$q$, 802, 803), 'ok:');

select pg_temp.expect('Separar la versión siguiente a la que ya es pedido', 'operator', pg_temp.q($q$
  select public.set_quote_hold(#1, now() + interval '1 day')
  $q$, 808), 'error:P0001:La cotización VCT-0005 ya tiene el pedido VEN-0032');

-- ====================================================== el cliente genérico

select pg_temp.expect_both('Un cliente nuevo llamado «cliente al paso» (T4-05)', pg_temp.q($q$
  insert into public.customers (workspace_id, name) values (#1, 'cliente  al PASO')
  $q$, 1), 'error:P0001:');

select pg_temp.expect('Un cliente nuevo llamado «Clientes Varios»', 'operator', pg_temp.q($q$
  insert into public.customers (workspace_id, name) values (#1, 'Clientes Varios')
  $q$, 1), 'error:P0001:');

select pg_temp.expect_both('Una venta rápida que deja deuda a «Cliente al paso» (T4-05)', pg_temp.q($q$
  select public.quick_sale(#1, ('[{"variant_id": "' || #2 || '", "quantity": 1, "unit_price": 14}]')::jsonb, null, 'Cliente al paso')
  $q$, 1, 511), 'error:P0001:Quedan S/ 14.00 por cobrar');

-- ====================================================== la entrega

select pg_temp.expect_both('Una entrega con fecha de mañana', pg_temp.q($q$
  select public.deliver_order(#1, null, now() + interval '1 day')
  $q$, 703), 'error:P0001:La entrega no puede tener fecha futura');

select pg_temp.expect('Media unidad entregada', 'operator', pg_temp.q($q$
  select public.deliver_order(#1, ('[{"order_line_id": "' || #2 || '", "quantity": 0.5}]')::jsonb)
  $q$, 701, 711), 'error:P0001:La cantidad a entregar de «Botella de poción — Roja» tiene que ser un número entero');

select pg_temp.expect_both('Lo hecho a medida con su impresión planificada (T4-08)', pg_temp.q($q$
  select public.deliver_order(#1)
  $q$, 702), 'error:P0001:«Llavero con nombre» tiene una impresión planificada en la cola');

select pg_temp.expect('Una parte de lo hecho a medida sí sale con su impresión en la cola', 'operator', pg_temp.q($q$
  select public.deliver_order(#1, ('[{"order_line_id": "' || #2 || '", "quantity": 1}]')::jsonb)
  $q$, 702, 712), 'ok:1');

select pg_temp.expect('Lo hecho a medida sale cuando su impresión se canceló', 'operator', pg_temp.q($q$do $x$
  begin
    update public.print_jobs set status = 'cancelled', finished_at = now() where id = #2;
    perform public.deliver_order(#1);
  end $x$$q$, 702, 722), 'ok:');

select pg_temp.expect('Una impresión nueva para una línea ya entregada entera', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.deliver_order(#1);
    insert into public.print_jobs (workspace_id, printer_id, order_line_id) values (#3, #4, #2);
  end $x$$q$, 703, 713, 1, 601), 'error:P0001:«Placa grabada» del pedido VEN-0003 ya se entregó entera');

select pg_temp.expect_both('La impresión de catálogo de una línea entregada se suelta del pedido (T4-08)', pg_temp.q($q$do $x$
  declare v_job public.print_jobs;
  begin
    perform public.deliver_order(#1);
    select * into v_job from public.print_jobs where id = #2;
    if v_job.order_line_id is not null then raise exception 'sigue atada al pedido'; end if;
    if v_job.status <> 'planned' then raise exception 'cambió de estado: %', v_job.status; end if;
    if v_job.label is distinct from 'Botella de poción — Roja' then raise exception 'quedó sin nombre: %', v_job.label; end if;
    if v_job.note not like '%Era del pedido VEN-0001, que se entregó desde el estante.%' then
      raise exception 'no dice de dónde venía: %', v_job.note;
    end if;
  end $x$$q$, 701, 721), 'ok:');

select pg_temp.expect('Una entrega parcial de catálogo deja la impresión atada', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.deliver_order(#1, ('[{"order_line_id": "' || #2 || '", "quantity": 1}]')::jsonb);
    if (select order_line_id from public.print_jobs where id = #3) is null then raise exception 'se soltó antes de tiempo'; end if;
  end $x$$q$, 701, 711, 721), 'ok:');

-- ====================================================== cancelar

select pg_temp.expect_both('Cancelar un pedido ya cancelado (T4-21)', pg_temp.q($q$
  select public.cancel_order(#1, '{}')
  $q$, 705), 'error:P0001:El pedido VEN-0005 ya estaba cancelado');

select pg_temp.expect('Cancelar un pedido con cobros', 'operator', pg_temp.q($q$
  select public.set_order_status(#1, 'cancelled', 'El cliente se arrepintió')
  $q$, 706), 'error:P0001:El pedido VEN-0006 tiene cobros por S/ 5.00. Anular un cobro es solo del dueño');

select pg_temp.expect('Cancelar un pedido con cobros', 'owner', pg_temp.q($q$
  select public.set_order_status(#1, 'cancelled', 'El cliente se arrepintió')
  $q$, 706), 'error:P0001:El pedido VEN-0006 tiene cobros por S/ 5.00: anúlalos en Caja');

-- --------------------------------------------------------------- resultado

do $$
declare
  v_failures text := current_setting('ventas.fallas', true);
begin
  if coalesce(v_failures, '') <> '' then
    raise exception 'ventas: no coincide%', v_failures;
  end if;
  raise notice 'ventas: todo coincide';
end;
$$;

rollback;
