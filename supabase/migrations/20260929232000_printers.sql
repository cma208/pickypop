-- Printers, assets and maintenance.
--
-- The platform never talks to a printer: its hours come from the jobs that are
-- recorded, plus an initial reading for machines that were already in use.

create type public.printer_status as enum ('active', 'maintenance', 'retired');
create type public.component_kind as enum ('nozzle', 'hotend', 'plate', 'ptfe', 'cutter', 'fan', 'ams', 'other');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  acquired_on date,
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  -- Hours the investment is spread over. 0 means "do not depreciate".
  useful_life_hours numeric(10, 2) not null default 0 check (useful_life_hours >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.printers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  model text,
  serial text,
  -- Average consumption while printing. Measure it; the Bambu wiki gives 57 W
  -- for the A1 mini with PLA.
  avg_power_w numeric(8, 2) not null default 0 check (avg_power_w >= 0),
  -- Hours already on the machine before it was registered here.
  initial_hours numeric(10, 2) not null default 0 check (initial_hours >= 0),
  maintenance_budget_per_year numeric(12, 2) not null default 0 check (maintenance_budget_per_year >= 0),
  expected_hours_per_year numeric(10, 2) not null default 0 check (expected_hours_per_year >= 0),
  status public.printer_status not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.printer_components (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  kind public.component_kind not null,
  description text,
  installed_on date not null default current_date,
  -- Printer hours when it was installed, to measure how long it lasted.
  hours_at_install numeric(10, 2) not null default 0 check (hours_at_install >= 0),
  retired_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index printer_components_printer_idx on public.printer_components (printer_id, retired_on);

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  task text not null check (length(btrim(task)) > 0),
  -- Whichever comes first. Leave a trigger null to ignore it.
  every_hours numeric(10, 2) check (every_hours is null or every_hours > 0),
  every_days integer check (every_days is null or every_days > 0),
  checklist jsonb not null default '[]'::jsonb,
  expected_parts jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_plans_needs_a_trigger check (
    every_hours is not null or every_days is not null
  )
);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  plan_id uuid references public.maintenance_plans (id) on delete set null,
  performed_at timestamptz not null default now(),
  -- Printer hours at that moment, so the next due date can be computed.
  printer_hours_at numeric(10, 2) not null default 0 check (printer_hours_at >= 0),
  duration_min integer check (duration_min is null or duration_min >= 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  performed_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_logs_printer_idx on public.maintenance_logs (printer_id, performed_at desc);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  -- Filled in once print jobs exist, in a later migration.
  print_job_id uuid,
  occurred_at timestamptz not null default now(),
  symptom text not null check (length(btrim(symptom)) > 0),
  cause text,
  fix text,
  downtime_min integer check (downtime_min is null or downtime_min >= 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What one hour of this machine costs: depreciation plus maintenance budget.
create view public.printer_machine_rates with (security_invoker = true) as
select
  p.id as printer_id,
  p.workspace_id,
  case
    when a.useful_life_hours > 0 then round(a.cost / a.useful_life_hours, 4)
    else 0
  end as depreciation_per_hour,
  case
    when p.expected_hours_per_year > 0
      then round(p.maintenance_budget_per_year / p.expected_hours_per_year, 4)
    else 0
  end as maintenance_per_hour,
  case
    when a.useful_life_hours > 0 then round(a.cost / a.useful_life_hours, 4)
    else 0
  end
  + case
      when p.expected_hours_per_year > 0
        then round(p.maintenance_budget_per_year / p.expected_hours_per_year, 4)
      else 0
    end as machine_rate_per_hour
from public.printers p
left join public.assets a on a.id = p.asset_id;

select app.apply_workspace_rls('assets');
select app.apply_workspace_rls('printers');
select app.apply_workspace_rls('printer_components');
select app.apply_workspace_rls('maintenance_plans');
select app.apply_workspace_rls('maintenance_logs');
select app.apply_workspace_rls('incidents');

select app.add_updated_at_trigger('assets');
select app.add_updated_at_trigger('printers');
select app.add_updated_at_trigger('printer_components');
select app.add_updated_at_trigger('maintenance_plans');
select app.add_updated_at_trigger('maintenance_logs');
select app.add_updated_at_trigger('incidents');
