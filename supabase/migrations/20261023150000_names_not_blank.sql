-- A filament has a colour name and a supply has a unit, even typed as spaces.
--
-- The form checked «required» before trimming, so three spaces passed, were
-- trimmed to nothing, and the database had no check of its own: a filament
-- listed as «Krear3D · PLA» with no colour, and a supply that read «Hay 0 ·
-- Mínimo 500» without saying 500 of what (tercera pasada, T1-12). The names of
-- every other catalogue table already had this check.
--
-- What is already blank gets a value first, so the check can be added on a
-- database with real data:
--
-- * a unit becomes «sin unidad»: guessing «unidad» could turn grams of
--   sweets into units without anyone noticing, while this one reads as
--   something to fix, and the form shows it until somebody does.
-- * a colour name becomes «Color sin nombre», which says what happened and
--   is easy to find and rename. If that would collide with an existing
--   filament of the same identity, the first characters of its id are added.

update public.inventory_items
   set unit = 'sin unidad'
 where btrim(unit) = '';

update public.filament_skus k
   set color_name = case
     when exists (
       select 1
       from public.filament_skus other
       where other.workspace_id = k.workspace_id
         and other.brand_id = k.brand_id
         and other.material_id = k.material_id
         and other.finish_id is not distinct from k.finish_id
         and other.net_weight_g = k.net_weight_g
         and other.diameter_mm = k.diameter_mm
         and other.color_name = 'Color sin nombre'
     ) then 'Color sin nombre ' || left(k.id::text, 8)
     else 'Color sin nombre'
   end
 where btrim(k.color_name) = '';

alter table public.filament_skus
  add constraint filament_skus_color_name_not_blank check (length(btrim(color_name)) > 0);

alter table public.inventory_items
  add constraint inventory_items_unit_not_blank check (length(btrim(unit)) > 0);
