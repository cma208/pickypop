-- Names that only differ in capitals or surrounding spaces are the same name
-- (T1-11).
--
-- The unique keys compared text as written, so «Instagram» and «instagram»,
-- «Efectivo» and «efectivo», or two PLA «Negro» and «negro» could live side by
-- side. With the filament it is worse than a duplicate in a list: the stock is
-- split between the two and neither shows what is on the shelf.
--
-- The old keys stay: a name written exactly the same still hits them first,
-- and friendlyError knows both names. bootstrap.sql names no key in its
-- "on conflict", so a twin in other capitals is skipped there too instead of
-- stopping the whole script.
--
-- Production may already hold such twins. Nothing is merged or deleted, since
-- a duplicated account or filament already has movements of its own: the
-- older one keeps its name and the newer ones get « (2)», « (3)»... so the
-- index can be built, and the owner sees them in the list to sort out. Each
-- rename is reported as a notice.

create or replace function app.rename_case_twins(
  p_table text,
  p_column text,
  p_partition text,
  p_where text default 'true'
)
returns void
language plpgsql
as $$
declare
  v_twin record;
  v_candidate text;
  v_taken boolean;
  v_suffix integer;
begin
  for v_twin in execute format(
    'select id, workspace_id, %1$I as label
     from (
       select id, workspace_id, %1$I,
              row_number() over (partition by %2$s, lower(btrim(%1$I)) order by created_at, id) as position
       from public.%3$I
       where %4$s
     ) ranked
     where position > 1
     order by workspace_id, lower(btrim(%1$I)), position',
    p_column, p_partition, p_table, p_where)
  loop
    v_suffix := 2;
    loop
      v_candidate := btrim(v_twin.label) || ' (' || v_suffix || ')';
      execute format(
        'select exists (select 1 from public.%I where workspace_id = $1 and lower(btrim(%I)) = lower($2))',
        p_table, p_column)
      into v_taken
      using v_twin.workspace_id, v_candidate;
      exit when not v_taken;
      v_suffix := v_suffix + 1;
    end loop;

    execute format('update public.%I set %I = $1 where id = $2', p_table, p_column)
    using v_candidate, v_twin.id;
    raise notice '%: «%» se renombró a «%» para no repetir un nombre que solo cambia en mayúsculas',
      p_table, v_twin.label, v_candidate;
  end loop;
end;
$$;

select app.rename_case_twins('sales_channels', 'name', 'workspace_id');
select app.rename_case_twins('accounts', 'name', 'workspace_id');
select app.rename_case_twins('transaction_categories', 'name', 'workspace_id, direction');
select app.rename_case_twins('gift_categories', 'name', 'workspace_id');
select app.rename_case_twins('brands', 'name', 'workspace_id');
select app.rename_case_twins('materials', 'code', 'workspace_id');
select app.rename_case_twins('filament_finishes', 'name', 'workspace_id');
select app.rename_case_twins('printers', 'name', 'workspace_id');
-- A finished good is named by the system after its product and variant, and
-- it is that variant, not its name, that identifies it.
select app.rename_case_twins('inventory_items', 'name', 'workspace_id, kind', 'kind <> ''finished_good''');
select app.rename_case_twins(
  'filament_skus', 'color_name',
  'workspace_id, brand_id, material_id, finish_id, net_weight_g, diameter_mm'
);

drop function app.rename_case_twins(text, text, text, text);

create unique index sales_channels_name_ci_key
  on public.sales_channels (workspace_id, lower(btrim(name)));
create unique index accounts_name_ci_key
  on public.accounts (workspace_id, lower(btrim(name)));
create unique index transaction_categories_name_ci_key
  on public.transaction_categories (workspace_id, direction, lower(btrim(name)));
create unique index gift_categories_name_ci_key
  on public.gift_categories (workspace_id, lower(btrim(name)));
create unique index brands_name_ci_key
  on public.brands (workspace_id, lower(btrim(name)));
create unique index materials_code_ci_key
  on public.materials (workspace_id, lower(btrim(code)));
create unique index filament_finishes_name_ci_key
  on public.filament_finishes (workspace_id, lower(btrim(name)));
create unique index printers_name_ci_key
  on public.printers (workspace_id, lower(btrim(name)));
create unique index inventory_items_name_ci_key
  on public.inventory_items (workspace_id, kind, lower(btrim(name)))
  where kind <> 'finished_good';
create unique index filament_skus_identity_ci_key
  on public.filament_skus (workspace_id, brand_id, material_id, finish_id, lower(btrim(color_name)), net_weight_g, diameter_mm)
  nulls not distinct;
