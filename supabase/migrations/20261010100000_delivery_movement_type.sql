-- Lo que sale del estante hacia un cliente tiene su propio tipo de movimiento.
--
-- "Consumo" es lo que se gasta para fabricar: el filamento de una placa, los
-- dulces al armar. Una entrega no se gasta, se vende o se regala, y el kardex
-- tiene que poder decirlo con esa palabra. Va sola en su migración: un valor
-- nuevo de enum no se puede usar en la misma transacción que lo creó.

alter type public.stock_movement_type add value if not exists 'delivery';
