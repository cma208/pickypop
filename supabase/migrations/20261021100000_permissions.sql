-- Permissions and immutability (ADR-025, the owner's decision of 2026-10-08).
--
-- Until now any member wrote almost everywhere and the owner could also
-- delete, so "solo el dueño" lived in a few hidden buttons. The rule now lives
-- here, table by table:
--
-- * the operator runs the day to day: produce, assemble and count the shelf,
--   buy, sell, collect, and keep the catalogue;
-- * only the owner changes the configuration: cost parameters, schedule and
--   workshop data, sales channels, accounts and their openings, money and gift
--   categories, members, and printers with their assets, parts and plans;
-- * a "Solo lectura" member only reads, as the members screen promises;
-- * nobody, not even the owner, edits or deletes a money movement, a stock
--   movement or a delivery through the API. Money is voided; stock is
--   corrected with another movement (a weighing or a shelf count).
--
-- The functions that write those ledgers (record_payment, deliver_order,
-- complete_print_job, count_shelf...) keep working: they only insert.

-- ------------------------------------------------------------ who operates

-- Owner or operator: whoever may write the day to day. A viewer is a member
-- and reads, but this says no.
create or replace function app.can_operate(target_workspace uuid)
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
      and m.role in ('owner', 'operator')
  );
$$;

grant execute on function app.can_operate(uuid) to authenticated;

-- ------------------------------------------------------- the three shapes

create or replace function app.drop_workspace_policies(target_table text)
returns void
language plpgsql
as $$
declare
  v_command text;
begin
  foreach v_command in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', target_table || '_' || v_command, target_table);
  end loop;
end;
$$;

-- The day to day. Any member reads; owner and operator write; only the owner
-- deletes. An update sees the row as a member and demands an operator for the
-- row it writes: a viewer gets a clear error instead of a change that silently
-- touched nothing, and an operator can still lock a row it will not change
-- (select ... for update needs the update policy to see the row).
create or replace function app.apply_workspace_rls(target_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', target_table);
  perform app.drop_workspace_policies(target_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (app.is_member(workspace_id))',
    target_table || '_select', target_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (app.can_operate(workspace_id))',
    target_table || '_insert', target_table);
  execute format(
    'create policy %I on public.%I for update to authenticated using (app.is_member(workspace_id)) with check (app.can_operate(workspace_id))',
    target_table || '_update', target_table);
  execute format(
    'create policy %I on public.%I for delete to authenticated using (app.is_owner(workspace_id))',
    target_table || '_delete', target_table);
end;
$$;

-- Configuration: every member sees it, only the owner changes it. Same trick
-- on update, so an operator who tries gets an error and not silence.
create or replace function app.apply_owner_rls(target_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', target_table);
  perform app.drop_workspace_policies(target_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (app.is_member(workspace_id))',
    target_table || '_select', target_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (app.is_owner(workspace_id))',
    target_table || '_insert', target_table);
  execute format(
    'create policy %I on public.%I for update to authenticated using (app.is_member(workspace_id)) with check (app.is_owner(workspace_id))',
    target_table || '_update', target_table);
  execute format(
    'create policy %I on public.%I for delete to authenticated using (app.is_owner(workspace_id))',
    target_table || '_delete', target_table);
end;
$$;

-- A ledger: read and appended to, never changed. Without the privilege the
-- API answers "permission denied" out loud; a missing policy alone would let
-- an update succeed on zero rows and the screen believe it.
create or replace function app.apply_ledger_rls(target_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', target_table);
  perform app.drop_workspace_policies(target_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (app.is_member(workspace_id))',
    target_table || '_select', target_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (app.can_operate(workspace_id))',
    target_table || '_insert', target_table);
  execute format('revoke update, delete, truncate on public.%I from anon, authenticated, service_role', target_table);
end;
$$;

-- ------------------------------------------------------- the owner's matrix

do $$
declare
  v_owner constant text[] := array[
    'accounts', 'assets', 'cost_profiles', 'gift_categories', 'maintenance_plans',
    'printer_components', 'printers', 'sales_channels', 'transaction_categories', 'workshop_settings'
  ];
  v_ledgers constant text[] := array['order_deliveries', 'order_delivery_lines', 'stock_movements', 'transactions'];
  v_table text;
begin
  foreach v_table in array v_owner loop
    perform app.apply_owner_rls(v_table);
  end loop;

  foreach v_table in array v_ledgers loop
    perform app.apply_ledger_rls(v_table);
  end loop;

  -- Everything else that got the standard rules is the day to day. The
  -- workshop and its members have rules of their own, already owner-only.
  for v_table in
    select p.tablename
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname = p.tablename || '_insert'
      and p.tablename <> all (v_owner || v_ledgers || array['workspaces', 'workspace_members'])
    order by p.tablename
  loop
    perform app.apply_workspace_rls(v_table);
  end loop;
end;
$$;

-- The photos follow the catalogue: a viewer looks at them and that is all.
alter policy "media: subir al propio taller" on storage.objects
  with check (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.can_operate(((storage.foldername(name))[1])::uuid)
  );

alter policy "media: reemplazar lo del propio taller" on storage.objects
  using (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.is_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.can_operate(((storage.foldername(name))[1])::uuid)
  );

alter policy "media: borrar lo del propio taller" on storage.objects
  using (
    bucket_id = 'media'
    and array_length(storage.foldername(name), 1) >= 1
    and app.can_operate(((storage.foldername(name))[1])::uuid)
  );

-- ------------------------------------------------- stock movements stay put

-- Revoking the privilege stops the API. This also stops the back door: a
-- spool or an item deleted by the owner used to take its movements with it
-- (on delete cascade), and the balance with them. Without a signed-in user
-- the caller is trusted: a migration, the SQL console, or a whole test
-- workshop being removed.
create or replace function app.stock_movement_is_permanent()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  raise exception 'Un movimiento de stock ya registrado no se cambia ni se borra, y tampoco lo que lo tiene (un rollo o un artículo con historial): el saldo sale de esos movimientos. Para corregir el stock registra otro movimiento, un pesaje del rollo o un conteo del estante; lo que ya no se usa se desactiva.';
end;
$$;

create trigger stock_movements_are_permanent
  before update or delete on public.stock_movements
  for each row execute function app.stock_movement_is_permanent();

-- ------------------------------------------------------- always an owner

-- The members screen already refused this; now the database does too, so a
-- stale tab or a direct call cannot leave a workshop that nobody configures.
create or replace function app.workshop_keeps_an_owner()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null
     or old.role <> 'owner'
     or (tg_op = 'UPDATE' and new.role = 'owner' and new.workspace_id = old.workspace_id) then
    return coalesce(new, old);
  end if;

  -- Two owners demoting each other at the same time would both see the other.
  perform 1 from public.workspaces w where w.id = old.workspace_id for update;

  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = old.workspace_id
      and m.role = 'owner'
      and m.id <> old.id
  ) then
    raise exception 'El taller necesita al menos un dueño. Nombra a otro dueño antes de cambiar este rol o de salir del taller.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger workspace_members_keep_an_owner
  before update of role, workspace_id or delete on public.workspace_members
  for each row execute function app.workshop_keeps_an_owner();
