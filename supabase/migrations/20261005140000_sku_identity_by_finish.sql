-- Dos filamentos que solo se diferencian en el acabado chocaban entre sí.
--
-- La identidad de un filamento se medía con la columna de texto `finish`, que
-- quedó obsoleta al pasar los acabados a su propia tabla. Como ya nadie la
-- escribe, está vacía en todas las filas nuevas, así que un Rojo Mate y un
-- Rojo Seda de la misma marca se veían como el mismo filamento y el segundo
-- se rechazaba con un "ya existe" que no era verdad.
--
-- `nulls not distinct` es lo que hace falta aquí: dos filamentos sin acabado
-- sí son el mismo filamento, y sin esa cláusula Postgres los trataría como
-- distintos y dejaría crear duplicados de verdad.

drop index if exists public.filament_skus_identity_idx;

create unique index filament_skus_identity_idx
  on public.filament_skus (
    workspace_id, brand_id, material_id, finish_id, color_name, net_weight_g, diameter_mm
  )
  nulls not distinct;

comment on index public.filament_skus_identity_idx is
  'Qué hace único a un filamento. Sin acabado cuenta como un valor más, no como "cualquiera".';
