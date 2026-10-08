-- Negar por el rol es 42501 con su frase, también al anular (ADR-025, punto 6).
--
-- La convención es que una función que niega por el rol lo dice con el código
-- de un permiso negado (`insufficient_privilege`, 42501) y una frase para una
-- persona, como `save_printer` y `app.require_operator`. Así la pantalla sabe
-- que el «no» fue a quien pide y no a lo que escribió: vuelve a leer el rol
-- (`CurrentWorkspace.afterRefusal`) y muestra la frase tal cual.
--
-- Tres seguían con `P0001`, de antes de la convención:
--
-- * `void_transaction`, cuando quien anula no es el dueño. Un operador con la
--   pestaña abierta desde que era dueño recibía la frase, pero la pantalla la
--   tomaba por un error de lo escrito y seguía ofreciendo «Anular».
-- * `guard_ledger_change`, la misma negativa cuando se anula escribiendo en
--   la tabla.
-- * `guard_sales_category`, al desmarcar una categoría de ventas sin ser el
--   dueño.
--
-- Se recrean desde su última versión cambiando solo eso:
-- `void_transaction` y `guard_ledger_change` de
-- 20261022110000_ledger_guards, y `guard_sales_category` de
-- 20261020140000_sales_categories. `void_transaction` corre como su dueño, y
-- de paso queda con el `search_path` vacío, como pide ADR-025 a toda función
-- así: ya nombraba todo con su esquema.

-- ------------------------------------------------------------- anular

create or replace function app.void_transaction(p_id uuid, p_reason text)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions;
begin
  select * into v_transaction from public.transactions t where t.id = p_id for update;
  if not found or not app.is_member(v_transaction.workspace_id) then
    raise exception 'No encontramos ese movimiento.';
  end if;
  -- 42501, like a refused policy, so the screen knows it was the role and
  -- reads it again, instead of taking it for a mistake in what was written.
  if not app.is_owner(v_transaction.workspace_id) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'Solo el dueño del taller puede anular un movimiento de dinero.';
  end if;
  if v_transaction.voided_at is not null then
    raise exception 'Este movimiento ya estaba anulado (motivo: «%»).', v_transaction.void_reason;
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribe el motivo de la anulación: queda en el registro.';
  end if;

  update public.transactions t
  set voided_at = now(),
      void_reason = btrim(p_reason),
      voided_by = auth.uid()
  where t.id = p_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

-- ------------------------------------------- anular escribiendo en la tabla

create or replace function app.guard_ledger_change()
returns trigger
language plpgsql
as $$
declare
  c_voiding constant text[] := array['voided_at', 'void_reason', 'voided_by', 'updated_at', 'expected_direction'];
  v_order record;
  v_left numeric;
  v_paid_after numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  if (to_jsonb(new) - c_voiding) is distinct from (to_jsonb(old) - c_voiding) then
    raise exception 'Un movimiento de dinero registrado no se edita: anúlalo, con su motivo, y registra el correcto.';
  end if;

  if old.voided_at is not null then
    if new.voided_at is null then
      raise exception 'Un movimiento anulado no se puede volver a activar: si hacía falta, registra uno nuevo.';
    end if;
    if new.voided_at is distinct from old.voided_at
       or new.void_reason is distinct from old.void_reason
       or new.voided_by is distinct from old.voided_by then
      raise exception 'Este movimiento ya estaba anulado (motivo: «%»).', old.void_reason;
    end if;
    return new;
  end if;

  if new.voided_at is null then
    if new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
      raise exception 'Un movimiento de dinero registrado no se edita: anúlalo, con su motivo, y registra el correcto.';
    end if;
    return new;
  end if;

  -- Voiding it, now. Refused by role, as a refused permission.
  if not app.is_owner(new.workspace_id) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'Solo el dueño del taller puede anular un movimiento de dinero.';
  end if;
  if length(btrim(coalesce(new.void_reason, ''))) = 0 then
    raise exception 'Escribe el motivo de la anulación: queda en el registro.';
  end if;

  if new.order_id is not null and new.type in ('income', 'expense') then
    -- Locked like a collection locks it: a collection and a voiding of the
    -- same order at once would each see the other's money.
    select o.number, o.total, c.name as customer_name, coalesce(c.walk_in, false) as walk_in,
           a.name as account_name
      into v_order
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    join public.accounts a on a.id = new.account_id
    where o.id = new.order_id
    for update of o;

    -- What the order will have collected once this one stops counting.
    v_paid_after := app.order_amount_paid(new.order_id)
      - case new.type when 'income' then new.amount else -new.amount end;

    -- Both ways out are said, because both happen: the money went to another
    -- account, or it never came (a Yape that did not go through, a forged
    -- note). The sale did happen and the goods left: what is corrected is
    -- where the money is, or that it is not anywhere.
    if new.type = 'income' and v_order.walk_in then
      v_left := v_order.total - v_paid_after;
      if v_left > 0 then
        raise exception 'Este cobro es de %, una venta a «%», que se paga en el acto y nunca debe: anulado, el pedido quedaría debiendo S/ % a nombre de nadie, así que no se anula. Si el dinero entró en otra cuenta, regístralo como una transferencia de % a esa cuenta. Si nunca llegó (un Yape que no entró, un billete falso), registra un egreso de S/ % en %: la venta queda hecha y lo que no llegó queda como pérdida.',
          v_order.number, v_order.customer_name, to_char(v_left, 'FM999999999990.00'),
          v_order.account_name, to_char(new.amount, 'FM999999999990.00'), v_order.account_name;
      end if;
    end if;

    -- A refund voided counts as collected again: never beyond the total, the
    -- rule every collection already meets.
    if new.type = 'expense' and v_paid_after > v_order.total then
      raise exception 'Anulada esta devolución, el pedido % quedaría cobrado de más: el total es S/ % y contaría S/ % cobrados. Si la devolución nunca se hizo, anula antes el cobro que la reemplazó.',
        v_order.number, to_char(v_order.total, 'FM999999999990.00'), to_char(v_paid_after, 'FM999999999990.00');
    end if;
  end if;

  new.voided_at := now();
  new.void_reason := btrim(new.void_reason);
  new.voided_by := auth.uid();
  return new;
end;
$$;

-- -------------------------------------------- desmarcar una categoría de ventas

create or replace function app.guard_sales_category()
returns trigger
language plpgsql
as $$
begin
  if not (old.sales and not new.sales) then
    return new;
  end if;
  -- Without a signed-in user the caller is trusted: a migration, the SQL console.
  -- Refused by role, as a refused permission.
  if auth.uid() is not null and not app.is_owner(new.workspace_id) then
    raise exception using
      errcode = 'insufficient_privilege',
      message = 'Solo el dueño del taller puede desmarcar una categoría de ventas: desmarcada, una venta podría anotarse en Caja como ingreso suelto, sin salir del estante ni llevar su costo.';
  end if;
  if exists (
    select 1 from public.workshop_settings s
    where s.workspace_id = new.workspace_id
      and s.order_payment_category_id = new.id
  ) then
    raise exception '«%» es la categoría de los cobros de pedidos, así que es de ventas. Para desmarcarla, elige antes otra categoría para los cobros.',
      new.name;
  end if;
  return new;
end;
$$;
