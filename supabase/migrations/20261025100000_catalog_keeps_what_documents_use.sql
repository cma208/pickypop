-- Lo que un documento ya usa no se borra del catálogo (T2-01).
--
-- `quote_lines`, `order_lines` e `inventory_items` apuntan a la variante con
-- ON DELETE SET NULL. Borrar una variante cotizada dejaba la línea como
-- «catálogo» sin variante: el plan la leía como un trabajo a medida y la
-- versión nueva de la cotización la recotizaba a precio de costo (de S/ 5.00 a
-- S/ 0.34). A un pedido entregado le pasaba lo mismo, y el producto armado del
-- estante perdía su variante: ni la entrega ni la Venta rápida lo encontraban.
--
-- Esas llaves son de las tablas de ventas y de inventario, así que no se tocan
-- aquí: el catálogo se niega a soltar lo que otros usan, con un disparador en
-- su propia tabla. Una variante que ya está en un documento se desactiva, que
-- es lo que existe `active` para hacer. Una que nadie usó (la que se creó por
-- error) se sigue pudiendo borrar, solo el dueño, con su receta y su escalera.
--
-- Vale también al borrar un producto: sus variantes caen en cascada y cada
-- una pasa por aquí.

/*
 * Where a variant is used: how many quotes and orders have it in a line, and
 * whether its assembled product is an inventory article. The screen asks this
 * before offering «Eliminar», and the trigger below asks the same, so the two
 * never give different answers.
 */
create or replace function app.variant_usage(p_variant_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'quotes', (select count(distinct ql.quote_id) from public.quote_lines ql where ql.variant_id = p_variant_id),
    'orders', (select count(distinct ol.order_id) from public.order_lines ol where ol.variant_id = p_variant_id),
    'shelf', (select count(*) from public.inventory_items i where i.product_variant_id = p_variant_id)
  );
$$;

grant execute on function app.variant_usage(uuid) to authenticated;

create or replace function public.variant_usage(p_variant_id uuid)
returns jsonb
language sql
stable
as $$
  select app.variant_usage(p_variant_id);
$$;

grant execute on function public.variant_usage(uuid) to authenticated;

comment on function app.variant_usage(uuid) is
  'Dónde se usa una variante: cotizaciones y pedidos que la tienen en una línea, y si su producto armado es un artículo del inventario. Una variante usada no se borra: se desactiva.';

create or replace function app.variant_keeps_its_documents()
returns trigger
language plpgsql
as $$
declare
  v_usage jsonb := app.variant_usage(old.id);
  v_quotes integer := (v_usage ->> 'quotes')::integer;
  v_orders integer := (v_usage ->> 'orders')::integer;
  v_where text[] := '{}';
begin
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

create trigger product_variants_keep_their_documents
  before delete on public.product_variants
  for each row execute function app.variant_keeps_its_documents();

-- ----------------------------------------------------------------- placas
--
-- `print_jobs.recipe_plate_id` también es ON DELETE SET NULL. Una impresión
-- cerrada guarda su etiqueta y sus costos, así que perder la placa no le
-- cambia nada. Una que espera en la cola, o que se está imprimiendo, sí: al
-- cerrarla ya no sabría qué piezas salen, y no metería nada al estante. Esa
-- placa no se quita hasta que la impresión se cierre o se cancele.

create or replace function app.plate_keeps_its_prints()
returns trigger
language plpgsql
as $$
declare
  v_pending integer;
begin
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

create trigger recipe_plates_keep_their_prints
  before delete on public.recipe_plates
  for each row execute function app.plate_keeps_its_prints();
