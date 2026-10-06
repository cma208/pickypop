-- Armar un producto, visto desde quien lo arma.
--
-- La pantalla preguntaba al revés: se elegía una variante de una lista de
-- texto, se escribía una cantidad y recién al pulsar el botón la base decía si
-- alcanzaba. El dueño lo pidió al derecho: elegir el producto terminado, decir
-- cuántos, y **ver antes** qué se va a consumir y qué falta.
--
-- Son dos preguntas y dos vistas: qué puedo armar, y con qué se arma esto.

-- Cuántas unidades alcanzan a armarse hoy: el mínimo entre lo que da cada
-- componente. Un componente con cantidad cero no limita nada, y una receta sin
-- componentes no se puede armar, que es distinto de poder armar infinitas.
create view public.assembly_options as
select
  v.workspace_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(v.image_path, p.image_path) as image_path,
  r.id as recipe_id,
  coalesce(fg.on_hand, 0) as assembled_on_hand,
  coalesce(limits.buildable_units, 0) as buildable_units,
  coalesce(limits.component_count, 0) as component_count
from public.product_variants v
join public.catalog_products p on p.id = v.product_id
join lateral (
  select id from public.recipes where variant_id = v.id order by version desc limit 1
) r on true
left join lateral (
  select b.on_hand
  from public.inventory_items i
  join public.inventory_balances b on b.inventory_item_id = i.id
  where i.product_variant_id = v.id and i.kind = 'finished_good'
  limit 1
) fg on true
left join lateral (
  select
    floor(min(coalesce(b.on_hand, 0) / nullif(ri.quantity_per_unit, 0))) as buildable_units,
    count(*) as component_count
  from public.recipe_items ri
  left join public.inventory_balances b on b.inventory_item_id = ri.inventory_item_id
  where ri.recipe_id = r.id
) limits on true
where v.active;

comment on view public.assembly_options is
  'Variantes con receta: cuántas hay armadas y cuántas más alcanzan a armarse con el stock de hoy.';

-- Con qué se arma una unidad, para poder enseñarlo antes de mover nada.
create view public.assembly_components as
select
  ri.workspace_id,
  r.variant_id,
  i.id as inventory_item_id,
  i.name,
  i.unit,
  i.kind,
  i.image_path,
  ri.quantity_per_unit,
  coalesce(b.on_hand, 0) as on_hand
from public.recipe_items ri
join public.recipes r on r.id = ri.recipe_id
join public.inventory_items i on i.id = ri.inventory_item_id
left join public.inventory_balances b on b.inventory_item_id = i.id
where r.id = (
  select id from public.recipes where variant_id = r.variant_id order by version desc limit 1
);

comment on view public.assembly_components is
  'La receta vigente de cada variante, con el stock de cada componente. Es lo que la pantalla de armado enseña antes de armar.';
