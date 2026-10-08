-- Cambiar la pieza que sale de una placa también la mete en la receta.
--
-- Desde 20261013110000, agregar lo que sale de una placa mete esa pieza en la
-- receta, una por producto. Pero solo al agregar: si en una salida ya
-- guardada se cambiaba «Tapa» por «Gancho», el gancho salía de la placa y la
-- receta no lo pedía. Armar no lo consumía y el plan no sabía que había que
-- imprimirlo, igual que antes de 20261013110000.
--
-- Va en un disparador aparte, y solo cuando la pieza de verdad cambia. Guardar
-- una salida manda siempre la pieza, aunque sea la misma, y quitar de la
-- receta una pieza que la placa sigue sacando es una decisión de la persona
-- que se respeta: cambiar cuántas salen por corrida no la vuelve a meter.

create trigger recipe_plate_outputs_join_recipe_on_swap
  after update of inventory_item_id on public.recipe_plate_outputs
  for each row
  when (old.inventory_item_id is distinct from new.inventory_item_id)
  execute function app.plate_output_joins_recipe();
