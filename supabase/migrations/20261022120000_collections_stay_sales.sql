-- The collections of orders fall only under a category of sales (T5-07).
--
-- With «Venta de productos» deactivated, «Para cobros de pedidos» went back
-- to «Automática», and since «Aporte del dueño» was then the only active
-- income category, `app.default_category` filed every collection and every
-- quick sale under it. Resultados did not change (it decides by the order),
-- but Caja said the sales were the owner's capital.
--
-- * The fallback of a collection is the only active category of sales, not
--   the only active category of income. The fallback of a purchase payment is
--   the only active expense category that is not of capital. A category of
--   capital is never a default: the ledger refuses it on both
--   (20261022110000_ledger_guards.sql).
-- * The last active category of sales can be neither deactivated nor
--   unmarked: collections and the quick sale would be left without one.
-- * The category chosen for collections, or for purchase payments, cannot be
--   deactivated while it is chosen, nor marked as capital: choose another one
--   first. It is the rule `guard_sales_category` already applies to unmarking
--   the one of collections. The screen shows the database's sentence as it is.

-- The same signature and the same contract as 20261015120000: only the
-- candidates change.
create or replace function app.default_category(
  p_workspace_id uuid,
  p_direction public.transaction_direction
)
returns uuid
language sql
stable
as $$
  select coalesce(
    -- The one the owner chose, while it is still active and still fits.
    (
      select c.id
      from public.workshop_settings s
      join public.transaction_categories c
        on c.id = case p_direction
                    when 'income' then s.order_payment_category_id
                    else s.purchase_payment_category_id
                  end
       and c.active
       and not c.capital
       and (p_direction = 'expense' or c.sales)
      where s.workspace_id = p_workspace_id
    ),
    -- If not, the only one there is that fits. With two or more nothing is guessed.
    (
      select (array_agg(c.id))[1]
      from public.transaction_categories c
      where c.workspace_id = p_workspace_id
        and c.direction = p_direction
        and c.active
        and not c.capital
        and (p_direction = 'expense' or c.sales)
      having count(*) = 1
    )
  );
$$;

create or replace function app.keep_payment_categories()
returns trigger
language plpgsql
as $$
declare
  v_chosen_for text;
begin
  select case
           when s.order_payment_category_id = new.id then 'los cobros de pedidos'
           else 'los pagos de compras'
         end
    into v_chosen_for
  from public.workshop_settings s
  where s.workspace_id = new.workspace_id
    and new.id in (s.order_payment_category_id, s.purchase_payment_category_id);

  if v_chosen_for is not null and old.active and not new.active then
    raise exception '«%» es la categoría de %. Para desactivarla, elige antes otra en Configuración › Categorías de dinero › Categorías por defecto.',
      new.name, v_chosen_for;
  end if;
  if v_chosen_for is not null and new.capital and not old.capital then
    raise exception '«%» es la categoría de %, así que no puede ser de capital. Elige antes otra para %.',
      new.name, v_chosen_for, v_chosen_for;
  end if;

  if old.sales and old.active and not (new.sales and new.active) and not exists (
    select 1
    from public.transaction_categories c
    where c.workspace_id = new.workspace_id
      and c.id <> new.id
      and c.sales
      and c.active
  ) then
    raise exception '«%» es la última categoría de ventas activa: sin ella, los cobros de pedidos y la Venta rápida quedarían sin categoría. Activa o crea otra de ventas antes de %.',
      new.name, case when new.active then 'desmarcarla' else 'desactivarla' end;
  end if;

  return new;
end;
$$;

create trigger transaction_categories_keep_payment_categories
  before update of active, sales, capital on public.transaction_categories
  for each row execute function app.keep_payment_categories();
