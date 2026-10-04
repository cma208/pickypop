-- Finance: accounts, money movements, balances and collecting an order.
--
-- The workshop already knew what it produced and what it spent in materials,
-- but not where the money was. This is the missing half.
--
-- Three ideas hold it together:
--   1. A balance is never stored. An account is worth its opening balance plus
--      every movement that touched it, exactly as stock is the sum of its
--      movements (ADR-006).
--   2. A transfer is one row, not two. It names the account the money leaves
--      and the account it lands in, so the two halves can never drift apart,
--      and the income statement ignores it: moving money is not earning it.
--   3. Nothing financial is deleted. A mistake is voided (voided_at), which
--      takes it out of every balance while leaving the trail intact.
--
-- Out of scope on purpose: boletas, facturas and anything SUNAT. The workshop
-- has no RUC yet (ADR-008).

create type public.account_kind as enum ('cash', 'bank', 'wallet');
create type public.payment_method as enum ('cash', 'yape', 'plin', 'transfer');
create type public.transaction_direction as enum ('income', 'expense');
create type public.transaction_type as enum (
  'income', 'expense', 'transfer', 'owner_contribution', 'owner_draw'
);
create type public.order_payment_status as enum ('not_applicable', 'unpaid', 'partial', 'paid');

-- ------------------------------------------------------------------ accounts

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  kind public.account_kind not null default 'cash',
  -- What was already in the account the day it was registered here. It is the
  -- starting point of the ledger, not a balance that anyone keeps up to date.
  opening_balance numeric(12, 2) not null default 0,
  opening_balance_on date not null default current_date,
  -- Yape is always yaped and the cash box is always cash, so the collection
  -- form can fill the method in by itself.
  default_payment_method public.payment_method,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, name),
  -- Lets a movement prove, declaratively, that it is not touching another
  -- workshop's money.
  constraint accounts_id_workspace_key unique (id, workspace_id)
);

comment on table public.accounts is
  'Where the money sits: cash box, bank, Yape, Plin. The balance is a view.';

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  direction public.transaction_direction not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, direction, name),
  -- Referenced below so an expense can never be filed under an income
  -- category, and the other way round.
  constraint transaction_categories_id_direction_key unique (id, direction)
);

-- -------------------------------------------------------------- movements

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The account the movement is seen from: money comes in here, goes out from
  -- here, or leaves here on its way to counter_account_id.
  account_id uuid not null references public.accounts (id) on delete restrict,
  counter_account_id uuid references public.accounts (id) on delete restrict,
  type public.transaction_type not null,
  category_id uuid references public.transaction_categories (id) on delete restrict,
  -- Always positive. Which way it moves is the type's job, so no one can
  -- record a negative income and quietly break a report.
  amount numeric(12, 2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  payment_method public.payment_method not null,
  order_id uuid references public.orders (id) on delete restrict,
  purchase_id uuid references public.purchases (id) on delete restrict,
  maintenance_log_id uuid references public.maintenance_logs (id) on delete restrict,
  counterparty text,
  reference text,                    -- Yape operation code, bank reference...
  note text,
  -- Money is never deleted, only annulled. A voided row disappears from every
  -- balance and every report, and stays on the record.
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- The direction this type implies. Null for a transfer, which is neither.
  expected_direction public.transaction_direction generated always as (
    case type
      when 'income' then 'income'::public.transaction_direction
      when 'owner_contribution' then 'income'::public.transaction_direction
      when 'expense' then 'expense'::public.transaction_direction
      when 'owner_draw' then 'expense'::public.transaction_direction
    end
  ) stored,
  foreign key (account_id, workspace_id)
    references public.accounts (id, workspace_id),
  foreign key (counter_account_id, workspace_id)
    references public.accounts (id, workspace_id),
  foreign key (category_id, expected_direction)
    references public.transaction_categories (id, direction),
  constraint transactions_transfer_needs_counter_account check (
    (type = 'transfer') = (counter_account_id is not null)
  ),
  constraint transactions_transfer_needs_two_accounts check (
    counter_account_id is null or counter_account_id <> account_id
  ),
  -- A transfer is the workshop's money changing pocket; it settles nothing.
  constraint transactions_transfer_settles_nothing check (
    type <> 'transfer' or num_nonnulls(order_id, purchase_id, maintenance_log_id) = 0
  ),
  constraint transactions_void_needs_reason check (
    voided_at is null or length(btrim(coalesce(void_reason, ''))) > 0
  )
);

comment on table public.transactions is
  'Every movement of money. A transfer is a single row with two accounts, so the two halves cannot drift apart.';

comment on column public.transactions.counter_account_id is
  'Where a transfer lands. The amount leaves account_id and arrives here, counted once on each side.';

create index transactions_workspace_date_idx
  on public.transactions (workspace_id, occurred_at desc);
create index transactions_account_idx on public.transactions (account_id, occurred_at);
create index transactions_counter_account_idx
  on public.transactions (counter_account_id, occurred_at)
  where counter_account_id is not null;
create index transactions_order_idx on public.transactions (order_id) where order_id is not null;
create index transactions_purchase_idx on public.transactions (purchase_id) where purchase_id is not null;
create index transactions_maintenance_idx
  on public.transactions (maintenance_log_id) where maintenance_log_id is not null;

-- ------------------------------------------------- how much an order is paid

-- Income linked to the order, minus anything refunded on it. Voided rows and
-- transfers never count.
create or replace function app.order_amount_paid(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case t.type when 'income' then t.amount else -t.amount end
  ), 0)
  from public.transactions t
  where t.order_id = p_order_id
    and t.voided_at is null
    and t.type in ('income', 'expense');
$$;

create or replace function app.payment_status_for(
  p_purpose public.order_purpose,
  p_total numeric,
  p_paid numeric
)
returns public.order_payment_status
language sql
immutable
as $$
  select case
    -- A gift or something for the workshop itself is never collected.
    when p_purpose <> 'sale' then 'not_applicable'::public.order_payment_status
    when p_total > 0 and p_paid >= p_total then 'paid'::public.order_payment_status
    when p_paid > 0 then 'partial'::public.order_payment_status
    else 'unpaid'::public.order_payment_status
  end;
$$;

grant execute on function app.order_amount_paid(uuid) to authenticated;
grant execute on function app.payment_status_for(public.order_purpose, numeric, numeric) to authenticated;

/*
 * The order carries a payment status so the orders list can be filtered
 * without summing the ledger for every row. It is a projection, never a hand
 * written value: the two triggers below recompute it from the movements, and
 * the real figures live in public.order_payment_summary.
 */
alter table public.orders
  add column payment_status public.order_payment_status not null default 'unpaid';

comment on column public.orders.payment_status is
  'Derived from the transactions linked to the order. Writing it by hand has no effect.';

create or replace function app.set_order_payment_status()
returns trigger
language plpgsql
as $$
begin
  new.payment_status := app.payment_status_for(
    new.purpose, new.total, app.order_amount_paid(new.id)
  );
  return new;
end;
$$;

create trigger orders_set_payment_status
before insert or update on public.orders
for each row execute function app.set_order_payment_status();

create or replace function app.refresh_payment_status_of(p_order_id uuid)
returns void
language sql
as $$
  update public.orders o
     set payment_status = app.payment_status_for(
           o.purpose, o.total, app.order_amount_paid(o.id)
         )
   where o.id = p_order_id;
$$;

-- Recording, voiding or correcting a payment has to move the order with it.
create or replace function app.refresh_order_payment_status()
returns trigger
language plpgsql
as $$
begin
  -- Both sides are refreshed: a payment moved from one order to another
  -- leaves two orders to put right.
  if tg_op <> 'INSERT' then
    if old.order_id is not null then
      perform app.refresh_payment_status_of(old.order_id);
    end if;
  end if;

  if tg_op <> 'DELETE' then
    if new.order_id is not null then
      perform app.refresh_payment_status_of(new.order_id);
    end if;
  end if;

  return null;
end;
$$;

create trigger transactions_refresh_order_payment_status
after insert or update or delete on public.transactions
for each row execute function app.refresh_order_payment_status();

-- Orders that already existed get their real status: the trigger above turns
-- this no-op write into a recalculation.
update public.orders set payment_status = payment_status;

-- ------------------------------------------------------------------- views

/*
 * One row per account a movement touches. An income, an expense or an owner
 * movement produces one leg; a transfer produces two, one negative and one
 * positive, out of the same row. This is what makes a transfer balance to zero
 * across the workshop and still show up in both account statements.
 */
create view public.transaction_entries with (security_invoker = true) as
select
  t.id as transaction_id,
  t.workspace_id,
  t.account_id,
  false as is_counter_leg,
  t.occurred_at,
  t.type,
  t.category_id,
  t.payment_method,
  case
    when t.type in ('income', 'owner_contribution') then t.amount
    else -t.amount
  end as signed_amount,
  t.order_id,
  t.purchase_id,
  t.maintenance_log_id,
  t.counterparty,
  t.note
from public.transactions t
where t.voided_at is null
union all
select
  t.id,
  t.workspace_id,
  t.counter_account_id,
  true,
  t.occurred_at,
  t.type,
  t.category_id,
  t.payment_method,
  t.amount,
  t.order_id,
  t.purchase_id,
  t.maintenance_log_id,
  t.counterparty,
  t.note
from public.transactions t
where t.voided_at is null
  and t.counter_account_id is not null;

comment on view public.transaction_entries is
  'The ledger seen account by account. A transfer appears twice: once leaving, once arriving.';

create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.workspace_id,
  a.name,
  a.kind,
  a.active,
  a.opening_balance,
  coalesce(sum(e.signed_amount) filter (where e.signed_amount > 0), 0) as total_in,
  coalesce(-sum(e.signed_amount) filter (where e.signed_amount < 0), 0) as total_out,
  a.opening_balance + coalesce(sum(e.signed_amount), 0) as balance,
  count(e.transaction_id) as movements,
  max(e.occurred_at) as last_movement_at
from public.accounts a
left join public.transaction_entries e on e.account_id = a.id
group by a.id;

comment on view public.account_balances is
  'Opening balance plus every movement. There is no stored balance to go stale.';

-- What each sale order is worth, what has been collected on it and what is
-- still owed. The orders screen and the receivables report both read this.
create view public.order_payment_summary with (security_invoker = true) as
select
  o.id as order_id,
  o.workspace_id,
  o.number,
  o.customer_id,
  o.channel_id,
  o.status,
  o.payment_status,
  o.ordered_on,
  o.due_date,
  o.total,
  coalesce(p.paid, 0) as paid,
  o.total - coalesce(p.paid, 0) as balance,
  p.last_payment_at
from public.orders o
left join lateral (
  select
    sum(case t.type when 'income' then t.amount else -t.amount end) as paid,
    max(t.occurred_at) filter (where t.type = 'income') as last_payment_at
  from public.transactions t
  where t.order_id = o.id
    and t.voided_at is null
    and t.type in ('income', 'expense')
) as p on true
where o.purpose = 'sale';

create view public.receivables with (security_invoker = true) as
select
  s.order_id,
  s.workspace_id,
  s.number,
  s.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  s.status,
  s.payment_status,
  s.ordered_on,
  s.due_date,
  s.total,
  s.paid,
  s.balance,
  s.last_payment_at,
  case
    when s.due_date is not null and s.due_date < current_date
      then current_date - s.due_date
    else 0
  end as days_overdue
from public.order_payment_summary s
left join public.customers c on c.id = s.customer_id
-- The goods are already with the customer and the money is not here yet.
where s.status in ('delivered', 'closed')
  and s.balance > 0;

comment on view public.receivables is
  'Delivered orders still owing money, with how late they are.';

/*
 * Ventas − costo de ventas − gastos = utilidad, month by month.
 *
 * This is the profitability view, not the cash flow one, and the two must not
 * be mixed (docs/02-dominio.md §2.9). A sale counts in the month it was
 * ordered, whether or not it has been collected; filament counts when a print
 * consumed it, not when the spool was paid for. That is why expenses tied to a
 * purchase are reported apart: their cost already reaches the result through
 * the cost of sales, and adding them again would count them twice.
 *
 * Owner contributions and draws are capital, never profit, so they are listed
 * for reference and left out of the bottom line.
 */
create view public.monthly_income_statement with (security_invoker = true) as
with order_costs as (
  select
    o.workspace_id,
    date_trunc('month', o.ordered_on::timestamp)::date as month,
    o.total,
    -- A failed print on a customer's order is a cost of that order too.
    coalesce((
      select sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0))
      from public.print_jobs j
      join public.order_lines l on l.id = j.order_line_id
      where l.order_id = o.id
        and j.status in ('success', 'failed')
    ), 0) as real_cost,
    coalesce((
      select sum(l.estimated_unit_cost * l.quantity)
      from public.order_lines l
      where l.order_id = o.id
    ), 0) as estimated_cost
  from public.orders o
  where o.purpose = 'sale'
    and o.status <> 'cancelled'
),
sales as (
  select
    workspace_id,
    month,
    sum(total) as sales,
    -- What it really cost, falling back to the estimate while nothing has been
    -- printed yet, so a fresh month is not reported as pure profit.
    sum(case when real_cost > 0 then real_cost else estimated_cost end) as cost_of_sales
  from order_costs
  group by workspace_id, month
),
money as (
  select
    t.workspace_id,
    date_trunc('month', t.occurred_at)::date as month,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is null), 0)
      as operating_expenses,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is not null), 0)
      as inventory_purchases,
    coalesce(sum(t.amount) filter (where t.type = 'owner_contribution'), 0) as owner_contributions,
    coalesce(sum(t.amount) filter (where t.type = 'owner_draw'), 0) as owner_draws,
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.order_id is null), 0)
      as other_income
  from public.transactions t
  where t.voided_at is null
  group by t.workspace_id, date_trunc('month', t.occurred_at)::date
)
select
  coalesce(s.workspace_id, m.workspace_id) as workspace_id,
  coalesce(s.month, m.month) as month,
  coalesce(s.sales, 0) as sales,
  coalesce(s.cost_of_sales, 0) as cost_of_sales,
  coalesce(s.sales, 0) - coalesce(s.cost_of_sales, 0) as gross_profit,
  coalesce(m.operating_expenses, 0) as operating_expenses,
  coalesce(s.sales, 0) - coalesce(s.cost_of_sales, 0) - coalesce(m.operating_expenses, 0)
    as net_profit,
  coalesce(m.other_income, 0) as other_income,
  coalesce(m.inventory_purchases, 0) as inventory_purchases,
  coalesce(m.owner_contributions, 0) as owner_contributions,
  coalesce(m.owner_draws, 0) as owner_draws
from sales s
full join money m on m.workspace_id = s.workspace_id and m.month = s.month;

comment on view public.monthly_income_statement is
  'Profitability by month. Inventory purchases are shown apart: they reach the result as cost of sales.';

-- ------------------------------------------------------- collecting an order

/*
 * Records money received against an order, in one transaction, and leaves the
 * order's payment status in step with it.
 *
 * The order row is locked first, so two people collecting the same order at
 * the same time cannot both pass the overpayment check. Runs as the caller, so
 * the usual access rules apply.
 */
create or replace function app.record_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_category_id uuid default null,
  p_reference text default null,
  p_note text default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_order public.orders;
  v_account public.accounts;
  v_amount numeric(12, 2);
  v_paid numeric;
  v_method public.payment_method;
  v_transaction public.transactions;
begin
  -- Rounded up front: the check has to judge the amount that will be stored.
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'No existe el pedido solicitado.';
  end if;
  if v_order.purpose <> 'sale' then
    raise exception 'El pedido % no es una venta, así que no se cobra.', v_order.number;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido % está cancelado y no admite cobros.', v_order.number;
  end if;

  select * into v_account from public.accounts where id = p_account_id;
  if not found then
    raise exception 'No existe la cuenta indicada para el cobro.';
  end if;
  if v_account.workspace_id <> v_order.workspace_id then
    raise exception 'La cuenta % pertenece a otro taller.', v_account.name;
  end if;
  if not v_account.active then
    raise exception 'La cuenta % está desactivada.', v_account.name;
  end if;

  v_method := coalesce(p_payment_method, v_account.default_payment_method);
  if v_method is null then
    raise exception 'Falta el medio de pago: la cuenta % no tiene uno por defecto.', v_account.name;
  end if;

  v_paid := app.order_amount_paid(p_order_id);
  if v_paid + v_amount > v_order.total then
    raise exception
      'El cobro excede el saldo del pedido %: el total es S/ %, ya se cobró S/ %, queda pendiente S/ % y se intentó cobrar S/ %.',
      v_order.number,
      to_char(v_order.total, 'FM999999990.00'),
      to_char(v_paid, 'FM999999990.00'),
      to_char(v_order.total - v_paid, 'FM999999990.00'),
      to_char(v_amount, 'FM999999990.00');
  end if;

  insert into public.transactions (
    workspace_id, account_id, type, category_id, amount, occurred_at,
    payment_method, order_id, counterparty, reference, note
  )
  values (
    v_order.workspace_id,
    p_account_id,
    'income',
    p_category_id,
    v_amount,
    coalesce(p_occurred_at, now()),
    v_method,
    p_order_id,
    (select c.name from public.customers c where c.id = v_order.customer_id),
    p_reference,
    coalesce(p_note, format('Cobro del pedido %s', v_order.number))
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

grant execute on function app.record_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text
) to authenticated;

-- The browser only reaches the "public" schema (see 20260930030000).
create or replace function public.record_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_category_id uuid default null,
  p_reference text default null,
  p_note text default null
)
returns public.transactions
language sql
volatile
as $$
  select app.record_payment(
    p_order_id, p_account_id, p_amount, p_payment_method,
    p_occurred_at, p_category_id, p_reference, p_note
  );
$$;

grant execute on function public.record_payment(
  uuid, uuid, numeric, public.payment_method, timestamptz, uuid, text, text
) to authenticated;

-- ------------------------------------------------------------ access rules

select app.apply_workspace_rls('accounts');
select app.apply_workspace_rls('transaction_categories');
select app.apply_workspace_rls('transactions');

select app.add_updated_at_trigger('accounts');
select app.add_updated_at_trigger('transaction_categories');
select app.add_updated_at_trigger('transactions');
