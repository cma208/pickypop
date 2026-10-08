-- Reasonable ranges for the schedule, and printer records that cannot happen
-- in the future (T1-18, T1-20).
--
-- The screens check these with a message next to the field. This is the net
-- for a stale tab or a direct call: a changeover of 99,999,999,999 minutes
-- used to reach the database and come back as "No pudimos guardar el horario".
--
-- The checks go in NOT VALID and are validated afterwards: if production holds
-- an odd value the migration still runs, the value stays, and only new writes
-- are held to the range.

alter table public.workshop_settings
  add constraint workshop_settings_changeover_fits_a_day
    check (changeover_default_minutes <= 1440) not valid,
  add constraint workshop_settings_hold_days_reasonable
    check (hold_default_days <= 30) not valid;

do $$
begin
  alter table public.workshop_settings validate constraint workshop_settings_changeover_fits_a_day;
exception when check_violation then
  raise notice 'workshop_settings: hay un cambio de placa de más de 24 h; se conserva, y el próximo guardado pedirá corregirlo';
end;
$$;

do $$
begin
  alter table public.workshop_settings validate constraint workshop_settings_hold_days_reasonable;
exception when check_violation then
  raise notice 'workshop_settings: hay un separo por defecto de más de 30 días; se conserva, y el próximo guardado pedirá corregirlo';
end;
$$;

-- Maintenance, incidents and installed parts record what already happened.
-- A few minutes of slack cover a browser clock that runs ahead.
create or replace function app.printer_record_not_in_future()
returns trigger
language plpgsql
as $$
declare
  v_now timestamptz := now() + interval '5 minutes';
  v_today date := app.workspace_day(new.workspace_id, now());
begin
  -- One branch per table: each one names columns only its table has.
  if tg_table_name = 'maintenance_logs' then
    if new.performed_at > v_now then
      raise exception 'El mantenimiento no puede tener una fecha futura: se registra lo que ya se hizo.';
    end if;
  elsif tg_table_name = 'incidents' then
    if new.occurred_at > v_now or new.resolved_at > v_now then
      raise exception 'Un incidente no puede ocurrir ni resolverse en el futuro: se registra lo que ya pasó.';
    end if;
  elsif tg_table_name = 'printer_components' then
    if new.installed_on > v_today or new.retired_on > v_today then
      raise exception 'Un componente no puede instalarse ni retirarse en una fecha futura.';
    end if;
  end if;
  return new;
end;
$$;

create trigger maintenance_logs_not_in_future
  before insert or update of performed_at on public.maintenance_logs
  for each row execute function app.printer_record_not_in_future();

create trigger incidents_not_in_future
  before insert or update of occurred_at, resolved_at on public.incidents
  for each row execute function app.printer_record_not_in_future();

create trigger printer_components_not_in_future
  before insert or update of installed_on, retired_on on public.printer_components
  for each row execute function app.printer_record_not_in_future();
