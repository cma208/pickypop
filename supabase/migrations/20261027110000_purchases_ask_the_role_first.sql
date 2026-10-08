-- Compras y numeración preguntan el rol al principio (ADR-025, punto 6), y
-- su stock se mueve solo por ellas (punto 9).
--
-- «Solo lectura» que intentaba registrar una compra, pagarla, pesar un rollo,
-- cambiarle el estado o mover un insumo chocaba más adentro: con la política
-- de la primera tabla que la función escribía («new row violates row-level
-- security policy for table "purchases"», o "stock_movements", o "spools"),
-- y la pantalla mostraba la frase genérica de permisos. Peor con la
-- numeración: `next_document_number` corre como su dueño y solo miraba que
-- quien llama fuera miembro, así que «Solo lectura» gastaba un número de
-- pedido o de cotización antes de que algo más adentro lo rechazara, y sin
-- sesión (`anon`, que la API sí deja llamar) numeraba en cualquier taller.
--
-- Ahora cada una pregunta al principio con `app.require_operator`, la misma
-- regla del estante (20261027100000): «Solo lectura» recibe un 42501 con la
-- frase de lo que quiso hacer, y alguien de otro taller, el «no encontramos»
-- que ya decía la función.
--
-- * `next_document_number` es `security definer`: la comprobación va dentro,
--   antes de tocar el contador, y `anon` deja de poder llamarla. Sin sesión
--   (una migración, la consola) sigue numerando, como desde 20260930020000.
-- * Las de compras son `security invoker`: la seguridad por fila ya las
--   protege, y la comprobación es para decirlo bien. Va en la función que
--   llama la pantalla, la de `public`, antes de entrar a la de `app`. Así no
--   se recrean sus cuerpos (que siguen siendo los de 20261023100000,
--   20261023110000, 20261023120000, 20261023160000 y 20261023180000), y
--   `register_purchase`, que paga por dentro con `app.record_purchase_payment`,
--   no pregunta dos veces. Las firmas no cambian: solo pasan de `sql` a
--   `plpgsql`.
--
-- Y su stock se mueve solo por ellas. Desde 20261027120000 Resultados lee los
-- movimientos de origen `manual`, `weighing` y `spool_status` como pérdidas,
-- y la política de insert de `stock_movements` dejaba al operador escribir
-- uno cualquiera por la API, con la cantidad y el costo que quisiera: una
-- pestaña con un error (o un POST a mano) fabricaba una pérdida o una
-- ganancia de S/ 50000 y una unidad que no existe en el kardex. Ahora la
-- política exige, además del rol y de que sea un rollo, un insumo, un
-- empaque o un repuesto del taller, que el movimiento lo escriba uno de sus
-- flujos (`app.in_stock_flow`): la compra, el pesaje y el movimiento de un
-- insumo lo dicen en la función de `public` antes de entrar a la de `app`, y
-- el cambio de estado del rollo en el disparador que saca lo que tenía. Lo
-- dicen con `app.stock_flow`, solo para la transacción, y lo devuelven a como
-- estaba al salir. La API no puede ponerlo: solo llega a las funciones de
-- `public`, igual que con `app.quick_sale` (20261020150000). Las cuatro siguen
-- siendo `security invoker`: pasan por la política como el operador.

-- ------------------------------------------------------------- numerar

-- The one of 20260930020000_numbering_for_trusted_callers, asking the role
-- before the counter moves.
create or replace function app.next_document_number(p_workspace uuid, p_doc_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
  v_prefix text;
begin
  perform app.require_operator(p_workspace, 'No perteneces a este taller.', 'crear cotizaciones y pedidos');

  insert into public.document_counters as c (workspace_id, doc_kind, year, last_number)
  values (p_workspace, p_doc_kind, v_year, 1)
  on conflict (workspace_id, doc_kind, year)
  do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  v_prefix := case p_doc_kind
                when 'quote' then 'COT'
                when 'order' then 'ORD'
                else upper(left(p_doc_kind, 3))
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_number::text, 4, '0'));
end;
$$;

revoke execute on function app.next_document_number(uuid, text) from public, anon;
revoke execute on function public.next_document_number(uuid, text) from public, anon;
grant execute on function app.next_document_number(uuid, text) to authenticated, service_role;
grant execute on function public.next_document_number(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------- comprar

create or replace function public.register_purchase(
  p_workspace_id uuid,
  p_lines jsonb,
  p_purchased_at date default null,
  p_supplier_id uuid default null,
  p_document_ref text default null,
  p_shipping_cost numeric default 0,
  p_other_costs numeric default 0,
  p_allocation public.cost_allocation default 'by_amount',
  p_note text default null,
  p_account_id uuid default null,
  p_payment_method public.payment_method default null,
  p_purchase_key uuid default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_flow text := current_setting('app.stock_flow', true);
  v_result jsonb;
begin
  perform app.require_operator(p_workspace_id, 'No perteneces a este taller.', 'registrar compras');
  -- Its rolls and articles enter the stock through the policy, as its flow.
  perform set_config('app.stock_flow', 'register_purchase', true);
  v_result := app.register_purchase(
    p_workspace_id, p_lines, p_purchased_at, p_supplier_id, p_document_ref,
    p_shipping_cost, p_other_costs, p_allocation, p_note,
    p_account_id, p_payment_method, p_purchase_key
  );
  perform set_config('app.stock_flow', coalesce(v_flow, ''), true);
  return v_result;
end;
$$;

create or replace function public.record_purchase_payment(
  p_purchase_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_note text default null,
  p_payment_key uuid default null
)
returns public.transactions
language plpgsql
volatile
as $$
begin
  perform app.require_operator(
    (select p.workspace_id from public.purchases p where p.id = p_purchase_id),
    'No existe la compra indicada.',
    'registrar pagos de compras'
  );
  return app.record_purchase_payment(
    p_purchase_id, p_account_id, p_amount, p_payment_method,
    p_occurred_at, p_reference, p_note, p_payment_key
  );
end;
$$;

-- ------------------------------------------------------------- los rollos

create or replace function public.weigh_spool(
  p_spool_id uuid,
  p_gross_g numeric,
  p_tare_g numeric,
  p_reopen boolean default false
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_flow text := current_setting('app.stock_flow', true);
  v_result jsonb;
begin
  perform app.require_operator(
    (select s.workspace_id from public.spools s where s.id = p_spool_id),
    'No existe el rollo indicado.',
    'pesar rollos'
  );
  -- What the scale found enters the stock through the policy, as its flow.
  perform set_config('app.stock_flow', 'weigh_spool', true);
  v_result := app.weigh_spool(p_spool_id, p_gross_g, p_tare_g, p_reopen);
  perform set_config('app.stock_flow', coalesce(v_flow, ''), true);
  return v_result;
end;
$$;

create or replace function public.set_spool_status(
  p_spool_id uuid,
  p_status public.spool_status,
  p_expected public.spool_status default null
)
returns jsonb
language plpgsql
volatile
as $$
begin
  perform app.require_operator(
    (select s.workspace_id from public.spools s where s.id = p_spool_id),
    'No existe el rollo indicado.',
    'cambiar el estado de un rollo'
  );
  return app.set_spool_status(p_spool_id, p_status, p_expected);
end;
$$;

-- ------------------------------------------------------------- los insumos

create or replace function public.move_item_stock(
  p_item_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason public.stock_movement_type default null,
  p_note text default null,
  p_request_key uuid default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_flow text := current_setting('app.stock_flow', true);
  v_result jsonb;
begin
  perform app.require_operator(
    (select i.workspace_id from public.inventory_items i where i.id = p_item_id),
    'No existe el artículo indicado.',
    'mover el stock de un artículo'
  );
  -- The entry, exit or count enters the stock through the policy, as its flow.
  perform set_config('app.stock_flow', 'move_item_stock', true);
  v_result := app.move_item_stock(p_item_id, p_mode, p_quantity, p_reason, p_note, p_request_key);
  perform set_config('app.stock_flow', coalesce(v_flow, ''), true);
  return v_result;
end;
$$;

-- ------------------------------------------------- el stock, por sus flujos

/*
 * Whether one of the stock flows that run as the caller is writing: a
 * purchase, a weighing, a supply moved by hand or a roll's state. They say so
 * in `app.stock_flow`, for their transaction only, and the API cannot set it.
 */
create or replace function app.in_stock_flow()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.stock_flow', true), '') <> '';
$$;

grant execute on function app.in_stock_flow() to authenticated;

comment on function app.in_stock_flow() is
  'Si escribe uno de los flujos de stock que corren como quien llama (compra, pesaje, movimiento de un insumo, estado del rollo). Lo dicen en app.stock_flow, solo para su transacción; la API no puede ponerlo.';

-- The one of 20261023120000_spool_status_moves_stock, saying it is the flow.
create or replace function app.spool_status_moves_stock()
returns trigger
language plpgsql
as $$
declare
  v_on_hand numeric := app.spool_on_hand(new.id);
  v_flow text := current_setting('app.stock_flow', true);
begin
  if v_on_hand > 0 then
    -- What the roll held leaves through the policy, as the flow of its state.
    perform set_config('app.stock_flow', 'spool_status', true);
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
    perform set_config('app.stock_flow', coalesce(v_flow, ''), true);
  end if;

  return null;
end;
$$;

-- What 20261027100000 let in (a roll, a supply, a bag or a spare part of the
-- workshop, by an owner or an operator), and only from inside its flows.
drop policy if exists stock_movements_insert on public.stock_movements;

create policy stock_movements_insert on public.stock_movements
  for insert to authenticated
  with check (
    app.can_operate(workspace_id)
    and app.in_stock_flow()
    and app.movable_by_hand(workspace_id, spool_id, inventory_item_id)
  );
