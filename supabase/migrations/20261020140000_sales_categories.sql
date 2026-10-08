-- A loose income does not go under a category of sales (the owner's decision).
--
-- «Ingreso» in Caja is for money that is neither a sale, nor the collection of
-- an order, nor capital: a refund, a supplier giving money back (ADR-024). It
-- still offered «Venta de productos», «Trabajos por encargo» and the category
-- collections are filed under, and only warned. A sale typed there never left
-- the shelf nor carried its cost, and a collection typed there counts twice.
--
-- * `transaction_categories.sales` says a category is one of sales. Only an
--   income category can be. The owner marks it in Configuración › Categorías
--   de dinero.
-- * It is set here on the categories that are: the one collections of orders
--   are filed under (`app.default_category`, the owner's choice or the only
--   one there is), and the two that bootstrap.sql creates for sales. Not by
--   guessing at other names: those are the owner's to mark.
-- * The category collections are filed under is one of sales by definition.
--   Choosing it marks it, and it cannot be unmarked while it is chosen.
-- * The rule lives here, not in the screen: an income with no order cannot
--   be written, or moved, under a category of sales. Collections of orders and
--   the quick sale (an income with its order) keep using them. A movement
--   written before this rule is not touched until someone changes its type,
--   its category or its order: voiding it stays possible.

alter table public.transaction_categories
  add column sales boolean not null default false,
  add constraint transaction_categories_sales_are_income check (not sales or direction = 'income');

comment on column public.transaction_categories.sales is
  'Es una categoría de ventas: la usan los cobros de pedidos y la venta rápida, y un ingreso suelto (sin pedido) no puede usarla. Solo una categoría de ingreso puede serlo.';

update public.transaction_categories c
set sales = true
where c.direction = 'income'
  and (
    c.name in ('Venta de productos', 'Trabajos por encargo')
    or c.id = app.default_category(c.workspace_id, 'income')
  );

-- ------------------------------------------- the category of collections

/*
 * Choosing the category collections are filed under makes it one of sales:
 * that is what it holds. Marked here and not refused, so choosing it in
 * Configuración is one step.
 */
create or replace function app.order_payment_category_is_sales()
returns trigger
language plpgsql
as $$
begin
  if new.order_payment_category_id is not null then
    update public.transaction_categories
    set sales = true
    where id = new.order_payment_category_id
      and not sales;
  end if;
  return new;
end;
$$;

create trigger workshop_settings_order_payment_category_is_sales
  after insert or update of order_payment_category_id on public.workshop_settings
  for each row execute function app.order_payment_category_is_sales();

create or replace function app.guard_sales_category()
returns trigger
language plpgsql
as $$
begin
  if old.sales and not new.sales and exists (
    select 1 from public.workshop_settings s
    where s.workspace_id = new.workspace_id
      and s.order_payment_category_id = new.id
  ) then
    raise exception '«%» es la categoría de los cobros de pedidos, así que es de ventas. Para desmarcarla, elige antes otra categoría para los cobros.',
      new.name;
  end if;
  return new;
end;
$$;

create trigger transaction_categories_guard_sales
  before update of sales on public.transaction_categories
  for each row execute function app.guard_sales_category();

-- ------------------------------------------------------ the loose income

create or replace function app.loose_income_is_not_a_sale()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  if new.type <> 'income' or new.order_id is not null or new.category_id is null then
    return new;
  end if;
  -- Only what changes is judged: voiding an old movement does not touch these.
  if tg_op = 'UPDATE'
     and new.type is not distinct from old.type
     and new.category_id is not distinct from old.category_id
     and new.order_id is not distinct from old.order_id then
    return new;
  end if;

  select c.name into v_name
  from public.transaction_categories c
  where c.id = new.category_id and c.sales;

  if v_name is not null then
    raise exception '«%» es una categoría de ventas, y un ingreso suelto no es una venta. Si vendiste, regístralo por Pedidos o por la Venta rápida; si te pagaron un pedido, cóbralo desde el pedido o desde Por cobrar. Si es otra cosa (un reembolso, una devolución), elige otra categoría.',
      v_name;
  end if;
  return new;
end;
$$;

create trigger transactions_loose_income_is_not_a_sale
  before insert or update of type, category_id, order_id on public.transactions
  for each row execute function app.loose_income_is_not_a_sale();
