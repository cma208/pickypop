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
-- * Which names are of capital is said once, in `app.category_name_is_capital`:
--     - an income category whose name speaks of a contribution or of capital
--       («Aporte del dueño», «Aportes de socios», «Inyección de capital»,
--       «Capital social»), unless it is a sale («Venta de bienes de
--       capital»);
--     - an expense category that speaks of the owners' draw or of giving
--       their capital back («Retiro del dueño», «Retiros de socios»,
--       «Retiro de capital», «Devolución de capital», «Dividendos»).
--   Capital alone is not enough for an expense: «Bienes de capital» is
--   equipment, an expense of the workshop. A plain «Retiro» is left alone
--   too: in a workshop it may as well be picking up a parcel.
-- * Marked here, without losing anything:
--     - a category already used by live contributions or draws and by no live
--       income or expense: that is what it holds, and marking it changes
--       nothing that was written;
--     - a category whose name is of capital. If it also has live incomes or
--       expenses, those are the mistake T5-06 is about: they stay as they are
--       and are listed, for the owner to void and register again as a
--       contribution or a draw.
--   Never a category of sales, nor the one a workshop chose for its
--   collections or its purchase payments. A movement already written under a
--   category marked here is not touched: it can still be voided.
-- * A category created later, or renamed, is marked the same way, by its
--   name (`transaction_categories_capital_by_name`), until Configuración has
--   a box for it. A rename only adds the mark, never takes it off: the mark
--   may have come from what the category held, not from its name. That is
--   the base area's screen: until then, a category of capital cannot be
--   marked by hand, nor a wrong mark taken off.
-- * A category of capital is never one of sales: marking it so is refused in
--   words, before the check below answers with its name.

alter table public.transaction_categories
  add column capital boolean not null default false,
  add constraint transaction_categories_capital_is_not_sales check (not (capital and sales));

comment on column public.transaction_categories.capital is
  'Es una categoría de capital: solo la usan los aportes y los retiros del dueño, y ellos solo usan categorías de capital (o ninguna). Un ingreso, un egreso o el cobro de un pedido no puede usarla. Una categoría de ventas no puede serlo.';

/*
 * Whether a category's name says it is one of capital. Accents and capitals
 * do not count. Said here once: the migration below marks the categories
 * that exist with it, and the trigger after it marks the ones created later.
 */
create or replace function app.category_name_is_capital(p_direction public.transaction_direction, p_name text)
returns boolean
language sql
immutable
as $$
  with named as (
    select translate(lower(btrim(coalesce(p_name, ''))), 'áéíóúüñ', 'aeiouun') as plain
  ),
  owners as (
    select plain, plain ~ '\m(duen[oa]s?|soci[oa]s?|propietari[oa]s?|accionistas?)\M' as of_owner
    from named
  )
  select case p_direction
    when 'income' then
      plain ~ '\m(aportes?|capital)\M' and plain !~ '\mventas?\M'
    when 'expense' then
      (plain ~ '\m(retiros?|capital)\M' and of_owner)
      or plain ~ '\m(retiros?|devolucion(es)?) de (capital|utilidades)\M'
      or plain ~ '\mdividendos?\M'
    else false
  end
  from owners;
$$;

do $$
declare
  v_marked text;
  v_review text;
begin
  with chosen as (
    select s.order_payment_category_id as id from public.workshop_settings s
    where s.order_payment_category_id is not null
    union
    select s.purchase_payment_category_id from public.workshop_settings s
    where s.purchase_payment_category_id is not null
  ),
  usage as (
    select
      c.id,
      exists (
        select 1 from public.transactions t
        where t.category_id = c.id
          and t.voided_at is null
          and t.type in ('owner_contribution', 'owner_draw')
      ) as as_capital,
      exists (
        select 1 from public.transactions t
        where t.category_id = c.id
          and t.voided_at is null
          and t.type in ('income', 'expense')
      ) as as_profit
    from public.transaction_categories c
  ),
  marked as (
    update public.transaction_categories c
    set capital = true
    from usage u
    where u.id = c.id
      and not c.sales
      and not exists (select 1 from chosen where chosen.id = c.id)
      and (
        (u.as_capital and not u.as_profit)
        or app.category_name_is_capital(c.direction, c.name)
      )
    returning c.name, u.as_profit
  )
  select
    string_agg(format('«%s»', name), ', ' order by name),
    string_agg(format('«%s»', name), ', ' order by name) filter (where as_profit)
  into v_marked, v_review
  from marked;

  if v_marked is not null then
    raise notice 'Categorías marcadas como de capital: %', v_marked;
  end if;
  if v_review is not null then
    raise notice 'Tienen ingresos o egresos vivos que quizá eran aportes o retiros (revisarlos en Caja y anularlos si hace falta): %', v_review;
  end if;
end;
$$;

/*
 * A category created after this migration, or renamed, is marked by its name
 * too, so a «Retiro de socios» made in Configuración, or «Otros ingresos»
 * renamed «Aporte de socios», is not offered to Caja's income or expense,
 * where it would move the owner's money through the profit (T5-06). A rename
 * only adds the mark: one that came from what the category held stays, and
 * once Configuración can mark a category by hand, a mark taken off there is
 * not put back by the same name.
 *
 * Capital and sales together is refused here, in words, for any write: the
 * check on the table would answer with a constraint name nobody can read.
 */
create or replace function app.mark_capital_by_name()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    if not new.sales and not new.capital and app.category_name_is_capital(new.direction, new.name) then
      new.capital := true;
    end if;
  end if;

  if new.sales and new.capital then
    raise exception '«%» es una categoría de capital, de los aportes y retiros del dueño, y una de ventas no puede serlo: un cobro no es un aporte. Si necesitas otra categoría de ventas, créala aparte.',
      new.name;
  end if;
  return new;
end;
$$;

create trigger transaction_categories_capital_by_name
  before insert or update of name, sales, capital on public.transaction_categories
  for each row execute function app.mark_capital_by_name();
