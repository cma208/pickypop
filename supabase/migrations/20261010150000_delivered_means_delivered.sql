-- "Entregado" se alcanza entregando.
--
-- Con `deliver_order` las cosas salen del estante. Pero el pedido todavía se
-- podía pasar a "Entregado" o "Cerrado" a mano, y entonces el estado decía una
-- cosa y el estante otra, que es exactamente el error que se acaba de cerrar.
-- Mientras quede algo por entregar, esos dos estados se rechazan con un
-- mensaje que dice qué hacer.
--
-- Un pedido que ya estaba entregado o cerrado antes de que existieran las
-- entregas no se toca: la vista lo da por entregado entero.

create or replace function app.guard_delivered_status()
returns trigger
language plpgsql
as $$
begin
  if new.status not in ('delivered', 'closed') or old.status in ('delivered', 'closed') then
    return new;
  end if;

  -- Se lee con el estado de antes, que es el que todavía tiene la fila.
  if exists (
    select 1 from public.order_line_delivery_status
    where order_id = new.id and pending > 0
  ) then
    raise exception 'Para marcar el pedido % como entregado hay que entregarlo, así sale del estante lo que se lleva el cliente.', new.number;
  end if;

  return new;
end;
$$;

create trigger orders_delivered_means_delivered
  before update of status on public.orders
  for each row execute function app.guard_delivered_status();
