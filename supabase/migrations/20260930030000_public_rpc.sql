-- The browser can only reach the "public" schema, and "app" stays internal on
-- purpose: it holds the helpers that policies depend on. These thin wrappers
-- expose just what the app needs to call, nothing else.

create or replace function public.next_document_number(p_workspace uuid, p_doc_kind text)
returns text
language sql
volatile
as $$
  select app.next_document_number(p_workspace, p_doc_kind);
$$;

create or replace function public.price_for_quantity(
  p_variant uuid,
  p_quantity integer,
  p_on_date date default current_date
)
returns numeric
language sql
stable
as $$
  select app.price_for_quantity(p_variant, p_quantity, p_on_date);
$$;

create or replace function public.complete_print_job(
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
language sql
volatile
as $$
  select app.complete_print_job(
    p_job_id, p_result, p_actual_time_s, p_filament_usage,
    p_failure_cause, p_material_cost, p_energy_cost, p_machine_cost
  );
$$;

grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.price_for_quantity(uuid, integer, date) to authenticated;
grant execute on function public.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause, numeric, numeric, numeric
) to authenticated;
