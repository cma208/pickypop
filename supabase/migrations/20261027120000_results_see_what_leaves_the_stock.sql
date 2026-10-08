-- Resultados ve todo lo que sale del inventario sin venderse (ADR-023).
--
-- `monthly_income_statement` solo restaba, de lo que el kardex saca sin
-- vender, lo que encontraba el conteo del estante (`shelf_count`). Desde
-- 20261023120000 un rollo marcado «Agotado» o «Descartado» con gramos los
-- saca del stock con un movimiento (`spool_status`), y un pesaje que
-- encuentra menos también (`weighing`). Ese filamento existió, se pagó y no
-- se vendió: las compras no restan en Resultados (ADR-019), así que su costo
-- no restaba en ninguna parte. Un rollo descartado de S/ 60 dejaba el mes
-- igual de rentable.
--
-- Lo mismo con lo que se mueve a mano (`move_item_stock`, origen `manual`):
--
-- * **Una merma** (salida por merma) es pérdida: resta.
-- * **Un consumo** (salida por consumo) no resta: ya llega a Resultados por
--   otro camino, y restarlo aquí lo contaría dos veces. El insumo de una línea
--   a medida está en su estimado (los insumos de la cotización), que es su
--   costo de ventas, y `deliver_order` no lo saca del stock: sacarlo a mano es
--   lo único que deja el kardex bien. Y un repuesto que se cambia (la
--   boquilla) ya lo paga el costo de máquina de cada impresión, que lleva el
--   presupuesto de mantenimiento. Lo que se usa fuera de todo eso (la bolsa de
--   un regalo) se queda sin restar: es poco, y es el precio de no contar dos
--   veces lo de todos los días.
-- * **Un conteo** es como el del estante o un pesaje: resta lo que faltó y
--   suma lo que sobró. Menos el primero de un artículo que nunca tuvo
--   movimientos: es su stock inicial, lo que ya había el día que se empezó a
--   contar, y cuenta como una entrada.
-- * **Una entrada** no suma. Es stock que llega sin compra (lo que ya había
--   el día que se empezó a usar el sistema, algo que regaló un proveedor):
--   contarla como ganancia subiría la utilidad con plata que nunca entró, y
--   su costo ya llega a Resultados cuando se usa o se vende.
--
-- Una entrada y un conteo que encontró de más son el mismo movimiento
-- (`adjustment` positivo, origen `manual`). Para separarlos, `move_item_stock`
-- deja ahora en `source_id` el artículo que contó, como el pesaje deja su
-- rollo, salvo en el primer conteo de un artículo sin movimientos, que queda
-- como una entrada. Los conteos de antes no lo tienen: los que encontraron
-- menos restan (solo un conteo saca con un ajuste), y los que encontraron
-- más quedan fuera, como una entrada.
--
-- Todo eso va en una columna nueva, `stock_written_off`, al costo con que
-- salió y en el mes del taller en que salió. Es parte de «Producción no
-- vendida» (`unsold_production`) y resta de la utilidad neta. La vista es la
-- de 20261024120000_cancelled_prints_reach_results con las mismas columnas,
-- en el mismo orden, y la nueva al final.
--
-- `move_item_stock` es la de 20261023180000_item_movement_key, con el
-- artículo contado en `source_id`. Nada de lo guardado cambia.

create or replace function app.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null,
  p_request_key uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  c_max_quantity constant numeric := 1000000;
  v_item public.inventory_items;
  v_before numeric;
  v_difference numeric;
  v_type public.stock_movement_type;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_tracked boolean;
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'No existe el artículo indicado.';
  end if;

  -- The same request asked again: its first answer, before judging anything,
  -- because an exit already made would now find less on the shelf.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('move_item_stock ' || p_request_key::text, 0));
    select r.result into v_result
    from public.item_movement_requests r
    where r.workspace_id = v_item.workspace_id and r.request_key = p_request_key;
    if found then
      return v_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  if v_item.kind not in ('supply', 'packaging', 'spare_part') then
    raise exception '% se mueve solo por sus flujos: imprimir, armar, entregar o contar el estante.', v_item.name;
  end if;
  if p_mode is null or p_mode not in ('in', 'out', 'count') then
    raise exception 'Elige si es una entrada, una salida o un conteo.';
  end if;

  if p_quantity is null or p_quantity = 'NaN'::numeric then
    raise exception 'Indica la cantidad.';
  end if;
  if p_quantity < 0 or (p_mode <> 'count' and p_quantity = 0) then
    raise exception 'La cantidad tiene que ser mayor que cero.';
  end if;
  if p_quantity > c_max_quantity then
    raise exception 'La cantidad va hasta 1000000: revísala.';
  end if;
  if p_quantity <> round(p_quantity, 3) then
    raise exception 'La cantidad admite hasta 3 decimales.';
  end if;
  if app.counted_whole(v_item.unit) and p_quantity <> trunc(p_quantity) then
    raise exception '% se cuenta por %: la cantidad va entera.', v_item.name, v_item.unit;
  end if;

  select coalesce(sum(m.quantity), 0), count(*) > 0 into v_before, v_tracked
  from public.stock_movements m
  where m.inventory_item_id = p_item_id
    and m.type not in ('reservation', 'release');

  if p_mode = 'out' and p_quantity > v_before then
    raise exception 'No puedes sacar más de lo que hay: quedan % %.', trim_scale(v_before)::text, v_item.unit;
  end if;

  v_difference := case p_mode
    when 'in' then p_quantity
    when 'out' then -p_quantity
    else p_quantity - v_before
  end;

  v_type := case
    when p_mode = 'out' and p_reason in ('consumption', 'waste') then p_reason
    when p_mode = 'out' then 'consumption'
    else 'adjustment'
  end;

  if v_difference <> 0 then
    -- A count names what it counted, as a weighing names its roll: that is
    -- how Resultados tells a count that found more from an entry. The first
    -- count of an article that never moved is its opening stock, what was
    -- there before anyone counted: it names nothing, like an entry.
    insert into public.stock_movements (
      workspace_id, type, inventory_item_id, quantity, unit_cost, source_type, source_id, note
    )
    values (
      v_item.workspace_id,
      v_type,
      p_item_id,
      v_difference,
      (select c.cost_per_unit from public.inventory_item_costs c where c.inventory_item_id = p_item_id),
      'manual',
      case when p_mode = 'count' and v_tracked then p_item_id end,
      coalesce(
        v_note,
        case when p_mode = 'count'
          then format('Conteo: había %s, se contaron %s', trim_scale(v_before)::text, trim_scale(p_quantity)::text)
        end
      )
    );
  end if;

  v_result := jsonb_build_object(
    'before', v_before,
    'difference', v_difference,
    'after', v_before + v_difference,
    'replayed', false
  );

  if p_request_key is not null then
    insert into public.item_movement_requests (workspace_id, request_key, inventory_item_id, result)
    values (v_item.workspace_id, p_request_key, p_item_id, v_result);
  end if;

  return v_result;
end;
$$;

-- ------------------------------------------------------------- Resultados

create or replace view public.monthly_income_statement with (security_invoker = true) as
with delivered as (
  -- What left the shelf for each line, and what it cost. A delivery line with
  -- no cost took nothing off the shelf.
  select
    dl.order_line_id,
    sum(dl.quantity) as units,
    sum(dl.quantity * dl.unit_cost) as cost
  from public.order_delivery_lines dl
  where dl.unit_cost is not null
  group by dl.order_line_id
),
line_costs as (
  select
    l.id,
    l.order_id,
    case
      -- Off the shelf at what it cost; the rest at its estimate.
      when l.variant_id is not null and d.units is not null
        then round(d.cost + greatest(l.quantity - d.units, 0) * coalesce(l.estimated_unit_cost, 0), 2)
      when l.estimated_unit_cost > 0 then round(l.estimated_unit_cost * l.quantity, 2)
      -- A failed print on a customer's order is a cost of that order too.
      else coalesce((
        select sum(coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0))
        from public.print_jobs j
        where j.order_line_id = l.id
          and (j.status in ('success', 'failed') or (j.status = 'cancelled' and j.actual_time_s is not null))
      ), 0)
    end as cost,
    -- The line costs its prints: its jobs are already in the cost of sales.
    not (l.variant_id is not null and d.units is not null)
      and coalesce(l.estimated_unit_cost, 0) <= 0 as from_prints,
    -- The line costs its estimate: its allowance pays for its jobs' failures.
    not (l.variant_id is not null and d.units is not null)
      and l.estimated_unit_cost > 0 as from_estimate
  from public.order_lines l
  left join delivered d on d.order_line_id = l.id
),
order_costs as (
  select
    o.workspace_id,
    date_trunc('month', o.ordered_on::timestamp)::date as month,
    o.total,
    coalesce((select sum(c.cost) from line_costs c where c.order_id = o.id), 0) as cost
  from public.orders o
  where o.purpose = 'sale'
    and o.status <> 'cancelled'
),
sales as (
  select
    workspace_id,
    month,
    sum(total) as sales,
    sum(cost) as cost_of_sales
  from order_costs
  group by workspace_id, month
),
money as (
  select
    t.workspace_id,
    date_trunc('month', t.occurred_at at time zone w.timezone)::date as month,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is null), 0)
      as operating_expenses,
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.purchase_id is not null), 0)
      as inventory_purchases,
    coalesce(sum(t.amount) filter (where t.type = 'owner_contribution'), 0) as owner_contributions,
    coalesce(sum(t.amount) filter (where t.type = 'owner_draw'), 0) as owner_draws,
    coalesce(sum(t.amount) filter (where t.type = 'income' and t.order_id is null), 0)
      as other_income
  from public.transactions t
  join public.workspaces w on w.id = t.workspace_id
  where t.voided_at is null
  group by t.workspace_id, 2
),
jobs as (
  select
    j.workspace_id,
    date_trunc('month', j.finished_at at time zone w.timezone)::date as month,
    j.status,
    -- A print cancelled after it ran is a try that left nothing on the shelf,
    -- like a failed one: it is counted as one (T3-08).
    j.status <> 'success' as failed,
    coalesce(j.material_cost, 0) + coalesce(j.energy_cost, 0) + coalesce(j.machine_cost, 0) as cost,
    -- A mould, a jig, a test: a job of no order that puts nothing on the
    -- shelf. Finished, it left nothing there. Failed, it had nothing to leave:
    -- no plate, or a plate with no parts. A job that did put parts there
    -- passed its cost to them, and it reaches the result when they are sold.
    (
      j.order_line_id is null
      and case
        when j.status = 'success' then j.units_produced = 0
        else not exists (
          select 1 from public.recipe_plate_outputs o where o.recipe_plate_id = j.recipe_plate_id
        )
      end
    )
    -- Printed for an order that was cancelled afterwards: nobody will pay
    -- for it and it left nothing on the shelf, like a test.
    or (
      j.status = 'success'
      and j.units_produced = 0
      and exists (
        select 1
        from public.order_lines l
        join public.orders o on o.id = l.order_id
        where l.id = j.order_line_id
          and o.status = 'cancelled'
      )
    ) as tool_or_test,
    -- A line that costs its prints (line_costs above) has them in the cost
    -- of sales already, failed ones included.
    exists (
      select 1
      from line_costs c
      join public.orders o on o.id = c.order_id
      where c.id = j.order_line_id
        and c.from_prints
        and o.purpose = 'sale'
        and o.status <> 'cancelled'
    ) as in_cost_of_sales,
    -- A line of a live sale that costs its estimate (line_costs above): the
    -- estimate's allowance pays for this job's failures.
    exists (
      select 1
      from line_costs c
      join public.orders o on o.id = c.order_id
      where c.id = j.order_line_id
        and c.from_estimate
        and o.purpose = 'sale'
        and o.status <> 'cancelled'
    ) as covered_by_estimate
  from public.print_jobs j
  join public.workspaces w on w.id = j.workspace_id
  where (j.status in ('success', 'failed') or (j.status = 'cancelled' and j.actual_time_s is not null))
    and j.finished_at is not null
),
printing as (
  select
    workspace_id,
    month,
    -- What the failure allowance pays for: the printing to produce, failures
    -- included, without tools, tests or lines that carry their own real cost.
    coalesce(sum(cost) filter (where not tool_or_test and not in_cost_of_sales), 0) as print_cost,
    coalesce(sum(cost) filter (where failed and not tool_or_test and not in_cost_of_sales), 0)
      as failed_prints,
    -- Of those, the ones no estimate pays for: printed and never sold.
    coalesce(sum(cost) filter (
      where failed and not tool_or_test and not in_cost_of_sales and not covered_by_estimate
    ), 0) as uncovered_failed_prints,
    -- A tool's failed tries are part of what the tool cost.
    coalesce(sum(cost) filter (where tool_or_test), 0) as tools_and_tests
  from jobs
  group by workspace_id, month
),
counts as (
  -- What the count found missing, less what it found over, at what a unit
  -- was worth on the shelf. Positive is a loss.
  select
    m.workspace_id,
    date_trunc('month', m.occurred_at at time zone w.timezone)::date as month,
    round(-sum(m.quantity * coalesce(m.unit_cost, 0)), 2) as shelf_count_losses
  from public.stock_movements m
  join public.workspaces w on w.id = m.workspace_id
  where m.source_type = 'shelf_count'
  group by m.workspace_id, 2
),
written_off as (
  -- What left the inventory without being sold, outside the shelf's flows
  -- and the prints, at what it was worth when it left: a roll marked
  -- «Agotado» or «Descartado» with grams on it, a weighing, and a supply, a
  -- bag or a spare part lost (waste) or counted short by hand. Less what
  -- weighings and counts found over. A manual entry is not here: it is stock
  -- that came in without a purchase, and its cost reaches the result when it
  -- is used. Nor is a manual consumption: a made-to-order line carries its
  -- supplies in its estimate, and a printer's spare parts are in the machine
  -- cost of every print, so subtracting it here would count it twice.
  select
    m.workspace_id,
    date_trunc('month', m.occurred_at at time zone w.timezone)::date as month,
    round(-sum(m.quantity * coalesce(m.unit_cost, 0)), 2) as stock_written_off
  from public.stock_movements m
  join public.workspaces w on w.id = m.workspace_id
  where m.source_type in ('spool_status', 'weighing')
     -- By hand: a waste, a count that found less (only a count takes out with
     -- an adjustment), and a count that found more (it names its article).
     -- Before 20261027120000 a count named nothing, and one that found more
     -- cannot be told from an entry: it stays out, like an opening count.
     or (
       m.source_type = 'manual'
       and (m.type = 'waste' or (m.type = 'adjustment' and (m.quantity < 0 or m.source_id is not null)))
     )
  group by m.workspace_id, 2
),
months as (
  select workspace_id, month from sales
  union
  select workspace_id, month from money
  union
  select workspace_id, month from printing
  union
  select workspace_id, month from counts
  union
  select workspace_id, month from written_off
),
merged as (
  select
    k.workspace_id,
    k.month,
    coalesce(s.sales, 0) as sales,
    coalesce(s.cost_of_sales, 0) as cost_of_sales,
    coalesce(m.operating_expenses, 0) as operating_expenses,
    coalesce(m.other_income, 0) as other_income,
    coalesce(m.inventory_purchases, 0) as inventory_purchases,
    coalesce(m.owner_contributions, 0) as owner_contributions,
    coalesce(m.owner_draws, 0) as owner_draws,
    coalesce(p.tools_and_tests, 0) as tools_and_tests,
    coalesce(c.shelf_count_losses, 0) as shelf_count_losses,
    coalesce(p.uncovered_failed_prints, 0) as uncovered_failed_prints,
    coalesce(p.failed_prints, 0) as failed_prints,
    coalesce(p.print_cost, 0) as print_cost,
    coalesce(x.stock_written_off, 0) as stock_written_off
  from months k
  left join sales s on s.workspace_id = k.workspace_id and s.month = k.month
  left join money m on m.workspace_id = k.workspace_id and m.month = k.month
  left join printing p on p.workspace_id = k.workspace_id and p.month = k.month
  left join counts c on c.workspace_id = k.workspace_id and c.month = k.month
  left join written_off x on x.workspace_id = k.workspace_id and x.month = k.month
)
select
  workspace_id,
  month,
  sales,
  cost_of_sales,
  sales - cost_of_sales as gross_profit,
  operating_expenses,
  -- Money in that is neither a sale nor capital is the workshop's too: it
  -- adds, on its own line (E5-01).
  sales - cost_of_sales - operating_expenses
    - tools_and_tests - shelf_count_losses - uncovered_failed_prints - stock_written_off
    + other_income as net_profit,
  other_income,
  inventory_purchases,
  owner_contributions,
  owner_draws,
  tools_and_tests + shelf_count_losses + uncovered_failed_prints + stock_written_off as unsold_production,
  tools_and_tests,
  shelf_count_losses,
  failed_prints,
  print_cost,
  -- The allowance the prices carried that month: the profile in force on its last day.
  (
    select p.failure_rate
    from public.cost_profiles p
    where p.workspace_id = merged.workspace_id
      and p.valid_from < merged.month + interval '1 month'
    order by p.valid_from desc
    limit 1
  ) as failure_reserve_rate,
  uncovered_failed_prints,
  -- New columns go last: `create or replace view` keeps the others in place.
  stock_written_off
from merged;


comment on view public.monthly_income_statement is
  'Profitability by month, in the workshop''s time zone. The cost of sales of a catalogue line is what its delivered units cost when they left the shelf (labour included), plus its pending units at their estimate; a made-to-order line costs its estimate, or else its prints. What was printed and never sold is an expense of its month: moulds, tests and their failed or cancelled tries, counted losses, the failed prints (cancelled ones that ran included) no estimate pays for, and what left the inventory without being sold outside the shelf (rolls emptied or discarded with grams, weighings, supplies lost or counted by hand). Other income (money in that is neither a sale nor capital) adds to the net profit on its own line. All failed prints of production are also shown against print_cost and the failure allowance. Inventory purchases are shown apart: they reach the result through the cost of sales.';

comment on column public.monthly_income_statement.unsold_production is
  'Printed or bought and never sold, subtracted from net_profit: tools_and_tests + shelf_count_losses + uncovered_failed_prints + stock_written_off.';

comment on column public.monthly_income_statement.stock_written_off is
  'What left the inventory without being sold outside the shelf''s flows and the prints, at what it was worth when it left: rolls marked empty or discarded with grams on them (spool_status), weighings, and supplies, bags and spare parts lost (waste) or counted by hand (manual), less what weighings and counts found over. A manual entry, an opening count and a manual consumption are not here: the consumption already reaches the result through an estimate or the machine cost. Part of unsold_production, so subtracted.';
