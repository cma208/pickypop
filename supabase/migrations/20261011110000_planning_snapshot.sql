-- La foto del taller que lee el plan (ADR-021).
--
-- El plan es una función pura en `packages/domain` (`plan`), y necesita de
-- una vez todo lo que decide quién se lleva qué: el estante, la cola, las
-- recetas con sus placas, los pedidos abiertos y los separos, el horario y el
-- cambio de placa medido. Pedirlo en diez consultas desde la pantalla daría
-- diez fotos tomadas en momentos distintos, y una entrega entre la tercera y
-- la cuarta haría que el reparto contara dos veces la misma poción. Por eso
-- sale de una sola función, en una sola instantánea.
--
-- La forma es exactamente `PlanInput` (`packages/domain/src/plan-types.ts`).
-- Si cambia uno, cambia el otro.

-- La receta vigente de cada variante: la de versión más alta, la misma que
-- usan `assemble_product` y `deliver_order`.
create or replace function app.current_recipes(p_workspace_id uuid)
returns setof public.recipes
language sql
stable
as $$
  select distinct on (r.variant_id) r.*
  from public.recipes r
  where r.workspace_id = p_workspace_id
  order by r.variant_id, r.version desc;
$$;

grant execute on function app.current_recipes(uuid) to authenticated;

-- Cómo se llama un filamento para una persona: "PLA Básico Rosado".
create or replace function app.filament_label(p_sku_id uuid)
returns text
language sql
stable
as $$
  select concat_ws(' ', m.code, s.finish, s.color_name)
  from public.filament_skus s
  left join public.materials m on m.id = s.material_id
  where s.id = p_sku_id;
$$;

grant execute on function app.filament_label(uuid) to authenticated;

-- Lo que una placa de receta usa por corrida.
create or replace function app.plate_filaments_json(p_plate_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'skuId', f.filament_sku_id,
           'label', coalesce(app.filament_label(f.filament_sku_id), concat_ws(' ', m.code, f.color_hex), 'Filamento'),
           'grams', f.grams
         ) order by f.slot), '[]'::jsonb)
  from public.recipe_plate_filaments f
  left join public.materials m on m.id = f.material_id
  where f.recipe_plate_id = p_plate_id;
$$;

-- Lo que una placa de receta deja en el estante por corrida.
create or replace function app.plate_outputs_json(p_plate_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'itemId', o.inventory_item_id,
           'units', o.units_per_run
         ) order by o.position), '[]'::jsonb)
  from public.recipe_plate_outputs o
  where o.recipe_plate_id = p_plate_id;
$$;

grant execute on function app.plate_filaments_json(uuid) to authenticated;
grant execute on function app.plate_outputs_json(uuid) to authenticated;

/*
 * A made-to-order line, as the quote froze it: its plates and supplies.
 * `p_printed` is how many finished units are already printed and not yet
 * handed over.
 */
create or replace function app.custom_work_json(p_quote_line_id uuid, p_printed numeric)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'plates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', coalesce(p ->> 'label', 'Placa'),
               'printSeconds', coalesce((p ->> 'printTimeSeconds')::numeric, 0),
               'unitsPerRun', greatest(coalesce((p ->> 'unitsPerRun')::numeric, 1), 1),
               'filaments', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'skuId', nullif(f ->> 'filamentSkuId', '')::uuid,
                          'label', coalesce(
                            app.filament_label(nullif(f ->> 'filamentSkuId', '')::uuid),
                            nullif(concat_ws(' ', f ->> 'type', f ->> 'colorHex'), ''),
                            'Filamento'
                          ),
                          'grams', coalesce((f ->> 'grams')::numeric, 0)
                        ))
                 from jsonb_array_elements(coalesce(p -> 'filaments', '[]'::jsonb)) f
               ), '[]'::jsonb)
             ))
      from jsonb_array_elements(coalesce(ql.plates, '[]'::jsonb)) p
    ), '[]'::jsonb),
    'supplies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'itemId', nullif(s ->> 'inventoryItemId', '')::uuid,
               'label', coalesce(s ->> 'label', 'Insumo'),
               'scope', case when s ->> 'scope' = 'batch' then 'batch' else 'unit' end,
               'quantity', coalesce((s ->> 'quantity')::numeric, 0)
             ))
      from jsonb_array_elements(coalesce(ql.items -> 'supplies', '[]'::jsonb)) s
    ), '[]'::jsonb),
    'setupMinutes', coalesce(ql.setup_minutes, 0),
    'minutesPerUnit', coalesce(ql.minutes_per_unit, 0),
    'printedUnits', greatest(coalesce(p_printed, 0), 0)
  )
  from public.quote_lines ql
  where ql.id = p_quote_line_id;
$$;

grant execute on function app.custom_work_json(uuid, numeric) to authenticated;

/*
 * Everything the plan needs, taken in one snapshot.
 *
 * The changeover is the measured 75th percentile once there are at least
 * five samples, and the workshop's default before that: three gaps are an
 * anecdote, not a measure.
 *
 * An order on hold without a deadline (from before holds existed, or seeded)
 * gets one already past: it keeps no place, which is what an old hold means.
 */
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
  -- Finished units printed for each made-to-order line. Without knowing
  -- which plate each job printed, a line of two plates counts the pairs.
  printed as (
    select j.order_line_id,
           floor(sum(j.units_produced) / greatest(coalesce(jsonb_array_length(ql.plates), 1), 1)) as units
    from public.print_jobs j
    join public.order_lines l on l.id = j.order_line_id
    left join public.quote_lines ql on ql.id = l.quote_line_id
    where j.workspace_id = p_workspace_id and j.status = 'success'
    group by j.order_line_id, ql.plates
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
        'filaments', case when j.recipe_plate_id is null then '[]'::jsonb else app.plate_filaments_json(j.recipe_plate_id) end
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

comment on function app.planning_snapshot(uuid) is
  'Todo lo que necesita el plan (PlanInput), en una sola instantánea.';

-- PostgREST only sees the public schema.
create or replace function public.planning_snapshot(p_workspace_id uuid)
returns jsonb
language sql
stable
as $$
  select app.planning_snapshot(p_workspace_id);
$$;

grant execute on function public.planning_snapshot(uuid) to authenticated;
