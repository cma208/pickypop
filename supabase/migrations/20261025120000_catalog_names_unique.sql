-- Dos productos, o dos variantes de un producto, no se llaman igual (T2-15).
--
-- El catálogo era único solo por slug, y las variantes por su nombre exacto:
-- cabían dos «Calavera dulcera», y «Llavero» junto a «llavero ». En un taller
-- donde la foto y el nombre son lo único que distingue «la botella roja» de la
-- otra, dos nombres iguales son dos cosas que nadie sabe separar.
--
-- «Igual» es sin mayúsculas, sin los espacios de los bordes y con los de en
-- medio contados como uno. La pantalla, además, compara sin tildes
-- («Poción» y «Pocion»), como ya hacía la importación con las piezas: eso no
-- se puede indexar sin una extensión, y la pantalla lo cubre.

create or replace function app.catalog_name_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g')));
$$;

comment on function app.catalog_name_key(text) is
  'El nombre tal como lo compara una persona: sin mayúsculas, sin espacios en los bordes y con los de en medio contados como uno.';

-- Los repetidos que ya existen no se borran ni se juntan: el más viejo se
-- queda con su nombre y los demás llevan « (2)», « (3)»… para que alguien
-- decida qué hacer con ellos. Lo que ya se cotizó o vendió apunta al id, no
-- al nombre, así que nada se pierde.
do $$
declare
  v_row record;
  v_suffix integer;
  v_name text;
  v_products integer := 0;
  v_variants integer := 0;
begin
  for v_row in
    select id, workspace_id, name
    from (
      select id, workspace_id, name,
             row_number() over (partition by workspace_id, app.catalog_name_key(name) order by created_at, id) as position
      from public.catalog_products
    ) ranked
    where position > 1
    order by workspace_id, name
  loop
    v_suffix := 2;
    loop
      v_name := btrim(v_row.name) || ' (' || v_suffix || ')';
      exit when not exists (
        select 1 from public.catalog_products
        where workspace_id = v_row.workspace_id
          and app.catalog_name_key(name) = app.catalog_name_key(v_name)
      );
      v_suffix := v_suffix + 1;
    end loop;
    update public.catalog_products set name = v_name where id = v_row.id;
    v_products := v_products + 1;
  end loop;

  for v_row in
    select id, product_id, name
    from (
      select id, product_id, name,
             row_number() over (partition by product_id, app.catalog_name_key(name) order by created_at, id) as position
      from public.product_variants
    ) ranked
    where position > 1
    order by product_id, name
  loop
    v_suffix := 2;
    loop
      v_name := btrim(v_row.name) || ' (' || v_suffix || ')';
      exit when not exists (
        select 1 from public.product_variants
        where product_id = v_row.product_id
          and app.catalog_name_key(name) = app.catalog_name_key(v_name)
      );
      v_suffix := v_suffix + 1;
    end loop;
    update public.product_variants set name = v_name where id = v_row.id;
    v_variants := v_variants + 1;
  end loop;

  if v_products + v_variants > 0 then
    raise notice 'Nombres repetidos renombrados con un número: % productos y % variantes.', v_products, v_variants;
  end if;
end;
$$;

create unique index catalog_products_name_key
  on public.catalog_products (workspace_id, app.catalog_name_key(name));

create unique index product_variants_name_key
  on public.product_variants (product_id, app.catalog_name_key(name));
