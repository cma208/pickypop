-- Foundation: workspaces, members, access rules and cost parameters.
--
-- Every business table belongs to a workspace and is protected by row level
-- security, so the same database can hold several workshops without them ever
-- seeing each other. See docs/03-modelo-de-datos.md and docs/04-arquitectura.md.

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create type public.member_role as enum ('owner', 'operator', 'viewer');
create type public.tax_regime as enum ('none', 'nrus', 'rer', 'rmt', 'general');
create type public.material_valuation as enum ('weighted_avg', 'last_cost', 'replacement');

-- ---------------------------------------------------------------- workspaces

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  currency char(3) not null default 'PEN',
  timezone text not null default 'America/Lima',
  tax_regime public.tax_regime not null default 'none',
  ruc text check (ruc is null or ruc ~ '^[0-9]{11}$'),
  legal_name text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is 'A workshop. Everything else hangs from here.';

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'operator',
  display_name text,
  -- What an hour of this person's time costs the workshop. Quotes use the
  -- profile rate; finished work can be costed with the rate of whoever did it.
  labor_rate_per_hour numeric(12, 2) check (labor_rate_per_hour is null or labor_rate_per_hour >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

-- ------------------------------------------------------------------- helpers

-- Security definer so that reading memberships inside a policy does not
-- trigger the policy on workspace_members itself.
create or replace function app.is_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = target_workspace
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_owner(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = target_workspace
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

grant execute on function app.is_member(uuid), app.is_owner(uuid) to authenticated;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Applies the standard tenant rules to a table that has a workspace_id column:
-- members read and write, only owners delete.
create or replace function app.apply_workspace_rls(target_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', target_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (app.is_member(workspace_id))',
    target_table || '_select', target_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (app.is_member(workspace_id))',
    target_table || '_insert', target_table);
  execute format(
    'create policy %I on public.%I for update to authenticated using (app.is_member(workspace_id)) with check (app.is_member(workspace_id))',
    target_table || '_update', target_table);
  execute format(
    'create policy %I on public.%I for delete to authenticated using (app.is_owner(workspace_id))',
    target_table || '_delete', target_table);
end;
$$;

create or replace function app.add_updated_at_trigger(target_table text)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
    target_table || '_touch_updated_at', target_table);
end;
$$;

-- Whoever creates a workshop becomes its first owner.
create or replace function app.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, auth.uid(), 'owner');
  end if;
  return new;
end;
$$;

create trigger workspaces_add_creator_as_owner
after insert on public.workspaces
for each row execute function app.add_creator_as_owner();

-- --------------------------------------------------------------- parameters

create table public.cost_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  valid_from date not null default current_date,
  -- Priming and spool leftovers only: the slicer already counts purge.
  material_waste_rate numeric(5, 4) not null default 0.0300
    check (material_waste_rate >= 0 and material_waste_rate < 1),
  failure_rate numeric(5, 4) not null default 0.1000
    check (failure_rate >= 0 and failure_rate < 1),
  labor_rate_per_hour numeric(12, 2) not null check (labor_rate_per_hour >= 0),
  energy_rate_per_kwh numeric(12, 4) not null check (energy_rate_per_kwh >= 0),
  -- Margin over the price, never a markup over the cost.
  target_margin numeric(5, 4) not null check (target_margin >= 0 and target_margin < 1),
  min_order_price numeric(12, 2) not null default 0 check (min_order_price >= 0),
  rounding_step numeric(12, 2) not null default 0.50 check (rounding_step >= 0),
  igv_rate numeric(5, 4) not null default 0.1800 check (igv_rate >= 0 and igv_rate < 1),
  material_valuation public.material_valuation not null default 'weighted_avg',
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, valid_from)
);

comment on table public.cost_profiles is
  'Versioned rates. Quotes keep a frozen copy of the profile they used.';

-- The profile in force on a given date.
create or replace function app.current_cost_profile(target_workspace uuid, on_date date default current_date)
returns public.cost_profiles
language sql
stable
as $$
  select p.*
  from public.cost_profiles p
  where p.workspace_id = target_workspace
    and p.valid_from <= on_date
  order by p.valid_from desc
  limit 1;
$$;

grant execute on function app.current_cost_profile(uuid, date) to authenticated;

-- ------------------------------------------------------------ access rules

alter table public.workspaces enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated using (app.is_member(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated with check (auth.uid() is not null);

create policy workspaces_update on public.workspaces
  for update to authenticated using (app.is_owner(id)) with check (app.is_owner(id));

alter table public.workspace_members enable row level security;

create policy workspace_members_select on public.workspace_members
  for select to authenticated using (app.is_member(workspace_id));

create policy workspace_members_insert on public.workspace_members
  for insert to authenticated with check (app.is_owner(workspace_id));

create policy workspace_members_update on public.workspace_members
  for update to authenticated using (app.is_owner(workspace_id)) with check (app.is_owner(workspace_id));

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated using (app.is_owner(workspace_id));

select app.apply_workspace_rls('cost_profiles');

select app.add_updated_at_trigger('workspaces');
select app.add_updated_at_trigger('workspace_members');
select app.add_updated_at_trigger('cost_profiles');
