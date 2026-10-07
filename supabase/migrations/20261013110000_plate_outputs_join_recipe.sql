-- Una pieza que sale de una placa de la receta es parte de la receta.
--
-- La importación ya lo suponía al calcular "alcanza para 7 productos,
-- contando una de cada pieza por producto", pero no lo escribía: la receta
-- quedaba sin piezas, Armar no las consumía y el plan no sabía que había que
-- imprimirlas. La única forma de ponerlas era como "insumo", donde aparecían
-- como algo que no se ha comprado.
--
-- Se hace aquí y no en la pantalla para que valga igual al importar un
-- archivo, al agregar a mano lo que sale de una placa y en lo que venga. Solo
-- al agregar: quitar la pieza de la receta después es una decisión de la
-- persona (una placa que también saca piezas para otro producto) y se respeta.
-- Entra con una por producto, que es lo que supone el cálculo de la placa.

create or replace function app.plate_output_joins_recipe()
returns trigger
language plpgsql
as $$
begin
  insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
  select new.workspace_id, rp.recipe_id, new.inventory_item_id, 1
  from public.recipe_plates rp
  where rp.id = new.recipe_plate_id
  on conflict (recipe_id, inventory_item_id) do nothing;
  return new;
end;
$$;

create trigger recipe_plate_outputs_join_recipe
  after insert on public.recipe_plate_outputs
  for each row execute function app.plate_output_joins_recipe();

-- Las recetas que ya tienen placas con piezas y no las listan.
insert into public.recipe_items (workspace_id, recipe_id, inventory_item_id, quantity_per_unit)
select distinct o.workspace_id, rp.recipe_id, o.inventory_item_id, 1
from public.recipe_plate_outputs o
join public.recipe_plates rp on rp.id = o.recipe_plate_id
on conflict (recipe_id, inventory_item_id) do nothing;
