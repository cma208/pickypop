-- El plan cuenta los rollos de cada trabajo, y lo llama por su nombre.
--
-- T3-10: la foto armaba el filamento de cada trabajo solo desde su placa: `[]` si
-- no tenía, y la de la placa si tenía. Nunca leía `print_job_filaments`. Un
-- trabajo suelto de 2 kg en PLA blanco dejaba el rollo «1 kg libres», y uno con
-- placa al que se le cambió el color al iniciarlo descontaba el SKU de la placa.
-- Ahora un trabajo con rollos cuenta sus rollos (sus gramos estimados, en el SKU
-- de cada rollo), y solo uno sin rollos, el que «Por lanzar» puso en la cola,
-- cae en su placa.
--
-- T3-12: el aviso de una placa que no cabe en el horario llamaba al trabajo
-- suelto por el nombre de la impresora («La placa "A1 mini" dura 1000 h…»),
-- porque la foto no traía su nombre. Ahora cada trabajo trae `label`: el mismo
-- que muestra su tarjeta en la cola.
--
-- Es la función de 20261017110000_custom_line_printed_like_the_queue con esos
-- dos cambios en `jobs`.

-- Lo que un trabajo va a gastar de cada rollo, con el SKU del rollo.
create or replace function app.job_filaments_json(p_job_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'skuId', s.filament_sku_id,
           'label', coalesce(app.filament_label(s.filament_sku_id), s.code, 'Filamento'),
           'grams', f.estimated_g
         ) order by f.slot nulls last, s.code), '[]'::jsonb)
  from public.print_job_filaments f
  join public.spools s on s.id = f.spool_id
  where f.print_job_id = p_job_id;
$$;

grant execute on function app.job_filaments_json(uuid) to authenticated;

create or replace function app.planning_snapshot(p_workspace_id uuid)
returns jsonb
language sql
stable
as $$
  with
  schedule as (
    select * from app.workshop_schedule(p_workspace_id)
  ),
  measured as (
    select samples, p75_minutes from public.changeover_estimate where workspace_id = p_workspace_id
  ),
  profile as (
    select c.failure_rate
    from public.cost_profiles c, schedule s
    where c.workspace_id = p_workspace_id
      and c.valid_from <= (now() at time zone s.timezone)::date
    order by c.valid_from desc
    limit 1
  ),
  recipes as (
    select * from app.current_recipes(p_workspace_id)
  ),
  open_orders as (
    select o.*
    from public.orders o
    where o.workspace_id = p_workspace_id
      and o.status not in ('delivered', 'closed', 'cancelled')
  ),
  -- Finished units printed for each made-to-order line, counted the way
  -- the queue counts its jobs (`lineUnits` below, shared among the line's
  -- plates in the plan): closing a print well moves it from queued to
  -- printed, and the line keeps what it had covered. Not floored: a line of
  -- two plates with only the front printed has half a unit begun, and the
  -- plan must not ask for that half again.
  printed as (
    select l.id as order_line_id,
           count(*) * coalesce((
             select min(greatest(coalesce((p ->> 'unitsPerRun')::numeric, 1), 1))
             from jsonb_array_elements(coalesce(ql.plates, '[]'::jsonb)) p
           ), 1) / greatest(coalesce(jsonb_array_length(ql.plates), 0), 1) as units
    from public.print_jobs j
    join public.order_lines l on l.id = j.order_line_id
    left join public.quote_lines ql on ql.id = l.quote_line_id
    where j.workspace_id = p_workspace_id
      and j.status = 'success'
      and l.variant_id is null
    group by l.id, ql.plates
  )
  select jsonb_build_object(
    'now', now(),
    'settings', (
      select jsonb_build_object(
        'timeZone', s.timezone,
        'window', jsonb_build_object(
          'firstStart', (extract(epoch from s.print_first_start) / 60)::integer,
          'lastStart', (extract(epoch from s.print_last_start) / 60)::integer,
          'endBy', (extract(epoch from s.print_end_by) / 60)::integer
        ),
        'changeoverMinutes', coalesce(
          (select p75_minutes from measured where samples >= 5),
          s.changeover_default_minutes
        ),
        'failureRate', coalesce((select failure_rate from profile), 0)
      )
      from schedule s
    ),
    'printers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
      from public.printers p
      where p.workspace_id = p_workspace_id and p.status = 'active'
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'printerId', j.printer_id,
        'status', j.status,
        'startedAt', j.started_at,
        'queuedAt', j.created_at,
        'estimatedSeconds', coalesce(j.estimated_time_s, rp.print_time_s, 0),
        -- What the queue card calls it, so the plan's warnings name the job the
        -- person sees, and not its printer (T3-12).
        'label', coalesce(nullif(btrim(j.label), ''), l.description, nullif(btrim(rp.label), '')),
        'outputs', case when j.recipe_plate_id is null then '[]'::jsonb else app.plate_outputs_json(j.recipe_plate_id) end,
        'orderLineId', case when l.id is not null and l.variant_id is null then l.id end,
        'lineUnits', case
          when l.id is not null and l.variant_id is null then coalesce((
            select min(greatest(coalesce((p ->> 'unitsPerRun')::numeric, 1), 1))
            from public.quote_lines ql, jsonb_array_elements(coalesce(ql.plates, '[]'::jsonb)) p
            where ql.id = l.quote_line_id
          ), 1)
          else 0
        end,
        -- The rolls the job was given, when it has them: a loose job has no
        -- plate, and one whose grams or colour were changed by hand is not its
        -- plate any more (T3-10). A job queued from «Por lanzar» gets its rolls
        -- when it starts; until then, its plate says what it will use.
        'filaments', case
          when exists (select 1 from public.print_job_filaments f where f.print_job_id = j.id)
            then app.job_filaments_json(j.id)
          when j.recipe_plate_id is not null then app.plate_filaments_json(j.recipe_plate_id)
          else '[]'::jsonb
        end
      ) order by j.created_at)
      from public.print_jobs j
      left join public.recipe_plates rp on rp.id = j.recipe_plate_id
      left join public.order_lines l on l.id = j.order_line_id
      where j.workspace_id = p_workspace_id and j.status in ('planned', 'printing')
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'kind', i.kind,
        'unit', i.unit,
        'onHand', coalesce(b.on_hand, 0)
      ) order by i.name)
      from public.inventory_items i
      left join public.inventory_balances b on b.inventory_item_id = i.id
      where i.workspace_id = p_workspace_id and i.active
    ), '[]'::jsonb),
    'filaments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skuId', s.id,
        'label', app.filament_label(s.id),
        'onHandGrams', coalesce(st.on_hand_g, 0)
      ) order by app.filament_label(s.id))
      from public.filament_skus s
      left join public.filament_sku_stock st on st.filament_sku_id = s.id
      where s.workspace_id = p_workspace_id and s.active
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', r.variant_id,
        'name', p.name || ' · ' || v.name,
        'assembled', r.assembled,
        'finishedItemId', fg.id,
        'components', coalesce((
          select jsonb_agg(jsonb_build_object('itemId', ri.inventory_item_id, 'perUnit', ri.quantity_per_unit))
          from public.recipe_items ri
          where ri.recipe_id = r.id
        ), '[]'::jsonb),
        'setupMinutes', coalesce(r.setup_minutes, 0),
        'minutesPerUnit', coalesce(r.minutes_per_unit, 0)
      ))
      from recipes r
      join public.product_variants v on v.id = r.variant_id
      join public.catalog_products p on p.id = v.product_id
      left join public.inventory_items fg on fg.product_variant_id = v.id and fg.kind = 'finished_good'
    ), '[]'::jsonb),
    'plates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id,
        'label', coalesce(nullif(btrim(rp.label), ''), 'Placa ' || rp.plate_index),
        'printSeconds', coalesce(rp.print_time_s, 0),
        'outputs', app.plate_outputs_json(rp.id),
        'filaments', app.plate_filaments_json(rp.id)
      ))
      from public.recipe_plates rp
      join recipes r on r.id = rp.recipe_id
    ), '[]'::jsonb),
    'demands', coalesce((
      select jsonb_agg(d.demand)
      from (
        select jsonb_build_object(
          'kind', 'order',
          'id', o.id,
          'number', o.number,
          'customerName', coalesce(c.name, o.recipient),
          'priorityAt', o.priority_at,
          'holdUntil', case when o.status = 'on_hold' then coalesce(o.hold_until, o.priority_at) end,
          'dueDate', o.due_date,
          'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id,
              'description', l.description,
              'quantity', ds.pending,
              'variantId', l.variant_id,
              -- A line without variant is made to order unless the quote
              -- said it was a service. One typed by hand in «Pedido nuevo»
              -- has no plates: it goes as made-to-order work without them,
              -- so the plan says it does not know, instead of calling it ready.
              'custom', case
                when l.variant_id is null and ql.kind = 'custom'
                  then app.custom_work_json(ql.id, coalesce(pr.units, 0) - ds.delivered)
                when l.variant_id is null and ql.id is null
                  then jsonb_build_object(
                    'plates', '[]'::jsonb, 'supplies', '[]'::jsonb,
                    'setupMinutes', 0, 'minutesPerUnit', 0,
                    'printedUnits', greatest(coalesce(pr.units, 0) - ds.delivered, 0)
                  )
              end
            ) order by l.position)
            from public.order_lines l
            join public.order_line_delivery_status ds on ds.order_line_id = l.id
            left join public.quote_lines ql on ql.id = l.quote_line_id
            left join printed pr on pr.order_line_id = l.id
            where l.order_id = o.id and ds.pending > 0
          ), '[]'::jsonb)
        ) as demand
        from open_orders o
        left join public.customers c on c.id = o.customer_id
        union all
        select jsonb_build_object(
          'kind', 'quote',
          'id', q.id,
          'number', q.number,
          'customerName', c.name,
          'priorityAt', q.held_at,
          'holdUntil', q.hold_until,
          'dueDate', null,
          'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', ql.id,
              'description', ql.description,
              'quantity', ql.quantity,
              'variantId', ql.variant_id,
              'custom', case when ql.kind = 'custom' then app.custom_work_json(ql.id, 0) end
            ) order by ql.position)
            from public.quote_lines ql
            where ql.quote_id = q.id
          ), '[]'::jsonb)
        )
        from public.quotes q
        left join public.customers c on c.id = q.customer_id
        where q.workspace_id = p_workspace_id
          and q.status = 'sent'
          and q.held_at is not null
          and q.hold_until is not null
      ) d
    ), '[]'::jsonb)
  );
$$;

grant execute on function app.planning_snapshot(uuid) to authenticated;
