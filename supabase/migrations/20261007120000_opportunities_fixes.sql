-- Dos correcciones a la migración de oportunidades, encontradas usándola.
--
-- Va encima y no dentro de la otra porque la otra ya está aplicada, y una
-- migración aplicada no se edita.
--
-- 1. Un trato liquidado que deja de estarlo —se anula un cobro, o entra otro
--    pedido al trato— se quedaba en "Cerrado" para siempre. El retroceso
--    devolvía la etapa a `old.stage`, que en ese caso ya era "Cerrado": se
--    devolvía a sí misma. Un saldo que se deriva tiene que derivarse en los
--    dos sentidos, o no se está derivando.
--
-- 2. Las filas del historial se fechaban con `now()`, que en PostgreSQL es la
--    hora de inicio de la transacción y no la del momento. Dos cambios de
--    etapa en la misma transacción quedaban con la misma hora y el historial
--    salía desordenado. `clock_timestamp()` sí avanza.

create or replace function app.normalize_opportunity_stage()
returns trigger
language plpgsql
as $$
declare
  v_has_orders boolean;
begin
  -- "Perdido" es la única etapa que la máquina nunca toca: es la decisión de
  -- una persona y no se deduce de ningún dato.
  if new.stage = 'lost' then
    return new;
  end if;

  if app.opportunity_is_settled(new.id) then
    new.stage := 'closed';
    return new;
  end if;

  select exists (
    select 1 from public.orders o
     where o.opportunity_id = new.id and o.status <> 'cancelled'
  ) into v_has_orders;

  /*
   * No está liquidado, así que no puede quedarse en "Cerrado": ni porque
   * alguien soltó ahí la tarjeta, ni porque dejó de estarlo.
   *
   * Con pedidos vivos el sitio correcto es "Ganado". Sin ellos, la tarjeta
   * vuelve de donde la arrastraron: en un tablero, verla regresar explica
   * mejor que un mensaje de error que esa columna no se elige a mano.
   */
  if new.stage = 'closed' then
    new.stage := case
                   when v_has_orders then 'won'
                   when tg_op = 'UPDATE' and old.stage <> 'closed' then old.stage
                   else 'new'
                 end;
  end if;

  -- "Ganado" significa que el trato se convirtió en pedido. Si hay pedido, lo
  -- está, lo haya arrastrado alguien o no.
  if v_has_orders and new.stage in ('new', 'quoted', 'negotiating') then
    new.stage := 'won';
  end if;

  return new;
end;
$$;

alter table public.opportunity_stage_history
  alter column changed_at set default clock_timestamp();
alter table public.order_status_history
  alter column changed_at set default clock_timestamp();

-- Vuelve a pasar la regla por todos los tratos que ya existieran: el
-- disparador de arriba convierte esta escritura vacía en un recálculo.
update public.opportunities set stage = stage;
