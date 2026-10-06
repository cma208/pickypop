# Inventario y compras — ronda 1

Mirada: filamentos y rollos, insumos, empaque, piezas impresas, armar, compras y kardex. Trabajé sobre el código (`apps/web/src/app/features/inventario/`, `ui/`, `core/`), las migraciones y la base local, sin navegador. No creé ni borré datos.

**Ojo con los números:** el agente "Persona nueva" movió la base mientras yo trabajaba (compró dulces y bolsas de celofán, imprimió, armó 10 pociones y las entregó a "María Barrido"). Uso esos movimientos como evidencia en vivo y cito la hora de cada consulta. La foto de referencia es la de las **15:48 del 2026-10-06**.

## En cinco líneas

1. **El inventario solo sabe "lo que hay", nunca "lo que ya está prometido".** Cuatro pantallas le ponen cuatro nombres al mismo número ("Disponible", "Existencias", "En el estante", "Hay"), y ninguna descuenta lo que piden los pedidos. A las 15:48 el estante mostraba 10 pociones que ya se habían entregado, y la vista de producción las restaba de lo que les falta a otros cuatro pedidos.
2. **Nada te dice qué comprar ni cuánto.** El mínimo solo avisa dentro de su propia lista, y "Hoy" solo mira el filamento: señala el verde lima, que ninguna receta usa, mientras para los 41 pociones comprometidas faltan 2.3 kg de dulces.
3. **Comprar no paga.** La compra no crea el egreso, y desde Caja no hay forma de ligar uno a la compra. Si se anota a mano, cuenta como gasto operativo y la utilidad del mes sale más baja de lo real. Además el formulario obliga a dividir (los dulces entraron como "500 × S/ 0.03") y una compra mal cargada no se puede anular.
4. **El costo y el kardex no se ponen de acuerdo.** Los insumos salen a su último precio (el armado de hoy cargó los dulces un 27 % más caros), las piezas a un promedio de todo lo que se imprimió alguna vez y el filamento al promedio de lo que hay. El kardex es un diario sin saldo, llama "Compra" a lo que se imprimió y muestra "assembly" en inglés.
5. **Propuesta central:** una sola *posición* por artículo (en mano · apartado · libre · falta), calculada a partir de los pedidos confirmados y las recetas, sin guardar nada. La usarían todas las pantallas, una lista "Por comprar" con su plazo, y el conteo de fin de mes. Hoy el conteo es por ventanita y deja fuera las piezas y los terminados, y la foto aparece a 28 px o no aparece.

## Hallazgos

### H1. "¿Cuánto me queda libre?": todas las pantallas dicen cuánto hay y ninguna cuánto está prometido

- **Qué pasa:**
  - **Cuatro nombres para el mismo número.** Filamentos titula la columna "Disponible" y pinta `availableG` (`filamentos.page.ts:77,124`). Insumos y Empaque dicen "Existencias" (`insumos.page.ts:61,82`), Piezas dice "En el estante" (`piezas.page.ts:55`) y Armar dice "Hay" (`armar.page.ts:91,108`). Los cuatro son el mismo número, porque nadie escribe reservas (corte 2 del encargo): `available = on_hand − reserved` con `reserved` siempre 0 (`20260929231000_inventory.sql:200-203,239-242`).
  - **Ni siquiera el mínimo se mide contra lo mismo.** El filamento compara lo disponible (`filament_sku_stock.below_minimum`). Los insumos comparan lo que hay en mano, y la cuenta está escrita en TypeScript (`inventario.data.ts:818`). Las piezas también comparan lo que hay en mano, pero en otra vista (`part_stock`).
  - **Reservar por movimientos no sirve para el filamento.** Un movimiento apunta a un rollo **o** a un artículo (`stock_movements_one_target`). Para apartar 233 g de rosado habría que elegir *qué rollo* en el momento de la venta, y lo que la venta necesita son gramos de un color, no un carrete concreto.
  - **La vista de producción cuenta lo que ya se fue.** `production_needs` suma la demanda de los pedidos `confirmed, queued, printing, post_processing` y le resta **todo** el producto armado que hay (definición de la vista). En vivo, a las 15:48, el pedido ORD-2026-0001 (María Barrido, 10 unidades) estaba `delivered`, y aun así las 10 pociones seguían en el estante (corte 3). `production_needs` contestaba `committed 41 · assembled 10 · missing 31`: le faltaban 41 y decía 31. Por la misma razón, el producto de un pedido `ready` (que está fuera de la demanda) se ofrece a los demás.
  - **Armar dice "No alcanza" y "10 armadas en el estante"** (`assembly_options` a las 15:48), y no menciona que hay 41 comprometidas.
- **Qué tarea traba:** el vendedor quiere saber si puede prometer 10 pociones más, y tiene que sumar de cabeza los pedidos abiertos contra cuatro listas. El taller quiere saber cuántas armadas están libres, y tiene que adivinar cuáles ya tienen dueño.
- **Ejemplo con los datos de las 15:48:** 41 pociones "con dulces surtidos" comprometidas en 4 pedidos. Tomo las 10 armadas por entregadas, que es lo que son. Explotando la receta (66 g de dulces, 1 bolsa con etiqueta, 1 botella y 1 tapa por unidad; la placa "Botella" sale de a 1 en 43 min y la de "Tapas" de a 9 en 20 min):

  | Artículo | Hace falta | En mano | Falta | Qué resuelve |
  |---|---|---|---|---|
  | Dulces surtidos | 2,706 g | 360 g | **2,346 g** | Comprar |
  | Bolsa con etiqueta | 41 | 60 | 0 (quedan 19, bajo el mínimo de 50) | Comprar para reponer el mínimo |
  | Botella impresa | 41 | 0 | 41 | 41 placas, 29 h 27 min de impresora |
  | Tapa impresa | 41 | 4 | 37 | 5 placas, 1 h 40 min |
  | Rosado / Negro / Rojo | 233 g / 265 g / 42 g | 613 / 837 / 934 g | 0 | Alcanza |

  Lo único que hay que comprar son dulces y bolsas. Ninguna pantalla de hoy lo dice (ver H2).
- **Cómo lo resuelven otros:**
  - **Shopify** separa *On hand*, *Committed*, *Available* y *Unavailable*. Lo comprometido son las unidades de un pedido no despachado, y deja de serlo al despacharse ([Inventory states](https://help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/inventory-states)).
  - **Katana** muestra *In stock · Committed · Expected* y calcula el faltante como *In stock − Committed + Expected − Safety stock* ([Basics of inventory management](https://support.katanamrp.com/en/articles/5908776-basics-of-inventory-management)). La disponibilidad de los ingredientes de cada pedido "se calcula sola según el stock y la prioridad de los pedidos y no se ajusta a mano" ([Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability)).
  - **InvenTree** tiene, en cada pieza, una pestaña *Allocations* con lo asignado a órdenes ([Part views](https://docs.inventree.org/en/stable/part/views/)).
- **Propuesta:**
  1. **Apartar sin escribir reservas.** Una vista derivada, por ejemplo `stock_position`, que para cada artículo y cada SKU de filamento dé: **en mano**, **apartado** (lo que piden los pedidos abiertos), **libre** (en mano − apartado) y **falta** (lo que no alcanza). Es la regla de la casa, "los saldos no se guardan, se derivan", y es lo que hace Katana. Cancelar o entregar un pedido libera solo, sin un `release` que alguien tenga que acordarse de escribir: esa clase de error ("un cálculo que nunca se recalculaba") es justo el más caro que ya tuvo el proyecto.
  2. **Cuándo se aparta.** Desde que el pedido está `confirmed` hasta que está `delivered` o `cancelled`, `ready` incluido. **Nunca con la cotización.** La proforma informa, el pedido compromete; es la misma línea que traza Shopify entre borrador y pedido. `on_hold` queda como pregunta para el dueño.
  3. **Cómo se reparte la demanda.** En el orden "lo armado primero, después las piezas en el estante, después las placas por imprimir, y de ahí los gramos por color". Cuando no alcanza para todos, por fecha de entrega: gana el que vence antes.
  4. **Un solo componente para mostrarlo**, por ejemplo `pp-stock`: "En mano 360 g · Apartado 2,706 g · **Faltan 2,346 g**". Va con las mismas palabras en Filamentos, Insumos, Empaque, Piezas, Armar, Cotizador y Pedido nuevo. Cada uno ve lo que le sirve:

     | Quién | Dónde | Qué ve |
     |---|---|---|
     | Vendedor | Cotizador, Pedido nuevo | Cuántas libres, qué falta y en cuánto tiempo (lo desarrolla la mirada de ventas) |
     | Taller | Armar, Estante, Piezas | En mano · apartado (para qué pedido) · libre |
     | Quien compra | Por comprar (H2) | Falta = apartado + mínimo − en mano |

  5. `production_needs` debería **leer esta misma vista** en vez de hacer su propia cuenta. Es el pedido de M12: "que la cuenta viva en un solo sitio".
- **Tamaño:** L (la vista con la explosión de dos niveles y sus pruebas contra la base); el componente y su uso en las pantallas, M.
- **Gravedad:** bloquea.

### H2. "¿Qué tengo que comprar, y cuánto?": nada lo dice

- **Qué pasa:**
  - **"Hoy" solo mira el filamento.** La tarjeta es "Filamentos bajo mínimo" (`panel.data.ts:76-80`, `panel.page.ts:82`). Ningún insumo, empaque, pieza o repuesto llega a "Hoy".
  - **El mínimo promete un aviso que no llega.** El formulario de artículo dice "Avisa cuando baje de aquí" (`item-form.ts:46`), pero el aviso es una insignia dentro de la propia lista y un filtro "Solo bajo mínimo" (`insumos.page.ts:46-49,83-85`). Hay que entrar a mirar.
  - **El mínimo sin la demanda engaña.** A las 15:37, recién comprados 500 g, los dulces tenían 1,020 g contra un mínimo de 1,000: **sin insignia**, con 41 pociones comprometidas que necesitan 2,706 g. A esa misma hora, "Hoy" señalaba el verde lima (380 g de 500), que no aparece en ninguna receta: `recipe_plate_filaments` no tiene ninguna fila con ese color.
  - **Del proveedor no se sabe nada.** Solo se crea, con su nombre, desde la compra (`inventario.data.ts:355-364`, `compra-form.ts:95`). No se edita en ninguna parte (`grep suppliers` solo devuelve archivos de inventario). Las columnas `contact` y `lead_time_days` existen y no las escribe ni las lee ninguna pantalla. Ningún artículo sabe a quién se le compró ni a cuánto la última vez, aunque está en `purchase_lines`.
  - **No hay forma de saltar de la alerta a la compra.** El único enlace es "Ver filamentos". M5 pedía "enlazar a la compra" y no está.
- **Qué tarea traba:** quien va a la tienda quiere salir con la lista hecha ("7 bolsas de dulces de 500 g y un paquete de bolsas con etiqueta"). Hoy tiene que recorrer cuatro pantallas, adivinar cuánto piden los pedidos y recordar el precio y la tienda de la última vez.
- **Cómo lo resuelven otros:**
  - **Zoho** lleva un *Reorder level* y un *Preferred vendor* por artículo. Al bajar del punto, filtra los proveedores con artículos por reponer y abre una orden de compra con todos ellos ([Preferred vendor](https://www.zoho.com/en-ng/books/kb/items/preferred-vendor.html)).
  - **Odoo** tiene un *Replenishment* que lista lo que cae bajo el mínimo **o** quedaría en negativo por pronóstico, con columnas en mano / pronóstico / mín / máx / a pedir, y un botón *Order Once* ([Replenishment](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html)).
  - **Sortly** tiene un *Low Stock Report* con lo que está en o bajo su mínimo ([Low stock report](https://help.sortly.com/low-stock-report)).
- **Propuesta:** un bloque **"Por comprar"** arriba de Compras, con su cuenta en "Hoy". Cada fila lleva:
  - foto (48 px o más), nombre y **cuánto comprar** = apartado + mínimo − en mano, redondeado a la presentación si se conoce (H4);
  - el **porqué** en palabras: "para 4 pedidos, el primero vence el 05-oct" o "bajo el mínimo";
  - el **último proveedor y precio**, sacados del historial y sin columna nueva: "Tienda local · 500 g a S/ 15 · 06-oct";
  - el **plazo**: `suppliers.lead_time_days` ya existe; hace falta poder editarlo.

  Se marcan casillas y "Registrar compra con estos" abre el formulario ya lleno. Si el dueño pide "mientras tanto, algo", la versión que solo mira el mínimo (sin H1) es S. El plazo del proveedor es lo que necesita el vendedor para decir "si compro hoy, el viernes".
- **Tamaño:** M (sobre la vista de H1). Editar el proveedor, S.
- **Gravedad:** bloquea.

### H3. "Registré la compra, ¿y el pago?": comprar no pasa por la caja

- **Qué pasa:**
  - `registerPurchase` escribe compra, líneas, rollos y movimientos, y **nada en `transactions`** (`inventario.data.ts:614-676`). La compra de las 15:37 (S/ 27.00) no tiene egreso.

    ```sql
    select p.purchased_at, (select count(*) from transactions t where t.purchase_id = p.id) tx ...
    -- 2026-10-06 | 0 | 27.00
    ```

  - `purchases.account_id` no existe, y el modelo lo reconoce (`docs/03-modelo-de-datos.md`, final de §3.4). Ese mismo documento dice "una compra se paga registrando a mano un egreso con su `purchase_id`", pero **el formulario de Caja no tiene ese campo**: `transaction-form.ts` y `transaction-draft.ts` no mencionan compras.
  - **Consecuencia en los números.** `monthly_income_statement` separa los egresos por `purchase_id`: si lo tiene, es *inventory_purchases* y no resta de la utilidad; si no lo tiene, es *operating_expenses* y sí resta (líneas 28-29 de la vista). Como desde la aplicación nunca lo tiene, **cada rollo pagado y anotado en Caja se resta como gasto**, y se vuelve a restar como costo de ventas cuando se consume. La utilidad sale más baja de lo real.
  - **No es todo o nada.** Son cuatro inserciones sueltas, y si se cae la red a la mitad, el "Deshacer lo creado" **borra** movimientos, rollos y la compra (`inventario.data.ts:679-694`). Choca con "nada se borra: se anula", y además la política `purchases_delete` es solo del dueño, así que a un operador el deshacer le falla.
  - **No se corrige.** "Después no se puede editar" (`compra-form.ts:202`), y tampoco hay "anular" en la lista (`compras.page.ts:71-80`, solo "Detalle"). Un precio mal tipeado queda para siempre y, como el insumo se valoriza con su última compra (H5), envenena el costo de cada receta hasta la siguiente compra.
- **Qué tarea traba:** la persona compra en la tienda, paga con Yape y quiere anotarlo una vez. Hoy lo anota en Compras, lo vuelve a anotar en Caja con el monto copiado a mano, y así y todo el resultado del mes queda mal.
- **Cómo lo resuelven otros:** Zoho, Katana y Odoo resuelven el paso con orden de compra, recepción y factura (ver "Lo que no hay que copiar"); en un taller que paga en el mostrador eso sobra. Busqué cómo lo hace Craftybase/Stocksmith ([Introduction to purchases](https://help.craftybase.com/article/1167-introduction-to-purchases)), pero esa página redirige a help.stocksmith.io y **no la pude verificar**. La propuesta se apoya en el propio modelo: §2.3 ya dice "una compra registra también el egreso de dinero en Finanzas", y §3.4 ya define `register_purchase` escribiendo en `transactions`.
- **Propuesta:**
  - La función `register_purchase`, que ya está prevista en §3.4. Recibe la compra entera **y la cuenta con la que se pagó**, y escribe el egreso con `purchase_id` en la misma transacción. El formulario suma un solo campo, "Pagado con", con la última cuenta usada preseleccionada. Hace falta una migración nueva para `purchases.account_id`.
  - **"Anular compra" con motivo obligatorio:** anula el egreso y deja contramovimientos de lo que no se consumió.
  - Se va el "Deshacer lo creado".
- **Tamaño:** M.
- **Gravedad:** bloquea (deja mal la utilidad sin que nadie lo note).

### H4. "Compré una bolsa de 500 g a S/ 15": el formulario pide la división hecha

- **Qué pasa:**
  - **El campo pide el precio ya dividido.** Se llama "Precio unitario (S/)" con `step="0.01"` (`compra-form.ts:125-126`) y no dice "por g". La base guarda hasta 6 decimales (`purchase_lines.unit_price numeric(12,6)`), pero la persona tiene que hacer la división. Es el cabo 3 de §7.5.1, y la evidencia es de hoy: el agente "Persona nueva" cargó `Dulces surtidos 500 × 0.030000` y `Bolsa de celofán 50 × 0.240000` (consulta a `purchase_lines`, 15:37). Hizo 15 ÷ 500 y 12 ÷ 50 de cabeza.
  - **No recuerda nada.** Ni la presentación ("bolsa de 500 g"), ni el último precio, ni el último proveedor.
  - **El reparto por peso deja fuera los insumos que se miden en peso.** `planPurchase` solo pesa las líneas de filamento (`packages/domain/src/purchase.ts:92-94`). Con "por peso", los 2.5 kg de dulces no cargan nada de envío aunque su unidad sea `g`. El campo dice además "Cómo repartirlos entre los rollos" (`compra-form.ts:154`), cuando por monto también reparte a los insumos.
  - **Detalles de la etiqueta y del aviso.** Mientras no se elige el artículo, la cantidad se llama "Rollos" (`compra-form.ts:365-368`). Al guardar, el aviso dice "Se crearon 2 rollos" sin decir cuáles (`compras.page.ts:156-160`), y el código (ROJO-02) es justo lo que hay que escribir en el carrete.
- **Qué tarea traba:** la persona quiere copiar el ticket tal cual ("2 bolsas de dulces de 500 g, S/ 30"), y tiene que sacar la calculadora para cada línea.
- **Cómo lo resuelven otros:** Craftybase/Stocksmith distingue la *unidad de compra* de la *unidad de seguimiento*, con su conversión. Su ejemplo: si se lleva en gramos y se compra en kilos, "una compra de 2 kg sube el stock en 2000 g" ([Purchase to tracking unit conversion](https://help.stocksmith.io/article/724-about-the-purchase-to-tracking-unit-conversion-feature)).
- **Propuesta:**
  1. **(S)** Cada línea acepta **"Pagaste (total de la línea)"** o "Precio por g", y calcula el otro al vuelo: "S/ 15 → S/ 0.030 por g". Ninguno de los dos hay que dividirlo a mano. Sin cambio de esquema.
  2. **(S)** Al elegir el artículo, se precarga el último precio y la sugerencia dice dónde se compró: "La última vez: 500 g a S/ 15 en Tienda local".
  3. **(M)** Una **presentación de compra** opcional en el artículo ("bolsa de 500 g", "paquete de 100"). El formulario pregunta entonces "¿Cuántas bolsas?" y "¿Precio por bolsa?", y convierte. Lleva una migración, solo si el dueño confirma que compra siempre igual (pregunta 4).
  4. **(S)** El reparto por peso cuenta como peso los insumos en `g` o `kg`.
  5. **(S)** El aviso final lista los códigos creados: "Escribe ROJO-02 y ROJO-03 en los carretes".
- **Tamaño:** S (1, 2, 4 y 5); M (3).
- **Gravedad:** confunde.

### H5. "¿Cuánto me costó el dulce?": tres criterios de costo, y el armado de hoy cargó los dulces un 27 % más caros

- **Qué pasa:**
  - **Filamento:** promedio ponderado de lo que queda en los rollos (`filament_sku_stock.weighted_cost_per_gram`). Es lo que dice §2.3.
  - **Insumos y empaque:** el **último precio de compra** (`inventory_item_costs`: `order by purchased_at desc limit 1`). Se eligió a propósito para que cotizador, estimación y receta coincidan (`catalogo.data.ts:575-579`), pero `assemble_product` usa esa misma vista para valorizar **lo que sale del estante** (`20261009150000_assembled_goods.sql:120-125`). §2.3 dice lo contrario: "Para medir la ganancia real … siempre se usa el costo del rollo que se consumió, no el método de cotización".
  - **Piezas:** el promedio de **todas las entradas de la historia**, sin descontar las ya consumidas (`part_stock`, subconsulta `made`).
  - **Evidencia del armado de las 15:44:**
    - **Dulces.** Antes había 1,020 g valorizados en S/ 24.05 en el kardex (S/ 0.0236 por g). El armado los sacó a **S/ 0.030**, el precio de la compra de 500 g de las 15:37: 660 g por S/ 19.80 en vez de S/ 15.56. Son S/ 4.24 de más en 10 pociones (+27 %). Los 360 g que quedan valen ahora S/ 4.25, o sea S/ 0.0118 por g: la mitad de lo que costaron.
    - **Botella impresa.** Salió a S/ 0.614520 = (30 × 0.597 + 18 × 0.612 + 2 × 0.90) / 50. Es el promedio de todas las que entraron desde septiembre. Las 10 que estaban en el estante valían en promedio S/ 0.6696.
- **Qué tarea traba:** el dueño quiere saber cuánto le costó cada poción armada, y el número depende de en qué orden se registraron las compras.
- **Cómo lo resuelven otros:** Craftybase (hoy Stocksmith) usa el costo promedio ponderado móvil y recalcula los costos unitarios "cada vez que cambia el nivel de inventario, según lo que hay en stock en ese momento" ([¿LIFO, FIFO o promedio ponderado?](https://help.stocksmith.io/article/813-how-does-craftybase-calculate-inventory-costs)).
- **Propuesta:**
  - **Un criterio para lo que sale del estante:** promedio ponderado móvil de lo que hay, calculado desde los movimientos, igual para filamento, insumos, piezas y terminados.
  - **Para cotizar** puede seguir valiendo el último precio, o el que diga `material_valuation`. Son dos preguntas distintas y hoy comparten la misma vista.
  - Es una regla de dinero, así que va en `packages/domain` con su prueba y en la vista de la base con la suya, como pide AGENTS.md.
- **Tamaño:** M.
- **Gravedad:** confunde (el costo de cada producto queda mal, en una dirección que depende del orden de las compras).

### H6. "¿Qué pasó con las tapas?": el kardex no se entiende

- **Qué pasa:**
  - **Es un diario agrupado por día, no la historia de un artículo.** Para ver una tapa hay que elegirla en un `select` de texto (`movimientos.page.ts:73-81`).
  - **No hay saldo** ("quedaban 5, entraron 9, salieron 10, quedan 4"), **ni costo**, aunque `unitCost` se lee (`inventario.data.ts:891`) y no se pinta.
  - **Lo impreso dice "Compra".** `complete_print_job` sigue escribiendo `purchase` (`20261008110000_parts_and_assembly.sql:224-228`). Hoy se leen tres filas "Compra · Botella impresa / Tapa impresa" con origen "Impresión" (movimientos de las 15:43-15:44). Es la mezcla de ADR-018, y sigue entrando con datos nuevos.
  - **"assembly" en inglés.** Es el origen que escribe `assemble_product`, y `SOURCE_LABELS` no lo traduce (`inventario.format.ts:50-57`). Todo armado se ve con "assembly" en la columna Origen.
  - **El origen no lleva a ninguna parte.** "Impresión" no dice cuál; "Compra" no dice a quién. El armado no guarda `source_id` y la pantalla nunca pasa `p_note` (`inventario.data.ts:963-969`), así que las 5 filas del armado de las 15:44 dicen "Armado de producto" sin pedido.
  - **Ninguna lista lleva a su kardex.** Ni Insumos, ni Piezas, ni Filamentos tienen enlace, y el kardex no acepta filtro por URL.
- **Qué tarea traba:** alguien sin formación contable quiere entender por qué el sistema dice 4 tapas si él contó 6. Tiene que filtrar un diario, ver "Compra" donde hubo una impresión y "assembly" donde hubo un armado, y sumar de cabeza.
- **Cómo lo resuelven otros:** Katana permite pulsar *In stock* o *Committed* y abrir una ventana con los movimientos y las órdenes relacionadas ([Basics of inventory management](https://support.katanamrp.com/en/articles/5908776-basics-of-inventory-management)). Shopify tiene un historial de ajustes por artículo con su motivo ([Adjustment history](https://help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/adjustment-history)).
- **Propuesta:**
  - **"Historia del artículo"**, que se abre al pulsar cualquier artículo o rollo en cualquier lista. Columnas: Fecha · Qué pasó · Entra · Sale · **Queda** · Costo.
  - **"Qué pasó" en frases:** "Se imprimieron 9 (placa Tapas, impresión del 06-oct)", "Se usaron 10 para armar 10 Botellas de poción (ORD-2026-0001)", "Compra a Tienda local". Cada una enlaza a su origen.
  - **Cabos chicos, cada uno S:** `complete_print_job` pasa a `production` (migración nueva, sin tocar las viejas); "assembly" pasa a "Armado"; el armado guarda el pedido.
  - El kardex general se queda como está, para auditar.
- **Tamaño:** M.
- **Gravedad:** confunde.

### H7. "Fin de mes: pesar y contar": cuesta, y lo impreso y lo armado no se puede corregir

- **Qué pasa:**
  - **Rollos.** Se pesan de a uno: hay que desplegar el filamento, pulsar "Pesar" y llenar una ventana (`filamentos.page.ts:174-176`). La tara se escribe cada vez y **no se guarda**: los 4 SKU tienen `spool_tare_g` nulo (consulta a `filament_skus`), y `recordWeighing` solo inserta el ajuste (`inventario.data.ts:534-546`).
  - **Insumos.** Uno por uno: "Movimiento" → "Ajuste por conteo físico" (`item-movement-form.ts:14-18`). El ajuste entra **sin costo** (`recordItemMovement` no escribe `unit_cost`, `inventario.data.ts:847-858`).
  - **Piezas y producto armado: no se pueden contar ni ajustar.** Piezas no tiene ninguna acción (`piezas.page.ts`), Insumos excluye `part` y `finished_good` (`app.routes.ts`, `scope`), y no hay pantalla de producto armado.
  - **"Agotado" no pone el rollo en cero.** `filament_sku_stock` suma cualquier rollo con gramos, sin mirar su estado. Producción, en cambio, solo ofrece `sealed, open, in_use` (`produccion.data.ts:13,317`). Un rollo marcado "Agotado" con 40 g teóricos no se puede usar al imprimir, pero sigue contando como disponible en Filamentos, en "Hoy" y en el cotizador.
- **Qué tarea traba:** el cierre de mes (§2.11 E) pide "pesar los rollos abiertos y registrar ajustes". Con 6 rollos y 15 artículos son 21 ventanitas. Si sobran 2 tapas, no hay dónde decirlo.
- **Cómo lo resuelven otros:**
  - **inFlow:** una *hoja de conteo* por ubicación o categoría, con *System quantity · Counted quantity · Discrepancy* en vivo, y un botón *Complete and adjust* que deja todo el ajuste de una vez ([Stock count](https://www.inflowinventory.com/support/cloud/how-to-create-and-complete-a-stock-count-web-app)).
  - **Spoolman:** guarda el peso del carrete vacío por fabricante, filamento o rollo (`spool_weight`, `empty_spool_weight`). Su operación `PUT /spool/{id}/measure` recibe "el peso bruto actual del rollo" y descuenta sola ([API](https://donkie.github.io/Spoolman/)).
- **Propuesta:** una pantalla **"Conteo"**, a la que se llega desde Inventario y desde la tarea de fin de mes en "Hoy".
  - Una sola lista agrupada: rollos abiertos, piezas, armados, insumos, empaque. Cada fila con foto, "Sistema", un campo "Contado" (en los rollos, "Peso en la balanza") y la diferencia en unidades y en soles.
  - La tara se pide la primera vez y se guarda en el filamento.
  - "Cerrar conteo y ajustar" escribe un ajuste por fila, con su costo.
  - Marcar "Agotado" ofrece llevar el saldo a cero con un ajuste.
- **Tamaño:** M.
- **Gravedad:** bloquea para piezas y armados; confunde para lo demás.

### H8. "¿Adónde fue lo que armé?": Armar no dice de dónde sale cada cosa ni adónde va

- **Qué pasa:**
  - **El aviso apunta a un sitio que no existe.** Después de armar dice "entraron al inventario de terminados" (`armar.page.ts:222-225`), y **no hay pantalla de terminados**: el menú de Inventario no la tiene (`shell.ts:70-76`). Lo armado solo se ve como una línea chica, "N armadas en el estante", en la tarjeta de Armar (`armar.page.ts:51`). Y ese número incluye lo ya entregado (H1, corte 3).
  - **No dice por qué armar.** La tarjeta no muestra cuánto piden los pedidos.
  - **No dice de dónde sale lo que falta.** Una fila en rojo dice "Faltan 37 Tapa impresa" (`armar.page.ts:110-111`), pero no que eso son 5 placas de Tapas de 20 min, ni enlaza a la cola. Para los dulces que faltan no enlaza a la compra.
  - **No se llega desde el pedido.** M14 decía que a Armar "también se llega desde el producto y desde el pedido". El único enlace a Armar está en Piezas (`piezas.page.ts:39`), y Armar no acepta variante ni cantidad por URL.
- **Qué tarea traba:** el taller quiere armar lo que pide el pedido del colegio. Tiene que saber de memoria cuántas pide, armar, y después no tiene dónde comprobar que las armadas están ahí y para quién.
- **Cómo lo resuelven otros:** en Katana, cada pedido de venta lleva una columna *Ingredients availability* (*In stock · Expected · Not available*), y para lo que no está propone crear la orden de compra o de fabricación ([Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability)).
- **Propuesta:**
  - **Un "Estante" con dos secciones:** *Productos armados* (foto, en mano, apartado para qué pedido, libre) y *Piezas impresas*, que es lo que hoy es la pantalla de piezas. El aviso de Armar enlaza ahí.
  - **La tarjeta de Armar dice** "Pedidos piden 41 · armadas 0 libres".
  - **Cada fila que falta lleva su acción:** "→ Imprimir 5 placas de Tapas (1 h 40 min)" hacia la cola, o "→ Comprar 2,346 g" hacia el formulario ya lleno (H2).
  - **Armar acepta `?variante=&cantidad=`** para que el pedido pueda mandar ahí, y guarda el pedido en la nota (H6).
- **Tamaño:** M.
- **Gravedad:** confunde.

### H9. "Quiero crear la pieza 'Tapa chica'": no hay dónde, y si la creas desaparece

- **Qué pasa:**
  - **Piezas no tiene botón de crear.** La receta solo deja elegir una pieza que ya existe, en un `select` de texto (`placa-editor.ts:36-41`, `catalogo.data.ts:371-380`). El mensaje vacío de Piezas no dice dónde se crea.
  - **El único sitio es "+ Nuevo artículo" de Insumos o Empaque**, que abre el formulario con los **cinco** tipos y "Insumo" ya elegido (`item-form.ts:87,96`; `inventario.format.ts:59-68`).
  - **Lo creado puede desaparecer de la pantalla.** Una bolsa creada desde Empaque sin cambiar el tipo queda como insumo y no aparece en Empaque. Una pieza creada desde Insumos sale de esa lista y aparece en Piezas, aunque ningún aviso lo dice.
  - **Hay un tipo que nadie debería crear a mano.** Se puede crear un "Producto terminado" suelto, sin variante, cuando esos los crea solo `app.finished_good_for`.
- **Qué tarea traba:** el dueño quiere cargar las piezas de su botella nueva para después armarla, que es su caso real. Tiene que ir a Insumos, cambiar el tipo, guardar, ver que desaparece, y volver al catálogo.
- **Cómo lo resuelven otros:** no hace falta referencia: es que la pantalla en la que estás decida el tipo.
- **Propuesta:**
  - `ItemForm` recibe los tipos permitidos y el tipo por defecto de la pantalla que lo abre. Empaque crea empaque, Insumos ofrece insumo o repuesto, y nadie ofrece "Producto terminado".
  - Piezas tiene "+ Nueva pieza", con foto.
  - El editor de placa usa `pp-item-picker` con "Crear pieza «…»" cuando la búsqueda no encuentra nada.
- **Tamaño:** S.
- **Gravedad:** confunde.

### H10. La regla de la foto, pantalla por pantalla

- **Qué pasa:** `pp-thumb` mide 28 px en `sm`, 40 px por defecto, 80 px en `lg` y 144 px en `xl` (`thumb.ts:28-36`). A las 15:48 **ninguno de los 7 artículos tenía foto** en la base local. Botella impresa, Bolsa con etiqueta, Bolsa de celofán, Boquilla y Botella de poción se ven las cinco como una "B" sobre el mismo fondo, que es justo el caso que el dueño quería evitar. Ninguna lista avisa "sin foto" ni deja agregarla desde ahí.

  | Pantalla | ¿Foto? | Tamaño | ¿Sirve para reconocer? |
  |---|---|---|---|
  | Filamentos (fila) | Punto de color | 16 px (`.swatch` 1rem) | Distingue colores; no distingue mate de seda ni dos rojos |
  | Filamentos (rollos desplegados) | No | — | No: solo el código |
  | Piezas impresas | Sí | 28 px | No |
  | Armar: tarjetas de producto | Sí | 80 px | Sí |
  | Armar: componentes de la receta | Sí | 28 px | No |
  | Insumos / Empaque | Sí | 28 px | No |
  | Compras (lista y detalle) | No | — | No: el detalle es texto (`compras.page.ts:86-94`) |
  | Formulario de compra: selector | Sí, o color | 28 px | Apenas |
  | Costo final antes de confirmar | No | — | No |
  | Kardex y sus filtros | No | — | No: filtros en `select` de texto |
  | Ventanas de movimiento y de pesaje | No | — | No |
  | Hoy · Filamentos bajo mínimo | Punto de color | chico | Apenas |
  | Receta · "Pieza que produce" | No | — | No: `select` de texto |
- **Qué tarea traba:** quien recorre veinte bolsas para encontrar "la chica" tiene que leer, que es lo que la regla quería evitar.
- **Cómo lo resuelven otros:** Sortly admite "hasta 8 fotos por artículo" para "confirmar visualmente variantes (por ejemplo, cuatro tipos de tubo de PVC) y asegurarte de que actualizas el correcto" ([Photos](https://www.sortly.com/features/photos/)). Spoolman agrupa los rollos en tarjetas por ubicación, con su muestra de color ([README](https://github.com/Donkie/Spoolman)).
- **Propuesta:**
  - **Tamaños mínimos:** 48 px en filas de tabla y 80 px en selectores y tarjetas.
  - **Una vista de cuadrícula** en Insumos, Empaque y Piezas, como la de Armar.
  - **Foto en todo lo que hoy es texto:** compras, vista previa, kardex, ventanas y receta.
  - **Una marca "Sin foto"** que abre `pp-image-field` sin salir de la lista.
  - **En los rollos,** la muestra de color también en la fila desplegada.
  - La miniatura liviana (no cargar 1024 px para pintar 28) es del agente Visual.
- **Tamaño:** M.
- **Gravedad:** confunde (regla permanente del dueño).

### H11. El selector de compras no se maneja con el teclado y ofrece cosas que no se compran

- **Qué pasa (`ui/item-picker.ts`):**
  - **Hay que hacer clic para buscar.** Al abrirse, el buscador **no recibe el foco**: la referencia `#search` no se usa en ninguna parte. El comentario dice "se abre con Enter, se escribe para filtrar", pero eso no pasa hasta hacer clic en el buscador.
  - **No se cierra al hacer clic fuera.** No hay escucha de clic afuera, así que en una compra de diez líneas se pueden quedar varios paneles abiertos, uno encima del otro. Tampoco hay flechas ni `role="option"`.
  - **Ofrece piezas impresas y productos terminados.** `compra-form.ts:251` solo filtra por activos, así que aparecen en los grupos "Pieza impresa" y "Producto terminado", que no se compran nunca (AGENTS.md). Una compra de "Tapa impresa" contaría además como costo "De una impresión" en `part_stock`.
  - **No deja crear lo que falta.** Si el artículo no existe, hay que cancelar la compra, con lo que se pierde todo lo escrito, y crearlo en otra pantalla.
- **Qué tarea traba:** cargar una compra de diez líneas con el teclado, que es justo para lo que se pensó el componente.
- **Cómo lo resuelven otros:** el patrón *combobox* de WAI-ARIA (foco en el campo, flechas, Escape) ([APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).
- **Propuesta:**
  - El buscador recibe el foco al abrir; se cierra al hacer clic fuera o con Escape; flechas y Enter.
  - Se excluyen `part` y `finished_good` de la compra.
  - Una opción "Crear «bolsa 15×20»" cuando no hay coincidencias.
  - El último precio en la segunda línea de cada opción.
- **Tamaño:** S.
- **Gravedad:** confunde.

### H12. Rollos y AMS: dónde está montado cada rollo no se ve

- **Qué pasa:**
  - **No hay un "qué tiene puesto la impresora".** La ubicación es texto libre con la sugerencia "AMS 1, ranura 2, estante A…" (`spool-label-form.ts:18`).
  - **Los rollos no tienen orden útil.** Salen ordenados por código, mezclando sellados, abiertos y agotados (`inventario.data.ts:516`).
  - **"Recarga" no se puede marcar.** `filament_skus.is_refill` existe y no aparece en el formulario. Bambu vende el PLA Basic con carrete o como *refill* para un carrete reutilizable, compatible con AMS y AMS lite ([MatterHackers, ficha de Bambu PLA](https://www.matterhackers.com/store/l/bambu-lab-pla-filament-175mm-1kg)). Eso cambia la tara al pesar.
- **Qué tarea traba:** al cerrar una impresión hay que elegir el rollo usado. Quien no sabe de memoria qué hay en cada ranura tiene que ir a mirar la impresora.
- **Cómo lo resuelven otros:**
  - **SimplyPrint** asigna un rollo a cada ranura del AMS (1-4) y avisa antes de imprimir si el rollo no tiene filamento suficiente ([Assigning filament spools to printers](https://help.simplyprint.io/en/article/assigning-filament-spools-to-printers-1r66t1p/)). Lo de la lectura NFC no aplica aquí, porque Pickypop no habla con la impresora.
  - **Spoolman** muestra un panel de tarjetas agrupadas por ubicación ([README](https://github.com/Donkie/Spoolman)).
- **Propuesta:**
  - La ubicación pasa a ser una elección: AMS ranura 1-4, Estante o Secadora.
  - Una franja "En el AMS" arriba de Filamentos: "1 Rosado ROSA-01 · 2 vacío · 3 Negro NEGRO-01 · 4 Rojo ROJO-01".
  - Los rollos agotados y descartados se esconden detrás de "ver todos".
  - El cierre de impresión puede proponer el rollo de la ranura (eso es de la mirada de producción).
- **Tamaño:** M.
- **Gravedad:** confunde.

### H13. Cabos sueltos (cada uno S)

- **La unidad se puede cambiar con stock encima.** `item-form.ts:38` y `inventario.data.ts:828`. Pasar "Dulces" de `g` a `kg` convertiría 360 g en 360 kg y cambiaría todas las recetas. Debería bloquearse en cuanto el artículo tiene movimientos.
- **"Vence el" se pregunta y nunca se usa.** `purchase_lines.expires_on` solo se escribe (`inventario.data.ts:650`); ninguna pantalla lo lee. O se muestra ("dulces que vencen este mes") o se quita.
- **Los repuestos no bajan al registrar un mantenimiento.** `impresoras.data.ts:298` solo inserta `maintenance_logs`; fuera de Inventario nada escribe `stock_movements`. La boquilla solo baja a mano.
- **La lista de compras no dice qué se compró.** Las columnas son Fecha · Proveedor · Documento · Total · Rollos (`compras.page.ts:49-53`), y una compra de dulces muestra "0" rollos. Mejor: miniaturas de lo comprado.
- **Dos personas pueden armar a la vez sobre el mismo stock.** `assemble_product` comprueba y después inserta, sin bloquear filas (`20261009150000_assembled_goods.sql:91-108`). Las dos pasan la comprobación y el stock queda negativo. Es poco probable con dos personas, pero §7.7 lo marca como nunca probado.
- **La entrada manual de un insumo entra sin costo** (H7) y desordena la valorización del kardex.

## Referencias revisadas

| Aplicación | Por qué sirve de referencia | Qué tomar | Qué NO tomar | Enlace |
|---|---|---|---|---|
| Shopify (inventario) | El vocabulario más claro del mercado | Las palabras *en mano · comprometido · disponible · no disponible*, y que lo comprometido nace con el pedido y muere al despacharlo | Reservar en borradores; transferencias entre locales | [Inventory states](https://help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/inventory-states) |
| Katana MRP | Fabricación por receta para talleres chicos | El faltante = en mano − comprometido + esperado − seguridad; disponibilidad de ingredientes por pedido, calculada sola | La prioridad de pedidos arrastrando a mano; las órdenes de fabricación formales | [Basics](https://support.katanamrp.com/en/articles/5908776-basics-of-inventory-management) · [Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability) |
| Zoho Inventory / Books | Reposición sencilla | Punto de reposición + proveedor preferido → una compra con todo lo de ese proveedor | El circuito orden de compra → recepción → factura | [Preferred vendor](https://www.zoho.com/en-ng/books/kb/items/preferred-vendor.html) |
| Odoo (Reposición) | Lista de lo que hay que comprar | Que la lista mire el mínimo **y** lo que va a faltar; el botón "pedir una vez" | Las reglas automáticas, rutas y almacenes | [Replenishment](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html) |
| inFlow | Conteo físico bien resuelto | Hoja de conteo: sistema · contado · diferencia, y "completar y ajustar" | Detener las ventas durante el conteo | [Stock count](https://www.inflowinventory.com/support/cloud/how-to-create-and-complete-a-stock-count-web-app) |
| Spoolman | Código abierto, la referencia más directa para rollos | Peso del carrete vacío por fabricante o filamento; medir con el peso bruto; tarjetas por ubicación | La integración con la impresora (Pickypop no habla con la máquina) | [README](https://github.com/Donkie/Spoolman) · [API](https://donkie.github.io/Spoolman/) |
| SimplyPrint | Filamento con AMS de Bambu | Rollo asignado a cada ranura; avisar si un rollo no alcanza | NFC y lectura automática | [Asignar rollos](https://help.simplyprint.io/en/article/assigning-filament-spools-to-printers-1r66t1p/) |
| Spoolstock | App de rollos para makers | Una base de pesos de carretes vacíos para no pedir la tara | Suscripción; **no pude abrir su página de la App Store (HTTP 429)**: lo que sé sale del resumen del buscador | [App Store](https://apps.apple.com/app/id6480470069) |
| Craftybase (ahora Stocksmith) | Inventario de talleres artesanales | Unidad de compra ≠ unidad de seguimiento, con conversión; promedio ponderado recalculado en cada compra | Contabilidad completa | [Conversión](https://help.stocksmith.io/article/724-about-the-purchase-to-tracking-unit-conversion-feature) · [Costeo](https://help.stocksmith.io/article/813-how-does-craftybase-calculate-inventory-costs) |
| Sortly | Inventario guiado por fotos, el más cercano a la regla del dueño | Foto grande para reconocer; mínimo por artículo; informe de lo que está bajo mínimo | Carpetas anidadas, alertas por correo | [Photos](https://www.sortly.com/features/photos/) · [Low stock](https://help.sortly.com/low-stock-report) |
| InvenTree | Código abierto con recetas y asignaciones | Una pestaña de "asignado" por artículo | Lotes, números de serie, ubicaciones anidadas | [Part views](https://docs.inventree.org/en/stable/part/views/) |

## Lo que no hay que copiar

- **Órdenes de compra con estados** (borrador → enviada → recibida en parte → facturada), como en Zoho, Katana o Odoo. Aquí se va a la tienda y se paga en el momento: la compra se registra cuando ya está en la mano. Basta con la lista "Por comprar" y el formulario ya lleno.
- **Reposición automática** (el "Automate" de Odoo). Comprar es un viaje al mercado y una decisión de gasto; el sistema propone y la persona decide.
- **Prioridad de pedidos arrastrando a mano** (Katana). Con dos personas, la fecha de entrega ordena sola.
- **Stock de seguridad calculado, lotes, números de serie, varios almacenes.** Un mínimo por artículo alcanza. La fecha de vencimiento solo si el dueño la quiere usar (H13).
- **Seguimiento en vivo del consumo y lectura NFC** (Spoolman, SimplyPrint). Exigen hablar con la impresora, y eso está fuera por diseño.
- **Reservar escribiendo movimientos de reserva y liberación.** Es lo que el esquema dejó preparado, pero obliga a apartar un rollo concreto y a acordarse de liberar en cada cambio de estado. Mejor derivarlo (H1).
- **Etiquetas con QR para cada rollo.** Es agradable, pero con 4 a 10 rollos basta con escribir el código que el sistema ya pone.

## Preguntas para el dueño

1. **¿Desde cuándo y hasta cuándo un pedido aparta stock?** Recomiendo desde "confirmado" (nunca la cotización) hasta "entregado" o "cancelado", incluido "listo". Para "en espera", recomiendo que siga apartando, porque no se canceló, pero que se vea aparte para poder soltarlo con un clic.
2. **Si lo que hay no alcanza para todos los pedidos, ¿quién se lo queda?** Recomiendo que gane el que vence antes. Cambia cómo se reparte en H1.
3. **¿Con qué costo sale del estante lo que se consume?** Recomiendo el promedio de lo que hay, como el filamento y como dice §2.3. El último precio puede seguir usándose para cotizar. Cambia H5 y el costo de cada poción armada.
4. **¿Compran casi siempre la misma presentación** (bolsa de dulces de 500 g, paquete de 100 bolsas)? Si sí, conviene guardarla en el artículo y preguntar "¿cuántas bolsas?" (H4, punto 3). Si no, basta con poner el total de la línea.
5. **¿Tienen balanza y pesan los rollos a fin de mes?** Si sí, el conteo pide el peso bruto y guarda la tara. Si no, el conteo de filamento se reduce a marcar "agotado" o "abierto" (H7).
6. **¿Pagan cada compra en el momento y desde una sola cuenta?** Recomiendo que sí, sin cuentas por pagar a proveedores: la compra lleva un campo "Pagado con" y se acabó (H3). Si alguna vez compran a crédito, esto cambia.
