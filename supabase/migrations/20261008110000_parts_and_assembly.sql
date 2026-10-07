-- Producir piezas al imprimir, y armar productos a partir de ellas.
--
-- Con esto, imprimir y vender se independizan: una placa de nueve tapas entra
-- al stock como nueve tapas, se arma una botella consumiendo una, y las ocho
-- restantes siguen ahí respaldando ventas futuras en vez de cargarle su costo
-- entero a la primera.

-- ------------------------------------------------- qué produce cada placa
--
-- `units_per_run` ya decía cuántas unidades aporta una corrida; lo que faltaba
-- era **de qué**. Nulo mantiene el comportamiento anterior, para no romper las
-- recetas ya cargadas: una placa sin pieza declarada sigue sin producir stock.

alter table public.recipe_plates
  add column produces_item_id uuid references public.inventory_items (id) on delete restrict;

create index recipe_plates_produces_idx on public.recipe_plates (produces_item_id);

comment on column public.recipe_plates.produces_item_id is
  'La pieza que sale de esta placa. Nulo: la placa no aporta stock, como antes.';

-- La pieza tiene que ser del mismo taller que la receta, o una placa estaría
-- produciendo inventario ajeno.
create or replace function app.check_plate_part_workspace()
returns trigger
language plpgsql
as $$
declare
  v_kind public.inventory_item_kind;
  v_workspace uuid;
begin
  if new.produces_item_id is null then
    return new;
  end if;

  select kind, workspace_id into v_kind, v_workspace
  from public.inventory_items where id = new.produces_item_id;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'la pieza que produce la placa es de otro taller';
  end if;
  if v_kind <> 'part' then
    raise exception 'una placa solo puede producir un artículo de tipo pieza';
  end if;

  return new;
end;
$$;

create trigger recipe_plates_part_is_ours
  before insert or update of produces_item_id, workspace_id on public.recipe_plates
  for each row execute function app.check_plate_part_workspace();

-- --------------------------------------------- el costo unitario de compra
--
-- `unit_price` tenía dos decimales, y eso rompía justo donde más se nota.
-- Una bolsa de 350 caramelos a S/ 15 cuesta S/ 0.042857 por caramelo, pero
-- solo se podía anotar S/ 0.04: la bolsa quedaba valorizada en S/ 14.00, un
-- 6.7 % menos y **siempre hacia abajo**. Los dulces están en casi todos los
-- productos del taller, así que el error se propagaba a todo el costeo.
--
-- La vista `inventory_item_costs` ya redondeaba a cuatro decimales, de modo
-- que el cuello estaba únicamente en la columna de entrada.

-- Las vistas se apoyan en la columna, así que hay que soltarlas y volver a
-- crearlas iguales. Se recrean con la misma definición que tenían, sin cambios.
--
-- `purchase_payment_status` (de 20261006120000) también lee `unit_price`, y
-- producción la tiene: sin soltarla, el `alter` falla. La base local de
-- desarrollo no lo mostró porque se fue armando por partes; una base nueva sí.
drop view public.purchase_payment_status;
drop view public.inventory_item_costs;

alter table public.purchase_lines
  alter column unit_price type numeric(12, 6);

comment on column public.purchase_lines.unit_price is
  'Precio por unidad, con seis decimales: un insumo barato comprado por cientos no cabe en dos.';

create view public.purchase_payment_status with (security_invoker = true) as
with totals as (
  select
    p.id as purchase_id,
    p.workspace_id,
    p.purchased_at,
    -- Rounded once, at the end, the way the purchase screen adds it up
    -- (`sumMoney` over every line plus shipping and other costs).
    round(
      coalesce((
        select sum(l.quantity * l.unit_price)
        from public.purchase_lines l
        where l.purchase_id = p.id
      ), 0) + p.shipping_cost + p.other_costs,
      2
    ) as total
  from public.purchases p
),
paid as (
  select t.purchase_id, sum(t.amount) as paid, max(t.occurred_at) as last_paid_at
  from public.transactions t
  where t.purchase_id is not null
    and t.type = 'expense'
    and t.voided_at is null
  group by t.purchase_id
)
select
  totals.purchase_id,
  totals.workspace_id,
  totals.total,
  coalesce(paid.paid, 0) as paid,
  greatest(totals.total - coalesce(paid.paid, 0), 0) as pending,
  paid.last_paid_at
from totals
left join paid on paid.purchase_id = totals.purchase_id;

comment on view public.purchase_payment_status is
  'How much of each purchase has been paid and how much is still owed, from the expenses tied to it.';

create view public.inventory_item_costs with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.standard_cost,
  last_purchase.unit_cost as last_purchase_cost,
  coalesce(last_purchase.unit_cost, i.standard_cost) as cost_per_unit,
  case
    when last_purchase.unit_cost is not null then 'purchase'
    when i.standard_cost is not null then 'standard'
    else 'unknown'
  end as cost_source
from public.inventory_items i
left join lateral (
  select
    case
      when l.quantity > 0
        then round((l.unit_price * l.quantity + l.allocated_extra_cost) / l.quantity, 4)
    end as unit_cost
  from public.purchase_lines l
  join public.purchases p on p.id = l.purchase_id
  where l.inventory_item_id = i.id
  order by p.purchased_at desc, l.created_at desc
  limit 1
) as last_purchase on true;

comment on view public.inventory_item_costs is
  'What a supply costs per unit, and whether that came from a real purchase.';

-- ----------------------------------------------------- el stock de piezas
--
-- Igual que todo lo demás aquí, el stock no se guarda: sale de sus
-- movimientos. Esta vista solo le pone nombre al subconjunto que interesa.

create view public.part_stock with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.min_stock,
  coalesce(b.on_hand, 0) as on_hand,
  coalesce(b.on_hand, 0) < i.min_stock as below_minimum,
  c.cost_per_unit,
  c.cost_source
from public.inventory_items i
left join public.inventory_balances b on b.inventory_item_id = i.id
left join public.inventory_item_costs c on c.inventory_item_id = i.id
where i.kind = 'part' and i.active;

comment on view public.part_stock is
  'Las piezas impresas que hay en el estante, con su costo. Derivado de los movimientos.';

-- ------------------------------------------- imprimir ahora produce piezas
--
-- Se reemplaza la función entera porque es más honesto que parchearla: lo
-- único que cambia es el bloque del final, que mete al stock lo que la placa
-- produjo. Solo cuenta si la impresión salió bien; una fallida no deja piezas.

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
  v_part uuid;
  v_units numeric;
  v_total_cost numeric;
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

  -- Lo nuevo: las piezas que salieron de la placa entran al estante.
  if p_result = 'success' then
    select rp.produces_item_id, coalesce(nullif(v_job.units_produced, 0), rp.units_per_run)
      into v_part, v_units
    from public.recipe_plates rp
    where rp.id = v_job.recipe_plate_id;

    if v_part is not null and coalesce(v_units, 0) > 0 then
      -- La pieza vale lo que costó producirla, repartido entre las que
      -- salieron. Es el mismo criterio que usa el resto del sistema: el costo
      -- sigue al material, no a una tarifa inventada.
      v_total_cost := coalesce(v_job.material_cost, 0)
                    + coalesce(v_job.energy_cost, 0)
                    + coalesce(v_job.machine_cost, 0);

      insert into public.stock_movements (
        workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
      ) values (
        v_job.workspace_id, 'purchase', v_part, v_units,
        round(v_total_cost / v_units, 6), 'print_job', p_job_id,
        'Piezas producidas por la impresión'
      );
    end if;
  end if;

  return v_job;
end;
$$;

grant execute on function app.complete_print_job(
  uuid, public.print_job_status, integer, jsonb, public.print_failure_cause, numeric, numeric, numeric
) to authenticated;

-- --------------------------------------------------------------- armar
--
-- Consume piezas e insumos y produce producto terminado. **Todo o nada**: si
-- falta un componente la operación entera falla y dice cuál falta, porque un
-- armado a medias deja el inventario mintiendo.

create or replace function app.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null
)
returns setof public.stock_movements
language plpgsql
as $$
declare
  v_workspace uuid;
  v_recipe uuid;
  v_shortage text;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'hay que armar al menos una unidad';
  end if;

  select v.workspace_id, r.id into v_workspace, v_recipe
  from public.product_variants v
  join public.recipes r on r.variant_id = v.id
  where v.id = p_variant_id
  order by r.version desc
  limit 1;

  if v_recipe is null then
    raise exception 'esa variante no tiene receta: no se sabe con qué armarla';
  end if;

  -- Primero se mira si alcanza para todo, y recién después se mueve algo.
  select string_agg(
           format('%s (hacen falta %s y hay %s)',
                  i.name,
                  trim(to_char(ri.quantity_per_unit * p_units, 'FM999999990.999')),
                  trim(to_char(coalesce(b.on_hand, 0), 'FM999999990.999'))),
           '; ' order by i.name)
    into v_shortage
  from public.recipe_items ri
  join public.inventory_items i on i.id = ri.inventory_item_id
  left join public.inventory_balances b on b.inventory_item_id = i.id
  where ri.recipe_id = v_recipe
    and coalesce(b.on_hand, 0) < ri.quantity_per_unit * p_units;

  if v_shortage is not null then
    raise exception 'No alcanza para armar % unidades. Falta: %', p_units, v_shortage;
  end if;

  return query
  insert into public.stock_movements (
    workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, note
  )
  select v_workspace, 'consumption', ri.inventory_item_id,
         -(ri.quantity_per_unit * p_units),
         c.cost_per_unit, 'assembly',
         coalesce(p_note, 'Armado de producto')
  from public.recipe_items ri
  left join public.inventory_item_costs c on c.inventory_item_id = ri.inventory_item_id
  where ri.recipe_id = v_recipe
  returning *;
end;
$$;

grant execute on function app.assemble_product(uuid, numeric, text) to authenticated;

create or replace function public.assemble_product(
  p_variant_id uuid,
  p_units numeric,
  p_note text default null
)
returns setof public.stock_movements
language sql
volatile
as $$
  select * from app.assemble_product(p_variant_id, p_units, p_note);
$$;

grant execute on function public.assemble_product(uuid, numeric, text) to authenticated;
