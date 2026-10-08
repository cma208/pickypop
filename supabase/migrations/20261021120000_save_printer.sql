-- A printer and its asset are saved together, or not at all (T1-07).
--
-- The screen used to update the asset first and the printer second, from the
-- browser. When the printer failed (a power too large for its column, or the
-- network) the asset kept its new cost, the hourly rate of every quote moved,
-- and the screen said nothing had been saved. Here both go in one transaction.
--
-- Only the owner registers or changes printers (ADR-025). The policies would
-- refuse anyway; the check up front says it in words.

create or replace function app.save_printer(
  p_printer_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_model text,
  p_status public.printer_status,
  p_initial_hours numeric,
  p_avg_power_w numeric,
  p_maintenance_budget_per_year numeric,
  p_expected_hours_per_year numeric,
  p_asset_cost numeric,
  p_useful_life_hours numeric
)
returns uuid
language plpgsql
as $$
declare
  v_printer public.printers;
  v_workspace uuid := p_workspace_id;
  v_asset uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := p_printer_id;
begin
  if v_id is not null then
    select * into v_printer from public.printers where id = v_id for update;
    if not found then
      raise exception 'Esa impresora ya no existe: alguien la borró. Recarga la página.';
    end if;
    v_workspace := v_printer.workspace_id;
  end if;

  if v_workspace is null or not app.is_owner(v_workspace) then
    raise exception 'Solo el dueño del taller puede registrar o cambiar las impresoras.';
  end if;

  if v_name = '' then
    raise exception 'Escribe el nombre de la impresora.';
  end if;

  v_asset := v_printer.asset_id;
  if v_asset is null then
    insert into public.assets (workspace_id, name, cost, useful_life_hours)
    values (v_workspace, 'Impresora ' || v_name, coalesce(p_asset_cost, 0), coalesce(p_useful_life_hours, 0))
    returning id into v_asset;
  else
    update public.assets
    set cost = coalesce(p_asset_cost, 0),
        useful_life_hours = coalesce(p_useful_life_hours, 0)
    where id = v_asset;
  end if;

  if v_id is null then
    insert into public.printers (
      workspace_id, asset_id, name, model, status, initial_hours, avg_power_w,
      maintenance_budget_per_year, expected_hours_per_year
    ) values (
      v_workspace, v_asset, v_name, nullif(btrim(p_model), ''), coalesce(p_status, 'active'),
      coalesce(p_initial_hours, 0), coalesce(p_avg_power_w, 0),
      coalesce(p_maintenance_budget_per_year, 0), coalesce(p_expected_hours_per_year, 0)
    )
    returning id into v_id;
  else
    update public.printers
    set asset_id = v_asset,
        name = v_name,
        model = nullif(btrim(p_model), ''),
        status = coalesce(p_status, v_printer.status),
        initial_hours = coalesce(p_initial_hours, 0),
        avg_power_w = coalesce(p_avg_power_w, 0),
        maintenance_budget_per_year = coalesce(p_maintenance_budget_per_year, 0),
        expected_hours_per_year = coalesce(p_expected_hours_per_year, 0)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.save_printer(
  p_printer_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_model text,
  p_status public.printer_status,
  p_initial_hours numeric,
  p_avg_power_w numeric,
  p_maintenance_budget_per_year numeric,
  p_expected_hours_per_year numeric,
  p_asset_cost numeric,
  p_useful_life_hours numeric
)
returns uuid
language sql
volatile
as $$
  select app.save_printer(
    p_printer_id, p_workspace_id, p_name, p_model, p_status, p_initial_hours, p_avg_power_w,
    p_maintenance_budget_per_year, p_expected_hours_per_year, p_asset_cost, p_useful_life_hours
  );
$$;

grant execute on function app.save_printer(
  uuid, uuid, text, text, public.printer_status, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
grant execute on function public.save_printer(
  uuid, uuid, text, text, public.printer_status, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
