-- El plan trabaja con la receta que la pantalla muestra.
--
-- `current_recipes` tomaba la versión más alta de cada variante sin mirar si
-- estaba activa. La pantalla, «Duplicar» y la creación de recetas trabajan con
-- la activa. Desde 20261025110000 hay a lo sumo una activa por variante, y la
-- que se dejó activa fue la más alta, así que hoy coinciden. Pero si alguna
-- vez la más alta queda desactivada, el plan imprimiría las placas de una
-- receta que nadie ve.
--
-- Ahora toma la activa, y si ninguna lo está, la más alta, como antes: una
-- variante con receta nunca se queda sin ninguna para el plan.

create or replace function app.current_recipes(p_workspace_id uuid)
returns setof public.recipes
language sql
stable
as $$
  select distinct on (r.variant_id) r.*
  from public.recipes r
  where r.workspace_id = p_workspace_id
  order by r.variant_id, r.active desc, r.version desc;
$$;
