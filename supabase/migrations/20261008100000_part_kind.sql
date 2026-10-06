-- Una pieza impresa es inventario, y hasta ahora no existía como tal.
--
-- Hoy una impresión descuenta gramos y no produce nada contable: la botella y
-- las tapas se desvanecen. Eso obliga a cargar una placa entera de nueve tapas
-- a la venta de una sola botella, y por eso una unidad suelta sale carísima.
--
-- Una pieza es un `inventory_item` y no una tabla nueva: así el kardex, la
-- receta, la valorización y los mínimos que ya existen sirven tal cual, en
-- vez de duplicarse con otro nombre.
--
-- Va sola en su propia migración porque PostgreSQL no deja **usar** un valor
-- de enumeración recién agregado dentro de la misma transacción que lo creó,
-- y el CLI corre cada archivo en una transacción.

alter type public.inventory_item_kind add value if not exists 'part';
