-- Lo que ya se entregó o se cobró no se cancela con un botón.
--
-- En el recorrido desde cero se canceló un pedido entregado y cobrado. La
-- venta desapareció de Resultados, la plata siguió en las cuentas y las dos
-- calaveras ya habían salido del estante: tres pantallas que dejaron de decir
-- lo mismo. Igual con «En espera» después de entregar.
--
-- Cancelar exige que no haya salido nada y que no quede plata cobrada (un
-- cobro se anula en Caja, con su motivo, y entonces sí). Y un pedido
-- entregado o cerrado solo se mueve entre esos dos estados.

create or replace function app.guard_settled_order()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('delivered', 'closed') and new.status not in ('delivered', 'closed') then
    raise exception 'El pedido % ya se entregó: no puede volver atrás ni cancelarse.', new.number;
  end if;

  if new.status = 'cancelled' then
    if exists (
      select 1
      from public.order_delivery_lines l
      join public.order_deliveries d on d.id = l.delivery_id
      where d.order_id = new.id and l.quantity > 0
    ) then
      raise exception 'El pedido % ya tiene entregas: lo entregado salió del estante y un pedido así no se cancela.', new.number;
    end if;

    select coalesce(sum(t.amount), 0) into v_paid
    from public.transactions t
    where t.order_id = new.id and t.type = 'income' and t.voided_at is null;

    if v_paid > 0 then
      raise exception 'El pedido % tiene cobros por S/ %: anúlalos en Caja antes de cancelarlo, para que la plata y el pedido digan lo mismo.',
        new.number, to_char(v_paid, 'FM999999990.00');
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_settled_stay_settled
  before update of status on public.orders
  for each row execute function app.guard_settled_order();
