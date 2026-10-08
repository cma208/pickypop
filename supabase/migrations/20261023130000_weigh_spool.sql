-- A weighing says what the scale said, and the database works out the rest.
--
-- The dialog worked out the difference itself, against the grams the roll had
-- when it was opened, and wrote that difference. Two tabs open on the same
-- roll wrote it twice: the scale said 0 g and the roll ended at +50.126 g
-- (tercera pasada, T3-02). A print closed between opening the dialog and
-- saving it did the same.
--
-- Now the screen sends the scale and the tare, and `weigh_spool` takes the
-- difference against the grams the roll has at that moment, under the roll's
-- lock: the way `count_shelf` counts the shelf. Saving it twice leaves the
-- roll where the scale said, and the second time writes nothing.

/*
 * Records a weighing of a roll. Returns {"net_g", "before_g", "difference_g",
 * "after_g", "status"}: a difference of zero wrote nothing.
 */
create or replace function app.weigh_spool(
  p_spool_id uuid,
  p_gross_g numeric,
  p_tare_g numeric
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

grant execute on function app.weigh_spool(uuid, numeric, numeric) to authenticated;

create or replace function public.weigh_spool(
  p_spool_id uuid,
  p_gross_g numeric,
  p_tare_g numeric
)
returns jsonb
language sql
volatile
as $$
  select app.weigh_spool(p_spool_id, p_gross_g, p_tare_g);
$$;

grant execute on function public.weigh_spool(uuid, numeric, numeric) to authenticated;
