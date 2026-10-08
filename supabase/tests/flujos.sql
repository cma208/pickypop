-- Prueba de lo que cruza áreas (la integración de la tercera pasada).
--
-- Se corre con psql sobre cualquier base local que tenga las migraciones:
--
--   docker exec -i supabase_db_pickypop psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/flujos.sql
--
-- Todo pasa dentro de `begin … rollback`: crea su propio taller, con un dueño y
-- un operador, sus rollos, insumos, catálogo y pedidos, y no deja rastro. Cada
-- caso corre como esa persona, con seguridad por fila, y se deshace solo. Si
-- algo no da lo esperado, termina con una excepción que nombra cada caso que
-- falló. Si todo coincide, dice «flujos: todo coincide».
--
-- Lo que prueba:
--
-- * Resultados ve todo lo que sale del inventario sin venderse, en su mes y
--   al costo con que salió: rollos agotados o descartados con gramos,
--   pesajes, y mermas y conteos de insumos a mano. Una entrada a mano, el
--   primer conteo de un artículo sin movimientos (su stock inicial) y un
--   consumo a mano no suman: el consumo ya llega por el estimado de una línea
--   a medida o el costo de máquina (ADR-023, `stock_written_off`).
-- * No se imprime con un rollo agotado o descartado (T3-07): ni al crear el
--   trabajo, ni al iniciarlo (eligiéndolo o con el que tenía de la cola), ni
--   al cerrarlo con gramos. Con cero gramos sí cierra. Y un rollo que se está
--   imprimiendo no se marca agotado ni descartado: primero se cierra la
--   impresión con lo que gastó.
-- * La receta que se usa es la activa, aunque haya una versión más alta
--   desactivada: al armar, al entregar, al vender y en las pantallas de armar
--   y de contar.
-- * La Venta rápida escribe sus montos con doce cifras (T4-15).
-- * Una llave por movimiento de dinero: el cobro de un pedido y el pago de
--   una compra la dejan en `transactions.entry_key`, la misma llave por
--   `record_payment` es el mismo cobro, una llave de antes sigue valiendo, y
--   la llave de otra compra o de otro pedido se rechaza.
-- * La ficha del pedido cuenta entre los fallidos una impresión cancelada que
--   corrió, como el tablero y Resultados (ADR-023, punto 6).
--
-- Los rechazos escritos para una persona son P0001.

begin;

-- --------------------------------------------------------------- helpers

create function pg_temp.id(p_n integer) returns uuid language sql immutable as $$
  select ('00000000-f1a0-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

create function pg_temp.person(p_who text) returns uuid language sql immutable as $$
  select case p_who when 'owner' then pg_temp.id(901) when 'operator' then pg_temp.id(902) end
$$;

create function pg_temp.label(p_who text) returns text language sql immutable as $$
  select case p_who when 'owner' then 'dueño' when 'operator' then 'operador' else p_who end
$$;

create function pg_temp.fail(p_message text) returns void language sql as $$
  select set_config('flujos.fallas', current_setting('flujos.fallas', true) || E'\n  - ' || p_message, true)
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

-- Fills #1, #2… with the ids of the numbers given, so each case reads short.
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

select set_config('flujos.fallas', '', true);

-- ---------------------------------------------------------------- el taller

insert into auth.users (id, email, aud, role) values
  (pg_temp.id(901), 'flujos-dueno@prueba.test', 'authenticated', 'authenticated'),
  (pg_temp.id(902), 'flujos-operador@prueba.test', 'authenticated', 'authenticated');

insert into public.workspaces (id, name) values (pg_temp.id(1), 'Taller de prueba de flujos');

insert into public.workspace_members (workspace_id, user_id, role, display_name) values
  (pg_temp.id(1), pg_temp.id(901), 'owner', 'Dueño'),
  (pg_temp.id(1), pg_temp.id(902), 'operator', 'Operador');

insert into public.accounts (id, workspace_id, name, opening_balance, opening_balance_on, active, default_payment_method)
values (pg_temp.id(201), pg_temp.id(1), 'Efectivo', 0, app.workspace_day(pg_temp.id(1), now()) - 60, true, 'cash');

insert into public.customers (id, workspace_id, name) values (pg_temp.id(301), pg_temp.id(1), 'Ana Prueba');

insert into public.printers (id, workspace_id, name) values (pg_temp.id(601), pg_temp.id(1), 'A1 mini de prueba');

-- ---------------------------------------------------------------- los rollos

insert into public.brands (id, workspace_id, name) values (pg_temp.id(401), pg_temp.id(1), 'Marca de prueba');
insert into public.materials (id, workspace_id, code) values (pg_temp.id(402), pg_temp.id(1), 'PLA');
insert into public.filament_skus (id, workspace_id, brand_id, material_id, color_name) values
  (pg_temp.id(403), pg_temp.id(1), pg_temp.id(401), pg_temp.id(402), 'Negro');

-- A gram costs 0.06, 0.05, 0.04, 0.03 and 0.02 on each roll.
insert into public.spools (id, workspace_id, filament_sku_id, code, initial_weight_g, unit_cost, status) values
  (pg_temp.id(411), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-A', 1000, 60, 'open'),
  (pg_temp.id(412), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-B', 1000, 50, 'open'),
  (pg_temp.id(413), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-C', 1000, 40, 'open'),
  (pg_temp.id(414), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-D', 1000, 30, 'open'),
  (pg_temp.id(415), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-E', 1000, 20, 'open');

-- What each roll holds, written without a session as a migration would.
insert into public.stock_movements (workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, note)
select pg_temp.id(1), now() - interval '70 days', 'purchase', s.id, g.grams, s.cost_per_gram, 'purchase', 'Prueba de flujos'
from public.spools s
join (values (411, 1000), (412, 1000), (413, 1000), (414, 500), (415, 1000)) as g (n, grams) on pg_temp.id(g.n) = s.id;

-- ---------------------------------------------------------------- los insumos

insert into public.inventory_items (id, workspace_id, kind, name, unit, standard_cost) values
  (pg_temp.id(421), pg_temp.id(1), 'supply', 'Pegamento', 'unidad', 2),
  (pg_temp.id(422), pg_temp.id(1), 'packaging', 'Bolsa chica', 'unidad', 1),
  (pg_temp.id(423), pg_temp.id(1), 'supply', 'Imán', 'unidad', 0.30);

insert into public.stock_movements (workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, note) values
  (pg_temp.id(1), now() - interval '70 days', 'purchase', pg_temp.id(421), 10, 2, 'purchase', 'Prueba de flujos'),
  (pg_temp.id(1), now() - interval '70 days', 'purchase', pg_temp.id(422), 3, 1, 'purchase', 'Prueba de flujos');

-- ======================================== Resultados ve lo que sale sin venderse

-- One month of the workshop, start to end: everything that left the stock by
-- hand or by a roll's state, and what reached the result.
select pg_temp.expect('Lo que sale del inventario sin venderse llega a Resultados', 'operator', pg_temp.q($q$do $x$
  declare
    v_month date := date_trunc('month', app.workspace_day(#1, now()))::date;
    r record;
  begin
    perform public.set_spool_status(#2, 'discarded');            -- 1000 g at 0.06: 60.00
    perform public.set_spool_status(#3, 'empty');                -- 1000 g at 0.05: 50.00
    perform public.weigh_spool(#4, 1100, 200);                   -- 900 g of 1000: 100 g at 0.04, 4.00
    perform public.weigh_spool(#5, 600, 0);                      -- 600 g of 500: 100 g over at 0.03, -3.00
    perform public.move_item_stock(#6, 'out', 2, 'waste');       -- 2 at 2: 4.00
    perform public.move_item_stock(#6, 'out', 1, 'consumption'); -- 1 at 2: nothing, its estimate pays it
    perform public.move_item_stock(#6, 'count', 5);              -- 7 counted as 5: 4.00
    perform public.move_item_stock(#7, 'count', 4);              -- 3 counted as 4: -1.00
    perform public.move_item_stock(#6, 'in', 10);                -- an entry: nothing
    perform public.move_item_stock(#8, 'count', 200);            -- opening stock, 200 at 0.30: nothing

    if (select m.source_id from public.stock_movements m where m.inventory_item_id = #8) is not null then
      raise exception 'el primer conteo del imán quedó como un conteo y no como su stock inicial';
    end if;

    select * into r from public.monthly_income_statement where workspace_id = #1 and month = v_month;
    if r.stock_written_off is distinct from 118.00 then
      raise exception 'stock_written_off da % y no 118.00', r.stock_written_off;
    end if;
    if r.unsold_production is distinct from 118.00 or r.shelf_count_losses <> 0 then
      raise exception 'producción no vendida da % (conteo del estante %)', r.unsold_production, r.shelf_count_losses;
    end if;
    if r.net_profit is distinct from -118.00 then
      raise exception 'la utilidad neta da % y no -118.00', r.net_profit;
    end if;
  end $x$$q$, 1, 411, 412, 413, 414, 421, 422, 423), 'ok:');

-- What a made-to-order line used, taken out by hand, is already in its
-- estimate: Resultados counts it once, as cost of sales.
select pg_temp.expect('Un insumo de una línea a medida resta una sola vez', 'operator', pg_temp.q($q$do $x$
  declare
    v_month date := date_trunc('month', app.workspace_day(#1, now()))::date;
    v_before record;
    v_after record;
  begin
    reset role;
    insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total, ordered_on)
    values (#2, #1, 'FLU-0009', 'sale', #3, 'confirmed', 50, app.workspace_day(#1, now()));
    insert into public.order_lines (workspace_id, order_id, position, variant_id, description, quantity, unit_price, estimated_unit_cost)
    values (#1, #2, 1, null, 'Llaveros con nombre', 10, 5, 3);
    set local role authenticated;

    select * into v_before from public.monthly_income_statement where workspace_id = #1 and month = v_month;
    perform public.move_item_stock(#4, 'out', 5, 'consumption', 'Para FLU-0009');
    select * into v_after from public.monthly_income_statement where workspace_id = #1 and month = v_month;

    if v_before.cost_of_sales is distinct from 30.00 or v_after.net_profit is distinct from v_before.net_profit then
      raise exception 'costo de ventas %, y la utilidad pasó de % a %', v_before.cost_of_sales, v_before.net_profit, v_after.net_profit;
    end if;
  end $x$$q$, 1, 709, 301, 421), 'ok:');

-- A roll emptied last month is a loss of last month, at what a gram cost.
select pg_temp.expect('Un rollo descartado el mes pasado resta en su mes', 'operator', pg_temp.q($q$do $x$
  declare
    v_today date := app.workspace_day(#1, now());
    v_last date := (date_trunc('month', v_today) - interval '1 month')::date;
    v_written numeric;
  begin
    -- As the backfill of 20261023120000 or a migration would date it.
    reset role;
    insert into public.stock_movements (workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, source_id, note)
    values (#1, ((v_last + 10)::timestamp + interval '10 hours') at time zone 'America/Lima',
            'waste', #2, -400, 0.02, 'spool_status', #2, 'Rollo descartado el mes pasado');
    set local role authenticated;

    select m.stock_written_off into v_written
    from public.monthly_income_statement m
    where m.workspace_id = #1 and m.month = v_last;
    if v_written is distinct from 8.00 then
      raise exception 'el mes pasado da % y no 8.00', v_written;
    end if;
  end $x$$q$, 1, 415), 'ok:');

-- ================================================ no se imprime con un rollo gastado

-- F is empty and G discarded, with nothing left. H waits in a planned job,
-- I is in the printer.
insert into public.spools (id, workspace_id, filament_sku_id, code, initial_weight_g, unit_cost, status) values
  (pg_temp.id(416), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-F', 1000, 50, 'empty'),
  (pg_temp.id(417), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-G', 1000, 50, 'discarded'),
  (pg_temp.id(418), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-H', 1000, 50, 'open'),
  (pg_temp.id(419), pg_temp.id(1), pg_temp.id(403), 'FLUJOS-I', 1000, 50, 'in_use');

insert into public.stock_movements (workspace_id, occurred_at, type, spool_id, quantity, unit_cost, source_type, note) values
  (pg_temp.id(1), now() - interval '70 days', 'purchase', pg_temp.id(418), 1000, 0.05, 'purchase', 'Prueba de flujos'),
  (pg_temp.id(1), now() - interval '70 days', 'purchase', pg_temp.id(419), 1000, 0.05, 'purchase', 'Prueba de flujos');

-- A second printer: the first one is busy, and one prints at a time.
insert into public.printers (id, workspace_id, name) values (pg_temp.id(602), pg_temp.id(1), 'Segunda de prueba');

insert into public.print_jobs (id, workspace_id, printer_id, label, status, started_at) values
  (pg_temp.id(611), pg_temp.id(1), pg_temp.id(602), 'Encolado con su rollo', 'planned', null),
  (pg_temp.id(612), pg_temp.id(1), pg_temp.id(602), 'Encolado sin rollo', 'planned', null),
  (pg_temp.id(613), pg_temp.id(1), pg_temp.id(601), 'En la impresora', 'printing', now() - interval '1 hour');

insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, estimated_g) values
  (pg_temp.id(1), pg_temp.id(611), pg_temp.id(418), 20),
  (pg_temp.id(1), pg_temp.id(613), pg_temp.id(419), 20);

select pg_temp.expect('Crear un trabajo con un rollo agotado', 'operator', pg_temp.q($q$
  select public.create_print_job(#1, 'Llaveros', null, null, null, null, ('[{"spool_id": "' || #2 || '", "estimated_g": 10}]')::jsonb)
  $q$, 601, 416), 'error:P0001:No se imprime con el rollo FLUJOS-F: está «Agotado»');

select pg_temp.expect('Crear un trabajo con un rollo descartado', 'operator', pg_temp.q($q$
  select public.create_print_job(#1, 'Llaveros', null, null, null, null, ('[{"spool_id": "' || #2 || '", "estimated_g": 10}]')::jsonb)
  $q$, 601, 417), 'error:P0001:No se imprime con el rollo FLUJOS-G: está «Descartado»');

select pg_temp.expect('Crear un trabajo con un rollo en uso', 'operator', pg_temp.q($q$
  select public.create_print_job(#1, 'Llaveros', null, null, null, null, ('[{"spool_id": "' || #2 || '", "estimated_g": 10}]')::jsonb)
  $q$, 601, 418), 'ok:1');

select pg_temp.expect('Iniciar eligiendo un rollo agotado', 'operator', pg_temp.q($q$
  select public.start_print_job(#1, ('[{"spool_id": "' || #2 || '", "estimated_g": 10}]')::jsonb)
  $q$, 612, 416), 'error:P0001:No se imprime con el rollo FLUJOS-F');

select pg_temp.expect('Iniciar un trabajo cuyo rollo se agotó en la cola', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.set_spool_status(#2, 'empty');
    perform public.start_print_job(#1);
  end $x$$q$, 611, 418), 'error:P0001:Este trabajo tiene un rollo que ya no se usa: FLUJOS-H («Agotado»)');

select pg_temp.expect('Iniciar un trabajo con su rollo en uso', 'operator', pg_temp.q($q$
  select public.start_print_job(#1)
  $q$, 611), 'ok:1');

-- The roll in the printer ran out halfway (the AMS case): it is not marked
-- until the print is closed with what it used.
select pg_temp.expect('Marcar agotado un rollo que se está imprimiendo', 'operator', pg_temp.q($q$
  select public.set_spool_status(#1, 'empty')
  $q$, 419), 'error:P0001:El rollo FLUJOS-I se está imprimiendo en «A1 mini de prueba»: cierra primero esa impresión');

select pg_temp.expect('Descartar un rollo que se está imprimiendo', 'operator', pg_temp.q($q$
  select public.set_spool_status(#1, 'discarded')
  $q$, 419), 'error:P0001:El rollo FLUJOS-I se está imprimiendo');

select pg_temp.expect('Cerrar la impresión y después marcar el rollo agotado', 'operator', pg_temp.q($q$do $x$
  declare v_print numeric; v_written numeric;
  begin
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 300}]')::jsonb);
    perform public.set_spool_status(#2, 'empty');
    select sum(quantity) filter (where source_type = 'print_job'), sum(quantity) filter (where source_type = 'spool_status')
      into v_print, v_written
    from public.stock_movements where spool_id = #2;
    if v_print is distinct from -300 or v_written is distinct from -700 then
      raise exception 'la impresión sacó % g y la marca %', v_print, v_written;
    end if;
  end $x$$q$, 613, 419), 'ok:');

-- The close itself may leave the roll empty: its consumption does, and that
-- is the print being closed, not a roll marked while printing.
select pg_temp.expect('Cerrar una impresión que acaba el rollo', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 1000}]')::jsonb);
    if (select status from public.spools where id = #2) <> 'empty' then
      raise exception 'el rollo quedó «%»', (select status from public.spools where id = #2);
    end if;
  end $x$$q$, 613, 419), 'ok:');

-- Weighing it empty while it prints would mark it too.
select pg_temp.expect('Pesar vacío un rollo que se está imprimiendo', 'operator', pg_temp.q($q$
  select public.weigh_spool(#1, 200, 200)
  $q$, 419), 'error:P0001:El rollo FLUJOS-I se está imprimiendo');

-- A roll marked before this rule, with its print still going: what the
-- print used left with the mark, so it closes with 0 g.
select pg_temp.expect('Cerrar con gramos en un rollo que se descartó antes de la regla', 'operator', pg_temp.q($q$do $x$
  begin
    perform set_config('request.jwt.claims', '', true);
    reset role;
    update public.spools set status = 'discarded' where id = #2;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', #3, 'role', 'authenticated')::text, true);
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 15}]')::jsonb);
  end $x$$q$, 613, 419, 902), 'error:P0001:El rollo FLUJOS-I está «Descartado»: lo que tenía salió del stock cuando se marcó así, también lo que gastó esta impresión');

select pg_temp.expect('Cerrar con cero gramos en un rollo que se descartó antes de la regla', 'operator', pg_temp.q($q$do $x$
  declare n integer;
  begin
    perform set_config('request.jwt.claims', '', true);
    reset role;
    update public.spools set status = 'discarded' where id = #2;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', #3, 'role', 'authenticated')::text, true);
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 0}]')::jsonb);
    select count(*) into n from public.stock_movements where source_type = 'print_job' and source_id = #1;
    if n <> 0 then raise exception 'el cierre movió % filas del rollo', n; end if;
  end $x$$q$, 613, 419, 902), 'ok:');

select pg_temp.expect('Cerrar con gramos en un rollo en uso', 'operator', pg_temp.q($q$
  select public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
    p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 15}]')::jsonb)
  $q$, 613, 419), 'ok:1');

select pg_temp.expect('Atar a mano un rollo agotado a un trabajo de la cola', 'operator', pg_temp.q($q$
  insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, estimated_g) values (#1, #2, #3, 10)
  $q$, 1, 612, 416), 'error:P0001:No se imprime con el rollo FLUJOS-F');

-- ================================================== la receta que se usa es la activa

-- Version 1 is active and assembled with the red cap. Version 2 is higher,
-- switched off, and not assembled, with the blue cap: the screen shows
-- version 1, and so must everything that moves the shelf.
insert into public.catalog_products (id, workspace_id, name, slug, status) values
  (pg_temp.id(501), pg_temp.id(1), 'Botella de flujos', 'botella-de-flujos-prueba', 'published');

insert into public.product_variants (id, workspace_id, product_id, name, list_price, active) values
  (pg_temp.id(511), pg_temp.id(1), pg_temp.id(501), 'Roja', 20, true);

insert into public.inventory_items (id, workspace_id, kind, name, unit, product_variant_id) values
  (pg_temp.id(521), pg_temp.id(1), 'part', 'Tapa roja de flujos', 'unidad', null),
  (pg_temp.id(522), pg_temp.id(1), 'part', 'Tapa azul de flujos', 'unidad', null),
  (pg_temp.id(523), pg_temp.id(1), 'finished_good', 'Botella roja de flujos', 'unidad', pg_temp.id(511));

insert into public.recipes (id, workspace_id, variant_id, version, assembled, active) values
  (pg_temp.id(531), pg_temp.id(1), pg_temp.id(511), 1, true, true),
  (pg_temp.id(532), pg_temp.id(1), pg_temp.id(511), 2, false, false);

insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit) values
  (pg_temp.id(1), pg_temp.id(531), pg_temp.id(521), 1),
  (pg_temp.id(1), pg_temp.id(532), pg_temp.id(522), 1);

insert into public.stock_movements (workspace_id, occurred_at, type, inventory_item_id, quantity, unit_cost, source_type, note) values
  (pg_temp.id(1), now() - interval '2 days', 'production', pg_temp.id(521), 5, 1, 'print_job', 'Prueba de flujos'),
  (pg_temp.id(1), now() - interval '2 days', 'production', pg_temp.id(522), 5, 1, 'print_job', 'Prueba de flujos'),
  (pg_temp.id(1), now() - interval '2 days', 'production', pg_temp.id(523), 3, 8, 'assembly', 'Prueba de flujos');

insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total) values
  (pg_temp.id(701), pg_temp.id(1), 'FLU-0001', 'sale', pg_temp.id(301), 'confirmed', 20);

insert into public.order_lines (id, workspace_id, order_id, position, variant_id, description, quantity, unit_price) values
  (pg_temp.id(711), pg_temp.id(1), pg_temp.id(701), 1, pg_temp.id(511), 'Botella de flujos — Roja', 1, 20);

select pg_temp.expect('Armar usa la receta activa', 'operator', pg_temp.q($q$do $x$
  declare n_red integer; n_blue integer;
  begin
    perform public.assemble_product(#1, 1);
    select count(*) filter (where inventory_item_id = #2), count(*) filter (where inventory_item_id = #3)
      into n_red, n_blue
    from public.stock_movements where source_type = 'assembly' and type = 'consumption' and workspace_id = #4;
    if n_red <> 1 or n_blue <> 0 then raise exception 'armó con la roja % y con la azul %', n_red, n_blue; end if;
  end $x$$q$, 511, 521, 522, 1), 'ok:');

select pg_temp.expect('Entregar usa la receta activa', 'operator', pg_temp.q($q$do $x$
  declare n_product integer; n_blue integer;
  begin
    perform public.deliver_order(#1);
    select count(*) filter (where inventory_item_id = #2), count(*) filter (where inventory_item_id = #3)
      into n_product, n_blue
    from public.stock_movements where source_type = 'order_delivery' and workspace_id = #4;
    if n_product <> 1 or n_blue <> 0 then raise exception 'sacó % botellas y % tapas azules', n_product, n_blue; end if;
  end $x$$q$, 701, 523, 522, 1), 'ok:');

select pg_temp.expect('Vender usa la receta activa', 'operator', pg_temp.q($q$
  select public.quick_sale(#1, ('[{"variant_id": "' || #2 || '", "quantity": 1, "unit_price": 20}]')::jsonb, #3)
  $q$, 1, 511, 301), 'ok:1');

select pg_temp.expect('Las pantallas de armar y de contar enseñan la receta activa', 'operator', pg_temp.q($q$do $x$
  begin
    if not exists (select 1 from public.assembly_options where variant_id = #1) then
      raise exception 'la pantalla de armar no ofrece la botella';
    end if;
    if exists (select 1 from public.assembly_components where variant_id = #1 and inventory_item_id = #2)
       or not exists (select 1 from public.assembly_components where variant_id = #1 and inventory_item_id = #3) then
      raise exception 'la pantalla de armar enseña otra receta';
    end if;
    if not exists (select 1 from public.shelf_count_items where variant_id = #1) then
      raise exception 'el conteo no ofrece la botella';
    end if;
  end $x$$q$, 511, 522, 521), 'ok:');

-- ============================================ la Venta rápida con cifras grandes

select pg_temp.expect('Un cobro de más con cifras grandes dice el monto (T4-15)', 'operator', pg_temp.q($q$
  select public.quick_sale(#1, ('[{"variant_id": "' || #2 || '", "quantity": 1, "unit_price": 20}]')::jsonb, #3,
    null, null, #4, 5000000000)
  $q$, 1, 511, 301, 201), 'error:P0001:Lo cobrado (S/ 5000000000.00) pasa del total de la venta (S/ 20.00)');

-- ========================================== una llave por movimiento de dinero

insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total) values
  (pg_temp.id(702), pg_temp.id(1), 'FLU-0002', 'sale', pg_temp.id(301), 'confirmed', 30);

insert into public.order_lines (id, workspace_id, order_id, position, variant_id, description, quantity, unit_price) values
  (pg_temp.id(712), pg_temp.id(1), pg_temp.id(702), 1, null, 'Llavero con nombre', 1, 30);

insert into public.purchases (id, workspace_id) values
  (pg_temp.id(801), pg_temp.id(1)),
  (pg_temp.id(802), pg_temp.id(1));

insert into public.purchase_lines (workspace_id, purchase_id, inventory_item_id, quantity, unit_price) values
  (pg_temp.id(1), pg_temp.id(801), pg_temp.id(421), 2, 5),
  (pg_temp.id(1), pg_temp.id(802), pg_temp.id(421), 2, 5);

-- A payment from before the key went into the movement: its key is only in
-- purchase_payment_requests.
insert into public.transactions (id, workspace_id, account_id, type, amount, payment_method, purchase_id, occurred_at)
values (pg_temp.id(811), pg_temp.id(1), pg_temp.id(201), 'expense', 2, 'cash', pg_temp.id(801), now() - interval '1 day');

insert into public.purchase_payment_requests (workspace_id, request_key, transaction_id)
values (pg_temp.id(1), pg_temp.id(953), pg_temp.id(811));

select pg_temp.expect('El cobro de un pedido deja su llave en el movimiento', 'operator', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.collect_order_payment(#1, #2, 5, 'cash', null, null, #3)).id;
    if (select entry_key from public.transactions where id = a) is distinct from #3 then
      raise exception 'el movimiento no lleva la llave';
    end if;
    if not exists (select 1 from public.order_payment_keys where payment_key = #3 and transaction_id = a) then
      raise exception 'la ficha del pedido no encuentra la llave';
    end if;
    -- The same key through record_payment is the same movement.
    b := (public.record_payment(#1, #2, 5, p_key => #3)).id;
    select count(*) into n from public.transactions where order_id = #1;
    if a is distinct from b or n <> 1 then raise exception 'dos cobros: % filas', n; end if;
  end $x$$q$, 702, 201, 951), 'ok:');

select pg_temp.expect('La llave de un cobro usada en otro pedido', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.collect_order_payment(#1, #3, 5, 'cash', null, null, #4);
    perform public.record_payment(#2, #3, 5, p_key => #4);
  end $x$$q$, 702, 701, 201, 955), 'error:P0001:Este cobro ya se registró en otro pedido');

select pg_temp.expect('El pago de una compra deja su llave en el movimiento', 'operator', pg_temp.q($q$do $x$
  declare a uuid; b uuid; n integer;
  begin
    a := (public.record_purchase_payment(#1, #2, 3, 'cash', null, null, null, #3)).id;
    b := (public.record_purchase_payment(#1, #2, 3, 'cash', null, null, null, #3)).id;
    if (select entry_key from public.transactions where id = a) is distinct from #3 then
      raise exception 'el movimiento no lleva la llave';
    end if;
    select count(*) into n from public.transactions where purchase_id = #1 and voided_at is null;
    if a is distinct from b or n <> 2 then raise exception 'pagos de la compra: % filas', n; end if;
    if exists (select 1 from public.purchase_payment_requests where request_key = #3) then
      raise exception 'la llave también fue a purchase_payment_requests';
    end if;
  end $x$$q$, 801, 201, 952), 'ok:');

select pg_temp.expect('Una llave de pago de antes sigue valiendo', 'operator', pg_temp.q($q$do $x$
  declare a uuid; n integer;
  begin
    a := (public.record_purchase_payment(#1, #2, 2, 'cash', null, null, null, #3)).id;
    select count(*) into n from public.transactions where purchase_id = #1;
    if a is distinct from #4 or n <> 1 then raise exception 'pagó otra vez: % filas', n; end if;
  end $x$$q$, 801, 201, 953, 811), 'ok:');

select pg_temp.expect('La llave de un pago usada en otra compra', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.record_purchase_payment(#1, #3, 1, 'cash', null, null, null, #4);
    perform public.record_purchase_payment(#2, #3, 1, 'cash', null, null, null, #4);
  end $x$$q$, 801, 802, 201, 954), 'error:P0001:Este pago ya se registró en otra compra');

-- ============================================ lo que falla, en la ficha del pedido

-- Four prints for one line: one went well, one failed, one was cancelled
-- after half an hour and one was cancelled before it ran.
insert into public.orders (id, workspace_id, number, purpose, customer_id, status, total) values
  (pg_temp.id(703), pg_temp.id(1), 'FLU-0003', 'sale', pg_temp.id(301), 'confirmed', 10);

insert into public.order_lines (id, workspace_id, order_id, position, variant_id, description, quantity, unit_price) values
  (pg_temp.id(713), pg_temp.id(1), pg_temp.id(703), 1, null, 'Placa grabada', 1, 10);

insert into public.print_jobs (
  id, workspace_id, printer_id, order_line_id, label, status, started_at, finished_at, actual_time_s,
  failure_cause, material_cost, energy_cost, machine_cost
) values
  (pg_temp.id(621), pg_temp.id(1), pg_temp.id(601), pg_temp.id(713), 'Placa', 'success',
   now() - interval '5 hours', now() - interval '4 hours', 3600, null, 1, 0.1, 0.5),
  (pg_temp.id(622), pg_temp.id(1), pg_temp.id(601), pg_temp.id(713), 'Placa', 'failed',
   now() - interval '7 hours', now() - interval '6 hours', 1800, 'adhesion', 0.5, 0.05, 0.25),
  (pg_temp.id(623), pg_temp.id(1), pg_temp.id(601), pg_temp.id(713), 'Placa', 'cancelled',
   now() - interval '9 hours', now() - interval '8 hours', 1800, null, 0.5, 0.05, 0.25),
  (pg_temp.id(624), pg_temp.id(1), pg_temp.id(601), pg_temp.id(713), 'Placa', 'cancelled',
   null, now() - interval '10 hours', null, null, null, null, null);

select pg_temp.expect('Una cancelada que corrió es un intento fallido en la ficha del pedido', 'operator', pg_temp.q($q$do $x$
  declare r record;
  begin
    select * into r from public.order_production_summary where order_id = #1;
    if r.jobs <> 4 or r.successful_jobs <> 1 or r.failed_jobs <> 2 then
      raise exception '% trabajos, % exitosos, % fallidos', r.jobs, r.successful_jobs, r.failed_jobs;
    end if;
  end $x$$q$, 703), 'ok:');

-- --------------------------------------------------------------- resultado

do $$
declare
  v_failures text := current_setting('flujos.fallas', true);
begin
  if coalesce(v_failures, '') <> '' then
    raise exception 'flujos: no coincide%', v_failures;
  end if;
  raise notice 'flujos: todo coincide';
end;
$$;

rollback;
