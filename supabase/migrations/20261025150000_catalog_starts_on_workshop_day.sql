-- Un escalón agregado de noche rige desde hoy en Lima (T1-15).
--
-- `price_tiers.valid_from` nacía con `current_date`, que en la base es el día
-- en UTC: después de las 19:00 en Lima ya es mañana. La lista y el cotizador
-- filtran lo vigente con el día de Lima, así que el escalón recién agregado
-- desaparecía hasta medianoche, y al volver a agregarlo chocaba con él
-- («Ya hay un escalón desde esa cantidad», sin ninguno a la vista). El taller
-- trabaja hasta las 23:00. Las recetas tenían la misma fecha.
--
-- Una columna no puede leer el taller de su propia fila en el valor por
-- defecto, así que lo pone un disparador: el día del taller
-- (`app.workspace_day`, en su zona horaria) cuando no llega ninguno.

create or replace function app.starts_on_workshop_day()
returns trigger
language plpgsql
as $$
begin
  if new.valid_from is null then
    new.valid_from := coalesce(
      app.workspace_day(new.workspace_id, now()),
      (now() at time zone 'America/Lima')::date
    );
  end if;
  return new;
end;
$$;

alter table public.price_tiers alter column valid_from drop default;
alter table public.recipes alter column valid_from drop default;

create trigger price_tiers_start_on_workshop_day
  before insert on public.price_tiers
  for each row execute function app.starts_on_workshop_day();

create trigger recipes_start_on_workshop_day
  before insert on public.recipes
  for each row execute function app.starts_on_workshop_day();

-- Los escalones que ya nacieron «mañana» por esto y todavía no llegan a su
-- día pasan a hoy en Lima: nadie agrega a propósito un escalón que empieza
-- mañana desde una pantalla que no deja elegir la fecha. Solo los de hoy en
-- UTC que en Lima siguen siendo de mañana, nada más.
update public.price_tiers t
   set valid_from = app.workspace_day(t.workspace_id, now())
 where t.valid_from > app.workspace_day(t.workspace_id, now())
   and t.valid_from <= (now() at time zone 'UTC')::date
   and not exists (
     select 1 from public.price_tiers other
     where other.variant_id = t.variant_id
       and other.min_quantity = t.min_quantity
       and other.valid_from = app.workspace_day(t.workspace_id, now())
   );

/*
 * The price for a quantity on a day, by default the workshop's today. The
 * server's current_date is UTC, which after 19:00 in Lima is already
 * tomorrow, and the order form asked here without a date.
 */
create or replace function app.price_for_quantity(
  target_variant uuid,
  quantity integer,
  on_date date default null
)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select t.unit_price
      from public.price_tiers t
      where t.variant_id = target_variant
        and t.min_quantity <= quantity
        and t.valid_from <= coalesce(on_date, app.workspace_day(v.workspace_id, now()))
      order by t.min_quantity desc, t.valid_from desc
      limit 1
    ),
    v.list_price
  )
  from public.product_variants v
  where v.id = target_variant;
$$;

create or replace function public.price_for_quantity(
  p_variant uuid,
  p_quantity integer,
  p_on_date date default null
)
returns numeric
language sql
stable
as $$
  select app.price_for_quantity(p_variant, p_quantity, p_on_date);
$$;
