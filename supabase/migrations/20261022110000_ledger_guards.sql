-- The book of money is kept by the database, not by record_payment alone (T5-01).
--
-- The rules of a collection lived inside `record_payment`: an active account,
-- no overpayment, no cancelled order. An income written straight into
-- `transactions` skipped all of them, Caja wrote its movements that way, and
-- a movement already written could be edited, revived after being voided or
-- deleted. The third pass found each of those through the screens (a movement
-- in a deactivated account from an old tab, a date at the end of the month,
-- two tabs voiding the same row) and the rest through the API.
--
-- Four things here, each a trigger or a function with a name of its own:
--
-- 1. Every new movement meets the same rules, whoever writes it
--    (`app.guard_ledger_entry`):
--    * Its account is active. A transfer may still leave a deactivated
--      account, so whatever is left in it can be moved out (T5-12): the
--      accounts screen asks for exactly that. It may not land in one (T5-03).
--    * It has already happened: a date more than five minutes ahead of now is
--      refused, the slack `quick_sale` gives a phone's clock (T5-08). That
--      covers Caja, the collections (T4-06) and purchase payments (T1-09).
--    * Its category belongs to the workshop, is active, fits the type: a
--      transfer takes none, and a category of capital is for the owner's
--      contributions and draws only, in both directions (T5-06). The
--      direction is still the composite foreign key's job, and a loose income
--      under a category of sales is still `loose_income_is_not_a_sale`'s.
--    * Its amount has a ceiling, `app.ledger_amount_limit()`, said in soles
--      instead of an overflow of the column (T4-15).
--    * Against an order: the order is of this workshop, a collection only for
--      a sale that is not cancelled, never more than what is owed, and a
--      refund never more than what was collected. Against a purchase: never
--      more than what is left to pay. The rules of `record_payment` and
--      `record_purchase_payment`, repeated for whatever skips them. Both
--      lock the row first, as those functions do.
-- 2. A movement written is never edited (`app.guard_ledger_change`). The only
--    change is voiding it, once, by the owner, with a reason. It cannot be
--    voided twice nor revived. And the collection of a quick sale to
--    «Clientes varios» is not voided: «Clientes varios» never owes (T5-05,
--    ADR-024).
-- 3. A movement is never deleted (`app.ledger_is_never_deleted`).
-- 4. Voiding goes through `void_transaction`, for the owner only, which says
--    in words why it cannot when it cannot (T5-10, T1-21).
--
-- The policies of the table are the base area's (ADR-025). These triggers
-- hold whatever the policies end up saying. Without a signed-in user the
-- caller is trusted, as in `guard_sales_category`: a migration, the SQL
-- console.
--
-- The opening date of an account cannot be in the future, and its opening
-- balance has the same ceiling (T5-02, T1-10): `app.guard_account_opening`.

-- ---------------------------------------------------------------- ceiling

/*
 * The largest single movement the workshop records, in soles. A two-person
 * shop never moves a million in one go, and a typo with three zeros too many
 * is far more likely. The screens repeat it (MAX_LEDGER_AMOUNT in
 * finanzas.models.ts), so the two change together.
 */
create or replace function app.ledger_amount_limit()
returns numeric
language sql
immutable
as $$
  select 1000000.00::numeric;
$$;

grant execute on function app.ledger_amount_limit() to authenticated;

-- ----------------------------------------------------- every new movement

create or replace function app.guard_ledger_entry()
returns trigger
language plpgsql
as $$
declare
  v_timezone text;
  v_limit numeric := app.ledger_amount_limit();
  v_account public.accounts;
  v_counter public.accounts;
  v_category public.transaction_categories;
  v_order public.orders;
  v_paid numeric;
  v_total numeric;
begin
  select w.timezone into v_timezone from public.workspaces w where w.id = new.workspace_id;

  -- NaN is greater than every number, so the ceiling refuses it too.
  if new.amount > v_limit then
    raise exception 'El monto (S/ %) pasa del máximo de un movimiento, S/ %: revisa que esté bien escrito.',
      to_char(new.amount, 'FM999999999990.00'), to_char(v_limit, 'FM999999999990.00');
  end if;

  if not isfinite(new.occurred_at) then
    raise exception 'La fecha del movimiento no es válida.';
  end if;
  -- A few minutes of slack: the phone's clock is not the server's.
  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'La fecha del movimiento (%) todavía no llega: el dinero se registra cuando ya se movió.',
      to_char(new.occurred_at at time zone coalesce(v_timezone, 'America/Lima'), 'DD/MM/YYYY HH24:MI');
  end if;

  -- The composite foreign keys already keep both accounts in this workshop.
  select * into v_account from public.accounts a where a.id = new.account_id;
  if found and not v_account.active and new.type <> 'transfer' then
    raise exception 'La cuenta % está desactivada: ya no recibe ni paga nada. Si todavía tiene saldo, sácalo con una transferencia a otra cuenta.',
      v_account.name;
  end if;

  if new.counter_account_id is not null then
    select * into v_counter from public.accounts a where a.id = new.counter_account_id;
    if found and not v_counter.active then
      raise exception 'La cuenta % está desactivada: no puede recibir una transferencia. Si va a volver a usarse, reactívala en Cuentas.',
        v_counter.name;
    end if;
  end if;

  if new.category_id is not null then
    if new.type = 'transfer' then
      raise exception 'Una transferencia no lleva categoría: el dinero solo cambia de bolsillo.';
    end if;

    select * into v_category from public.transaction_categories c where c.id = new.category_id;
    if not found or v_category.workspace_id <> new.workspace_id then
      raise exception 'No encontramos esa categoría en este taller.';
    end if;
    if not v_category.active then
      raise exception 'La categoría «%» está desactivada: elige otra.', v_category.name;
    end if;

    if v_category.capital and new.type = 'income' and new.order_id is not null then
      raise exception '«%» es una categoría de capital, y el cobro de un pedido es una venta: elige una categoría de ventas, o deja la de por defecto.',
        v_category.name;
    elsif v_category.capital and new.type = 'income' then
      raise exception '«%» es una categoría de capital, y un ingreso no es un aporte del dueño: sumaría a la utilidad. Si es plata tuya que metes al taller, regístrala con el tipo «Aporte del dueño»; si es otra cosa, elige otra categoría.',
        v_category.name;
    elsif v_category.capital and new.type = 'expense' then
      raise exception '«%» es una categoría de capital, y un egreso no es un retiro del dueño: restaría de la utilidad. Si es plata del taller que sacas para ti, regístrala con el tipo «Retiro del dueño»; si es otra cosa, elige otra categoría.',
        v_category.name;
    elsif not v_category.capital and new.type in ('owner_contribution', 'owner_draw') then
      raise exception '«%» no es una categoría de capital: un aporte o un retiro del dueño no es un ingreso ni un gasto del taller. Déjalo sin categoría, o elige una de capital.',
        v_category.name;
    end if;
  end if;

  if new.order_id is not null then
    select * into v_order from public.orders o where o.id = new.order_id for update;
    if not found or v_order.workspace_id <> new.workspace_id then
      raise exception 'No encontramos ese pedido en este taller.';
    end if;

    v_paid := app.order_amount_paid(new.order_id);

    if new.type = 'income' then
      if v_order.purpose <> 'sale' then
        raise exception 'El pedido % no es una venta, así que no se cobra.', v_order.number;
      end if;
      if v_order.status = 'cancelled' then
        raise exception 'El pedido % está cancelado y no admite cobros.', v_order.number;
      end if;
      if v_paid + new.amount > v_order.total then
        raise exception
          'El cobro excede el saldo del pedido %: el total es S/ %, ya se cobró S/ %, queda pendiente S/ % y se intentó cobrar S/ %.',
          v_order.number,
          to_char(v_order.total, 'FM999999999990.00'),
          to_char(v_paid, 'FM999999999990.00'),
          to_char(v_order.total - v_paid, 'FM999999999990.00'),
          to_char(new.amount, 'FM999999999990.00');
      end if;
    elsif new.type = 'expense' and new.amount > v_paid then
      raise exception 'La devolución del pedido % (S/ %) pasa de lo que se le cobró (S/ %).',
        v_order.number, to_char(new.amount, 'FM999999999990.00'), to_char(v_paid, 'FM999999999990.00');
    end if;
  end if;

  if new.purchase_id is not null then
    perform 1 from public.purchases p
    where p.id = new.purchase_id and p.workspace_id = new.workspace_id
    for update;
    if not found then
      raise exception 'No encontramos esa compra en este taller.';
    end if;

    if new.type = 'expense' then
      select s.total, s.paid into v_total, v_paid
      from public.purchase_payment_status s
      where s.purchase_id = new.purchase_id;

      if coalesce(v_paid, 0) + new.amount > coalesce(v_total, 0) then
        raise exception
          'El pago excede lo que falta pagar de la compra: el total es S/ %, ya se pagó S/ %, queda S/ % y se intentó pagar S/ %.',
          to_char(coalesce(v_total, 0), 'FM999999999990.00'),
          to_char(coalesce(v_paid, 0), 'FM999999999990.00'),
          to_char(coalesce(v_total, 0) - coalesce(v_paid, 0), 'FM999999999990.00'),
          to_char(new.amount, 'FM999999999990.00');
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- After `transactions_default_category`, which fills the category in: the
-- triggers of one event run in the order of their names.
create trigger transactions_guard_entry
  before insert on public.transactions
  for each row execute function app.guard_ledger_entry();

-- ------------------------------------------------- written is written

create or replace function app.guard_ledger_change()
returns trigger
language plpgsql
as $$
declare
  c_voiding constant text[] := array['voided_at', 'void_reason', 'voided_by', 'updated_at', 'expected_direction'];
  v_order record;
  v_left numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  if (to_jsonb(new) - c_voiding) is distinct from (to_jsonb(old) - c_voiding) then
    raise exception 'Un movimiento de dinero registrado no se edita: anúlalo, con su motivo, y registra el correcto.';
  end if;

  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'Un movimiento anulado no se puede volver a activar: si hacía falta, registra uno nuevo.';
    end if;
    if new.voided_at is distinct from old.voided_at
       or new.void_reason is distinct from old.void_reason
       or new.voided_by is distinct from old.voided_by then
      raise exception 'Este movimiento ya estaba anulado (motivo: «%»).', old.void_reason;
    end if;
    return new;
  end if;

  if new.voided_at is null then
    if new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
      raise exception 'Un movimiento de dinero registrado no se edita: anúlalo, con su motivo, y registra el correcto.';
    end if;
    return new;
  end if;

  -- Voiding it, now.
  if not app.is_owner(new.workspace_id) then
    raise exception 'Solo el dueño del taller puede anular un movimiento de dinero.';
  end if;
  if length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Escribe el motivo de la anulación: queda en el registro.';
  end if;

  if new.type = 'income' and new.order_id is not null then
    select o.number, o.total, c.name as customer_name into v_order
    from public.orders o
    join public.customers c on c.id = o.customer_id and c.walk_in
    where o.id = new.order_id;

    if found then
      v_left := v_order.total - (app.order_amount_paid(new.order_id) - new.amount);
      if v_left > 0 then
        raise exception 'Este cobro es de %, una venta a «%», que se paga en el acto y nunca debe: anulado, el pedido quedaría debiendo S/ % a nombre de nadie. Si el dinero entró en otra cuenta, corrígelo con una transferencia entre cuentas.',
          v_order.number, v_order.customer_name, to_char(v_left, 'FM999999999990.00');
      end if;
    end if;
  end if;

  new.voided_at := now();
  new.void_reason := btrim(new.void_reason);
  new.voided_by := auth.uid();
  return new;
end;
$$;

create trigger transactions_only_voiding
  before update on public.transactions
  for each row execute function app.guard_ledger_change();

create or replace function app.ledger_is_never_deleted()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    raise exception 'Un movimiento de dinero no se borra: se anula, con su motivo, y queda en el registro.';
  end if;
  return old;
end;
$$;

create trigger transactions_never_deleted
  before delete on public.transactions
  for each row execute function app.ledger_is_never_deleted();

-- ------------------------------------------------------------- voiding

/*
 * Voids a movement: it leaves every balance and every report and stays on the
 * record with its reason. For the owner only (the owner's decision of
 * 2026-10-08). Runs as its definer because the policies may leave no update
 * open on the table at all; it checks who is calling itself, and the trigger
 * above checks the rest again.
 *
 * It answers in words when it cannot: a second tab voiding the same row used
 * to read «Movimiento anulado» while its reason was thrown away.
 */
create or replace function app.void_transaction(p_id uuid, p_reason text)
returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
begin
  select * into v_transaction from public.transactions t where t.id = p_id for update;
  if not found or not app.is_member(v_transaction.workspace_id) then
    raise exception 'No encontramos ese movimiento.';
  end if;
  if not app.is_owner(v_transaction.workspace_id) then
    raise exception 'Solo el dueño del taller puede anular un movimiento de dinero.';
  end if;
  if v_transaction.voided_at is not null then
    raise exception 'Este movimiento ya estaba anulado (motivo: «%»).', v_transaction.void_reason;
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribe el motivo de la anulación: queda en el registro.';
  end if;

  update public.transactions t
  set voided_at = now(),
      void_reason = btrim(p_reason),
      voided_by = auth.uid()
  where t.id = p_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function app.void_transaction(uuid, text) from public, anon;
grant execute on function app.void_transaction(uuid, text) to authenticated;

-- The browser only reaches the public schema (see 20260930030000).
create or replace function public.void_transaction(p_id uuid, p_reason text)
returns public.transactions
language sql
volatile
as $$
  select app.void_transaction(p_id, p_reason);
$$;

revoke execute on function public.void_transaction(uuid, text) from public, anon;
grant execute on function public.void_transaction(uuid, text) to authenticated;

-- ------------------------------------------------------ opening balance

/*
 * The opening balance is what was already in the account the day it was
 * registered, so its day cannot be after today in the workshop. A date at
 * the end of the year left every real movement until then out of the
 * balance (T5-02). Only what changes is judged: an account that somehow has
 * one already is not locked by it, and editing its note still works.
 */
create or replace function app.guard_account_opening()
returns trigger
language plpgsql
as $$
declare
  v_today date;
  v_limit numeric := app.ledger_amount_limit();
begin
  if tg_op = 'INSERT' or new.opening_balance_on is distinct from old.opening_balance_on then
    v_today := coalesce(app.workspace_day(new.workspace_id, now()), (now() at time zone 'America/Lima')::date);
    if new.opening_balance_on > v_today then
      raise exception 'La fecha del saldo de apertura (%) todavía no llega: es lo que había en la cuenta el día que la registras, así que no puede ser posterior a hoy (%).',
        to_char(new.opening_balance_on, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY');
    end if;
  end if;

  if (tg_op = 'INSERT' or new.opening_balance is distinct from old.opening_balance)
     and (new.opening_balance = 'NaN'::numeric or abs(new.opening_balance) > v_limit) then
    raise exception 'El saldo de apertura (S/ %) pasa del máximo, S/ %: revisa que esté bien escrito.',
      to_char(new.opening_balance, 'FM999999999990.00'), to_char(v_limit, 'FM999999999990.00');
  end if;

  return new;
end;
$$;

create trigger accounts_guard_opening
  before insert or update of opening_balance, opening_balance_on on public.accounts
  for each row execute function app.guard_account_opening();

-- Accounts that already open in the future are only listed: moving their date
-- would move their balance, and that is the owner's to decide.
do $$
declare
  v_future text;
begin
  select string_agg(format('%s (%s)', a.name, a.opening_balance_on), ', ' order by a.name) into v_future
  from public.accounts a
  join public.workspaces w on w.id = a.workspace_id
  where a.opening_balance_on > (now() at time zone w.timezone)::date;

  if v_future is not null then
    raise notice 'Cuentas con fecha de apertura futura (corregirlas en Cuentas): %', v_future;
  end if;
end;
$$;
