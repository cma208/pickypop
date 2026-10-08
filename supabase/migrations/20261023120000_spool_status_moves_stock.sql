-- A roll marked «Agotado» or «Descartado» leaves the stock through a movement.
--
-- Marking a roll that way only changed a word. Its grams went on counting:
-- «3 kg · 3 kg libres» with one of the three rolls thrown away, and the plan
-- (planning_snapshot reads filament_sku_stock) treated them as filament it
-- could print with, while no screen let anyone choose that roll (tercera
-- pasada, T1-08 and T3-07).
--
-- Two ways out were weighed:
--
-- * Have filament_sku_stock (and what reads it) skip those rolls. The grams
--   would vanish from every total without a trace: the kardex would still say
--   the roll holds 1 kg, its cost would leave the inventory and reach no
--   expense, and setting the roll back to «En uso» would bring the kilo back
--   with nobody having weighed it.
-- * Make the change of state write what happened. That is the rule everything
--   else follows: stock is the sum of its movements, and what leaves the
--   stock leaves through one. This is the one taken.
--
-- So, from now on:
--
-- 1. Marking a roll «Agotado» with grams left writes an `adjustment` that
--    takes them to zero: the person says the roll is empty, and the kardex was
--    wrong. Marking it «Descartado» writes a `waste` (merma): the filament
--    existed and was thrown away. Both at what a gram of that roll cost, with
--    `source_type = 'spool_status'`, so the kardex says why.
-- 2. A roll «Agotado» or «Descartado» with no grams cannot go back to
--    «Sellado», «Abierto» or «En uso» by hand: it would be offered to every
--    print with nothing on it. It goes back by weighing it: a weighing that
--    finds filament reopens it.
-- 3. The weighing rule of `sync_spool_status` now also reopens a discarded
--    roll. Before, only an empty one: with rule 1 a discarded roll holds no
--    grams, so a weighing that finds some is the person taking it back.
-- 4. Rolls already «Agotado» or «Descartado» with grams get the same movement
--    now, dated today, so the rule holds for what came before it too.
--
-- Where its cost lands in Resultados: `monthly_income_statement` belongs to
-- production and today counts only the shelf count's losses
-- (`source_type = 'shelf_count'`). These movements, and the weighings, are
-- left with their own source for that view to take, and the change is
-- reported to its owner.

create or replace function app.spool_status_label(p_status public.spool_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'sealed' then 'Sellado'
    when 'open' then 'Abierto'
    when 'in_use' then 'En uso'
    when 'empty' then 'Agotado'
    when 'discarded' then 'Descartado'
  end;
$$;

grant execute on function app.spool_status_label(public.spool_status) to authenticated;

-- Grams on a roll, as its movements say.
create or replace function app.spool_on_hand(p_spool_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(m.quantity), 0)
  from public.stock_movements m
  where m.spool_id = p_spool_id
    and m.type not in ('reservation', 'release');
$$;

grant execute on function app.spool_on_hand(uuid) to authenticated;

-- Before the change: no way back without grams, and a roll that starts being
-- used gets the day it was opened.
create or replace function app.guard_spool_status()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('empty', 'discarded')
     and new.status in ('sealed', 'open', 'in_use')
     and app.spool_on_hand(new.id) <= 0 then
    raise exception
      'El rollo % no tiene filamento según sus movimientos, así que no puede volver a «%». Pésalo: si la balanza encuentra filamento, vuelve a quedar abierto.',
      coalesce(new.code, 'sin código'), app.spool_status_label(new.status);
  end if;

  if new.status in ('open', 'in_use') and new.opened_at is null then
    new.opened_at := now();
  end if;

  return new;
end;
$$;

create trigger spools_guard_status
  before update of status on public.spools
  for each row
  when (old.status is distinct from new.status)
  execute function app.guard_spool_status();

-- After the change: what the roll still held leaves the stock.
create or replace function app.spool_status_moves_stock()
returns trigger
language plpgsql
as $$
declare
  v_on_hand numeric := app.spool_on_hand(new.id);
begin
  if v_on_hand > 0 then
    insert into public.stock_movements (
      workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
    )
    values (
      new.workspace_id,
      case when new.status = 'discarded' then 'waste' else 'adjustment' end::public.stock_movement_type,
      new.id,
      -v_on_hand,
      new.cost_per_gram,
      'spool_status',
      new.id,
      format(
        'Rollo marcado «%s» con %s g según sus movimientos',
        app.spool_status_label(new.status),
        trim_scale(v_on_hand)::text
      )
    );
  end if;

  return null;
end;
$$;

create trigger spools_status_moves_stock
  after update of status on public.spools
  for each row
  when (old.status is distinct from new.status and new.status in ('empty', 'discarded'))
  execute function app.spool_status_moves_stock();

-- Rule 3: same function as 20261015100000, with the reopening extended to a
-- discarded roll.
create or replace function app.sync_spool_status()
returns trigger
language plpgsql
as $$
declare
  v_status public.spool_status;
  v_on_hand numeric;
begin
  -- The roll is locked so two movements at once do not step on each other.
  select status into v_status from public.spools where id = new.spool_id for update;
  if not found then
    return null;
  end if;

  v_on_hand := app.spool_on_hand(new.spool_id);

  if v_status = 'sealed' and new.quantity < 0 and new.type in ('consumption', 'waste', 'maintenance') then
    update public.spools
       set status = 'open',
           opened_at = coalesce(opened_at, new.occurred_at)
     where id = new.spool_id;
    v_status := 'open';
  end if;

  if v_status in ('sealed', 'open', 'in_use') and v_on_hand <= 0 then
    update public.spools set status = 'empty' where id = new.spool_id;
  elsif v_status in ('empty', 'discarded') and v_on_hand > 0 and new.type = 'adjustment' and new.quantity > 0 then
    update public.spools set status = 'open' where id = new.spool_id;
  end if;

  return null;
end;
$$;

/*
 * Changes the state of a roll by hand, and says what that moved.
 *
 * `p_expected` is the state the screen showed. If somebody changed it in the
 * meantime (another tab, a print that emptied it), nothing changes and the
 * person is told, instead of overwriting what they did not see.
 *
 * Returns {"status", "changed", "removed_g", "removed_cost"}: the grams that
 * left the stock (rule 1 above) and what they were worth.
 */
create or replace function app.set_spool_status(
  p_spool_id uuid,
  p_status public.spool_status,
  p_expected public.spool_status default null
)
returns jsonb
language plpgsql
as $$
declare
  v_spool public.spools;
  v_before numeric;
  v_after numeric;
begin
  select * into v_spool from public.spools where id = p_spool_id for update;
  if not found then
    raise exception 'No existe el rollo indicado.';
  end if;
  if p_status is null then
    raise exception 'Elige el estado del rollo.';
  end if;

  if p_expected is not null and v_spool.status <> p_expected then
    raise exception 'El rollo % ya está «%»: alguien lo cambió mientras tanto. Revisa la lista, que ya está al día.',
      coalesce(v_spool.code, 'sin código'), app.spool_status_label(v_spool.status);
  end if;

  if v_spool.status = p_status then
    return jsonb_build_object('status', p_status, 'changed', false, 'removed_g', 0, 'removed_cost', 0);
  end if;

  v_before := app.spool_on_hand(p_spool_id);
  update public.spools set status = p_status where id = p_spool_id;
  v_after := app.spool_on_hand(p_spool_id);

  return jsonb_build_object(
    'status', p_status,
    'changed', true,
    'removed_g', v_before - v_after,
    'removed_cost', round((v_before - v_after) * v_spool.cost_per_gram, 2)
  );
end;
$$;

grant execute on function app.set_spool_status(uuid, public.spool_status, public.spool_status) to authenticated;

create or replace function public.set_spool_status(
  p_spool_id uuid,
  p_status public.spool_status,
  p_expected public.spool_status default null
)
returns jsonb
language sql
volatile
as $$
  select app.set_spool_status(p_spool_id, p_status, p_expected);
$$;

grant execute on function public.set_spool_status(uuid, public.spool_status, public.spool_status) to authenticated;

-- Rule 4: the rolls that were already marked with grams on them.
insert into public.stock_movements (
  workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
)
select
  s.workspace_id,
  case when s.status = 'discarded' then 'waste' else 'adjustment' end::public.stock_movement_type,
  s.id,
  -b.on_hand,
  s.cost_per_gram,
  'spool_status',
  s.id,
  format(
    'Rollo que ya estaba «%s» con %s g según sus movimientos: salen del stock al aplicar la regla nueva',
    app.spool_status_label(s.status),
    trim_scale(b.on_hand)::text
  )
from public.spools s
cross join lateral (select app.spool_on_hand(s.id) as on_hand) b
where s.status in ('empty', 'discarded')
  and b.on_hand > 0;
