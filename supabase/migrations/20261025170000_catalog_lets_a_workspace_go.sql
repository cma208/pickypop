-- Un taller entero se sigue pudiendo borrar.
--
-- 20261025100000 hizo que una variante usada en una cotización o un pedido no
-- se borre, y que una placa con una impresión en la cola tampoco. Los dos
-- disparadores saltaban también en la cascada de borrar el taller entero, que
-- es como se quita un taller de prueba o de demostración: `delete from
-- workspaces` fallaba con «No se puede eliminar la variante…».
--
-- Ahí no hay documento que proteger: el taller se va con todas sus
-- cotizaciones, pedidos e impresiones. Igual que el kardex y los trabajos
-- cerrados, la regla vale mientras el taller exista. Cuando la cascada llega a
-- la variante o a la placa, el taller ya no está.

create or replace function app.variant_keeps_its_documents()
returns trigger
language plpgsql
as $$
declare
  v_usage jsonb;
  v_quotes integer;
  v_orders integer;
  v_where text[] := '{}';
begin
  if not exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    return old;
  end if;

  v_usage := app.variant_usage(old.id);
  v_quotes := (v_usage ->> 'quotes')::integer;
  v_orders := (v_usage ->> 'orders')::integer;

  if v_quotes = 1 then
    v_where := v_where || 'en 1 cotización'::text;
  elsif v_quotes > 1 then
    v_where := v_where || format('en %s cotizaciones', v_quotes);
  end if;
  if v_orders = 1 then
    v_where := v_where || 'en 1 pedido'::text;
  elsif v_orders > 1 then
    v_where := v_where || format('en %s pedidos', v_orders);
  end if;
  if (v_usage ->> 'shelf')::integer > 0 then
    v_where := v_where || 'en el inventario como producto armado'::text;
  end if;

  if cardinality(v_where) = 0 then
    return old;
  end if;

  raise exception 'No se puede eliminar la variante «%»: está %. Desactívala: deja de ofrecerse para vender, y lo que ya se cotizó o se vendió conserva su producto.',
    old.name,
    case cardinality(v_where)
      when 1 then v_where[1]
      else array_to_string(v_where[1:cardinality(v_where) - 1], ', ') || ' y ' || v_where[cardinality(v_where)]
    end;
end;
$$;

create or replace function app.plate_keeps_its_prints()
returns trigger
language plpgsql
as $$
declare
  v_pending integer;
begin
  if not exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    return old;
  end if;

  select count(*) into v_pending
  from public.print_jobs j
  where j.recipe_plate_id = old.id
    and j.status in ('planned', 'printing');

  if v_pending > 0 then
    raise exception 'No se puede quitar la placa %: %. Ciérrala o cancélala en Producción, y después quita la placa.',
      old.plate_index || coalesce(' (' || nullif(btrim(old.label), '') || ')', ''),
      case when v_pending = 1 then 'tiene una impresión en la cola o imprimiéndose'
           else format('tiene %s impresiones en la cola o imprimiéndose', v_pending) end;
  end if;

  return old;
end;
$$;
