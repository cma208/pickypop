-- Una foto por artículo.
--
-- Regla del dueño, y de las que se notan en el taller: casi todo se llama
-- "la botella roja" o "la tapa chica", así que el nombre escrito es el peor
-- identificador que hay. Una lista con foto se recorre de un vistazo.
--
-- La ruta de cada archivo empieza por el id del taller y la política solo deja
-- entrar a esa carpeta: es la misma frontera que el resto de las tablas, pero
-- aplicada al almacenamiento, donde no hay `workspace_id` que mirar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  5242880,  -- 5 MB: el navegador redimensiona antes de subir, así que es un tope de seguridad, no el tamaño esperado.
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- `storage.foldername(name)` devuelve las carpetas de la ruta; la primera es
-- el taller. Un archivo suelto en la raíz no pertenece a nadie y no pasa.
create policy "media: ver lo del propio taller"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "media: subir al propio taller"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "media: reemplazar lo del propio taller"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "media: borrar lo del propio taller"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

-- La imagen principal de cada cosa. `product_media` sigue existiendo para la
-- galería de un producto; esto es la que se usa en las listas, que es donde
-- importa que haya exactamente una y siempre la misma.
alter table public.catalog_products add column if not exists image_path text;
alter table public.product_variants add column if not exists image_path text;
alter table public.inventory_items add column if not exists image_path text;

comment on column public.product_variants.image_path is
  'Foto propia de la variante. Cuando es nula se usa la del producto: obligar a una por variante sería pesado, pero el producto terminado puede verse distinto por variante.';
