-- A scheduled version of the cost parameters can be corrected or removed;
-- one that is already in force cannot (T1-14, ADR-006).
--
-- A typo in a version scheduled for tomorrow (S/ 150 an hour instead of 15)
-- could only be covered by yet another version, and would rule at least one
-- day: every quote of that day freezes it. Until its day comes nothing has
-- used it, so the owner may fix it or take it back. From its first day on it
-- is history: quotes, assemblies and deliveries were priced with it.
--
-- "Today" is the workshop's day, not the server's: after 19:00 in Lima the
-- server already lives in tomorrow, and a version scheduled for tomorrow would
-- look as if it were in force.
--
-- Only the owner writes cost_profiles at all (20261021100000_permissions).

create or replace function app.cost_profile_versions_stay_put()
returns trigger
language plpgsql
as $$
declare
  v_today date;
begin
  -- Without a signed-in user the caller is trusted: a migration, the seed, the
  -- SQL console setting up a workshop's history.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_today := app.workspace_day(coalesce(new.workspace_id, old.workspace_id), now());

  if tg_op in ('UPDATE', 'DELETE') and old.valid_from <= v_today then
    raise exception 'La versión vigente desde el % ya se usó para cotizar y costear: no se cambia ni se quita. Para cambiar un valor, crea una versión nueva con su fecha.',
      to_char(old.valid_from, 'DD/MM/YYYY');
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.valid_from < v_today then
    raise exception 'Una versión de los parámetros no puede empezar antes de hoy (%): cambiaría el costo de lo que ya pasó.',
      to_char(v_today, 'DD/MM/YYYY');
  end if;

  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception 'Una versión de los parámetros no cambia de taller.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger cost_profiles_versions_stay_put
  before insert or update or delete on public.cost_profiles
  for each row execute function app.cost_profile_versions_stay_put();

-- The profile in force on a given day. Without a day it is the workshop's
-- today, for the reason above; every caller today passes one.
create or replace function app.current_cost_profile(target_workspace uuid, on_date date default null)
returns public.cost_profiles
language sql
stable
as $$
  select p.*
  from public.cost_profiles p
  where p.workspace_id = target_workspace
    and p.valid_from <= coalesce(on_date, app.workspace_day(target_workspace, now()))
  order by p.valid_from desc
  limit 1;
$$;
