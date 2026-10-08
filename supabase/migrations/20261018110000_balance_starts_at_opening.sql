-- A movement dated before an account's opening balance does not change it (E5-02).
--
-- The opening balance is "what was already in the account the day it was
-- registered here". A movement dated before that day is already inside it:
-- an expense of 30 September registered late against a cash box opened on
-- 7 October with S/ 500 took those S/ 4 off a second time. The date of the
-- opening balance was asked for, required, and never used.
--
-- The owner's decision: such a movement is allowed, and it still counts in
-- the income statement of its month (that view reads `transactions` and is
-- not touched here), but it does not change that account's balance.
--   * The day is the movement's day in the workshop's time zone, compared
--     with `opening_balance_on`. A movement on the opening day itself counts.
--   * A transfer is judged leg by leg, each against its own account: money
--     that left Yape before Yape was opened may still have reached a cash box
--     that was already open.
--
-- `transaction_entries` says it of every leg (`before_opening`), so the book
-- can say it too, and `account_balances` leaves those legs out of the inflow,
-- the outflow and the balance. They are still counted apart, so the accounts
-- screen can explain why a movement it lists did not move the balance.
-- Both views only gain columns at the end: `create or replace view` keeps the
-- existing ones as they are.

create or replace view public.transaction_entries with (security_invoker = true) as
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
  t.note,
  (t.occurred_at at time zone w.timezone)::date < a.opening_balance_on as before_opening
from public.transactions t
join public.accounts a on a.id = t.account_id
join public.workspaces w on w.id = t.workspace_id
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
  t.note,
  (t.occurred_at at time zone w.timezone)::date < a.opening_balance_on
from public.transactions t
join public.accounts a on a.id = t.counter_account_id
join public.workspaces w on w.id = t.workspace_id
where t.voided_at is null
  and t.counter_account_id is not null;

comment on view public.transaction_entries is
  'The ledger seen account by account. A transfer appears twice: once leaving, once arriving. before_opening marks a leg dated before its account''s opening balance: it is already inside that balance.';

create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.workspace_id,
  a.name,
  a.kind,
  a.active,
  a.opening_balance,
  coalesce(sum(e.signed_amount) filter (where e.signed_amount > 0 and not e.before_opening), 0) as total_in,
  coalesce(-sum(e.signed_amount) filter (where e.signed_amount < 0 and not e.before_opening), 0) as total_out,
  a.opening_balance + coalesce(sum(e.signed_amount) filter (where not e.before_opening), 0) as balance,
  count(e.transaction_id) as movements,
  max(e.occurred_at) as last_movement_at,
  count(e.transaction_id) filter (where e.before_opening) as movements_before_opening,
  coalesce(sum(e.signed_amount) filter (where e.before_opening), 0) as net_before_opening
from public.accounts a
left join public.transaction_entries e on e.account_id = a.id
group by a.id;

comment on view public.account_balances is
  'Opening balance plus every movement from its date on. There is no stored balance to go stale. A movement dated before the opening balance is already inside it: it is counted apart (movements_before_opening, net_before_opening) and moves nothing.';

-- The day of the opening balance now decides what counts, so it has to be the
-- workshop's day. `current_date` is the server's, in UTC: an account created
-- after 19:00 in Lima opened "tomorrow", and that evening's movements would
-- have been left out of its balance.
alter table public.accounts
  alter column opening_balance_on set default ((now() at time zone 'America/Lima')::date);

-- Accounts that already took that UTC default get the day they were really
-- created. Only a date equal to the UTC day of creation and later than the
-- workshop's day is touched: nobody types tomorrow by hand.
update public.accounts a
   set opening_balance_on = (a.created_at at time zone w.timezone)::date
  from public.workspaces w
 where w.id = a.workspace_id
   and a.opening_balance_on = (a.created_at at time zone 'UTC')::date
   and (a.created_at at time zone w.timezone)::date < a.opening_balance_on;
