-- A category of capital is for the owner's contributions and draws, and only for them (T5-06).
--
-- «Ingreso» in Caja offered «Aporte del dueño», and an income filed there
-- added S/ 100 to the month's profit: Resultados classifies by the type of the
-- movement, not by its category, so capital typed as an income is income. The
-- collection of an order offered it too. The same happens the other way round
-- with an expense filed under «Retiro del dueño». The owner's decision (3c):
-- the loose income does not offer the categories of capital, as it already
-- does not offer the ones of sales, and neither does the collection of an
-- order. The rule lives in the database.
--
-- * `transaction_categories.capital` says a category is one of capital. A
--   category of sales cannot be one: a sale is not capital.
-- * Only a contribution or a draw of the owner may be filed under one, and they
--   may only be filed under one (or under none: the type already says what
--   they are). The guard is in 20261022110000_ledger_guards.sql, with the other
--   rules every new movement has to meet.
-- * Marked here, without losing anything:
--     - a category already used by live contributions or draws and by no live
--       income or expense: that is what it holds, and marking it changes
--       nothing that was written;
--     - an income category whose name speaks of a contribution or of capital
--       («Aporte del dueño», «Aportes», «Capital»), and an expense category
--       that speaks of capital or of the owners' draw («Retiro del dueño»,
--       «Retiros de socios»). A plain «Retiro» is left alone: in a workshop it
--       may as well be picking up a parcel.
--   Never a category of sales, nor the one a workshop chose for its
--   collections or its purchase payments. A movement already written under a
--   category marked here is not touched: it can still be voided.
-- * The owner marks the others in Configuración › Categorías de dinero.

alter table public.transaction_categories
  add column capital boolean not null default false,
  add constraint transaction_categories_capital_is_not_sales check (not (capital and sales));

comment on column public.transaction_categories.capital is
  'Es una categoría de capital: solo la usan los aportes y los retiros del dueño, y ellos solo usan categorías de capital (o ninguna). Un ingreso, un egreso o el cobro de un pedido no puede usarla. Una categoría de ventas no puede serlo.';

do $$
declare
  v_marked text;
begin
  with chosen as (
    select s.order_payment_category_id as id from public.workshop_settings s
    where s.order_payment_category_id is not null
    union
    select s.purchase_payment_category_id from public.workshop_settings s
    where s.purchase_payment_category_id is not null
  ),
  named as (
    select c.id, translate(lower(c.name), 'áéíóúüñ', 'aeiouun') as plain, c.direction
    from public.transaction_categories c
  ),
  marked as (
    update public.transaction_categories c
    set capital = true
    from named n
    where n.id = c.id
      and not c.sales
      and not exists (select 1 from chosen where chosen.id = c.id)
      and (
        (
          exists (
            select 1 from public.transactions t
            where t.category_id = c.id
              and t.voided_at is null
              and t.type in ('owner_contribution', 'owner_draw')
          )
          and not exists (
            select 1 from public.transactions t
            where t.category_id = c.id
              and t.voided_at is null
              and t.type in ('income', 'expense')
          )
        )
        or n.plain ~ '\mcapital\M'
        or (n.direction = 'income' and n.plain ~ '\maportes?\M')
        or (n.direction = 'expense' and n.plain ~ '\mretiros?\M' and n.plain ~ '\m(duenos?|socios?)\M')
      )
    returning c.name
  )
  select string_agg(format('«%s»', name), ', ' order by name) into v_marked from marked;

  if v_marked is not null then
    raise notice 'Categorías marcadas como de capital: %', v_marked;
  end if;
end;
$$;
