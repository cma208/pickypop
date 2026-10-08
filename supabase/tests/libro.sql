-- Prueba del libro de dinero (T5-01 y los hallazgos de finanzas de la tercera pasada).
--
-- Se corre con psql sobre cualquier base local que tenga las migraciones:
--
--   docker exec -i supabase_db_pickypop psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/libro.sql
--
-- Todo pasa dentro de `begin … rollback`: crea su propio taller, con un dueño y
-- un operador, sus cuentas, categorías, pedidos y una compra, y no deja rastro.
-- Cada caso corre como esa persona, con seguridad por fila, y se deshace solo.
-- Si algo no da lo esperado, termina con una excepción que nombra cada caso
-- que falló. Si todo coincide, dice «libro: todo coincide».
--
-- Lo que prueba, cada cosa con el caso que la encontró:
--
-- * Lo escrito no se reescribe: ni el monto, ni la cuenta, ni se desanula, ni
--   se borra. Solo se anula, una vez, por el dueño y con motivo (T5-01, T5-10).
-- * El cobro de una venta a «Clientes varios» no se anula, y la negativa dice
--   las dos salidas: una transferencia o un egreso (T5-05). Tampoco le deja
--   deuda una devolución, y anular una devolución no deja un pedido cobrado
--   de más.
-- * Todo movimiento nuevo cumple las reglas, lo escriba quien lo escriba:
--   cuenta activa (T5-03, T5-12), fecha que ya llegó (T5-08), categoría que
--   corresponde (T5-06), tope (T4-15), sin sobrepagar un pedido ni una compra.
-- * Una llave por movimiento: el mismo envío dos veces registra uno.
-- * La apertura de una cuenta no es futura (T5-02, T1-10).
-- * Los cobros caen en una categoría de ventas, nunca en una de capital (T5-07).
-- * Las categorías de capital se reconocen por su nombre al crearlas o
--   renombrarlas, y una de capital no es de ventas (T5-06).
-- * Un taller entero que se borra se lleva su libro.
-- * El atraso se cuenta con el día del taller (T4-11).
--
-- Los rechazos de la base escritos para una persona son P0001. Editar o borrar
-- un movimiento se espera como «error» a secas: según las políticas del área
-- base lo frena el permiso de la tabla (42501) o, si no, el disparador (P0001).

begin;

-- ------------------------------------------------------------ las personas

insert into auth.users (id, email, aud, role) values
  ('00000000-11b0-4000-8000-0000000000a1', 'libro-dueno@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-11b0-4000-8000-0000000000a2', 'libro-operador@prueba.test', 'authenticated', 'authenticated');

insert into public.workspaces (id, name) values
  ('00000000-11b0-4000-8000-000000000001', 'Taller de prueba del libro');

insert into public.workspace_members (workspace_id, user_id, role, display_name) values
  ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-0000000000a1', 'owner', 'Dueño'),
  ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-0000000000a2', 'operator', 'Operador');

-- --------------------------------------------------------------- helpers

create function pg_temp.person(p_who text) returns uuid language sql immutable as $$
  select case p_who
    when 'owner' then '00000000-11b0-4000-8000-0000000000a1'::uuid
    when 'operator' then '00000000-11b0-4000-8000-0000000000a2'::uuid
  end
$$;

create function pg_temp.label(p_who text) returns text language sql immutable as $$
  select case p_who when 'owner' then 'dueño' when 'operator' then 'operador' else p_who end
$$;

create function pg_temp.fail(p_message text) returns void language sql as $$
  select set_config('libro.fallas', current_setting('libro.fallas', true) || E'\n  - ' || p_message, true)
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

-- `p_expected` is a LIKE pattern for the start of the answer: % inside it
-- skips the parts of a message that do not matter.
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

create function pg_temp.check(p_case text, p_holds boolean) returns void language plpgsql as $$
begin
  if p_holds is distinct from true then
    perform pg_temp.fail(p_case);
  end if;
end;
$$;

select set_config('libro.fallas', '', true);

-- ------------------------------------------------------------------ datos

insert into public.workshop_settings (workspace_id) values ('00000000-11b0-4000-8000-000000000001');

insert into public.accounts (
  id, workspace_id, name, opening_balance, opening_balance_on, active, default_payment_method
) values
  ('00000000-11b0-4000-8000-000000000201', '00000000-11b0-4000-8000-000000000001', 'Efectivo', 100,
   app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) - 30, true, 'cash'),
  ('00000000-11b0-4000-8000-000000000202', '00000000-11b0-4000-8000-000000000001', 'Yape', 0,
   app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) - 30, true, 'yape'),
  ('00000000-11b0-4000-8000-000000000203', '00000000-11b0-4000-8000-000000000001', 'Cerrada', 40,
   app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) - 30, false, 'cash');

-- Capital is not given here: the names say it (`transaction_categories_capital_by_name`).
insert into public.transaction_categories (id, workspace_id, name, direction, sales, active) values
  ('00000000-11b0-4000-8000-000000000211', '00000000-11b0-4000-8000-000000000001', 'Venta de productos', 'income', true, true),
  ('00000000-11b0-4000-8000-000000000212', '00000000-11b0-4000-8000-000000000001', 'Reembolsos', 'income', false, true),
  ('00000000-11b0-4000-8000-000000000213', '00000000-11b0-4000-8000-000000000001', 'Envíos', 'expense', false, true),
  ('00000000-11b0-4000-8000-000000000214', '00000000-11b0-4000-8000-000000000001', 'Aporte del dueño', 'income', false, true),
  ('00000000-11b0-4000-8000-000000000215', '00000000-11b0-4000-8000-000000000001', 'Retiro de socios', 'expense', false, true),
  ('00000000-11b0-4000-8000-000000000216', '00000000-11b0-4000-8000-000000000001', 'Bienes de capital', 'expense', false, true),
  ('00000000-11b0-4000-8000-000000000217', '00000000-11b0-4000-8000-000000000001', 'Luz vieja', 'expense', false, false);

update public.workshop_settings
set order_payment_category_id = '00000000-11b0-4000-8000-000000000211'
where workspace_id = '00000000-11b0-4000-8000-000000000001';

insert into public.customers (id, workspace_id, name) values
  ('00000000-11b0-4000-8000-000000000301', '00000000-11b0-4000-8000-000000000001', 'Ana Prueba');

-- The workshop may already have its «Clientes varios».
insert into public.customers (workspace_id, name, walk_in)
select '00000000-11b0-4000-8000-000000000001', 'Clientes varios', true
where not exists (
  select 1 from public.customers c
  where c.workspace_id = '00000000-11b0-4000-8000-000000000001' and c.walk_in
);

insert into public.orders (id, workspace_id, number, customer_id, status, total, due_date) values
  ('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000001', 'LIB-0001',
   '00000000-11b0-4000-8000-000000000301', 'delivered', 90,
   app.workspace_day('00000000-11b0-4000-8000-000000000001', now())),
  ('00000000-11b0-4000-8000-000000000402', '00000000-11b0-4000-8000-000000000001', 'LIB-0002',
   '00000000-11b0-4000-8000-000000000301', 'cancelled', 50, null),
  ('00000000-11b0-4000-8000-000000000404', '00000000-11b0-4000-8000-000000000001', 'LIB-0004',
   '00000000-11b0-4000-8000-000000000301', 'delivered', 40,
   app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) - 3);

-- A quick sale is the only way to sell to «Clientes varios»: it says so for
-- this transaction, and this is that sale, already collected.
select set_config('app.quick_sale', 'on', true);
insert into public.orders (id, workspace_id, number, customer_id, status, total)
select '00000000-11b0-4000-8000-000000000403', '00000000-11b0-4000-8000-000000000001', 'LIB-0003', c.id, 'delivered', 25
from public.customers c
where c.workspace_id = '00000000-11b0-4000-8000-000000000001' and c.walk_in;
select set_config('app.quick_sale', '', true);

insert into public.purchases (id, workspace_id, shipping_cost) values
  ('00000000-11b0-4000-8000-000000000501', '00000000-11b0-4000-8000-000000000001', 30);

-- Written without a session, as a migration would: the caller is trusted.
insert into public.transactions (
  id, workspace_id, account_id, type, category_id, amount, payment_method, order_id, entry_key,
  occurred_at, void_reason, voided_at
) values
  ('00000000-11b0-4000-8000-000000000601', '00000000-11b0-4000-8000-000000000001',
   '00000000-11b0-4000-8000-000000000201', 'income', '00000000-11b0-4000-8000-000000000211',
   10, 'cash', '00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-0000000006a1',
   now() - interval '1 day', null, null),
  ('00000000-11b0-4000-8000-000000000602', '00000000-11b0-4000-8000-000000000001',
   '00000000-11b0-4000-8000-000000000201', 'expense', '00000000-11b0-4000-8000-000000000213',
   5, 'cash', null, null, now() - interval '1 day', 'Se anotó dos veces', now()),
  ('00000000-11b0-4000-8000-000000000603', '00000000-11b0-4000-8000-000000000001',
   '00000000-11b0-4000-8000-000000000202', 'income', '00000000-11b0-4000-8000-000000000211',
   25, 'yape', '00000000-11b0-4000-8000-000000000403', null, now() - interval '1 hour', null, null),
  ('00000000-11b0-4000-8000-000000000604', '00000000-11b0-4000-8000-000000000001',
   '00000000-11b0-4000-8000-000000000201', 'income', '00000000-11b0-4000-8000-000000000212',
   15, 'cash', null, null, now() - interval '1 hour', null, null);

-- ------------------------------------------------- lo escrito, escrito está

select pg_temp.expect('Cambiar el monto de un cobro', 'owner',
  $q$update public.transactions set amount = 999.99 where id = '00000000-11b0-4000-8000-000000000601'$q$, 'error:');
select pg_temp.expect('Mover un cobro a otra cuenta', 'owner',
  $q$update public.transactions set account_id = '00000000-11b0-4000-8000-000000000202' where id = '00000000-11b0-4000-8000-000000000601'$q$, 'error:');
select pg_temp.expect('Desanular un movimiento', 'owner',
  $q$update public.transactions set voided_at = null, void_reason = null where id = '00000000-11b0-4000-8000-000000000602'$q$, 'error:');
select pg_temp.expect('Cambiar el motivo de una anulación', 'owner',
  $q$update public.transactions set void_reason = 'Otro motivo' where id = '00000000-11b0-4000-8000-000000000602'$q$, 'error:');
select pg_temp.expect('Borrar un movimiento', 'owner',
  $q$delete from public.transactions where id = '00000000-11b0-4000-8000-000000000604'$q$, 'error:');
select pg_temp.expect('Anular escribiendo en la tabla', 'operator',
  $q$update public.transactions set voided_at = now(), void_reason = 'x' where id = '00000000-11b0-4000-8000-000000000604'$q$, 'error:');

-- --------------------------------------------------------------- anular

select pg_temp.expect('Anular un movimiento', 'operator',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000604', 'Me equivoqué')$q$,
  'error:P0001:Solo el dueño del taller puede anular');
select pg_temp.expect('Anular sin motivo', 'owner',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000604', '   ')$q$,
  'error:P0001:Escribe el motivo');
select pg_temp.expect('Anular lo ya anulado', 'owner',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000602', 'Otra vez')$q$,
  'error:P0001:Este movimiento ya estaba anulado (motivo: «Se anotó dos veces»)');
select pg_temp.expect('Anular dos veces, como dos pestañas (T5-10)', 'owner',
  $q$do $x$ begin
    perform public.void_transaction('00000000-11b0-4000-8000-000000000604', 'Primera');
    perform public.void_transaction('00000000-11b0-4000-8000-000000000604', 'Segunda');
  end $x$$q$,
  'error:P0001:Este movimiento ya estaba anulado (motivo: «Primera»)');
select pg_temp.expect('Anular un ingreso', 'owner',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000604', 'Se anotó en la cuenta equivocada')$q$, 'ok:1');
select pg_temp.expect('Anular el cobro de un pedido con cliente', 'owner',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000601', 'El voucher era de otro pedido')$q$, 'ok:1');
select pg_temp.expect('Anular el cobro de una venta a «Clientes varios» (T5-05)', 'owner',
  $q$select public.void_transaction('00000000-11b0-4000-8000-000000000603', 'No llegó el Yape')$q$,
  'error:P0001:Este cobro es de LIB-0003%transferencia de Yape a esa cuenta%egreso de S/ 25.00 en Yape%');

select pg_temp.expect('Devolver parte de una venta a «Clientes varios» (T5-05)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000202', 'expense', 5, 'yape',
             '00000000-11b0-4000-8000-000000000403')$q$,
  'error:P0001:El pedido LIB-0003 es una venta a «Clientes varios»%quedaría debiendo S/ 5.00%');
select pg_temp.expect('Anular una devolución que ya se volvió a cobrar', 'owner',
  $q$do $x$
  declare
    v_refund uuid;
  begin
    insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
    values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income', 40, 'cash',
            '00000000-11b0-4000-8000-000000000404');
    insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
    values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 40, 'cash',
            '00000000-11b0-4000-8000-000000000404')
    returning id into v_refund;
    insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
    values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income', 40, 'cash',
            '00000000-11b0-4000-8000-000000000404');
    perform public.void_transaction(v_refund, 'La devolución no se hizo');
  end $x$$q$,
  'error:P0001:Anulada esta devolución, el pedido LIB-0004 quedaría cobrado de más: el total es S/ 40.00 y contaría S/ 80.00');
select pg_temp.expect('Anular una devolución que no se hizo', 'owner',
  $q$do $x$
  declare
    v_refund uuid;
  begin
    insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
    values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 5, 'cash',
            '00000000-11b0-4000-8000-000000000401')
    returning id into v_refund;
    perform public.void_transaction(v_refund, 'La devolución no se hizo');
  end $x$$q$, 'ok:');

-- ------------------------------------------- cada movimiento nuevo cumple

select pg_temp.expect('Un ingreso en una cuenta desactivada (T5-03)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000203', 'income', 5, 'cash')$q$,
  'error:P0001:La cuenta Cerrada está desactivada');
select pg_temp.expect('Vaciar una cuenta desactivada con una transferencia (T5-12)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, counter_account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000203',
             '00000000-11b0-4000-8000-000000000201', 'transfer', 40, 'cash')$q$, 'ok:1');
select pg_temp.expect('Transferir a una cuenta desactivada', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, counter_account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201',
             '00000000-11b0-4000-8000-000000000203', 'transfer', 1, 'cash')$q$,
  'error:P0001:La cuenta Cerrada está desactivada');
select pg_temp.expect('Un egreso con fecha de mañana (T5-08)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, occurred_at)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 5, 'cash', now() + interval '1 day')$q$,
  'error:P0001:La fecha del movimiento');
select pg_temp.expect('Un egreso con el reloj del teléfono un minuto adelantado', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, occurred_at)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 5, 'cash', now() + interval '1 minute')$q$,
  'ok:1');
select pg_temp.expect('Un egreso de más de un millón (T4-15)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 1000000.01, 'cash')$q$,
  'error:P0001:El monto (S/ 1000000.01) pasa del máximo');
select pg_temp.expect('Un egreso que no es un número', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 'NaN', 'cash')$q$,
  'error:');
select pg_temp.expect('Un ingreso en «Aporte del dueño» (T5-06)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income',
             '00000000-11b0-4000-8000-000000000214', 100, 'cash')$q$,
  'error:P0001:«Aporte del dueño» es una categoría de capital');
select pg_temp.expect('Un egreso en «Retiro de socios» (T5-06)', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense',
             '00000000-11b0-4000-8000-000000000215', 10, 'cash')$q$,
  'error:P0001:«Retiro de socios» es una categoría de capital');
select pg_temp.expect('Un egreso en «Bienes de capital», que es equipo', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense',
             '00000000-11b0-4000-8000-000000000216', 10, 'cash')$q$, 'ok:1');
select pg_temp.expect('Un aporte del dueño en «Reembolsos»', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'owner_contribution',
             '00000000-11b0-4000-8000-000000000212', 10, 'cash')$q$,
  'error:P0001:«Reembolsos» no es una categoría de capital');
select pg_temp.expect('Un aporte del dueño en «Aporte del dueño»', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'owner_contribution',
             '00000000-11b0-4000-8000-000000000214', 10, 'cash')$q$, 'ok:1');
select pg_temp.expect('Un retiro del dueño sin categoría', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'owner_draw', 10, 'cash')$q$,
  'ok:1');
select pg_temp.expect('Una transferencia con categoría', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, counter_account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201',
             '00000000-11b0-4000-8000-000000000202', 'transfer', '00000000-11b0-4000-8000-000000000213', 1, 'cash')$q$,
  'error:');
select pg_temp.expect('Un egreso en una categoría desactivada', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense',
             '00000000-11b0-4000-8000-000000000217', 3, 'cash')$q$,
  'error:P0001:La categoría «Luz vieja» está desactivada');

-- ----------------------------------------------------- pedidos y compras

select pg_temp.expect('Cobrar de más escribiendo en la tabla', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income', 100, 'cash',
             '00000000-11b0-4000-8000-000000000401')$q$,
  'error:P0001:El cobro excede el saldo del pedido LIB-0001');
select pg_temp.expect('Cobrar de más con record_payment', 'operator',
  $q$select public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 100)$q$,
  'error:P0001:El cobro excede el saldo del pedido LIB-0001');
select pg_temp.expect('Cobrar un pedido cancelado', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income', 1, 'cash',
             '00000000-11b0-4000-8000-000000000402')$q$,
  'error:P0001:El pedido LIB-0002 está cancelado');
select pg_temp.expect('Devolver más de lo cobrado', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, order_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 20, 'cash',
             '00000000-11b0-4000-8000-000000000401')$q$,
  'error:P0001:La devolución del pedido LIB-0001');
select pg_temp.expect('Cobrar un pedido en una categoría de capital', 'operator',
  $q$select public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 5,
       p_category_id => '00000000-11b0-4000-8000-000000000214')$q$,
  'error:P0001:«Aporte del dueño» es una categoría de capital, y el cobro de un pedido es una venta');
select pg_temp.expect('Cobrar un pedido con fecha de mañana', 'operator',
  $q$select public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 5,
       p_occurred_at => now() + interval '1 day')$q$,
  'error:P0001:');
select pg_temp.expect('Pagar una compra de más', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, purchase_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 50, 'cash',
             '00000000-11b0-4000-8000-000000000501')$q$,
  'error:P0001:El pago excede lo que falta pagar de la compra');
select pg_temp.expect('Pagar una compra entera', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, amount, payment_method, purchase_id)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'expense', 30, 'cash',
             '00000000-11b0-4000-8000-000000000501')$q$, 'ok:1');

-- -------------------------------------------------- una llave, una vez

select pg_temp.expect('El mismo cobro enviado dos veces', 'operator',
  $q$do $x$
  declare
    v_count int;
  begin
    perform public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 5,
      p_key => '00000000-11b0-4000-8000-0000000006b1');
    perform public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 5,
      p_key => '00000000-11b0-4000-8000-0000000006b1');
    select count(*) into v_count from public.transactions where entry_key = '00000000-11b0-4000-8000-0000000006b1';
    if v_count <> 1 then
      raise exception 'quedaron % cobros', v_count;
    end if;
  end $x$$q$, 'ok:');
select pg_temp.expect('El mismo movimiento de Caja enviado dos veces', 'operator',
  $q$insert into public.transactions (workspace_id, account_id, type, category_id, amount, payment_method, order_id, entry_key)
     values ('00000000-11b0-4000-8000-000000000001', '00000000-11b0-4000-8000-000000000201', 'income',
             '00000000-11b0-4000-8000-000000000211', 10, 'cash', '00000000-11b0-4000-8000-000000000401',
             '00000000-11b0-4000-8000-0000000006a1')
     on conflict (workspace_id, entry_key) do nothing$q$, 'ok:0');

-- ------------------------------------------------- apertura de cuentas

select pg_temp.expect('Crear una cuenta que abre en dos meses (T1-10)', 'owner',
  $q$insert into public.accounts (workspace_id, name, opening_balance_on)
     values ('00000000-11b0-4000-8000-000000000001', 'BCP', app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) + 60)$q$,
  'error:P0001:La fecha del saldo de apertura');
select pg_temp.expect('Llevar la apertura a mañana (T5-02)', 'owner',
  $q$update public.accounts set opening_balance_on = app.workspace_day('00000000-11b0-4000-8000-000000000001', now()) + 1
     where id = '00000000-11b0-4000-8000-000000000201'$q$,
  'error:P0001:La fecha del saldo de apertura');
select pg_temp.expect('Llevar la apertura a hoy', 'owner',
  $q$update public.accounts set opening_balance_on = app.workspace_day('00000000-11b0-4000-8000-000000000001', now())
     where id = '00000000-11b0-4000-8000-000000000201'$q$, 'ok:1');
select pg_temp.expect('Un saldo de apertura de dos millones', 'owner',
  $q$insert into public.accounts (workspace_id, name, opening_balance)
     values ('00000000-11b0-4000-8000-000000000001', 'BCP', 2000000)$q$,
  'error:P0001:El saldo de apertura');

-- ------------------------------------- los cobros caen en una de ventas

select pg_temp.expect('Desactivar la última categoría de ventas (T5-07)', 'owner',
  $q$update public.transaction_categories set active = false where id = '00000000-11b0-4000-8000-000000000211'$q$,
  'error:P0001:');
select pg_temp.expect('Desmarcar la última categoría de ventas', 'owner',
  $q$update public.transaction_categories set sales = false where id = '00000000-11b0-4000-8000-000000000211'$q$,
  'error:P0001:');
select pg_temp.expect('Elegir una categoría de capital para los cobros', 'owner',
  $q$update public.workshop_settings set order_payment_category_id = '00000000-11b0-4000-8000-000000000214'
     where workspace_id = '00000000-11b0-4000-8000-000000000001'$q$,
  'error:P0001:');
select pg_temp.expect('Un cobro sin categoría elegida cae en la de ventas', 'owner',
  $q$do $x$
  declare
    v_category uuid;
  begin
    update public.workshop_settings set order_payment_category_id = null
    where workspace_id = '00000000-11b0-4000-8000-000000000001';
    perform public.record_payment('00000000-11b0-4000-8000-000000000401', '00000000-11b0-4000-8000-000000000201', 5,
      p_key => '00000000-11b0-4000-8000-0000000006b2');
    select category_id into v_category from public.transactions where entry_key = '00000000-11b0-4000-8000-0000000006b2';
    if v_category is distinct from '00000000-11b0-4000-8000-000000000211' then
      raise exception 'cayó en %', v_category;
    end if;
  end $x$$q$, 'ok:');

-- --------------------------------------------- capital por su nombre

select pg_temp.check('«Aporte del dueño» se crea como categoría de capital',
  (select capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000214'));
select pg_temp.check('«Retiro de socios» se crea como categoría de capital',
  (select capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000215'));
select pg_temp.check('«Bienes de capital» no es de capital: es equipo',
  (select not capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000216'));
select pg_temp.check('«Venta de productos» no es de capital',
  (select not capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000211'));
select pg_temp.check('Los nombres de capital, en las dos direcciones',
  app.category_name_is_capital('income', 'Capital social')
  and app.category_name_is_capital('income', 'APORTES')
  and app.category_name_is_capital('income', 'Inyección de Capital')
  and app.category_name_is_capital('expense', 'Devolución de capital')
  and app.category_name_is_capital('expense', 'Retiro del Dueño')
  and app.category_name_is_capital('expense', 'Retiro de capital')
  and app.category_name_is_capital('expense', 'Dividendos')
  and not app.category_name_is_capital('expense', 'Retiro')
  and not app.category_name_is_capital('expense', 'Bienes de capital')
  and not app.category_name_is_capital('income', 'Venta de bienes de capital'));

select pg_temp.expect('Marcar «Aporte del dueño» como de ventas', 'owner',
  $q$update public.transaction_categories set sales = true where id = '00000000-11b0-4000-8000-000000000214'$q$,
  'error:P0001:«Aporte del dueño» es una categoría de capital');
select pg_temp.expect('Crear una categoría de capital y de ventas a la vez', 'owner',
  $q$insert into public.transaction_categories (workspace_id, name, direction, sales, capital)
     values ('00000000-11b0-4000-8000-000000000001', 'Ventas raras', 'income', true, true)$q$,
  'error:P0001:«Ventas raras» es una categoría de capital');
select pg_temp.expect('Renombrar «Reembolsos» a «Aporte de socios» la marca de capital', 'owner',
  $q$do $x$
  begin
    update public.transaction_categories set name = 'Aporte de socios' where id = '00000000-11b0-4000-8000-000000000212';
    if not (select capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000212') then
      raise exception 'no quedó de capital';
    end if;
  end $x$$q$, 'ok:');
select pg_temp.expect('Renombrar «Aporte del dueño» no le quita la marca', 'owner',
  $q$do $x$
  begin
    update public.transaction_categories set name = 'Plata de Carlos' where id = '00000000-11b0-4000-8000-000000000214';
    if not (select capital from public.transaction_categories where id = '00000000-11b0-4000-8000-000000000214') then
      raise exception 'perdió la marca';
    end if;
  end $x$$q$, 'ok:');
select pg_temp.expect('Renombrar la categoría de los pagos de compras a «Retiro del dueño»', 'owner',
  $q$do $x$
  begin
    update public.workshop_settings set purchase_payment_category_id = '00000000-11b0-4000-8000-000000000213'
    where workspace_id = '00000000-11b0-4000-8000-000000000001';
    update public.transaction_categories set name = 'Retiro del dueño' where id = '00000000-11b0-4000-8000-000000000213';
  end $x$$q$,
  'error:P0001:«Retiro del dueño» es la categoría de los pagos de compras, y con ese nombre');

-- --------------------------------------- el atraso, con el día del taller

-- A server whose clock is already in tomorrow (UTC+14) used to count a debt
-- due today in Lima as one day late.
set local timezone = 'Pacific/Kiritimati';
select pg_temp.check('Lo que vence hoy en el taller no está atrasado (T4-11)',
  (select days_overdue = 0 from public.receivables where order_id = '00000000-11b0-4000-8000-000000000401'));
select pg_temp.check('Lo que venció hace tres días lleva tres días de atraso',
  (select days_overdue = 3 from public.receivables where order_id = '00000000-11b0-4000-8000-000000000404'));
reset timezone;

-- --------------------------------------------- un taller entero se va

-- Nadie lo puede hacer por la API (workspaces no tiene política de borrar),
-- pero desde la consola, con la sesión de alguien puesta, la regla de no
-- borrar movimientos frenaba la cascada. Los miembros se quitan antes y sin
-- sesión: lo que se prueba aquí es el libro, no las reglas de los miembros.
do $$
begin
  begin
    delete from public.workspace_members where workspace_id = '00000000-11b0-4000-8000-000000000001';
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', pg_temp.person('owner'), 'role', 'authenticated')::text,
      true
    );
    delete from public.workspaces where id = '00000000-11b0-4000-8000-000000000001';
    raise exception using errcode = 'PT999', message = 'deshacer';
  exception
    when sqlstate 'PT999' then null;
    when others then perform pg_temp.fail('Borrar un taller entero con su libro: ' || sqlerrm);
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ------------------------------------------------------------- veredicto

do $$
begin
  if current_setting('libro.fallas', true) <> '' then
    raise exception 'libro: no coincide%', current_setting('libro.fallas', true);
  end if;
  raise notice 'libro: todo coincide';
end;
$$;

rollback;
