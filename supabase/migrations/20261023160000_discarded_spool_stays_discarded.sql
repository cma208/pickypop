-- A discarded roll comes back only when somebody says it comes back.
--
-- 20261023120000 took the grams of a discarded roll out of the stock, and
-- let a weighing that finds filament reopen it (its rule 3). The review found
-- the hole that left: Filamentos offers «Pesar» on a discarded roll too, and
-- weighing one to note down what was thrown away put it back. A wet PETG
-- discarded with 600 g, weighed afterwards at 650 g net, came back «Abierto»
-- with 650 g that Filamentos, the plan and the print screens counted again:
-- exactly what T1-08 was about, filament nobody can use counted as available.
--
-- An emptied roll keeps reopening by itself when a weighing finds filament:
-- «Agotado» was a mistake about how much was left, and the filament is good.
-- A discarded one was a decision about the filament, and only the person can
-- take it back. So:
--
-- 1. `weigh_spool` gains `p_reopen`. Weighing a discarded roll that has
--    filament is refused unless it says the roll comes back into use, with a
--    message that says what would happen. Weighing it empty is harmless and
--    still allowed.
-- 2. The database keeps the rule for every way in, not only the screen.
--    `sync_spool_status` refuses a movement that leaves a discarded roll with
--    grams unless `weigh_spool` was told to reopen that roll, through a setting
--    that lasts only for its transaction (as `app.change_reason` does for
--    order statuses). Production only takes grams out of a roll, a purchase
--    only puts them on a new sealed one, so nothing else is affected.

drop function public.weigh_spool(uuid, numeric, numeric);
drop function app.weigh_spool(uuid, numeric, numeric);

/*
 * Records a weighing of a roll. Returns {"net_g", "before_g", "difference_g",
 * "after_g", "status"}: a difference of zero wrote nothing.
 *
 * `p_reopen` says that a discarded roll goes back into use with what the
 * scale found. Without it, a discarded roll with filament is refused.
 */
create function app.weigh_spool(
  p_spool_id uuid,
  p_gross_g numeric,
  p_tare_g numeric,
  p_reopen boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  -- A 1 kg roll with its spool weighs about 1.2 kg. Past this it is a typing
  -- mistake, not a roll.
  c_max_weight_g constant numeric := 100000;
  v_spool public.spools;
  v_net numeric;
  v_before numeric;
  v_difference numeric;
  v_status public.spool_status;
begin
  if p_gross_g is null or p_tare_g is null or p_gross_g = 'NaN'::numeric or p_tare_g = 'NaN'::numeric then
    raise exception 'Indica el peso en la balanza y la tara del carrete.';
  end if;
  if p_gross_g < 0 or p_tare_g < 0 then
    raise exception 'Los pesos no pueden ser negativos.';
  end if;
  if p_gross_g > c_max_weight_g or p_tare_g > c_max_weight_g then
    raise exception 'Un pesaje va hasta 100000 g: revisa el número.';
  end if;
  if p_gross_g < p_tare_g then
    raise exception 'El peso de la balanza no puede ser menor que la tara del carrete.';
  end if;

  -- Locked before reading what it holds, so a print closing at the same time
  -- waits instead of slipping in between.
  select * into v_spool from public.spools where id = p_spool_id for update;
  if not found then
    raise exception 'No existe el rollo indicado.';
  end if;

  v_net := round(p_gross_g - p_tare_g, 3);
  v_before := app.spool_on_hand(p_spool_id);
  v_difference := v_net - v_before;

  if v_spool.status = 'discarded' and v_net > 0 then
    if not coalesce(p_reopen, false) then
      raise exception
        'El rollo % está descartado. Pesarlo con filamento lo vuelve a usar: sus % g volverían a contar en Filamentos y en el plan. Si es lo que quieres, marca «Vuelve a usarse». Si solo querías anotar lo que se botó, no hace falta pesarlo.',
        coalesce(v_spool.code, 'sin código'), trim_scale(v_net)::text;
    end if;
    perform set_config('app.reopen_spool', p_spool_id::text, true);
  end if;

  if v_difference <> 0 then
    insert into public.stock_movements (
      workspace_id, type, spool_id, quantity, unit_cost, source_type, source_id, note
    )
    values (
      v_spool.workspace_id,
      'adjustment',
      p_spool_id,
      v_difference,
      v_spool.cost_per_gram,
      'weighing',
      p_spool_id,
      format(
        'Pesaje: %s g en balanza, tara %s g, esperado %s g',
        trim_scale(round(p_gross_g, 3))::text,
        trim_scale(round(p_tare_g, 3))::text,
        trim_scale(v_before)::text
      )
    );
  end if;

  perform set_config('app.reopen_spool', '', true);

  select status into v_status from public.spools where id = p_spool_id;

  return jsonb_build_object(
    'net_g', v_net,
    'before_g', v_before,
    'difference_g', v_difference,
    'after_g', app.spool_on_hand(p_spool_id),
    'status', v_status
  );
end;
$$;

grant execute on function app.weigh_spool(uuid, numeric, numeric, boolean) to authenticated;

create function public.weigh_spool(
  p_spool_id uuid,
  p_gross_g numeric,
  p_tare_g numeric,
  p_reopen boolean default false
)
returns jsonb
language sql
volatile
as $$
  select app.weigh_spool(p_spool_id, p_gross_g, p_tare_g, p_reopen);
$$;

grant execute on function public.weigh_spool(uuid, numeric, numeric, boolean) to authenticated;

-- Same function as 20261023120000, with rule 2 above in front.
create or replace function app.sync_spool_status()
returns trigger
language plpgsql
as $$
declare
  v_status public.spool_status;
  v_code text;
  v_on_hand numeric;
begin
  -- The roll is locked so two movements at once do not step on each other.
  select status, code into v_status, v_code from public.spools where id = new.spool_id for update;
  if not found then
    return null;
  end if;

  v_on_hand := app.spool_on_hand(new.spool_id);

  -- Left with grams, a discarded roll would count again. Bringing a negative
  -- balance up to zero is only a correction, and stays allowed.
  if v_status = 'discarded' and new.quantity > 0 and v_on_hand > 0
     and coalesce(current_setting('app.reopen_spool', true), '') <> new.spool_id::text then
    raise exception
      'El rollo % está descartado: no recibe filamento hasta que alguien diga que vuelve a usarse. Pésalo y marca «Vuelve a usarse».',
      coalesce(v_code, 'sin código');
  end if;

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
