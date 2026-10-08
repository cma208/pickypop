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
--
-- With a name that reads like a customer, the rule needs the database's
-- help in two more places, or «Clientes varios» could owe after all:
--
-- * Nobody else can be called that. Typed as the name of a new customer (in
--   the quick sale, in «Nuevo pedido», in Clientes) it would make a second
--   «Clientes varios» without the mark, one that can owe and that nobody
--   knows how to collect from. The walk-in customer's name, and the default
--   one, are refused for anybody else, written in any case or with any accent.
-- * It buys only in the quick sale, which collects everything or refuses.
--   Any other order (one from «Nuevo pedido», a quote accepted) waits to be
--   made, paid or delivered, and needs the person who asked for it. An
--   order of the walk-in customer is refused unless `quick_sale` writes it.
--   Orders that already exist are not judged until someone changes their
--   customer.

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
  'El cliente de las ventas rápidas sin nombre («Clientes varios»). Uno por taller: lo crea app.walk_in_customer la primera vez. No puede deber: solo compra por quick_sale, que con saldo pide a una persona (app.walk_in_buys_on_the_spot), y ningún otro cliente puede llevar su nombre (app.walk_in_name_is_taken).';

-- ------------------------------------------------------- nobody else's name

/*
 * A name as a person reads it: no accents, no case, single spaces. «clientes
 * VARIOS» and «Clientes  varios» are the same name. `nameKey` in the quick
 * sale's screen compares names the same way.
 */
create or replace function app.name_key(p_name text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(translate(
    p_name,
    'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
    'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'
  )), '\s+', ' ', 'g')), '');
$$;

grant execute on function app.name_key(text) to authenticated;

/*
 * Whether a name is the walk-in customer's: the name it has in the workshop,
 * or the one it is created with. Typed for anybody else, it is the walk-in.
 */
create or replace function app.is_walk_in_name(p_workspace_id uuid, p_name text)
returns boolean
language sql
stable
as $$
  select coalesce(app.name_key(p_name) = any (array[
    app.name_key((
      select c.name from public.customers c
      where c.workspace_id = p_workspace_id and c.walk_in
    )),
    app.name_key('Clientes varios')
  ]), false);
$$;

grant execute on function app.is_walk_in_name(uuid, text) to authenticated;

create or replace function app.walk_in_name_is_taken()
returns trigger
language plpgsql
as $$
begin
  if new.walk_in then
    return new;
  end if;
  -- A customer that already had the name keeps it: edited for its phone, it
  -- is not refused for a name nobody is changing.
  if tg_op = 'UPDATE'
     and new.name is not distinct from old.name
     and new.walk_in is not distinct from old.walk_in then
    return new;
  end if;

  if app.is_walk_in_name(new.workspace_id, new.name) then
    raise exception '«%» es el cliente de las ventas al paso, y no puede haber otro: a su nombre no se le puede cobrar a nadie. Escribe el nombre de la persona.',
      btrim(new.name);
  end if;
  return new;
end;
$$;

create trigger customers_walk_in_name_is_taken
  before insert or update of name, walk_in on public.customers
  for each row execute function app.walk_in_name_is_taken();

-- ------------------------------------------------- it buys on the spot only

create or replace function app.walk_in_buys_on_the_spot()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  if new.customer_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;

  select c.name into v_name
  from public.customers c
  where c.id = new.customer_id and c.walk_in;

  -- `quick_sale` says it is writing, for this transaction only. PostgREST
  -- cannot set it: it only reaches functions of the public schema.
  if v_name is not null and coalesce(current_setting('app.quick_sale', true), '') <> 'on' then
    raise exception '«%» es el cliente de las ventas rápidas, que se cobran en el acto. Un pedido necesita a la persona que lo pide: elígela o créala con su nombre.',
      v_name;
  end if;
  return new;
end;
$$;

create trigger orders_walk_in_buys_on_the_spot
  before insert or update of customer_id on public.orders
  for each row execute function app.walk_in_buys_on_the_spot();
