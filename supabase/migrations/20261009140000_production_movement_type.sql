-- Lo que el taller produce no se compra.
--
-- Hasta hoy, las piezas que salían de una impresión entraban al estante con
-- tipo `purchase`, porque era el único tipo que sumaba stock. En el kardex eso
-- se lee como "compramos nueve tapas", que es falso y confunde justo a quien
-- está intentando entender por qué el stock dice lo que dice.
--
-- Un valor nuevo de enum no se puede usar en la misma transacción que lo creó,
-- así que va solo en su migración.
alter type public.stock_movement_type add value if not exists 'production';
