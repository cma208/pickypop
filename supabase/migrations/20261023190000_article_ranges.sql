-- A filament and a supply with numbers that make sense.
--
-- The forms only asked for a minimum. A typo reached the database whole: a
-- diameter of 175 (meant 1.75) does not fit numeric(4,2) and the screen could
-- only say «Revisa los datos e inténtalo de nuevo» without pointing at the
-- field, and a net weight of 100000 g fits, so every purchase of that
-- filament brought in rolls of 100 kg (review of the tercera pasada, rule 4).
--
-- The forms now say the range next to the field. This is the net under them,
-- with the same sentences, for a stale tab or a direct call. It only judges a
-- number that is being written: a filament or a supply already out of range
-- can still be renamed or switched off without being corrected first, so the
-- migration cannot fail on what production already holds, and nothing in it
-- changes.
--
-- A diameter past 99.99 still fails before any trigger runs, when the value
-- is cast to the column: only the form can say that one.

create function app.guard_filament_sku_ranges()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or new.diameter_mm is distinct from old.diameter_mm)
     and new.diameter_mm not between 1 and 3 then
    raise exception 'El diámetro va de 1 a 3 mm: el común es 1.75.';
  end if;

  if (tg_op = 'INSERT' or new.net_weight_g is distinct from old.net_weight_g)
     and new.net_weight_g not between 1 and 10000 then
    raise exception 'El peso neto va de 1 a 10 000 g por rollo: revisa el número.';
  end if;

  if (tg_op = 'INSERT' or new.spool_tare_g is distinct from old.spool_tare_g)
     and new.spool_tare_g > 5000 then
    raise exception 'La tara va hasta 5 000 g: es el carrete vacío.';
  end if;

  if (tg_op = 'INSERT' or new.min_stock_g is distinct from old.min_stock_g)
     and new.min_stock_g > 100000 then
    raise exception 'El mínimo va hasta 100 000 g (100 kg): revisa el número.';
  end if;

  if (tg_op = 'INSERT' or new.replacement_cost_per_kg is distinct from old.replacement_cost_per_kg)
     and new.replacement_cost_per_kg > 10000 then
    raise exception 'El costo de reposición va hasta S/ 10 000 por kg: revisa el número.';
  end if;

  return new;
end;
$$;

create trigger filament_skus_guard_ranges
  before insert or update on public.filament_skus
  for each row execute function app.guard_filament_sku_ranges();

-- The same cap a purchase line and a manual movement have.
create function app.guard_inventory_item_ranges()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or new.min_stock is distinct from old.min_stock)
     and new.min_stock > 1000000 then
    raise exception 'El mínimo va hasta 1 000 000: revisa el número.';
  end if;

  return new;
end;
$$;

create trigger inventory_items_guard_ranges
  before insert or update on public.inventory_items
  for each row execute function app.guard_inventory_item_ranges();
