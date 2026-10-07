-- Los cobros de pedidos y los pagos de compras ya no quedan sin categoría.
--
-- Existen «Venta de productos» (ingreso) y «Filamento e insumos» (egreso), pero
-- `record_payment` y `record_purchase_payment` escribían el movimiento sin
-- categoría y nada la elegía por nadie: Caja se llenaba de renglones sin
-- clasificar que había que corregir a mano (recorrido desde cero, H38). Tampoco
-- se adivina por el nombre: la categoría que usa el taller la elige el dueño.
--
-- * `workshop_settings` guarda dos decisiones: la categoría de los cobros de
--   pedidos y la de los pagos de compras. Se eligen en Configuración.
-- * Si no hay una elegida y el taller tiene una sola categoría activa de esa
--   dirección, se usa esa: no hay nada que decidir.
-- * Se aplica con un disparador sobre `transactions` y no dentro de las dos
--   funciones: así vale para cualquier forma de escribir un cobro o un pago, y
--   las funciones siguen diciendo solo lo que ya decían. Una categoría que la
--   pantalla sí pasa (`p_category_id`) manda sobre la de por defecto.
-- * La dirección la garantiza la propia base: la llave foránea compuesta es la
--   misma que usa `transactions`, con la dirección fija en una columna
--   generada. Un egreso no puede quedar como categoría de cobros. Sin
--   `on delete`: Postgres no lo admite con una columna generada, y una
--   categoría no se borra, se desactiva, así que nunca hizo falta.

alter table public.workshop_settings
  add column order_payment_category_id uuid,
  add column order_payment_direction public.transaction_direction
    generated always as ('income'::public.transaction_direction) stored,
  add column purchase_payment_category_id uuid,
  add column purchase_payment_direction public.transaction_direction
    generated always as ('expense'::public.transaction_direction) stored,
  add constraint workshop_settings_order_payment_category_fkey
    foreign key (order_payment_category_id, order_payment_direction)
    references public.transaction_categories (id, direction),
  add constraint workshop_settings_purchase_payment_category_fkey
    foreign key (purchase_payment_category_id, purchase_payment_direction)
    references public.transaction_categories (id, direction);

comment on column public.workshop_settings.order_payment_category_id is
  'Categoría (de ingreso) con que se clasifican los cobros de pedidos cuando nadie elige otra. Sin elegir, la única categoría activa de ingreso si es una sola.';
comment on column public.workshop_settings.purchase_payment_category_id is
  'Categoría (de egreso) con que se clasifican los pagos de compras cuando nadie elige otra. Sin elegir, la única categoría activa de egreso si es una sola.';

-- La categoría de por defecto de una dirección. Es la misma regla que repite
-- la pantalla para decir «se registra como…»: si cambia, cambia en los dos.
create or replace function app.default_category(
  p_workspace_id uuid,
  p_direction public.transaction_direction
)
returns uuid
language sql
stable
as $$
  select coalesce(
    -- La que eligió el dueño, mientras siga activa.
    (
      select c.id
      from public.workshop_settings s
      join public.transaction_categories c
        on c.id = case p_direction
                    when 'income' then s.order_payment_category_id
                    else s.purchase_payment_category_id
                  end
       and c.active
      where s.workspace_id = p_workspace_id
    ),
    -- Si no, la única que hay. Con dos o más no se adivina.
    (
      select (array_agg(c.id))[1]
      from public.transaction_categories c
      where c.workspace_id = p_workspace_id
        and c.direction = p_direction
        and c.active
      having count(*) = 1
    )
  );
$$;

grant execute on function app.default_category(uuid, public.transaction_direction) to authenticated;

create or replace function app.default_payment_category()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is not null then
    return new;
  end if;

  if new.type = 'income' and new.order_id is not null then
    new.category_id := app.default_category(new.workspace_id, 'income');
  elsif new.type = 'expense' and new.purchase_id is not null then
    new.category_id := app.default_category(new.workspace_id, 'expense');
  end if;

  return new;
end;
$$;

create trigger transactions_default_category
  before insert on public.transactions
  for each row execute function app.default_payment_category();
