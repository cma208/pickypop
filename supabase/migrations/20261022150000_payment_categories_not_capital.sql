-- A category of capital cannot be the one collections or purchase payments fall under.
--
-- Configuración › Categorías por defecto offers every active category of each
-- direction. Choosing «Aporte del dueño» for the collections of orders made
-- `order_payment_category_is_sales` mark it as one of sales, and the check
-- that a category of capital is never one of sales (20261022100000) answered
-- with a constraint name nobody can read. Choosing a category of capital for
-- purchase payments went through, and then `default_category` ignored it:
-- every payment without a category, and nobody told.
--
-- Refused here, before either happens, with a sentence that says what to do.
-- A trigger of its own on `workshop_settings`, whose policies and screen are
-- the base area's.

create or replace function app.payment_categories_not_capital()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  if new.order_payment_category_id is not null
     and (tg_op = 'INSERT' or new.order_payment_category_id is distinct from old.order_payment_category_id) then
    select c.name into v_name
    from public.transaction_categories c
    where c.id = new.order_payment_category_id and c.capital;
    if v_name is not null then
      raise exception '«%» es una categoría de capital, de los aportes del dueño: no puede ser la de los cobros de pedidos, que son ventas. Elige una categoría de ventas.',
        v_name;
    end if;
  end if;

  if new.purchase_payment_category_id is not null
     and (tg_op = 'INSERT' or new.purchase_payment_category_id is distinct from old.purchase_payment_category_id) then
    select c.name into v_name
    from public.transaction_categories c
    where c.id = new.purchase_payment_category_id and c.capital;
    if v_name is not null then
      raise exception '«%» es una categoría de capital, de los retiros del dueño: no puede ser la de los pagos de compras. Elige una categoría de gastos.',
        v_name;
    end if;
  end if;

  return new;
end;
$$;

create trigger workshop_settings_payment_categories_not_capital
  before insert or update of order_payment_category_id, purchase_payment_category_id on public.workshop_settings
  for each row execute function app.payment_categories_not_capital();
