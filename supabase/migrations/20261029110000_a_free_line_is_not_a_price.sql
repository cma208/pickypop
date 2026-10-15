-- Un costo de cero no es un costo (ADR-023, punto 7, revisión).
--
-- 20261029100000 dejó de aceptar S/ 0 en el costo que pide un movimiento a
-- mano. Quedaban dos puertas por donde un insumo o un empaque seguía valiendo
-- S/ 0 sin que nadie lo eligiera, y ninguna pantalla lo avisaba, porque para
-- ellas el artículo sí tenía costo:
--
-- * Una línea de compra a S/ 0 (las 20 bolsas que regaló el proveedor dentro
--   de una compra) pasaba a ser «la última compra» y dejaba el artículo en
--   S/ 0, por encima de su costo estándar. Ahora `inventory_item_costs` no la
--   cuenta: un regalo no dice cuánto cuesta el artículo, y entra al costo que
--   ya tenía, igual que una «Entrada sin compra». Si no hay otra compra, manda
--   el costo estándar, y si tampoco, el artículo queda sin costo y lo pide el
--   próximo movimiento. Ninguna compra cambia: su línea, su total y lo que
--   entró al stock con ella siguen como se guardaron.
--
-- * Dos líneas del mismo artículo en una compra (dos lotes a distinto precio)
--   se guardan en la misma transacción, con la misma hora, y la vista tomaba
--   una cualquiera. Ahora toma lo que costó una unidad en esa compra: el
--   promedio de sus líneas, cada una con su parte del envío. Con una sola
--   línea da lo mismo que antes.
--
-- * La ficha aceptaba un costo estándar de S/ 0, y uno con cinco decimales
--   (0.00004) la columna lo redondeaba a 0.0000 sin avisar. Ahora el mismo
--   disparador del tope rechaza lo que queda en cero o menos, con la frase de
--   `move_item_stock`. Como el tope, solo juzga el número que se está
--   escribiendo: lo que ya está guardado no se toca.

-- ------------------------------------------------------------- la vista

-- The one of 20261008110000_parts_and_assembly, same columns. A line whose
-- unit costs nothing is skipped, and the lines of the latest purchase are
-- averaged by quantity, with a stable order between purchases.
create or replace view public.inventory_item_costs with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.standard_cost,
  last_purchase.unit_cost as last_purchase_cost,
  coalesce(last_purchase.unit_cost, i.standard_cost) as cost_per_unit,
  case
    when last_purchase.unit_cost is not null then 'purchase'
    when i.standard_cost is not null then 'standard'
    else 'unknown'
  end as cost_source
from public.inventory_items i
left join lateral (
  select
    round(sum(l.unit_price * l.quantity + l.allocated_extra_cost) / sum(l.quantity), 4) as unit_cost
  from public.purchase_lines l
  join public.purchases p on p.id = l.purchase_id
  where l.inventory_item_id = i.id
    and l.quantity > 0
    -- What rounds to S/ 0 a unit is a gift: it would price the article at
    -- nothing. Every line kept is worth at least 0.0001, and so is their
    -- average.
    and round((l.unit_price * l.quantity + l.allocated_extra_cost) / l.quantity, 4) > 0
  group by p.id, p.purchased_at, p.created_at
  order by p.purchased_at desc, p.created_at desc, p.id desc
  limit 1
) as last_purchase on true;

comment on view public.inventory_item_costs is
  'What a supply costs per unit, and whether that came from a real purchase.';

-- ------------------------------------------------------------- la ficha

-- The one of 20261029100000_supplies_carry_their_cost, with a floor under
-- the standard cost. NEW already holds the column's 4 decimals: 0.00004
-- arrives as 0 and is refused like a zero.
create or replace function app.guard_inventory_item_ranges()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or new.min_stock is distinct from old.min_stock)
     and new.min_stock > 1000000 then
    raise exception 'El mínimo va hasta 1 000 000: revisa el número.';
  end if;

  if tg_op = 'INSERT' or new.standard_cost is distinct from old.standard_cost then
    -- numeric sorts NaN above every number: unnamed, it would reach the cap.
    if new.standard_cost = 'NaN'::numeric or new.standard_cost <= 0 then
      raise exception 'El costo por % tiene que ser mayor que cero.', new.unit;
    end if;
    if new.standard_cost > 100000 then
      raise exception 'El costo por unidad va hasta S/ 100 000: revisa el número.';
    end if;
  end if;

  return new;
end;
$$;
