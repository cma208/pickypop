-- Las vistas nuevas no estaban respetando la seguridad por fila.
--
-- En Postgres una vista corre con los permisos de **quien la creó**, no de
-- quien la consulta, así que las políticas de las tablas de abajo no se
-- aplican. Todas las vistas de este proyecto llevan `security_invoker = true`
-- por eso mismo; las cuatro que escribí yo no lo llevaban.
--
-- Hoy no se nota porque hay un solo taller: la vista devuelve lo de ese taller
-- porque no hay nada más. El día que exista un segundo, cualquiera de los dos
-- vería el stock, las recetas y los pedidos del otro a través de estas cuatro
-- vistas. Es el tipo de agujero que no se descubre hasta que ya pasó.
--
-- Está dicho en AGENTS.md: "las reglas de acceso viven en la base de datos".
-- Una vista que las esquiva es una puerta al lado de la cerradura.

alter view public.part_stock set (security_invoker = true);
alter view public.assembly_options set (security_invoker = true);
alter view public.assembly_components set (security_invoker = true);
alter view public.production_needs set (security_invoker = true);
