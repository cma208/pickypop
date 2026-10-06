# Del pedido a la entrega — ronda 2

> Leí enteros los otros cinco informes de la ronda 1 y, dos veces, la aclaración del dueño y sus tres respuestas (`00-encargo-ronda-2.md`). Esas respuestas mandan: lo que choca con ellas en mi informe o en los de otros queda abajo como corrección, no como debate. Mi informe de la ronda 1 se queda como estaba.

## De acuerdo

**Lo que refuerza mis hallazgos con evidencia que yo no tenía**

- **El costo de ventas sale mal, y con un número.** El "real" de una venta de S/ 85 quedó en **S/ 2.70**: solo cuenta las tres impresiones del día, no las 8 botellas y 5 tapas que salieron del estante ni los 660 g de dulces (1·"Lo que creí" 6). Eso sube la gravedad de mi H6 (entregar no descuenta): la entrega también es la que tiene que fijar el costo de ventas.
- **Nadie sabe si lo del estante ya tiene dueño.** La Persona nueva hizo el pedido de punta a punta y no supo si las 8 botellas del estante eran de otros pedidos (1·T3). Es mi H3/H4 visto desde la tarea real.
- **La vista de producción cuenta de más por otro lado.** `production_needs` cuenta como faltante el pedido en `post_processing` (`production_needs.sql:40`), que ya se imprimió: 20 de los 41 (4·H2). Yo había visto que contaba dos veces lo de `ready`, pero no esto. Las dos fallas tienen el mismo origen: la demanda se filtra por estados escritos a mano, en lugar de salir de lo que falta entregar.
- **Comprometer por movimientos no sirve para el filamento.** Un movimiento apunta a un rollo **o** a un artículo (`stock_movements_one_target`), y una venta compromete gramos de un color, no un carrete (3·H1). Es el mejor argumento técnico para calcular lo comprometido en vez de escribirlo, y yo no lo tenía.
- **La cola pone primero lo último que se creó** y se corta en 150 sin `fetchAll` (4·H3). Además, la misma A1 mini puede tener dos trabajos "Imprimiendo" a la vez (`produccion.data.ts:374-381` no lo impide; 4·H6, 1·T3). Ninguna fecha prometida sirve si la cola no tiene orden y una impresora no imprime de a una placa.

**Lo que completa mis propuestas**

- **El panel de aceptar.** 5·H1 lo completa con cuatro cosas: el adelanto en la misma transacción (con `record_payment`, que ya rechaza el sobrepago), aceptar desde el borrador (hoy solo se acepta lo `sent`, `cotizacion.page.ts:166`), un índice único parcial para que solo haya una versión aceptada por número, y la herencia del trato.
- **La disponibilidad del día en que se cotizó, guardada.** 5·H3 propone guardar en `cost_profile_snapshot` lo que había ese día y compararlo con hoy al aceptar, y poner en el PDF un plazo relativo ("2 días desde que confirmes"). Es mejor que lo mío, que solo proponía la fecha de hoy.
- **El precio de lo aceptado.** El cotizador ignora la escalera: una poción sale S/ 17.00 cotizada y S/ 10.00 en el pedido (5·H2). Si `accept_quote` copia el precio congelado, también copia ese error, así que hay que arreglarlo antes o junto (ver "Cinco cosas", punto 3).
- **Los rollos se confirman al iniciar** (4·H4), proponiendo primero el que está en el AMS. Yo los pedía al poner en cola, y entre una cosa y otra el AMS cambia: corrijo.
- **Producción en bolsa común** (4·H2.4): los trabajos de catálogo no se atan a un pedido, y lo hecho a medida sí se ata a su línea. Es lo mismo que propuse, y se mantiene con la regla de prioridad del dueño (ver contradicción 1).
- **Lo que el pedido tiene que heredar de la cotización.** Lo hecho a medida se imprime con `quote_lines.plates` (4·H11), y el pedido tiene que poder corregirse después de guardado (5·H1). Esto último yo no lo había visto, y con lo comprometido calculado es seguro: cambiar una cantidad recalcula todo solo.
- **Armar.** 3·H8 y 4·H7 piden lo mismo que mi H9: Armar con `?variante=&cantidad=`, enlazado desde el pedido y desde el plan, guardando el pedido en la nota, y el menú de Armar dentro de Producción.
- **Un solo criterio de valorización** para lo que sale del estante: promedio ponderado móvil (3·H5). `deliver_order` y la entrega de un kit tienen que usar esa misma regla, no `part_stock` como dije yo.
- **La ficha del pedido.** 6·H5 pide título humano y **una** acción primaria: hoy el formulario de cobro aparece antes que el avance. Coincido, salvo en qué acción es la primaria (ver En desacuerdo, punto 4).

## En desacuerdo

1. **"El pedido de cada trabajo se calcula por fecha de entrega, como Katana" (4·H2.4; también 3·H1.3 y 5·H3).**
   - El dueño ya lo decidió: manda el que confirmó primero, y una persona puede cambiarlo con un aviso a la vista.
   - Además, el ejemplo de Katana no dice lo que se le atribuye. En Katana la prioridad es **la posición en la lista**, que se cambia arrastrando: "The position of an SO in the list determines its priority" ([Katana, prioridad de pedidos](https://support.katanamrp.com/en/articles/5914297-managing-sales-order-priority)), y las órdenes de fabricación igual: "The topmost MO has the highest priority" ([Katana, prioridad de fabricación](https://support.katanamrp.com/en/articles/5914369-managing-the-priority-of-manufacturing-orders)). Ninguna de las dos páginas habla de ordenar por fecha de entrega.
   - Hay dos argumentos más, del propio taller:
     - **Lo prometido no se mueve solo.** Con la regla de la fecha, una venta nueva que vence antes le quita en silencio el estante a un pedido al que ya se le dijo "está listo".
     - **La fecha es opcional** (`orders.due_date`), y un pedido sin fecha no tiene lugar en esa regla.
   - Lo que sí hay que quedarse del lado de la fecha: es la **alarma**. Cuando el orden de confirmación hace que alguien llegue tarde, el sistema lo dice y propone el cambio (ver la sección de las respuestas del dueño).

2. **"Una cotización no compromete nada" (5·H3) y "nunca con la cotización" (3·H1.2).** La respuesta 2 del dueño los deja atrás: una proforma hace un **separo con vencimiento**. Es lo que hace Shopify con un borrador de pedido: "Select the date and time when the reserve will expire" ([Shopify, draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)).

3. **El plazo calculado con "horas impresas por día" (4·H8, 5·Q3).** Con `expected_hours_per_year ÷ 365` salen 5.5 h al día, un promedio que mezcla el uso con la disponibilidad. La respuesta 1 del dueño da la regla real: una placa empieza entre las 6:00 y las 23:00 si termina antes de medianoche. Eso se simula placa por placa (ver abajo). El promedio de horas reales de 4·H10 sirve para **comprobar** la simulación, no para reemplazarla.

4. **"Un botón: el siguiente paso («Pasar a Post-proceso»)" (6·H5).** El siguiente paso no puede ser empujar un estado. La Persona nueva hizo "cuatro clics para algo que ya pasó" (1·T5), y `ORD-2026-0001` recorrió cinco estados en cinco segundos, con las impresiones ya cerradas (mi H7). La acción primaria es la que sale de la situación del pedido: **Armar 2**, **Entregar 6** o **Cobrar S/ 35**. Comparto con 6·H5 la cabecera y la regla de una sola acción.

5. **`production_plan` como resta de totales (4·H2.1).** Esa resta ("Σ demanda − armado − stock − cola") da bien el total que falta, pero no dice **de quién** es cada unidad. Sin eso no puede salir el aviso que pidió el dueño ("María Pérez hizo un separo antes"), ni coincidir con lo que ve el vendedor en cada pedido. Cuando el estante no alcanza para todos, la resta de totales y el reparto por pedido dicen lo mismo en el agregado y distinto en cada pedido. El plan tiene que ser **la suma del reparto línea por línea** (mi `order_allocation`), no otra cuenta paralela. Así la cuenta de ventas y la de producción coinciden por construcción, que es lo que pide la contradicción 1.

6. **"El pedido es editable mientras no haya entrado a producción" (5·H1).** Con la producción en bolsa común, un pedido de catálogo nunca "entra a producción": las placas no son suyas. La regla tiene que ser "editable siempre, con motivo, mientras no se haya entregado lo que se cambia". El reparto se recalcula solo.

## Las contradicciones

**1. ¿A qué pedido le toca primero lo que hay?** Lo decidió el dueño, y lo concreto así:
- **Una sola regla para todo:** estante, piezas, material y salida de la cola. El orden es `priority_at`: el momento de confirmación o del separo vigente.
- **La cambia una persona, con aviso.** Pulsa "Pasar adelante", ve quién separó antes y en qué queda, y el cambio queda registrado con motivo.
- **La fecha de entrega no ordena: alerta.** El sistema propone el cambio solo cuando así nadie llega tarde.
- **Una sola cuenta.** `production_plan` y `capable_to_promise` leen el mismo `order_allocation`.

Detalle en la sección de las respuestas del dueño.

**2. ¿Se escribe la reserva o se calcula?** **Se calcula, con el vencimiento adentro.**
- **Lo que se escribe es la decisión,** no el saldo: `quotes.held_at` y `quotes.hold_until`, `orders.hold_until` (en espera) y `orders.priority_at`.
- **El reparto filtra `hold_until > now()`,** así que lo vencido deja de estar comprometido sin que nadie escriba un `release`.
- **Los movimientos `reservation` y `release` se quedan quietos y prohibidos.** Postgres no deja quitar un valor de un enum, así que va un `check (type not in ('reservation', 'release'))` en `stock_movements`, en una migración nueva y con su porqué. Si alguien vuelve a escribirlos, `inventory_balances.available` se separaría en silencio del reparto.
- **Las columnas `reserved` y `available` de las vistas viejas no se renombran.** `create or replace` no puede hacerlo (AGENTS.md). Las pantallas pasan a leer la vista de posición y se documenta que esas dos columnas no significan nada.

**3. ¿De dónde sale la foto de una pieza?** **De los dos lados, cada uno con su papel.**
- **Al importar el `.gcode.3mf`**, `plate_N.png` se guarda en `recipe_plates.thumbnail_path` (y en `quote_lines.plates` si es a medida). Esa miniatura es la que identifica **la placa**: en la cola y en la propuesta de placas es lo que se va a sacar de la cama (4·H6, 6·H1, 6·H7).
- **La misma miniatura es la foto inicial de la pieza** que produce la placa, si la pieza no tiene foto (6·Q2).
- **Una persona la reemplaza** por una foto real desde Piezas ("Editar", "+ Nueva pieza": 3·H9, 6·H1). Hoy no hay pantalla para eso, y una placa con dos objetos (frente y espalda de la botella, 4·H2.7) da una miniatura de la cama, no de la pieza.
- **El orden al mostrar una pieza:** su foto, luego la miniatura de la placa, luego el icono por tipo (6·H2). En la tarjeta de un trabajo va al revés: primero la miniatura de la placa.
- **Hace falta leer entradas binarias del zip**, que hoy `core/zip.ts` no expone (4·H6).

**4. ¿Dónde vive el "¿para cuándo?"?**
- **Se ve en todos los sitios donde se decide una cantidad o se mira un pedido:**
  - la línea del cotizador;
  - la línea del pedido nuevo;
  - el panel de aceptar, con "cuando cotizaste" contra "hoy" (5·H3);
  - la situación del pedido;
  - la fila del plan de producción, con su fecha y en rojo si llega tarde;
  - Hoy, cuando algo va a llegar tarde o un separo vence hoy.
- **La cuenta vive en un solo sitio:** las funciones de la base que reparten (`order_allocation`) y simulan la cola con el horario (`print_schedule`), y `capable_to_promise` encima. Las demás son lectoras. 4·H8 ya proponía "una sola función en la base, compartida con M5", y 5·H3 su `promise_for`: es la misma, con un solo nombre.
- **El dueño de la cuenta es quien tome M5, y nadie más la escribe.** La vista `production_needs` ya lo había decidido en su comentario: "esta vista crece ahí y no en otro sitio" (`production_needs.sql:8-10`). Producción aporta los datos de entrada (tiempos por placa, tasa de fallos, horario) e inventario aporta el stock, pero ninguno de los dos recalcula.

**5. ¿La compra crea su egreso sola, o se liga desde Caja?** **La crea sola. Lo que se paga después se paga desde la compra.**
- `register_purchase` (la de §3.4, 3·H3) recibe "Pagado con", con la última cuenta usada ya puesta, y escribe el egreso con `purchase_id` en la misma transacción.
- Una opción "Lo pago después" (compra a crédito) no escribe egreso. La compra muestra **"Por pagar S/ X"**, que se calcula como total menos egresos ligados (el saldo se deriva, AGENTS.md), y tiene un botón "Pagar" que crea el egreso ligado.
- Caja solo gana "Ligar a una compra" para reparar los egresos sueltos que ya existen, incluido el que está publicado. No es el camino normal: quien paga sabe en el mostrador con qué pagó (1·T1).
- Para mi flujo, lo que importa es que "Falta material" del cálculo de promesa abra la compra ya llena, con el plazo del proveedor.

**Otras contradicciones que encontré**

6. **"No atar los trabajos de catálogo" (4·H2) contra cómo se calcula hoy el costo.**
   - `order_production_summary` y `monthly_income_statement` toman el costo real de las impresiones **ligadas al pedido** (`20261004130000_finance.sql:402-431`).
   - Si producción deja de atar (y debe dejar de hacerlo), toda venta de catálogo queda para siempre con su costo estimado.
   - Las dos cosas tienen que llegar juntas: el costo de ventas pasa a ser lo que sacó `deliver_order` del estante (valorizado con el criterio de 3·H5), más las impresiones de las líneas a medida.

7. **Estados escritos a mano contra situación calculada.** 6·H5 los quiere como botón, y 4·H7, 5·H6 y mi H7 quieren calcularlos. Gana el cálculo: el estado escrito a mano ya produjo las dos fallas de conteo de `production_needs` (`ready` y `post_processing`). A mano quedan **en espera**, **cancelar** y **entregar** (que es una acción, no un estado).

8. **El precio que fija `accept_quote`** (5·H2 contra 5·H1 y mi H1): congelar el precio de la cotización es correcto, pero hoy congelaría un precio calculado desde el costo que contradice la escalera. Hay que arreglar el precio de catálogo en el cotizador antes o junto.

## Las respuestas del dueño, dentro de la cuenta

### Prioridad: quién va primero y cómo se cambia

- **`orders.priority_at`** (nuevo, `not null`):
  - si el pedido nace de una cotización con separo vigente, es **`quotes.held_at`**: quien separó antes va antes;
  - si no, es el momento de confirmar;
  - un pedido en espera cuyo separo venció lo pierde: al retomarse, `priority_at` pasa a ser el momento en que se retoma. La pantalla lo dice antes de confirmar: "Perdió su lugar: ahora va detrás de 3 pedidos".
- **El reparto** recorre pedidos y separos vigentes por `priority_at`. A cada línea le asigna, en este orden: estante, piezas libres, cola ya lanzada y por imprimir (mi ronda 1, H4, con la regla del dueño).
- **"Pasar adelante".** La persona quiere darle a Diego (confirmado el martes) las 4 botellas que el reparto le dio a María Pérez (separo del lunes). Puede hacerlo desde Armar, Entregar, el plan o la ficha del pedido, y antes de confirmar ve:
  > **María Pérez hizo un separo antes** (COT-2026-0012, lunes 18:00, vigente hasta el miércoles 18:00). Si se las das a Diego, a María le quedan 10 por fabricar: listas el jueves 8 por la mañana.
  > [Dárselas a Diego igual] [No]

  Si confirma, se registra el cambio de orden con quién, cuándo, a quién pasó y el motivo, en el mismo historial del pedido. El reparto se recalcula solo y la situación de María cambia a la vista.
- **La fecha de entrega como alarma.** Si con el orden actual un pedido llega tarde, Hoy y el plan dicen "B vence el miércoles y sale el jueves". Si pasar B adelante no hace que nadie más llegue tarde, se ofrece el botón con el mismo aviso. Si sí hace llegar tarde a alguien, se informa y decide la persona.

### El separo y su vencimiento

- **Cuándo nace.**
  - En una proforma, al **enviarla**, no en el borrador: si separara en el borrador, cotizar para probar bloquearía el estante. Ese momento es "Marcar como enviada" o "Enviar por WhatsApp" (5·H8).
  - En un pedido, al **ponerlo en espera**.
  - En los dos casos dura lo que diga el plazo por defecto, que se puede cambiar en ese documento, o **acortar a cero** con "Soltar ya".
- **Plazo por defecto: 48 horas**, configurable en Configuración › Taller. Es más corto que la vigencia del precio a propósito: el precio puede valer 15 días y el material no puede quedar frenado tanto tiempo (respuesta 2). 48 h cubren "lo veo con mi esposo y te aviso mañana", y un viernes por la tarde vence el domingo, sin congelar el estante toda la semana.
- **Qué aparta:** lo mismo que un pedido. Estante, piezas, gramos por color, dulces, frascos y empaque, y también **su lugar en la cola** para calcular las fechas de quienes van detrás.
  - Producción **no** propone placas para un separo: el dueño dijo que producción mira los pedidos cerrados.
  - Mientras el separo está vigente, las fechas de los que van detrás salen un poco pesimistas. Es el error barato.
- **Cómo vence.** No pasa nada en la base: la vista deja de contarlo porque `hold_until <= now()`. No hay tarea programada ni `release`.
  - Lo que se escribe es solo la decisión: crear el separo, extenderlo o soltarlo.
  - Hoy avisa unas horas antes: "Vence el separo de María Pérez (10 pociones) hoy 18:00 · [Extender] [Soltar]".
  - Al aceptar una cotización con el separo vencido, el pedido toma la prioridad del momento de aceptar, y el panel compara lo que había al cotizar con lo que hay hoy (5·H3).
- **Cómo lo ve otro vendedor:** "4 en el estante, **separadas para María Pérez hasta el miércoles 18:00** · para este pedido: 0 en el estante, 6 por fabricar, listo el miércoles por la mañana". Decide él: esperar al vencimiento, hacer la proforma o pasar adelante con el aviso.

### El horario y la fecha prometida

Configurable en Configuración › Taller, en hora de Lima (los cálculos con `now() at time zone 'America/Lima'`; 5·H10 ya mostró lo que pasa si no):

| Parámetro | Valor de hoy (respuesta 1) |
|---|---|
| Empieza desde | 06:00 |
| Último inicio | 23:00 |
| Tiene que terminar antes de | 24:00 |
| Minutos entre una placa y la siguiente | 15 (lo propongo yo; se calibra con lo real cuando "Iniciar" se pulse siempre, 4·H5) |

**`print_schedule`** simula la cola placa por placa, en el orden de prioridad:

```
t = fin estimado de lo que imprime ahora (si ya pasó su estimado: ahora, y "¿terminó? ciérrala")
para cada corrida de duración d:
  si no es la primera corrida con la impresora libre: t = t + cambio de placa
  último_inicio_del_día = mínimo(23:00, 24:00 − d)
  si t < 06:00 del día          → t = 06:00
  si t > último_inicio_del_día  → t = 06:00 del día siguiente
  si d > 18 h                   → "esta placa no cabe en el horario" (aviso, no error)
  fin = t + d
armado = (preparación + minutos por unidad × unidades), en la misma ventana
```

Los fallos se cuentan como **una corrida de reserva** por cada 1 ÷ tasa corridas, redondeando hacia arriba (con 10 %, una por cada diez o fracción). La fecha se da en dos tiempos: "lo más probable" sin la reserva y "si falla una placa" con ella. Es más honesto que inflar todos los tiempos un 11 %.

**Cómo cambia la promesa.** Venta de 10 pociones: 4 en el estante, 2 se arman con lo que hay y 4 por imprimir (4 placas de botella de 43 min y 1 de tapas de 20 min), con la cola vacía:

| Se pregunta a las | Placas | Listo |
|---|---|---|
| 18:00 (martes) | 18:00 → 22:12, las cinco seguidas | **Hoy, cerca de las 23:00.** Si falla una placa, la reserva termina 23:10 y el armado pasa a la mañana: miércoles antes de las 7:00 |
| 21:00 (martes) | Tres botellas hasta las 23:39. La cuarta empezaría a las 23:54, después del último inicio, y pasa al miércoles 6:00; tapas 6:58 → 7:18 | **Miércoles, cerca de las 8:00** |

Y una pieza a medida de una sola placa de **3 horas**: su último inicio es `mínimo(23:00, 21:00) = 21:00`.

| Se pregunta a las | Listo |
|---|---|
| 20:30 | **Hoy 23:30** |
| 21:15 | **Mañana 9:00**: la placa espera a las 6:00 |

45 minutos de diferencia al preguntar mueven la promesa casi diez horas. Ningún promedio de horas por día lo ve. Por eso el horario entra en la simulación y no en un divisor.

**Dónde se escribe y qué cambia al moverlo:** como la fecha estimada se deriva, cambiar el horario recalcula al instante todas las fechas estimadas. Las fechas **prometidas** (`orders.due_date`) no se tocan, porque son una decisión. Si con el horario nuevo un pedido ya no llega, aparece en la alarma de "llega tarde".

## Lo que cambio de mi informe

- **Retiro el horario inventado** (8:00 a 22:00), mi pregunta 1 y la hora del ejemplo de H3 ("miércoles 7, cerca de las 10:00"). Los reemplazan el horario del dueño y la simulación de arriba.
- **Corrijo la regla de prioridad.** Mantengo el orden de confirmación, que el dueño confirmó, pero **retiro** mi recomendación de "estante por confirmación, cola por fecha de entrega" (pregunta 2). Era incoherente: lo que se imprime primero para B se lo llevaría A por prioridad. Una sola prioridad para todo, con `priority_at` guardado (para que el cambio a mano persista) y la fecha como alarma.
- **Corrijo "en espera conserva lo del estante"** (pregunta 3 y caso "en espera"): pasa a ser un separo con vencimiento, y al vencer se pierde el lugar en la fila.
- **Corrijo cuándo se eligen los rollos** en "Poner en cola": se proponen ahí y se confirman al **Iniciar** (4·H4).
- **Corrijo la valorización** en `deliver_order` y en el kit: usar el criterio único de 3·H5, no `part_stock`.
- **Agrego lo que no vi:**
  - el pedido no se puede editar (5·H1);
  - `production_needs` cuenta el `post_processing` (4·H2);
  - dos trabajos imprimiendo a la vez en la misma impresora (4·H6);
  - el precio de la cotización contradice la escalera, y `accept_quote` lo congelaría (5·H2).
- **Subo de gravedad:**
  - H6 (entregar), por el costo de ventas de S/ 2.70 sobre S/ 85 (1·"Lo que creí" 6). Ya estaba en "bloquea", y ahora es la más urgente después de H2.
  - H12 (piezas "sin costo"), de *confunde* a **bloquea**: en el cotizador invita a cobrar la pieza dos veces (5·H2), y eso es dinero frente al cliente.
- **Bajo de gravedad:** H10 (miniatura de la placa). Sigue siendo necesaria, pero ya la proponen 4·H6, 5·H9 y 6·H1, y la tomará quien haga lo visual. La quito de mis cinco.

## Si solo se pudieran hacer cinco cosas

1. **Que cerrar una impresión meta las piezas que salieron de verdad** (S).
   - Qué es: `complete_print_job` con `p_units_produced`, tipo `production`, y una sola impresión "Imprimiendo" por impresora.
   - Qué destraba: saber cuántas piezas hay.
   - Por qué primero: todo lo demás se calcula encima, el error se acumula cada día sin que nadie lo vea, y son horas de trabajo.
2. **Entregar de verdad** (M).
   - Qué es: `deliver_order` con cantidades por línea (entrega parcial). Saca del estante (o los componentes, si es un kit), registra el costo de ventas con lo que salió y deduce "entregado" y "cerrado".
   - Lleva además una consulta para el proyecto publicado: comparar el producto terminado en mano con lo que ya se entregó, y ajustar una sola vez lo que esté de más, con motivo.
   - Qué destraba: entregar y que el estante baje, y que Resultados diga cuánto costó lo vendido.
   - Por qué antes que el reparto: repartir un estante que cuenta lo ya entregado da respuestas falsas (dice 31 donde faltan 41).
3. **"El cliente aceptó" en un paso** (M/L).
   - Qué es: `accept_quote` con precio congelado (corrigiendo antes el precio de catálogo del cotizador), líneas a medida, canal, trato, adelanto y la prioridad heredada del separo. El pedido se puede corregir después, con motivo.
   - Qué destraba: pasar del "sí" a un pedido en marcha sin volver a escribirlo, y que lo hecho a medida se pueda registrar, que hoy no se puede.
   - Por qué antes que el reparto: el reparto necesita que todas las líneas existan, y la prioridad nace aquí.
4. **La cuenta única de promesa** (L).
   - Qué es: `order_allocation`, con la prioridad del dueño, los separos con vencimiento y "Pasar adelante" con aviso; `print_schedule`, con el horario configurable; y `capable_to_promise`. Se ve en el cotizador, en el pedido nuevo, en aceptar y en la situación del pedido.
   - Qué destraba: "¿cuánto puedo prometer y para cuándo?", la idea no negociable del dueño, y el separo que pidió.
   - Por qué cuarto: lee lo que dejan bien hecho los tres anteriores.
5. **El plan de producción, opción B** (L).
   - Qué es: "Por lanzar", como suma del reparto. Las placas propuestas con su miniatura y su fecha, "Poner en cola" en lote (`queue_print_runs`), la cola en orden de prioridad (`queue_position`) y los rollos confirmados al iniciar.
   - Qué destraba: "¿qué imprimo ahora?" cada mañana.
   - Por qué quinto: solo lee lo que calcula el punto 4. Mientras no exista, la situación de cada pedido del punto 4 ya dice qué le falta, con nombre y cantidad.

Fuera de las cinco, pero barato y en el mismo viaje: el aviso de Hoy "vence un separo" o "llega tarde", y la foto en las líneas de pedido y de cotización (lo visual).
