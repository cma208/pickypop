-- «Cliente al paso» también es el cliente genérico (T4-05).
--
-- Nadie más que el cliente de las ventas sin nombre puede llamarse como él
-- (20261020130000_walk_in_is_clientes_varios): escrito en la Venta rápida es
-- ese cliente y no uno nuevo, y una deuda suya se rechaza. Pero la regla
-- miraba solo su nombre de hoy, «Clientes varios». En la tercera pasada se
-- escribió «cliente al paso», el nombre que tuvo hasta el 2026-10-07, y la
-- venta creó un cliente nuevo con ese nombre y le dejó la deuda: en «Por
-- cobrar» y en los selectores quedaron «Cliente al paso» y «cliente al paso»
-- sin forma de distinguirlos.
--
-- Ahora cuentan como el cliente genérico su nombre de hoy y los dos nombres
-- con que se lo conoce, en singular o en plural: «Clientes varios», «Cliente
-- varios», «Cliente al paso» y «Clientes al paso», sin distinguir mayúsculas,
-- espacios ni tildes. Con eso, en la Venta rápida se toman como el cliente
-- genérico (y con saldo, la venta pide el nombre de quien debe), y en
-- Clientes, «Nuevo pedido» y el Cotizador no se puede crear a nadie así.
--
-- Lo que ya existe no se toca: un cliente que ya se llama así sigue como
-- está, y la regla lo mira solo si alguien le cambia el nombre. La pantalla
-- de la Venta rápida reconoce los mismos nombres (`GENERIC_CUSTOMER_NAMES`).

create or replace function app.is_walk_in_name(p_workspace_id uuid, p_name text)
returns boolean
language sql
stable
as $$
  select coalesce(app.name_key(p_name) = any (array[
    app.name_key((
      select c.name from public.customers c
      where c.workspace_id = p_workspace_id and c.walk_in
    )),
    app.name_key('Clientes varios'),
    app.name_key('Cliente varios'),
    app.name_key('Cliente al paso'),
    app.name_key('Clientes al paso')
  ]), false);
$$;

comment on function app.is_walk_in_name(uuid, text) is
  'Si un nombre es el del cliente genérico: el que tiene en el taller, o «Clientes varios» y «Cliente al paso» (en singular o plural), sin distinguir mayúsculas, espacios ni tildes. Nadie más puede llamarse así (walk_in_name_is_taken), y quick_sale lo toma como el cliente genérico.';
