-- Una llave por movimiento de dinero, en el movimiento.
--
-- Tres áreas resolvieron por su cuenta el mismo problema (un envío que llega
-- dos veces porque la respuesta se perdió), con tres ideas distintas:
--
-- * finanzas: `transactions.entry_key`, única por taller, con
--   `record_payment(p_key)` y el «on conflict do nothing» de Caja
--   (20261022140000);
-- * ventas: una tabla aparte, `order_payment_keys`, para
--   `collect_order_payment` (20261026100000), que decía «La llave no va en
--   `transactions`... la llave tendría que escribirse después de que
--   `record_payment` inserta». No era así: `record_payment` ya recibía la
--   llave y la escribía en el mismo insert;
-- * compras: otra tabla, `purchase_payment_requests`, para
--   `record_purchase_payment` (20261023100000).
--
-- Un cobro o un pago es un movimiento de dinero, y su llave es la del
-- movimiento: ahora las tres la dejan en `transactions.entry_key`.
--
-- * `collect_order_payment` pasa su llave a `record_payment` como `p_key`, y
--   la busca primero en `transactions`. Sigue escribiendo `order_payment_keys`,
--   porque la ficha del pedido pregunta ahí si un cobro cuya respuesta se
--   perdió quedó registrado; cuando pregunte en `transactions`, la tabla se
--   puede soltar.
-- * `record_purchase_payment` escribe la llave en el movimiento y la busca
--   ahí. `purchase_payment_requests` ya no se escribe: solo se lee, para un
--   reintento con una llave de antes de esta migración.
-- * Las dos rechazan la llave usada en otro pedido u otra compra, en vez de
--   devolver el movimiento de otro.
--
-- Lo demás que se pide con llave ya la guarda en la fila que crea
-- (`orders.quick_sale_key` y `create_key`, `quotes.save_key`,
-- `purchases.purchase_key`, `order_deliveries.delivery_key`,
-- `print_jobs.request_key`, el `source_id` de un armado). La excepción que
-- queda es `item_movement_requests` (`move_item_stock`): un conteo que no
-- cambia nada no escribe ningún movimiento, y aun así la misma llave tiene
-- que devolver la misma respuesta.
--
-- Las funciones se recrean desde su última versión y sus firmas no cambian.
-- Nada de lo guardado se toca: las llaves viejas siguen donde estaban.

-- ------------------------------------------------------- cobrar un pedido
--
-- La de 20261026100000_order_payment_once, con la llave en el movimiento.
create or replace function app.collect_order_payment(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default null,
  p_occurred_at timestamptz default null,
  p_reference text default null,
  p_payment_key uuid default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_workspace uuid;
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_key_order uuid;
  v_key_transaction uuid;
  v_transaction public.transactions;
begin
  select o.workspace_id into v_workspace from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'No existe el pedido solicitado.';
  end if;

  -- The same payment asked again: the movement it already made, and nothing else.
  if p_payment_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('order payment ' || p_payment_key::text, 0));

    -- The key is the movement's (transactions.entry_key), as for Caja.
    select t.order_id, t.id into v_key_order, v_key_transaction
    from public.transactions t
    where t.workspace_id = v_workspace and t.entry_key = p_payment_key;

    -- A payment from before 20261027150000 has its key here only.
    if v_key_order is null then
      select k.order_id, k.transaction_id into v_key_order, v_key_transaction
      from public.order_payment_keys k
      where k.workspace_id = v_workspace and k.payment_key = p_payment_key;
    end if;

    if v_key_order is not null then
      if v_key_order <> p_order_id then
        raise exception 'Este cobro ya se registró en otro pedido. Recarga la pantalla y vuelve a intentarlo.';
      end if;
      select * into v_transaction from public.transactions t where t.id = v_key_transaction;
      return v_transaction;
    end if;
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha del cobro no es válida.';
  end if;
  -- A few minutes of slack: the phone's clock is not the server's.
  if v_when > now() + interval '5 minutes' then
    raise exception 'El cobro no puede tener fecha futura. Anótalo con la fecha en que entró el dinero.';
  end if;

  v_transaction := app.record_payment(
    p_order_id, p_account_id, p_amount, p_payment_method, v_when, null, p_reference, null, p_payment_key
  );

  -- Still written: the order's screen asks here whether a payment whose
  -- answer was lost went in.
  if p_payment_key is not null then
    insert into public.order_payment_keys (workspace_id, payment_key, order_id, transaction_id)
    values (v_workspace, p_payment_key, p_order_id, v_transaction.id);
  end if;

  return v_transaction;
end;
$$;

comment on function public.collect_order_payment(uuid, uuid, numeric, public.payment_method, timestamptz, text, uuid) is
  'Cobra un pedido por record_payment, una sola vez por llave (p_payment_key, que queda en transactions.entry_key): la misma llave devuelve el cobro que ya se hizo, y usada en otro pedido se rechaza. Rechaza la fecha futura.';

-- ------------------------------------------------------- pagar una compra
--
-- La de 20261023100000_purchase_payment_key, con la llave en el movimiento.
create or replace function app.record_purchase_payment(
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
as $$
declare
  v_purchase public.purchases;
  v_account public.accounts;
  v_amount numeric(12, 2);
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_total numeric;
  v_paid numeric;
  v_method public.payment_method;
  v_transaction public.transactions;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'No existe la compra indicada.';
  end if;

  -- The same payment asked again: the one already written, and nothing else.
  if p_payment_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('purchase_payment ' || p_payment_key::text, 0));

    -- The key is the movement's (transactions.entry_key), as for Caja.
    select t.* into v_transaction
    from public.transactions t
    where t.workspace_id = v_purchase.workspace_id and t.entry_key = p_payment_key;

    -- A payment from before 20261027150000 has its key here only.
    if not found then
      select t.* into v_transaction
      from public.purchase_payment_requests r
      join public.transactions t on t.id = r.transaction_id
      where r.workspace_id = v_purchase.workspace_id and r.request_key = p_payment_key;
    end if;

    if found then
      if v_transaction.purchase_id is distinct from p_purchase_id then
        raise exception 'Este pago ya se registró en otra compra. Recarga la pantalla y vuelve a intentarlo.';
      end if;
      return v_transaction;
    end if;
  end if;

  -- Rounded up front: the check has to judge the amount that will be stored.
  if p_amount is null or p_amount = 'NaN'::numeric then
    raise exception 'Indica cuánto pagaste.';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 then
    raise exception 'El monto mínimo de un pago es S/ 0.01.';
  end if;

  if not isfinite(v_when) then
    raise exception 'La fecha del pago no es válida.';
  end if;
  if v_when > now() + interval '5 minutes' then
    raise exception 'El pago no puede tener fecha futura.';
  end if;

  select * into v_account from public.accounts where id = p_account_id;
  if not found then
    raise exception 'No existe la cuenta indicada para el pago.';
  end if;
  if v_account.workspace_id <> v_purchase.workspace_id then
    raise exception 'La cuenta % pertenece a otro taller.', v_account.name;
  end if;
  if not v_account.active then
    raise exception 'La cuenta % está desactivada.', v_account.name;
  end if;

  v_method := coalesce(p_payment_method, v_account.default_payment_method);
  if v_method is null then
    raise exception 'Falta el medio de pago: la cuenta % no tiene uno por defecto.', v_account.name;
  end if;

  select s.total, s.paid into v_total, v_paid
  from public.purchase_payment_status s
  where s.purchase_id = p_purchase_id;

  if v_paid + v_amount > v_total then
    raise exception
      'El pago excede lo que falta pagar de la compra: el total es S/ %, ya se pagó S/ %, queda S/ % y se intentó pagar S/ %.',
      to_char(v_total, 'FM999999999990.00'),
      to_char(v_paid, 'FM999999999990.00'),
      to_char(v_total - v_paid, 'FM999999999990.00'),
      to_char(v_amount, 'FM999999999990.00');
  end if;

  insert into public.transactions (
    workspace_id, account_id, type, amount, occurred_at,
    payment_method, purchase_id, counterparty, reference, note, entry_key
  )
  values (
    v_purchase.workspace_id,
    p_account_id,
    'expense',
    v_amount,
    v_when,
    v_method,
    p_purchase_id,
    (select s.name from public.suppliers s where s.id = v_purchase.supplier_id),
    coalesce(nullif(btrim(p_reference), ''), v_purchase.document_ref),
    coalesce(
      nullif(btrim(p_note), ''),
      format('Pago de la compra del %s', to_char(v_purchase.purchased_at, 'DD/MM/YYYY'))
    ),
    p_payment_key
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on table public.purchase_payment_requests is
  'Las llaves de los pagos de compra anteriores a 20261027150000. Desde entonces la llave va en transactions.entry_key y aquí no se escribe nada: record_purchase_payment solo la lee para un reintento con una llave vieja.';

comment on table public.order_payment_keys is
  'La llave con que la ficha del pedido pidió cada cobro. Desde 20261027150000 la llave también queda en transactions.entry_key, que es donde collect_order_payment la busca primero; esta tabla se sigue escribiendo porque la ficha pregunta aquí si un cobro cuya respuesta se perdió quedó registrado. Solo crece.';
