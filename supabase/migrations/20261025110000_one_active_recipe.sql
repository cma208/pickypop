-- Una sola receta activa por variante, y crearla en un solo paso (T2-02).
--
-- «Crear receta» leía la versión más alta y después insertaba la siguiente:
-- dos pestañas, o dos clics, leían lo mismo y creaban la 1 y la 2, las dos
-- activas. La pantalla mostraba la 2, la base trabajaba con la 2, y lo que se
-- guardaba en la pestaña que se había quedado con la 1 desaparecía de la
-- vista. La cola, además, ofrecía las placas de las dos.
--
-- Ahora lo decide la base: `create_recipe` bloquea la variante, se niega si ya
-- hay una activa y numera la versión, todo junto. El índice de abajo es la red
-- por si algo la salta.

-- Las variantes que ya tienen más de una activa se quedan con la de versión
-- más alta, que es la que la pantalla muestra y la que usan Armar, la entrega
-- y el plan: para ellos no cambia nada. Las otras se desactivan, no se borran.
do $$
declare
  v_count integer;
begin
  with ranked as (
    select id, row_number() over (partition by variant_id order by version desc) as position
    from public.recipes
    where active
  )
  update public.recipes r
     set active = false
    from ranked
   where ranked.id = r.id
     and ranked.position > 1;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise notice 'Se desactivaron % versiones de receta repetidas: cada variante se queda con la más alta.', v_count;
  end if;
end;
$$;

create unique index recipes_one_active_per_variant
  on public.recipes (variant_id)
  where active;

/*
 * Creates the first recipe of a variant, or the next version when every one
 * it had was switched off. The variant row is the lock, so two tabs creating
 * at once queue up, and the second finds the first one's recipe and says so.
 * The version starts on the workshop's day, not on the server's.
 */
create or replace function app.create_recipe(p_variant_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_workspace uuid;
  v_recipe uuid;
begin
  select workspace_id into v_workspace
  from public.product_variants
  where id = p_variant_id
  for update;

  if v_workspace is null then
    raise exception 'Esa variante ya no existe. Recarga la página.';
  end if;

  if exists (select 1 from public.recipes where variant_id = p_variant_id and active) then
    raise exception 'Esta variante ya tiene receta: se creó hace un momento, quizá en otra pestaña. Recarga la página para verla.';
  end if;

  insert into public.recipes (workspace_id, variant_id, version, valid_from)
  values (
    v_workspace,
    p_variant_id,
    coalesce((select max(version) from public.recipes where variant_id = p_variant_id), 0) + 1,
    app.workspace_day(v_workspace, now())
  )
  returning id into v_recipe;

  return v_recipe;
end;
$$;

grant execute on function app.create_recipe(uuid) to authenticated;

create or replace function public.create_recipe(p_variant_id uuid)
returns uuid
language sql
volatile
as $$
  select app.create_recipe(p_variant_id);
$$;

grant execute on function public.create_recipe(uuid) to authenticated;

comment on function app.create_recipe(uuid) is
  'Crea la receta de una variante (o la versión siguiente, si todas estaban desactivadas). Se niega si ya tiene una activa.';
