-- Sales and production: customers, quotes, orders and print jobs.
--
-- An order always has a purpose: a sale, something for the workshop itself, or
-- a gift. The three are produced the same way and cost the same; what changes
-- is whether there is a price and how the money is treated.
--
-- Closing a print job is what moves the stock, and it happens in one
-- transaction through app.complete_print_job.

create type public.customer_kind as enum ('person', 'company');
create type public.customer_doc_type as enum ('none', 'dni', 'ruc', 'ce');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.quote_line_kind as enum ('catalog', 'custom', 'service');
create type public.request_status as enum ('new', 'awaiting_slicing', 'quoted', 'discarded');
create type public.order_purpose as enum ('sale', 'personal', 'gift');
create type public.order_status as enum (
  'confirmed', 'queued', 'printing', 'post_processing', 'ready', 'delivered', 'closed',
  'on_hold', 'cancelled'
);
create type public.gift_treatment as enum ('marketing', 'owner_draw', 'other');
create type public.print_job_status as enum ('planned', 'printing', 'success', 'failed', 'cancelled');
create type public.print_failure_cause as enum (
  'adhesion', 'clog', 'spaghetti', 'layer_shift', 'filament_runout', 'power_loss',
  'wrong_settings', 'other'
);

-- --------------------------------------------------------- numbering

create table public.document_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  doc_kind text not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (workspace_id, doc_kind, year)
);

-- Gives out COT-2026-0001, ORD-2026-0001... one series per workshop and year.
create or replace function app.next_document_number(p_workspace uuid, p_doc_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
  v_prefix text;
begin
  if not app.is_member(p_workspace) then
    raise exception 'not a member of workspace %', p_workspace using errcode = 'insufficient_privilege';
  end if;

  insert into public.document_counters as c (workspace_id, doc_kind, year, last_number)
  values (p_workspace, p_doc_kind, v_year, 1)
  on conflict (workspace_id, doc_kind, year)
  do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  v_prefix := case p_doc_kind
                when 'quote' then 'COT'
                when 'order' then 'ORD'
                else upper(left(p_doc_kind, 3))
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_number::text, 4, '0'));
end;
$$;

grant execute on function app.next_document_number(uuid, text) to authenticated;

-- --------------------------------------------------------- customers

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.customer_kind not null default 'person',
  name text not null check (length(btrim(name)) > 0),
  doc_type public.customer_doc_type not null default 'none',
  doc_number text,
  phone text,
  email text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_doc_number_needed check (doc_type = 'none' or doc_number is not null),
  constraint customers_ruc_format check (doc_type <> 'ruc' or doc_number ~ '^[0-9]{11}$'),
  constraint customers_dni_format check (doc_type <> 'dni' or doc_number ~ '^[0-9]{8}$')
);

create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  commission_rate numeric(5, 4) not null default 0
    check (commission_rate >= 0 and commission_rate < 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.gift_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  treatment public.gift_treatment not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Something a customer asked for that still needs a human to slice it.
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id uuid references public.sales_channels (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  contact text,
  description text not null check (length(btrim(description)) > 0),
  attachments jsonb not null default '[]'::jsonb,
  status public.request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ quotes

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number text not null,
  version integer not null default 1 check (version > 0),
  parent_quote_id uuid references public.quotes (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  channel_id uuid references public.sales_channels (id) on delete set null,
  request_id uuid references public.quote_requests (id) on delete set null,
  status public.quote_status not null default 'draft',
  issued_on date not null default current_date,
  valid_until date,
  -- Frozen copy of the parameters used, so an old quote never changes.
  cost_profile_snapshot jsonb not null default '{}'::jsonb,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  igv numeric(12, 2) not null default 0 check (igv >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, number, version),
  constraint quotes_validity check (valid_until is null or valid_until >= issued_on)
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null default 1 check (position > 0),
  kind public.quote_line_kind not null default 'catalog',
  variant_id uuid references public.product_variants (id) on delete set null,
  description text not null check (length(btrim(description)) > 0),
  quantity integer not null check (quantity > 0),
  -- What the calculator produced, kept for the record.
  plates jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  setup_minutes numeric(8, 2) not null default 0 check (setup_minutes >= 0),
  minutes_per_unit numeric(8, 2) not null default 0 check (minutes_per_unit >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, position)
);

-- ------------------------------------------------------------ orders

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number text not null,
  purpose public.order_purpose not null default 'sale',
  gift_category_id uuid references public.gift_categories (id) on delete set null,
  recipient text,
  customer_id uuid references public.customers (id) on delete set null,
  channel_id uuid references public.sales_channels (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  status public.order_status not null default 'confirmed',
  ordered_on date not null default current_date,
  due_date date,
  total numeric(12, 2) not null default 0 check (total >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, number),
  -- A sale needs someone to sell to; a gift or own use does not.
  constraint orders_sale_needs_customer check (purpose <> 'sale' or customer_id is not null),
  constraint orders_gift_needs_category check (purpose <> 'gift' or gift_category_id is not null),
  -- Nothing that is not a sale can carry a price.
  constraint orders_only_sales_have_total check (purpose = 'sale' or total = 0)
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  position integer not null default 1 check (position > 0),
  variant_id uuid references public.product_variants (id) on delete set null,
  quote_line_id uuid references public.quote_lines (id) on delete set null,
  description text not null check (length(btrim(description)) > 0),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  -- What the calculator expected this to cost, to compare against reality.
  estimated_unit_cost numeric(12, 2) not null default 0 check (estimated_unit_cost >= 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, position)
);

-- -------------------------------------------------------- production

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete restrict,
  order_line_id uuid references public.order_lines (id) on delete set null,
  recipe_plate_id uuid references public.recipe_plates (id) on delete set null,
  label text,
  status public.print_job_status not null default 'planned',
  started_at timestamptz,
  finished_at timestamptz,
  -- The slicer's estimate, and what it really took.
  estimated_time_s integer check (estimated_time_s is null or estimated_time_s > 0),
  actual_time_s integer check (actual_time_s is null or actual_time_s > 0),
  units_produced numeric(10, 3) not null default 0 check (units_produced >= 0),
  failure_cause public.print_failure_cause,
  percent_complete numeric(5, 2) check (percent_complete is null or (percent_complete >= 0 and percent_complete <= 100)),
  slicer_metadata jsonb not null default '{}'::jsonb,
  -- Costs frozen when the job closes.
  material_cost numeric(12, 2),
  energy_cost numeric(12, 2),
  machine_cost numeric(12, 2),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint print_jobs_failure_needs_cause check (status <> 'failed' or failure_cause is not null),
  constraint print_jobs_finished_after_start check (
    finished_at is null or started_at is null or finished_at >= started_at
  )
);

create index print_jobs_printer_idx on public.print_jobs (printer_id, started_at desc);
create index print_jobs_order_line_idx on public.print_jobs (order_line_id);

create table public.print_job_filaments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  print_job_id uuid not null references public.print_jobs (id) on delete cascade,
  spool_id uuid not null references public.spools (id) on delete restrict,
  slot integer check (slot is null or slot > 0),
  estimated_g numeric(10, 2) not null default 0 check (estimated_g >= 0),
  actual_g numeric(10, 2) check (actual_g is null or actual_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (print_job_id, spool_id)
);

-- Incidents can now point at the job that went wrong.
alter table public.incidents
  add constraint incidents_print_job_fkey
  foreign key (print_job_id) references public.print_jobs (id) on delete set null;

-- --------------------------------------------------- closing a job

/*
 * Closes a print job and moves the stock in one transaction: a successful job
 * consumes filament, a failed one wastes it. Runs as the caller, so the usual
 * access rules apply.
 *
 * p_filament_usage looks like:
 *   [{"spool_id": "...", "actual_g": 5.69}, ...]
 */
create or replace function app.complete_print_job(
  p_job_id uuid,
  p_result public.print_job_status,
  p_actual_time_s integer default null,
  p_filament_usage jsonb default '[]'::jsonb,
  p_failure_cause public.print_failure_cause default null,
  p_material_cost numeric default null,
  p_energy_cost numeric default null,
  p_machine_cost numeric default null
)
returns public.print_jobs
language plpgsql
as $$
declare
  v_job public.print_jobs;
  v_usage jsonb;
  v_spool uuid;
  v_grams numeric;
  v_movement public.stock_movement_type;
begin
  if p_result not in ('success', 'failed', 'cancelled') then
    raise exception 'a job can only be closed as success, failed or cancelled';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'print job % not found', p_job_id;
  end if;
  if v_job.status in ('success', 'failed', 'cancelled') then
    raise exception 'print job % is already closed', p_job_id;
  end if;
  if p_result = 'failed' and p_failure_cause is null then
    raise exception 'a failed job needs a cause';
  end if;

  v_movement := case p_result when 'success' then 'consumption' else 'waste' end;

  for v_usage in select value from jsonb_array_elements(p_filament_usage) loop
    v_spool := (v_usage ->> 'spool_id')::uuid;
    v_grams := (v_usage ->> 'actual_g')::numeric;

    update public.print_job_filaments
       set actual_g = v_grams
     where print_job_id = p_job_id and spool_id = v_spool;

    -- A cancelled job that never printed does not move anything.
    if p_result <> 'cancelled' and coalesce(v_grams, 0) > 0 then
      insert into public.stock_movements (
        workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
      )
      select v_job.workspace_id, v_movement, s.id, -v_grams, s.cost_per_gram, 'print_job', p_job_id,
             case when p_result = 'success' then 'Consumo de impresión'
                  else 'Merma por impresión fallida' end
      from public.spools s
      where s.id = v_spool;
    end if;
  end loop;

  update public.print_jobs
     set status = p_result,
         finished_at = coalesce(finished_at, now()),
         actual_time_s = coalesce(p_actual_time_s, actual_time_s),
         failure_cause = coalesce(p_failure_cause, failure_cause),
         material_cost = coalesce(p_material_cost, material_cost),
         energy_cost = coalesce(p_energy_cost, energy_cost),
         machine_cost = coalesce(p_machine_cost, machine_cost)
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

grant execute on function app.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause, numeric, numeric, numeric
) to authenticated;

-- ------------------------------------------------------------- views

create view public.order_production_summary with (security_invoker = true) as
select
  o.id as order_id,
  o.workspace_id,
  o.number,
  o.purpose,
  o.status,
  count(j.id) as jobs,
  count(j.id) filter (where j.status = 'success') as successful_jobs,
  count(j.id) filter (where j.status = 'failed') as failed_jobs,
  round(coalesce(sum(j.actual_time_s) filter (where j.status = 'success'), 0) / 3600.0, 2) as printed_hours,
  coalesce(sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0)), 0)
    as real_production_cost,
  coalesce(sum(l.estimated_unit_cost * l.quantity), 0) as estimated_cost,
  o.total as sold_for
from public.orders o
left join public.order_lines l on l.order_id = o.id
left join public.print_jobs j on j.order_line_id = l.id
group by o.id;

comment on view public.order_production_summary is
  'Estimated against real, per order: the loop that recalibrates the calculator.';

-- How often things fail, and why. Feeds the failure rate in the parameters.
create view public.failure_stats with (security_invoker = true) as
select
  workspace_id,
  printer_id,
  count(*) filter (where status in ('success', 'failed')) as closed_jobs,
  count(*) filter (where status = 'failed') as failed_jobs,
  case
    when count(*) filter (where status in ('success', 'failed')) > 0
      then round(
        count(*) filter (where status = 'failed')::numeric
        / count(*) filter (where status in ('success', 'failed')), 4)
  end as failure_rate,
  mode() within group (order by failure_cause) filter (where status = 'failed') as most_common_cause
from public.print_jobs
group by workspace_id, printer_id;

select app.apply_workspace_rls('customers');
select app.apply_workspace_rls('sales_channels');
select app.apply_workspace_rls('gift_categories');
select app.apply_workspace_rls('quote_requests');
select app.apply_workspace_rls('quotes');
select app.apply_workspace_rls('quote_lines');
select app.apply_workspace_rls('orders');
select app.apply_workspace_rls('order_lines');
select app.apply_workspace_rls('print_jobs');
select app.apply_workspace_rls('print_job_filaments');

alter table public.document_counters enable row level security;
create policy document_counters_select on public.document_counters
  for select to authenticated using (app.is_member(workspace_id));

select app.add_updated_at_trigger('customers');
select app.add_updated_at_trigger('sales_channels');
select app.add_updated_at_trigger('gift_categories');
select app.add_updated_at_trigger('quote_requests');
select app.add_updated_at_trigger('quotes');
select app.add_updated_at_trigger('quote_lines');
select app.add_updated_at_trigger('orders');
select app.add_updated_at_trigger('order_lines');
select app.add_updated_at_trigger('print_jobs');
select app.add_updated_at_trigger('print_job_filaments');
