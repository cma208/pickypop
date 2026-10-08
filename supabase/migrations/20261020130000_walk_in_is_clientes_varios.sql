-- The walk-in customer is called «Clientes varios» (the owner's decision).
--
-- A sale always has a name. The people who buy on the way past go under one
-- generic customer, and the owner chose the name the workshop already uses
-- for them: «Clientes varios», not «Cliente al paso». The column marks it,
-- not the name (20261019100000_quick_sale), so nothing else changes. The rule
-- stays: what is left owed needs a person, and «Clientes varios» cannot owe.
--
-- A workshop whose walk-in customer still has the old name, as the
-- application wrote it, gets the new one. One the owner renamed keeps the
-- name the owner gave it.

update public.customers
set name = 'Clientes varios'
where walk_in
  and name = 'Cliente al paso';

/*
 * The workshop's walk-in customer, created the first time a sale needs it.
 * Two first sales at once both try to insert: the unique index keeps one, and
 * the other reads it back.
 */
create or replace function app.walk_in_customer(p_workspace_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.customers c
  where c.workspace_id = p_workspace_id and c.walk_in;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.customers (workspace_id, name, walk_in, note)
  values (
    p_workspace_id,
    'Clientes varios',
    true,
    'Las ventas rápidas sin nombre. Lo creó la aplicación con la primera.'
  )
  on conflict (workspace_id) where walk_in do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id
    from public.customers c
    where c.workspace_id = p_workspace_id and c.walk_in;
  end if;

  return v_id;
end;
$$;

comment on column public.customers.walk_in is
  'El cliente de las ventas rápidas sin nombre («Clientes varios»). Uno por taller: lo crea app.walk_in_customer la primera vez. No puede deber: lo que queda por cobrar necesita a una persona.';
