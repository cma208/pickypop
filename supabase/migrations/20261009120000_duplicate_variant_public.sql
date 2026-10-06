-- PostgREST solo ve `public`, así que la función tiene que asomarse por ahí
-- para que el cliente tipado la encuentre. El trabajo sigue viviendo en `app`,
-- como `assemble_product` y `complete_print_job`.
create or replace function public.duplicate_variant(p_variant_id uuid, p_name text)
returns uuid
language sql
as $$
  select app.duplicate_variant(p_variant_id, p_name);
$$;

grant execute on function public.duplicate_variant(uuid, text) to authenticated;
