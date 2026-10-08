-- Piezas enteras y precios mayores que cero (T2-09, T2-08).
--
-- La pantalla ya los pide así; esto es la red, para lo que llegue por otro
-- lado. Ninguna regla revisa lo que ya está guardado: si hay fracciones o
-- precios en cero de antes, se quedan como están hasta que alguien los edite,
-- y la pantalla los marca para que se corrijan. Así la migración no falla por
-- datos viejos y no se cambia un número sin que una persona lo decida.

-- ------------------------------------------------------- piezas enteras
--
-- No se imprime media pieza: una impresión cerrada metería 1.5 tapas al
-- estante y «Armar» consumiría 1.5 ganchos. Los insumos sí van con decimales
-- (66 g de dulces), así que la regla mira qué es el artículo.

create or replace function app.plate_output_is_whole()
returns trigger
language plpgsql
as $$
begin
  if new.units_per_run <> trunc(new.units_per_run) then
    raise exception 'Las piezas salen enteras: «%» no puede salir % por corrida.',
      coalesce((select name from public.inventory_items where id = new.inventory_item_id), 'la pieza'),
      app.tidy_number(new.units_per_run);
  end if;
  return new;
end;
$$;

create trigger recipe_plate_outputs_whole_units
  before insert or update of units_per_run on public.recipe_plate_outputs
  for each row execute function app.plate_output_is_whole();

create or replace function app.recipe_part_is_whole()
returns trigger
language plpgsql
as $$
declare
  v_kind public.inventory_item_kind;
  v_name text;
begin
  if new.quantity_per_unit = trunc(new.quantity_per_unit) then
    return new;
  end if;

  select kind, name into v_kind, v_name
  from public.inventory_items
  where id = new.inventory_item_id;

  if v_kind = 'part' then
    raise exception 'Las piezas impresas van enteras: un producto no puede llevar % de «%».',
      app.tidy_number(new.quantity_per_unit), v_name;
  end if;
  return new;
end;
$$;

create trigger recipe_items_whole_parts
  before insert or update of quantity_per_unit, inventory_item_id on public.recipe_items
  for each row execute function app.recipe_part_is_whole();

-- ---------------------------------------------------- precios sobre cero
--
-- Un escalón a S/ 0.00 regalaba el producto y la pantalla decía que alcanzaba
-- el margen. Sin precio se escribe vacío (la variante sin precio de lista) o
-- no se agrega el escalón, nunca con un cero. Se mira solo cuando el precio
-- cambia: una variante vieja en cero se puede seguir desactivando o
-- renombrando mientras alguien decide su precio.

create or replace function app.tier_price_is_above_zero()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.unit_price is not distinct from old.unit_price then
    return new;
  end if;
  if new.unit_price <= 0 then
    raise exception 'Un escalón a S/ 0.00 regala el producto: ponle un precio mayor que cero.';
  end if;
  return new;
end;
$$;

create trigger price_tiers_price_above_zero
  before insert or update of unit_price on public.price_tiers
  for each row execute function app.tier_price_is_above_zero();

create or replace function app.list_price_is_above_zero()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.list_price is not distinct from old.list_price then
    return new;
  end if;
  if new.list_price <= 0 then
    raise exception 'El precio de lista tiene que ser mayor que cero. Si todavía no tiene precio, déjalo vacío.';
  end if;
  return new;
end;
$$;

create trigger product_variants_list_price_above_zero
  before insert or update of list_price on public.product_variants
  for each row execute function app.list_price_is_above_zero();
