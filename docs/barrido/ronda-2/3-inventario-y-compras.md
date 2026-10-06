# Inventario y compras — ronda 2

Leí los cinco informes enteros, la "Aclaración del dueño" de `00-encargo.md` y las tres "Respuestas del dueño" de `ronda-2/00-encargo-ronda-2.md`. Las respuestas del dueño mandan, y dos de ellas me corrigen (ver "Lo que cambio").

**Sobre la evidencia en vivo de mi ronda 1.** Los números que medí entre las 15:37 y las 15:48 salían de los datos del agente "Persona nueva", y ese agente los borró al terminar (1, "Datos de prueba creados y borrados"). Hoy la base local volvió a la semilla: 41 pociones comprometidas, 0 armadas, 8 botellas impresas, 5 tapas y 520 g de dulces (`production_needs` → `41 | 0 | 41 | 4`), con un trabajo "Botellas de Ana (repetida)" imprimiéndose. Los cálculos de esta ronda usan esa base.

## De acuerdo

- **1·T1 confirma, con el tiempo de una persona real, cuatro hallazgos míos.**
  - La compra no paga y el egreso cuenta como gasto (3·H3).
  - Hubo que dividir 15 ÷ 500 (3·H4).
  - El buscador no deja crear el artículo, y al salir a crearlo **se perdió la compra a medio llenar** (3·H11).
  - Empaque abre "Nuevo artículo" con el tipo "Insumo" (3·H9).

  Son unos 35 clics y dos compras escritas para lo que en el ticket son dos líneas. El dato que más pesa es la compra perdida, y yo no lo había visto: lo leí en el código, no lo viví.
- **2·H2 y 4·H1: la impresión mete la placa entera.** `closeJob` guarda `units_produced` después de llamar a `complete_print_job` (`produccion.data.ts:395` contra `:414`), y la función hace `coalesce(nullif(units_produced, 0), units_per_run)` (`20261008110000_parts_and_assembly.sql:210`). **Se me pasó**, y es el error más grave de mi área: es la única entrada de stock de piezas, y todo lo que yo propuse (la posición, Por comprar, el conteo) se calcula encima.
- **2·H9: `assemble_product` arma de la nada.** Con una receta sin componentes no entra al chequeo de faltantes y produce `p_units` a costo 0 (`20261009150000_assembled_goods.sql:91-145`). Yo solo había visto que no bloquea filas (3·H13). Es del mismo tipo que el anterior: entra stock que no existe.
- **2·H5: hay dos definiciones de "receta vigente".** Armar toma la última versión sin mirar `active` (`assembled_goods.sql:84`), y el cotizador, el pedido y producción sí lo miran. Armar puede consumir una receta que el resto ya no usa.
- **2·H4, 5·H3 y 3·H1 dicen lo mismo:** lo comprometido se deriva. El `order_allocation` de 2, por pedido, y mi `stock_position`, por artículo, son **dos proyecciones de la misma cuenta**, y tienen que salir de una sola vista.
- **4·H2 ya trae "también falta comprar"** en la fórmula del plan. Mi "Por comprar" (3·H2) es la tercera fila del plan de 2 (*Diseño · Opción B*: placas, armados, compras): **una lista con dos entradas**, desde Compras y desde la Cola, no dos listas.
- **4·H4 cubre mejor que mi 3·H12 lo del AMS.** `suggestSpool` propone el rollo más lleno y también ofrece los sellados (`print-job-form.ts:296-301`, `produccion.data.ts:13`). Me quedo con su propuesta y retiro la mía.
- **4·H5: "Gramos reales" es el estimado copiado** (la relación da 1.000 exacto). Eso deja el **pesaje del rollo** como la única corrección real del consumo de filamento, y sube el valor de mi conteo con balanza y tara guardada (3·H7).
- **4·H9 cubre los repuestos del mantenimiento,** con más detalle que mi cabo de 3·H13.
- **6·H1: a una pieza no se le puede cargar foto desde ninguna pantalla.** Yo vi que Piezas no tiene botón de crear (3·H9), pero no saqué la consecuencia: tampoco hay "Editar" y por eso no hay foto. 6·H2 y 6·H3 resuelven el tamaño y el peso mejor que mi 3·H10, y adopto su escala.
- **6·H8 tiene razón con el kardex:** una tabla por día descuadra las columnas. Lo sumo a mi "Historia del artículo" (3·H6).
- **2·H12 y 5·H2: las piezas aparecen como insumos a S/ 0.** Desde el costo puedo dar la regla exacta (ver "Otras contradicciones", D).

## En desacuerdo

1. **Con 2·H4 ("los dos tipos de movimiento se quedan en el enum sin usarse, y se documenta por qué"): no alcanza con documentarlo.** Las vistas de hoy **todavía restan** esos movimientos para calcular `available` (`20260929231000_inventory.sql:200-203, 239-242`), y el cotizador lee esa columna para los insumos (`cotizador.data.ts:546`). Si alguien escribe una sola `reservation` "porque el tipo existe", habrá dos disponibles distintos, el de la vista vieja y el derivado, y ninguno dirá cuál vale. Hoy hay **0 filas** de esos dos tipos (consulta de tipos en `stock_movements`) y nada en `apps/` ni en `supabase/` los escribe (grep). Propongo:
   - una migración que agregue `check (type not in ('reservation', 'release'))` a `stock_movements`, segura porque no hay filas que la violen;
   - recrear `inventory_balances` y `filament_sku_stock` para que dejen de exponer `reserved` y `available`. `create or replace view` no quita columnas (AGENTS.md), así que hay que soltarlas y recrearlas.

   El valor del enum se queda: Postgres no tiene `DROP VALUE`, y las migraciones son de ida.
2. **Con 2, *Diseño · Dónde vive* ("el costo de lo que falta comprar sale de `inventory_item_costs`"): de acuerdo para comprar, no para consumir.** El último precio es justo lo que hace falta para "¿cuánto me va a costar reponer?" y para cotizar. El problema es que **la misma vista** valoriza lo que sale del estante al armar (`assembled_goods.sql:120-125`). Son dos preguntas y necesitan dos vistas: el último precio para comprar y cotizar, y el promedio de lo que hay para consumir (3·H5).
3. **Con 1·T1 ("esperaba que me pidiera la foto"): la foto no debe ser obligatoria al crear.** Quien crea "Bolsa de celofán" en el mercado, con la compra a medias, no siempre tiene la foto a mano. Obligarla lo empuja a no registrar o a subir cualquier cosa. La regla del dueño se cumple mejor así:
   - el artículo se crea sin foto;
   - la fila dice **"Sin foto · Agregar"** (6, regla 2 de su escala);
   - Inventario cuenta cuántos artículos están sin foto, para que no se olvide.
4. **Con mi propia 3·H1, que proponía repartir "por fecha de entrega: gana el que vence antes".** El dueño lo decidió al revés: manda el que confirma primero (respuesta 3), y retiro lo mío. Lo que sí sostengo es que la fecha de entrega no desaparece: sirve como **alarma** ("PED-0005 vence antes y, en este orden, llegaría tarde"). Eso cubre la preocupación de 4·H2.4 y 5·H3 sin una segunda regla de reparto.
5. **Con 2, pregunta 3, y su recomendación de que "en espera" conserve lo del estante sin límite.** Queda superada por la respuesta 2 del dueño: un pedido en espera es un **separo con vencimiento**.

## Las contradicciones

### 1. ¿A qué pedido le toca primero lo que hay?

**Decidido por el dueño: el que confirma primero, y una persona puede elegir otro con un aviso a la vista.** Lo que falta precisar es qué se ordena y con qué dato, para que ventas y producción den lo mismo:

- **Una sola clave de prioridad por compromiso**, la hora en que empezó:
  - la del **separo**, si el cliente después confirma dentro del plazo (así "María Pérez hizo un separo antes" se cumple también cuando María ya cerró);
  - si no, la de la **confirmación del pedido**;
  - si el separo venció antes de confirmar, la clave es la hora de confirmación: el cliente pierde su lugar.
- **La misma clave reparte todo:** producto armado, piezas, insumos, empaque y gramos de filamento, y también lo que va saliendo de la cola. Por eso la situación de un pedido en la venta y la fila del plan en producción no pueden diferir: es la misma cuenta leída de dos lados.
- **El cambio manual** ("dale estas 6 a Diego") mueve la clave del pedido elegido delante de la del otro. Pide confirmar con el aviso "María Pérez hizo un separo antes (lun 6, 10:12)" y deja quién, cuándo y por qué en un historial escrito por disparador, como `order_status_history`. El dato es del pedido, no un movimiento de stock.
- **La fecha de entrega no reparte: avisa.** Si con este orden un pedido llega después de lo prometido, la situación y el plan lo dicen y ofrecen "Pasar adelante", con el mismo aviso.

### 2. ¿Se escribe la reserva o se calcula?

**Se escribe la decisión y se calcula el efecto.** La respuesta 2 del dueño agrega algo que no se puede deducir de los pedidos: **hasta cuándo** se separa. Ese dato hay que guardarlo, pero es **una fecha en el documento**, no un movimiento de stock:

| Se escribe (decide una persona) | Se calcula (en la vista, siempre al día) |
|---|---|
| `quotes.hold_until`: hasta cuándo separa una proforma enviada | Cuánto separa: las líneas de la proforma explotadas por su receta |
| `orders.hold_until`: hasta cuándo separa un pedido en espera | Que un separo vencido deja de contar: `hold_until > now()` dentro de la vista |
| La clave de prioridad y su cambio manual (contradicción 1) | Qué le toca a cada compromiso, en el orden de esa clave |
| "Soltar ahora": `hold_until = now()` | En mano · para pedidos · separado · libre · falta |

Por qué no movimientos `reservation`/`release` con vencimiento:

- **Un separo escrito necesita a alguien que lo suelte.** El módulo de Odoo que separa desde la cotización lo resuelve con "una acción programada cada hora que libera cualquier reserva vencida" ([Cerevantix, Product Reservation System](https://apps.odoo.com/apps/modules/18.0/cerevantix_product_reservation_system)). El de OCA libera "cuando la cotización se cancela o se confirma" ([stock_reserve_sale](https://apps.odoo.com/apps/modules/9.0/stock_reserve_sale)). Con la fecha dentro de la vista, el separo vence **en el segundo exacto**, sin tarea programada y sin que nadie se acuerde. Es lo que pidió el dueño: "vuelve a estar disponible" solo.
- **El filamento no se puede separar por movimiento.** Un movimiento apunta a un rollo **o** a un artículo (`stock_movements_one_target`), y una proforma necesita "233 g de rosado", no "el rollo ROSA-01" (3·H1).
- **Una proforma cambia de versión y de cantidad.** Con movimientos habría que reescribir el separo en cada versión; derivado, sigue a las líneas vigentes.

**Cómo se ve en la posición.** Son cinco cifras en todas las pantallas de stock, con las mismas palabras (`pp-stock`, 3·H1). Ejemplo con la semilla de hoy y una proforma supuesta, COT-0004 de María Pérez, por 5 pociones, enviada después de los cuatro pedidos:

| Artículo | En mano | Para pedidos | Separado | Libre | Falta |
|---|---|---|---|---|---|
| Bolsa con etiqueta | 70 | 41 | 5 · *María Pérez, vence jue 8 · 18:00* | **24** | — |
| Tapa impresa | 5 | 5 de 41 | 0 de 5 · *no queda libre* | 0 | **36 para pedidos** |
| Dulces surtidos | 520 g | 520 g de 2,706 g | 0 de 330 g · *no queda libre* | 0 | **2,186 g para pedidos** · 330 g más si María cierra |

Reglas de lectura:

- **"Separado" muestra siempre a quién y hasta cuándo.** Al pasar el puntero o tocar se ven todos los separos de esa fila.
- **Un separo solo aparta lo que existe.** Si no hay libre, separa 0 y lo dice ("0 de 330 g · no queda libre"). Así cumple el "como quien separa el filamento" del dueño: se separa lo que está en el estante.
- **Un separo nunca pide producción ni compra.** El plan de producción suma solo los pedidos cerrados (aclaración del dueño). Lo que un separo necesita y no existe aparece aparte, como "si cierra", en el plan y en Por comprar: "330 g más si María cierra". El que compra ve las dos cosas y decide.
- **Al vencer**, la fila se recalcula sola y el separo desaparece.

**Cómo se ve en la proforma y en el pedido en espera.**

- Debajo del total: "Separo hasta jue 8 · 18:00 · 5 bolsas, 0 de 330 g de dulces (no hay libres)", con los botones **[Soltar ahora]** y **[Extender]**.
- En la lista de cotizaciones, una insignia "Separo vence en 5 h".
- **En Hoy, "Separos que vencen hoy"**, con el teléfono a un toque (5·H5 propone `wa.me`). El vencimiento se vuelve una acción de venta: "escríbele a María antes de las 18:00".

**Plazo por defecto: 48 horas desde que se envía la proforma o se pone el pedido en espera.**

- Se configura en Configuración y se cambia en cada documento, entre 0 y la vigencia de la proforma.
- Un borrador no separa. Una versión nueva hereda el separo y su prioridad, pero no alarga el plazo.

Por qué 48 h:

- **Es mucho más corto que la vigencia del precio**, que viene en 15 días (`cotizador.page.ts:57`). Apartar material 15 días congelaría el estante, que es justo lo que el dueño quiere evitar.
- **Alcanza para que un cliente de WhatsApp conteste**: el dueño cotiza de noche (5·H10), y el cliente responde al día siguiente o al otro.
- **Ninguna referencia fija un número.** Shopify pide "la fecha y hora en que vencerá la reserva", sin valor por defecto ([draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)), y el módulo de Odoo lo deja configurable. Las 48 h son mi criterio, no un estándar. Que lo ajuste el dueño después de un mes de uso.

### 3. ¿De dónde sale la foto de una pieza?

**De las dos fuentes, y la de una persona manda.**

- **Al importar el `.gcode.3mf`** (receta y cotizador), `Metadata/plate_N.png` (`docs/01-investigacion.md:43`) se guarda en `recipe_plates.thumbnail_path`, que existe y nadie llena. Esa imagen es la de **la placa**: lo que hay en la cama. Va en la tarjeta de la cola, en el plan y en el historial (4·H6, 6·H7).
- **Si la pieza que produce esa placa no tiene foto**, toma esa misma imagen como foto inicial (6·H1.4, 6, pregunta 2).
- **En Piezas, "Editar" deja reemplazarla** por una foto real de la pieza terminada (lijada, pintada), que es la que sirve en Armar y en el Estante.
- **El orden de respaldo** en `pp-thumb` para una pieza: su foto, si no la de su placa, y si no el icono del tipo (6·H2).
- **Para el producto armado**, que lo crea solo `app.finished_good_for` sin foto, se usa la de la variante y si no la del producto, igual que `assembly_options` (`coalesce(v.image_path, p.image_path)`). Hoy el Kardex lo muestra como texto.

### 4. ¿Dónde vive el "¿para cuándo?"?

**Se muestra en todo lugar donde se promete una cantidad** (cotizador, pedido nuevo y panel de aceptar), y en el pedido ya cerrado como su situación (2·H7). **Se calcula en una sola función de la base**, montada sobre dos capas con dueño claro:

| Capa | Responde | Dueño |
|---|---|---|
| `stock_position` (vista) | En mano · para pedidos · separado · libre · falta, por artículo y por gramo de filamento, en el orden de la contradicción 1 | Inventario: es la regla de "los saldos se derivan" |
| `production_plan` (vista) | Corridas que faltan, lo que ya está en cola, `queue_position` | Producción (4·H2, 2 · *Opción B*) |
| `capable_to_promise(lines)` (función) | Las cinco partes de 2 · *Diseño* y la fecha | Producción, porque la fecha la manda la cola |

- **La venta no tiene cuenta propia: lee la función.** Cuando el vendedor pone una línea, la función la mete **al final de la fila** (después de todos los compromisos vigentes, separos incluidos) y avisa si un separo ajeno le quita lo que hay: "6 libres si vence el separo de María, jue 18:00".
- **La fecha usa el horario del dueño** (respuesta 1: empieza entre 6:00 y 23:00 y termina antes de medianoche, configurable). Se muestra como día ("jueves 8") y con hora solo si es hoy. La relación real/estimado y la tasa de falla de 4·H8 la ajustan cuando los datos sean confiables (4·H5); hoy no lo son.
- **Si falta comprar**, suma `suppliers.lead_time_days` cuando el proveedor lo tiene. Si no lo tiene, dice "más lo que tarde la compra" (4·H8). Hace falta que el proveedor se pueda editar (3·H2).

### 5. ¿La compra crea su egreso sola, o se liga desde Caja?

**Las dos cosas: sola en el caso normal, y ligada después cuando se paga más tarde.**

- **`register_purchase` en una transacción** (3·H3): compra, líneas, rollos, movimientos **y egreso**. El formulario agrega un solo campo, **"Pagado con"**, con la última cuenta usada ya elegida y una opción más, **"Lo pago después"**.
- **Lo que falta pagar se deriva, no se guarda:** total de la compra − egresos no anulados con su `purchase_id`. La compra muestra "Por pagar S/ 37.50" y el botón **[Registrar pago]**, que crea el egreso ya ligado. Se permiten pagos parciales y desde cuentas distintas.
- **Corrijo lo que propuse en la ronda 1:** **no** hace falta `purchases.account_id`. La cuenta vive en cada egreso; ponerla también en la compra la duplica y no aguanta una compra pagada mitad en efectivo y mitad por Yape.
- **En Caja, un egreso puede ligarse a una compra con saldo por pagar** (un selector de compras, con foto de lo comprado). Es lo que arregla el pasado. La semilla ya trae el caso:

  ```sql
  select p.purchased_at,
         round((select sum(l.quantity * l.unit_price) from purchase_lines l where l.purchase_id = p.id)
               + p.shipping_cost + p.other_costs, 2) as total,
         coalesce((select sum(t.amount) from transactions t
                   where t.purchase_id = p.id and t.voided_at is null), 0) as pagado
  from purchases p order by 1;
  -- 2026-09-01 | 100.00 | 100.00
  -- 2026-09-10 |  75.00 |   0      ← el verde lima, sin pago
  -- 2026-09-22 |  95.50 |  58.00   ← dulces y bolsas: faltan S/ 37.50, o el pago se cargó mal
  ```

  Hoy nada compara lo comprado con lo pagado, así que ninguna de las dos se nota.
- **Anular una compra** pide motivo, anula sus egresos y deja contramovimientos de lo que no se consumió. Se va el "Deshacer lo creado", que **borra** (`inventario.data.ts:679-694`).
- **A crédito** es "Lo pago después" con proveedor. Si alguna vez hace falta, se puede sumar "¿Cuánto le debo a cada proveedor?" como un filtro de Compras, no como un módulo.

### Otras contradicciones que encontré

- **A. ¿Producción imprime para un separo?** La aclaración del dueño dice que la producción ve "la demanda de todos los pedidos cerrados", y la respuesta 2 dice que un separo aparta material. Mi lectura: un separo aparta lo que existe y **no pide producción ni compra**. En el plan y en Por comprar aparece solo como "si cierra". Si no, una proforma que nunca se cierra lanzaría placas.
- **B. ¿Las piezas de un pedido a medida entran al estante común?** 2 y 4 dicen que no (2 · *Opción B*: "no entran al estante común"; 4·H2.5), y estoy de acuerdo. Si entraran, la posición se las ofrecería a otros. Desde el inventario, lo importante es que sus gramos sí cuenten como "para pedidos" en el filamento.
- **C. Menú: Armar a Producción (4·H7) y un "Estante" en Inventario (3·H8).** Son compatibles:
  - **Producción:** Cola, Plan, Armar, Historial.
  - **Inventario:** Estante (productos armados y piezas), Filamentos, Insumos, Empaque, Compras, Kardex y Conteo.
- **D. ¿Cuánto cuesta una pieza dentro de una receta?** 2·H12 y 5·H2 dejan la decisión abierta, y esta es la regla. Si **una placa de la misma receta** produce la pieza, no se suma: ya está costeada en las placas. Si viene de otra receta (una tapa compartida entre dos botellas), se costea con `part_stock.cost_per_unit`, que es la excepción de AGENTS.md, nunca con `inventory_item_costs`.
- **E. Prioridad por confirmación (respuesta 3) y cola por fecha de entrega (4·H2.3).** Una sola clave alcanza para las dos. La cola propone en el orden de la prioridad, y la fecha solo dispara la alarma "llegaría tarde → Pasar adelante". Si la cola se ordenara por fecha y el estante por confirmación, la situación del pedido y la fila del plan dirían cosas distintas.

## Lo que cambio de mi informe

**Retiro:**

- **3·H1, el reparto "por fecha de entrega".** El dueño decidió por confirmación. La fecha queda como alarma.
- **"Nunca con la cotización"** (3·H1, punto 2, y mi pregunta 1). Una proforma enviada **sí** separa, con vencimiento (respuesta 2).
- **`purchases.account_id`** (3·H3). La cuenta va en cada egreso, y lo que falta pagar se deriva.
- **Mis tamaños de foto de 48 y 80 px** (3·H10). Adopto la escala de 6 (*Escala de fotos*): 40 px en filas y selectores, 64 px en filas protagonistas (componentes de Armar, Por comprar), foto entera con `contain` e icono por tipo.
- **3·H12 (AMS) y el cabo de repuestos de 3·H13.** 4·H4 y 4·H9 los cubren mejor.

**Corrijo:**

- **La tabla de 3·H1,** con la base de hoy y restando la cola, como hizo 4·H2:
  - faltan **32 botellas** (41 − 8 − 1 en cola), que son 32 corridas y 23 h;
  - faltan **36 tapas**, que son 4 corridas y 1 h 20 min;
  - faltan **2,186 g de dulces**.
  - En filamento, el apartado incluye los gramos de los trabajos en cola, cosa que antes no restaba.
- **La posición pasa de cuatro a cinco cifras:** en mano · para pedidos · **separado** (con a quién y hasta cuándo) · libre · falta.
- **La evidencia de 3·H5,** los dulces un 27 % más caros, salía de una compra que ya se borró y no se puede repetir. El mecanismo sigue a la vista: `assemble_product` valoriza con `inventory_item_costs`, que es `order by purchased_at desc limit 1` (`assembled_goods.sql:120-125`).

**Subo de gravedad:**

- **3·H5 (el costo de lo que sale del estante), de "confunde" a "bloquea"** en cuanto exista `deliver_order`. 1 midió que el costo de ventas de una venta de S/ 85 quedó en S/ 2.70 (1, "Lo que creí", punto 6), y 2·H6 propone que el costo real pase a ser lo que salió del estante. Ese costo es el del producto armado, que hoy se arma con los insumos a su último precio. Si no se corrige junto, Resultados pasa de un error a otro.
- **3·H11 (crear desde el buscador sin perder la compra),** de cabo chico al primero de los arreglos de Compras: a una persona real le costó rehacer la compra entera (1·T1).
- **3·H9 (crear y editar piezas),** de "confunde" a "bloquea" para la regla de la foto. Sin "Editar" en Piezas, una pieza no tiene foto nunca (6·H1).

**Agrego:** que la impresión meta las unidades reales y como `production` (2·H2, 4·H1), y que `assemble_product` rechace recetas vacías y bloquee filas (2·H9). Los pongo en la cosa 1, abajo.

## Si solo se pudieran hacer cinco cosas

**1. Que lo que entra hoy a la base sea verdad.** Tamaño S + M + M.

- `complete_print_job` recibe las unidades buenas y las registra como `production` (2·H2, 4·H1).
- `assemble_product` rechaza las recetas vacías y bloquea las filas que va a consumir (2·H9).
- Un `deliver_order` mínimo: entregar saca el producto del estante (2·H6, corte 3).
- `register_purchase` con "Pagado con" y "Lo pago después" (contradicción 5).
- **Qué destraba:** el dueño puede creerle al estante y a Resultados.
- **Por qué primero:** son los cuatro sitios donde la aplicación **escribe mal** en producción todos los días, y dos de esos errores no se pueden reconstruir después: nadie va a recordar cuántas tapas salieron buenas ni qué pociones se entregaron. Todo lo de abajo se calcula sobre estos números.

**2. La posición derivada, con separos y prioridad.** Tamaño L.

- Una vista `stock_position` con cinco cifras por artículo y por gramo de filamento: en mano · para pedidos · separado · libre · falta.
- `hold_until` en proformas y pedidos en espera, la clave de prioridad con su cambio manual y su aviso, y el `check` que cierra la puerta a `reservation`.
- `production_needs` pasa a leer esta vista. Se muestra igual en Estante, Filamentos, Insumos, Empaque y Armar.
- **Qué destraba:** "¿qué me queda libre?" para el vendedor y "¿esto de quién es?" para el taller, y el separo tal como lo pidió el dueño.
- **Por qué antes que la 3:** el pedido que nace de una cotización tiene que heredar el lugar del separo, y sin esta vista no hay dónde guardarlo.

**3. Aceptar crea el pedido, también lo hecho a medida.** Tamaño M-L.

- `accept_quote`, con la prioridad del separo si se acepta dentro del plazo (2·H1, 5·H1).
- **Qué destraba:** dejar de escribir el pedido dos veces, y que una pieza a medida pueda ser pedido. Hoy no puede (`pedido-linea.ts:21`).
- **Por qué antes que la 4:** el plan de producción tiene que ver **toda** la demanda cerrada. Mientras lo hecho a medida no sea pedido, el plan propone de menos.

**4. El plan de la mañana (opción B), con sus tres filas.** Tamaño L.

- **Placas:** "Poner en cola" en lote, con `queue_position` (4·H2, 4·H3).
- **Armados:** "Armar 6" abre Armar con la variante y la cantidad puestas.
- **Compras:** Por comprar, con el último proveedor y su precio, y el formulario ya lleno (3·H2).
- **Qué destraba:** "¿qué imprimo, qué armo y qué compro hoy?" en una pantalla.
- **Por qué antes que la 5:** la fecha que se promete sale del orden de la cola y de las corridas planificadas, y sin plan no hay orden.

**5. "¿Para cuándo?" donde se vende.** Tamaño M, sobre la 2 y la 4.

- `capable_to_promise` en el cotizador, el pedido nuevo y el panel de aceptar, con el horario de 6:00 a 23:00 configurable y el aviso de los separos ajenos.
- **Qué destraba:** la idea no negociable del dueño: el vendedor sabe si hay, qué falta y cuándo estaría, y decide si hace la proforma o cierra la venta.

**Fuera de las cinco, pero baratos y en paralelo:**

- **Comprar como en el ticket:** total de la línea, crear el artículo desde el buscador sin perder la compra y excluir piezas y terminados del selector (3·H4, 3·H11). Son S.
- **Foto de las piezas:** "Editar" en Piezas y la miniatura de la placa como foto inicial (contradicción 3). Es M.
- **La escala de miniaturas de 6.** Es S.

Son los que más reducen lo que hay que explicar, y no dependen de las cinco.
