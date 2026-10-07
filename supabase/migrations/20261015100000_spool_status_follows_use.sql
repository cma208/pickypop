-- El estado de un rollo sigue a su uso.
--
-- Un rollo que ya imprimió seguía diciendo «sellado», y uno sin gramos seguía
-- diciendo «abierto» o «sellado» en la lista de rollos y en el selector de
-- «Iniciar». El estado solo cambiaba si alguien lo tocaba a mano, y nadie lo
-- hace en pleno trabajo. Lo vio el recorrido desde cero (H23).
--
-- Se decide en la base y no en la pantalla por lo mismo que el stock: el
-- consumo lo escribe `complete_print_job`, un pesaje o un mantenimiento, y
-- cualquiera de los tres tiene que dejar el rollo en el estado correcto.
--
-- Reglas, en este orden:
--   1. El primer consumo real (impresión, merma, mantenimiento) abre el rollo
--      sellado. Un pesaje no: pesar un rollo cerrado no lo abre.
--   2. Un rollo sin gramos pasa a «vacío», sea cual sea el movimiento que lo
--      dejó así. «Descartado» no se toca: es una decisión de la persona.
--   3. Si un ajuste positivo (un pesaje) encuentra gramos en un rollo vacío,
--      vuelve a «abierto»: el conteo manda sobre la cuenta.
--
-- Cuando alguien cambia el estado a mano, vale lo que diga: el disparador solo
-- reacciona a movimientos nuevos.

create or replace function app.sync_spool_status()
returns trigger
language plpgsql
as $$
declare
  v_status public.spool_status;
  v_on_hand numeric;
begin
  -- Se bloquea el rollo para que dos movimientos a la vez no se pisen.
  select status into v_status from public.spools where id = new.spool_id for update;
  if not found then
    return null;
  end if;

  select coalesce(sum(quantity), 0) into v_on_hand
  from public.stock_movements
  where spool_id = new.spool_id
    and type not in ('reservation', 'release');

  if v_status = 'sealed' and new.quantity < 0 and new.type in ('consumption', 'waste', 'maintenance') then
    update public.spools
       set status = 'open',
           opened_at = coalesce(opened_at, new.occurred_at)
     where id = new.spool_id;
    v_status := 'open';
  end if;

  if v_status in ('sealed', 'open', 'in_use') and v_on_hand <= 0 then
    update public.spools set status = 'empty' where id = new.spool_id;
  elsif v_status = 'empty' and v_on_hand > 0 and new.type = 'adjustment' and new.quantity > 0 then
    update public.spools set status = 'open' where id = new.spool_id;
  end if;

  return null;
end;
$$;

create trigger stock_movements_sync_spool_status
  after insert on public.stock_movements
  for each row
  when (new.spool_id is not null and new.type not in ('reservation', 'release'))
  execute function app.sync_spool_status();

-- Los rollos que ya existen: los que imprimieron y siguen «sellados», y los que
-- ya no tienen gramos. Sin esto la regla solo valdría de hoy en adelante y la
-- lista de rollos seguiría mintiendo sobre todo lo anterior.
update public.spools s
   set status = 'open',
       opened_at = coalesce(s.opened_at, u.first_use)
  from (
    select spool_id, min(occurred_at) as first_use
    from public.stock_movements
    where spool_id is not null
      and type in ('consumption', 'waste', 'maintenance')
      and quantity < 0
    group by spool_id
  ) u
 where s.id = u.spool_id
   and s.status = 'sealed';

update public.spools s
   set status = 'empty'
 where s.status in ('sealed', 'open', 'in_use')
   and exists (select 1 from public.stock_movements m where m.spool_id = s.id)
   and (
     select coalesce(sum(m.quantity), 0)
     from public.stock_movements m
     where m.spool_id = s.id and m.type not in ('reservation', 'release')
   ) <= 0;
