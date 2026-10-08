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
--   pesajes, y mermas, consumos y conteos de insumos a mano. Una entrada a
--   mano no suma (ADR-023, `stock_written_off`).
-- * No se imprime con un rollo agotado o descartado (T3-07): ni al crear el
--   trabajo, ni al iniciarlo (eligiéndolo o con el que tenía de la cola), ni
--   al cerrarlo con gramos. Con cero gramos sí cierra.
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
  (pg_temp.id(422), pg_temp.id(1), 'packaging', 'Bolsa chica', 'unidad', 1);

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
    perform public.move_item_stock(#6, 'out', 1, 'consumption'); -- 1 at 2: 2.00
    perform public.move_item_stock(#6, 'count', 5);              -- 7 counted as 5: 4.00
    perform public.move_item_stock(#7, 'count', 4);              -- 3 counted as 4: -1.00
    perform public.move_item_stock(#6, 'in', 10);                -- an entry: nothing

    select * into r from public.monthly_income_statement where workspace_id = #1 and month = v_month;
    if r.stock_written_off is distinct from 120.00 then
      raise exception 'stock_written_off da % y no 120.00', r.stock_written_off;
    end if;
    if r.unsold_production is distinct from 120.00 or r.shelf_count_losses <> 0 then
      raise exception 'producción no vendida da % (conteo del estante %)', r.unsold_production, r.shelf_count_losses;
    end if;
    if r.net_profit is distinct from -120.00 then
      raise exception 'la utilidad neta da % y no -120.00', r.net_profit;
    end if;
  end $x$$q$, 1, 411, 412, 413, 414, 421, 422), 'ok:');

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

select pg_temp.expect('Cerrar con gramos en un rollo que se descartó', 'operator', pg_temp.q($q$do $x$
  begin
    perform public.set_spool_status(#2, 'discarded');
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 15}]')::jsonb);
  end $x$$q$, 613, 419), 'error:P0001:El rollo FLUJOS-I está «Descartado»');

select pg_temp.expect('Cerrar con cero gramos en un rollo que se descartó', 'operator', pg_temp.q($q$do $x$
  declare n integer;
  begin
    perform public.set_spool_status(#2, 'discarded');
    perform public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
      p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 0}]')::jsonb);
    select count(*) into n from public.stock_movements where source_type = 'print_job' and source_id = #1;
    if n <> 0 then raise exception 'el cierre movió % filas del rollo', n; end if;
  end $x$$q$, 613, 419), 'ok:');

select pg_temp.expect('Cerrar con gramos en un rollo en uso', 'operator', pg_temp.q($q$
  select public.complete_print_job(p_job_id => #1, p_result => 'success', p_expected_status => 'printing',
    p_actual_time_s => 3600, p_filament_usage => ('[{"spool_id": "' || #2 || '", "actual_g": 15}]')::jsonb)
  $q$, 613, 419), 'ok:1');

select pg_temp.expect('Atar a mano un rollo agotado a un trabajo de la cola', 'operator', pg_temp.q($q$
  insert into public.print_job_filaments (workspace_id, print_job_id, spool_id, estimated_g) values (#1, #2, #3, 10)
  $q$, 1, 612, 416), 'error:P0001:No se imprime con el rollo FLUJOS-F');

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
