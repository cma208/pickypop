# Persona nueva — ronda 2

> Leí los cinco informes de la ronda 1 completos, la aclaración del dueño y sus tres respuestas. Esta vez no usé el navegador ni creé datos; solo hice una consulta de lectura sobre los pedidos abiertos. Juzgo cada propuesta con una pregunta: **si mañana llego sin que nadie me explique nada, ¿la entiendo y me quita las dudas que tuve en las siete tareas?** Las dudas las cito por su número en «Las diez dudas más caras» de mi informe de la ronda 1 (R1).

## Las propuestas, vistas desde las siete tareas

| Propuesta | ¿La habría entendido sola? | ¿Qué duda mía quita? | Qué palabra o número me confundiría | Qué cambiaría |
|---|---|---|---|---|
| **Cuenta única «capaz de prometer»** (2·H3 `capable_to_promise`, 5·H3 `app.promise_for`, 3·H1 `stock_position`, 4·H2 `production_plan`) | No la veo; veo sus números. Funciona solo si **todas las pantallas dan el mismo número** | La n.º 1. En la tarea 3 me paralizó que Armar dijera «Alcanza para 5», la Cola «faltan 51» y el pedido no dijera nada: tres pantallas, tres respuestas | «Capaz de prometer» no debe aparecer nunca en pantalla. Y hoy hay **cuatro nombres para la misma cuenta**: si se construyen dos, vuelvo a ver dos números | Una sola vista en la base, con un nombre, que lean todas las pantallas |
| **Bloque «¿Para cuándo?»** (5·H3; ejemplo de 2, «Cómo se ve») | Sí: es lo que busqué en las tareas 2 y 3 | La n.º 1 | «Pediste 10» (5): yo no pedí nada, el cliente me pidió. «4 por imprimir (4 placas de botella + 1 de tapas)» (2): tres cuatros y un uno con unidades distintas en la misma línea. «240 libres» cuando Insumos dice 360: pensaría que hay un error. «Cerca de las 10:00» (2): me haría prometer una hora | Que responda la pregunta del cliente. Si escribo «vie 9» en Fecha de entrega, que diga **«Sí llega: estaría el jue 8»** o **«No llega: estaría el lun 12»**. Y que aparezca también en la **ficha del pedido**, que 5 no incluye: mi tarea 3 se hacía con el pedido ya guardado |
| **«Por lanzar» en la cola** (4·H2) / **tarjeta «Plan»** (2) | «Poner en cola» sí: ya había usado «Pasar a En cola». Ante «Por lanzar» dudaría, y «Plan» no dice nada | La n.º 4 (un trabajo por corrida, la placa que no se recuerda), gracias al `[− 32 +]` | La fila **suma los pedidos de todos**. Con la tarea «deja en marcha lo de María» habría visto «Botella impresa · faltan 32» sin saber si encolar 32 o 10. Las referencias a «PED-0003, PED-0004 y 2 más»: nunca me aprendí ORD-2026-0001, yo pensaba «el de María». Y «32 corridas» (4) junto a «4 placas de tapas» (2), dos palabras para contar lo mismo | Llamarlo **«Falta imprimir»**. En cada fila, «de estas, 10 son para María Barrido (vie 9)», con nombres de cliente y no números. Si el pedido pierde «Crear trabajo» (2·H5, 4·H7), que gane «Ir a imprimir lo de María», que abra la cola filtrada: mi camino en la tarea 3 empezó en el pedido |
| **Aceptar la cotización y que nazca el pedido** (2·H1, 5·H1) | Sí. «El cliente aceptó» (5) se entiende mejor que «Aceptada: crear pedido» (2), porque nombra lo que pasó | Me evita un callejón sin salida que **no llegué a ver**: si la persona del llavero dice que sí, hoy no hay forma de hacer el pedido (`pedido-linea.ts:21`). «¿Te pagó algo ya?» quita la duda de la tarea 2 de tener que guardar primero y cobrar después | Ninguna, si el panel ya viene lleno | Que diga «lo separado pasa a este pedido» (ver la contradicción 2) |
| **Entregar** (2·H6 `deliver_order`, 2·H7 situación deducida) | Sí: «Entregar» es la palabra que busqué en la tarea 5 | Los cuatro clics de estado, el estante que no bajó y el cobro aparte (n.º 5) | Un diálogo que pide cantidades por línea cuando entrego todo | Venir ya lleno con «Entregar las 10» y, en la misma ventana, «Saldo S/ 35: ¿te pagó? [Efectivo] [Yape] [Plin] [Banco] [Después]». «Cerrado» deducido, sin botón |
| **Posición en mano · apartado · libre · falta** (3·H1, `pp-stock`) | Casi | La n.º 1, del lado del estante | «En mano» se entiende, pero Armar ya dice **«Hay»** (`armar.page.ts:91`) y lo entendí al instante. «Disponible» (hoy en Filamentos, y quiere decir «en mano») es la trampa que hay que quitar | **«Hay · Separado · Libre · Falta»**, porque el dueño ya dijo «separo». «Separado» siempre con el nombre del cliente y la fecha |
| **La compra que crea su egreso** (3·H3, con 3·H4 y 3·H11) | Sí | Las n.º 2, 3 y 8: toda mi tarea 1 | «Pagado con» con la última cuenta ya elegida (3·H3): pagué en efectivo, venía «Yape», no lo vi y lo guardé | Cuatro botones sin nada elegido, más «Todavía no»: es un solo clic y obliga a mirar |
| **`pp-item`** (6·H1) | No hay nada que entender: se ve | En mis tareas, solo una: los trabajos de Botella y de Tapas se llamaban igual (tarea 3). Ahí lo resuelve la **miniatura de la placa**. Con siete artículos, los nombres me bastaron | La inicial: «B» para Bolsa y «B» para Botella | Sin un «Agregar foto» en la fila y sin la miniatura del laminado por defecto, sigo viendo letras: a las 15:48 ninguno de los 7 artículos tenía foto (3·H10). El icono por tipo en lugar de la letra, sí (6·H2) |
| **Cabecera de ficha** (6·H5, `pp-resource-header`) | Sí. «María Barrido · 10 Botellas de poción» es como yo pensaba en mi pedido | La n.º 5, **solo si la acción principal se deduce** | El ejemplo de 6: un único botón «Pasar a Post-proceso». Es justo el empujar estados que me costó cuatro clics en la tarea 5 | Que la acción principal la diga la situación: «Entregar y cobrar», «Ver qué falta imprimir», «Armar 10», «Cobrar S/ 35» |

## De acuerdo

- **2·H2 y 4·H1** (al cerrar una impresión, las unidades que escribes no llegan al estante). Lo apoyo justamente porque **no lo vi**: acepté los valores que traía el formulario, y por eso coincidieron. Un error que la persona no puede notar es más grave que uno que la traba.
- **2·H4 y 3·H1** (lo prometido no se descuenta). Mi pedido es su evidencia: `production_needs` contestó `41 · 10 · 31` con mis 10 pociones ya entregadas.
- **2·H6 y 2·H7** (entregar y la situación deducida). Mi pedido pasó por Imprimiendo, Post-proceso, Listo y Entregado en cinco segundos (`order_status_history`, 20:45:00 → 20:45:05) cuando ya no quedaba nada por imprimir.
- **3·H3, 3·H4, 3·H9 y 3·H11** (la compra). Mi tarea 1 es su evidencia: la división 15 ÷ 500, el «Nuevo artículo» que se abrió en «Insumo» estando en Empaque, el buscador sin «Crear» y el egreso escrito dos veces.
- **3·H2** (Hoy solo mira el filamento). Me hace corregir mi tarea 7: ver «Lo que cambio de mi informe».
- **4·H3, 4·H5 y 4·H6** (cola). «+9 Tapa impresa (ahora 14) · Ya puedes armar 8 botellas → Armar» es exactamente lo que me faltó después de cerrar en la tarea 4. Y el título igual para la botella y la tapa fue una duda de la tarea 3.
- **5·H1 y 5·H7** (cliente al vuelo en el cotizador). En la tarea 6 no pude crear a la persona del llavero.
- **5·H4.4** (que el cobro muestre cada pago). En la tarea 5 solo vi «Último cobro: 06 oct.».
- **5·H5** (Por cobrar). Mi tarea 7: tuve que sumar a mano los S/ 450 de los pedidos en curso.
- **5·H8** (enviar por WhatsApp). La tarea 6 terminó en un PDF que no descargué y un «Marcar como enviada» que no me atreví a pulsar.
- **2·H12 y 5·H2** (las piezas sin costo). Es el aviso «Es un mínimo…» que me hizo desconfiar del costo en la tarea 2.

## En desacuerdo

1. **El botón principal de la ficha no puede ser «Pasar a…»** (6·H5). La cabecera es buena, pero su ejemplo conserva lo peor de la tarea 5. Con estados deducidos (2·H7), a mano solo quedan entregar, poner en espera y cancelar. El botón principal sale de la situación.
2. **Ni la hora exacta (2) ni el rango (4·H8, «listo en 4 a 6 días») responden lo que pregunta el cliente.** María escribió «para el viernes». Con «cerca de las 10:00» prometo una hora, y con «4 a 6 días» tengo que contar en un calendario. Lo que necesito es un sí o un no frente a la fecha pedida, y el día estimado. El detalle (cola por delante, fallos, horario) va en «¿Por qué esa fecha?», plegado y no en la frase.
3. **Lo que se propone imprimir debe separarse por cliente** (4·H2, 2). Si la fila suma la demanda de todos, la tarea «deja en marcha lo de María» abre una duda nueva que hoy no existe.
4. **Que «Pagado con» venga ya elegido** (3·H3). Un valor elegido de antemano que la persona no mira es un error que no se ve. Con cuatro botones, sigue siendo un clic.
5. **Que «Entregar» pida cantidades por línea antes de nada** (2·H6). Cuando se entrega todo, que venga lleno con el total. La entrega parcial va un clic más allá.
6. **Las propuestas hablan de PED-0005; las personas, de clientes.** En los ejemplos de 2, 3 y 4 los pedidos se nombran por número. En la tarea 3 el número de mi pedido no me sirvió de nada; el nombre «María» sí.
7. **Mover «Armar productos» al menú de Producción** (4·H7). No me opongo, pero no habría cambiado nada en mis tareas. Lo encontré en Inventario sin problema; lo que me faltó fue el botón desde donde estaba (el pedido, la impresión recién cerrada).
8. **Por cobrar en tres grupos** (5·H5): sí, pero **sin sumarlos en una sola cifra**. «Te deben S/ 540» mezcla lo entregado con lo que todavía no le di al cliente. Son dos números: «Te deben (ya entregado): S/ 90» y «Saldos de pedidos en curso: S/ 450».

## Las contradicciones

### 1. ¿A quién le toca primero lo que hay? (decidida por el dueño)

**Acepto la regla: el que confirmó primero propone, y una persona puede cambiarlo con un aviso.** Se entiende sola, porque es la cola del banco y el separo de cualquier tienda de Lima, **con una condición: que el orden se vea**. Hoy el único dato que muestra la lista de Pedidos es «Entrega 05 oct.». La confirmación no aparece en ninguna pantalla, y en local solo uno de los seis pedidos abiertos tiene registrada la hora en que se confirmó:

```sql
select o.number, o.due_date, (select min(changed_at) from order_status_history h
  where h.order_id = o.id and h.to_status = 'confirmed') confirmado ...
-- PED-0003 5 oct · — | PED-0004 6 oct · — | PED-0007 7 oct · — | PED-0005 8 oct · 2026-10-06 13:07 | PED-0006 11 oct · — | PED-0008 16 oct · —
```

Lo que hace falta para que se entienda sin explicación:

- **En el estante**, cada cosa separada dice para quién y desde cuándo: «8 Botellas impresas · separadas para Ana Quispe desde el 30 set.».
- **En la ficha del pedido**, su lugar en la fila: «María va 6.ª para las botellas».
- **El aviso para elegir otro debe decir qué le pasa al otro pedido.** «María Pérez hizo un separo antes» no alcanza: lo habría pasado de largo con un clic. Mi caso real fue la tarea 4: armé las 10 de María con las 8 botellas que, según esta regla, eran de Ana. El aviso que necesitaba era este:
  > Estas 8 botellas están separadas para **Ana Quispe** (desde el 30 set., entrega el 05 oct.). Si las usas para María, el pedido de Ana queda en «falta imprimir 8 botellas · estaría el jue 8». **[Usarlas para María]** **[Imprimir las de María]**
- **El otro pedido guarda el rastro:** «El 6 oct. se pasaron 8 botellas a María Barrido».
- **Producción propone en el mismo orden** y marca en rojo lo que llega tarde («Ana: venció ayer»). El cambio de orden es el mismo gesto, con el mismo aviso. Así ventas y producción dan el mismo número.

### 2. ¿La reserva se escribe o se calcula? (ahora con plazo)

**Desde la pantalla, no quiero ningún paso de «liberar» que tenga que acordarme de hacer.** Me olvidaría, igual que nadie se acordó de sacar mis 10 pociones del estante. Por eso:

- **Se escribe solo el plazo** («separado hasta…») en la proforma o en el pedido en espera. Las cantidades se calculan con la receta, y lo vencido deja de contar comparando con la hora actual. No hacen falta movimientos.
- **«Acortar a cero» es un botón, «Liberar ya»**, que solo pone el plazo en este momento.
- **Los movimientos `reservation` y `release` no se usan, y se sacan del filtro del Kardex.** Hoy el filtro «Tipo» ofrece «Reserva» y «Liberación de reserva» (`inventario.format.ts:44-45`), y nunca hay una fila de esos tipos. Para alguien nuevo, una opción que nunca tiene filas parece algo que debería estar haciendo.

**¿Se entiende «separo» sin explicación?** Sí. En Lima, «te lo separo hasta el sábado» es lenguaje de mostrador, mejor que «apartado», «reserva» o «comprometido». Para que se entienda **cuándo vence** y **qué pasa al vencer**:

- **El vencimiento va como fecha y hora, nunca como duración:** «Separado para Diego Flores hasta el jue 8, 23:00 · [Liberar ya] [Alargar]».
- **Una proforma tiene dos fechas que se pueden confundir:** la vigencia del precio (15 días por defecto, `cotizador.page.ts:57`) y el separo. Cada una con su nombre: «Precio válido hasta el 21 oct.» y «Material separado hasta el jue 8, 23:00».
- **Hoy avisa antes y después:** «El separo de Diego vence hoy a las 23:00: ¿confirma o se libera?» y «Venció el separo de Diego: 6 tapas volvieron a quedar libres».
- **Al cliente, el separo se le dice como condición de la entrega:** en el PDF, «Si confirmas antes del jue 8, te lo entrego el sáb 10». Nunca la palabra «separo» a secas.
- **Plazo por defecto que propongo: hasta las 23:00 del día siguiente.** Es una frase que cualquiera dice por WhatsApp («te lo separo hasta mañana en la noche»), coincide con el cierre del horario de impresión y es corto, como pidió el dueño. Configurable, y con cero permitido.
- **Un pedido confirmado no tiene vencimiento:** dice «Separado para María · pedido», sin fecha. La diferencia se ve en el texto, no hay que recordarla.

### 3. ¿De dónde sale la foto de una pieza?

**De los dos lados.** La miniatura de la placa (`Metadata/plate_N.png`) es la foto automática; una foto real la reemplaza cuando alguien la sube.

- En **la cola, el trabajo usa siempre la miniatura de la placa**, porque eso es lo que va a salir de la impresora. Habría resuelto mi duda de la tarea 3.
- En **el estante**, la miniatura de una placa de 9 tapas sigue siendo reconocible, pero una foto real es mejor.
- Nunca la inicial.
- Y hace falta poder **subir la foto de una pieza**, que hoy no se puede desde ninguna pantalla (6·H1).

### 4. ¿Dónde vive el «¿para cuándo?»?

**En cuatro pantallas más Hoy, con un solo número:**

1. el cotizador;
2. el pedido nuevo;
3. el panel de «El cliente aceptó»;
4. **la ficha del pedido**, como su situación. Es la que se le olvidó a 5, y la que necesitó mi tarea 3;
5. **Hoy**, solo para «va a llegar tarde».

**Su dueño:** el lado de producción, porque la fecha es casi toda tiempo de cola y horario. Ventas solo la lee.

**El horario (de 6:00 a 23:00, terminando antes de medianoche) no va en la frase.** Aparece donde explica algo:

- en «¿Por qué esa fecha?»: «la botella de 43 min de las 23:30 ya no cabe hoy: empieza mañana a las 6:00»;
- en la cola, junto a la siguiente placa: «ya no cabe hoy · empieza a las 6:00».

### 5. ¿La compra crea su egreso, o se liga desde Caja?

**La compra crea su egreso.**

- **En el formulario va un campo obligatorio, «¿Cómo pagaste?»:** [Efectivo] [Yape] [Plin] [Banco] [Todavía no].
- **Con «Todavía no»**, la compra queda «Por pagar S/ 27 · Tienda local», a la vista en Compras y en Hoy, y se paga después **desde la compra**, con un botón «Pagar», igual que los cobros de un pedido. Eso cubre la compra a crédito y el pago en partes.
- **Desde Caja, como segunda puerta**, porque ahí fui yo en la tarea 1: si un egreso es de «Dulces y empaque» o de «Filamento», la pantalla pregunta «¿Es el pago de una compra?» y ofrece las compras sin pagar.
- **El pago de una compra no pide categoría**, porque ya se sabe qué es.

### Otras contradicciones que encontré

6. **La acción principal de la ficha:** 6·H5 dice «Pasar a…», 2·H7 dice estados deducidos. Gana 2·H7 (ver «En desacuerdo», punto 1).
7. **Doce palabras para contar lo mismo.** Hoy hay cuatro (3·H1: Disponible, Existencias, En el estante, Hay). Las propuestas suman ocho más: en mano, apartado, libre, comprometido, separado, por lanzar, plan, falta producir. Propongo un solo juego:
   - **Hay · Separado · Libre · Falta** para el stock;
   - **Falta imprimir** para la cola;
   - **Poner en cola** para la acción.
8. **Contar en placas o en corridas** (2 frente a 4). Propongo **placas**: «4 placas de Tapas (9 cada una)». Es lo que la persona saca de la impresora y lo que ve en la cola.
9. **Por cobrar sumado o separado** (5·H5): separado (ver «En desacuerdo», punto 8).

## Lo que cambio de mi informe

- **Corrijo la tarea 7.** Contesté «Verde lima» como el filamento por acabarse porque es lo que decía Hoy. Según 3·H2, **ninguna receta usa ese color**, y lo que de verdad se acaba son los dulces: faltan 2.3 kg para las 41 pociones comprometidas. La pantalla me hizo contestar algo correcto e inútil. Subo «Hoy solo mira el filamento» a **bloquea** para esa tarea.
- **Subo la tarea 6 a «bloquea».** La califiqué «a medias» porque no podía mandar la cotización. El problema real viene después: si la persona acepta, el llavero no cabe en un pedido (`pedido-linea.ts:21`; 2·H1, 5·H1).
- **Agrego el error de las unidades al cerrar** (2·H2, 4·H1), que no detecté por la misma razón por la que es grave: no se ve.
- **Corrijo un número.** La cola decía «faltan 51», pero 20 de esas eran de PED-0006, ya en post-proceso (4·H2). Mi duda tenía más motivo del que pensaba.
- **Bajo la numeración ORD/PED a «afea, solo en local».** La semilla escribe `PED-` (14 líneas en `supabase/seed.sql`) y la base genera `ORD-` (`20260930020000_numbering_for_trusted_callers.sql:32`). En producción solo existe `ORD-`. Lo que queda es que «ORD» está en inglés (6·H4). Su lugar entre mis diez dudas lo ocupa «Hoy señala el filamento equivocado».
- **Bajo las fotos como causa de mis dudas.** En siete tareas, la falta de foto solo me costó una: los trabajos con el mismo título. La regla del dueño sigue en pie, pero no fue lo que me frenó.
- **Retiro** lo del Rosado «camino al mínimo»: alcanza para las 41 pociones (233 g de 613 g, 3·H1).
- **Agrego** un hallazgo chico: «Reserva» y «Liberación de reserva» aparecen en el filtro del Kardex sin que haya una sola fila de esos tipos (`inventario.format.ts:44-45`).

## Si solo se pudieran hacer cinco cosas

1. **Que el estante diga la verdad** (M). Tres piezas:
   - «Entregar» descuenta el producto (`deliver_order`) y ofrece cobrar el saldo en la misma ventana;
   - los estados intermedios se deducen;
   - cerrar una impresión mete las unidades reales, como producción.

   *Destraba* las tareas 5 y 4. *Va primero* porque todo lo que viene después («libre», «separado», la fecha) se calcula sobre el estante, y hoy el estante ofrece a otros pedidos 10 pociones que ya se entregaron.
2. **La compra que se paga** (M):
   - «¿Cómo pagaste?» en el formulario, con «Todavía no»;
   - «Crear «…»» en el buscador;
   - el total de la línea en vez del precio dividido.

   *Destraba* la tarea 1 y arregla Resultados. *Va antes que la 3* porque es chica, no tiene ningún camino alternativo en pantalla, y deja mal el dinero de producción con cada compra: o sin egreso, o con el egreso contado como gasto.
3. **La cuenta única, con separos y con su cara en pantalla** (L):
   - «Hay · Separado · Libre · Falta», con nombres de cliente y fecha de vencimiento;
   - «¿Para cuándo?», respondiendo «¿llega el viernes?» en el pedido nuevo, el cotizador, el panel de aceptar y la ficha del pedido;
   - el horario de 6:00 a 23:00;
   - el aviso de quién separó antes, con la consecuencia para el otro pedido.

   *Destraba* las tareas 2 y 3, y es la idea no negociable del dueño. *Va después de la 1* porque lee el estante.
4. **«Falta imprimir» en la cola, con cantidad y «Poner en cola»** (M, sobre la 3):
   - filas con la miniatura de la placa;
   - «de estas, 10 son para María»;
   - el mismo orden y el mismo aviso que la 3.

   *Destraba* la segunda mitad de la tarea 3 y la tarea 4. *Va después de la 3* porque es la misma cuenta vista desde producción.
5. **«El cliente aceptó» crea el pedido** (M–L):
   - con líneas a medida;
   - con «¿Te pagó algo ya?»;
   - con el separo de la proforma pasando al pedido.

   *Destraba* la tarea 6 (hoy, un callejón sin salida para todo lo hecho a medida) y evita volver a escribir el pedido. *Va última* porque la línea a medida necesita que la cola sepa imprimirla a partir de `quote_lines.plates` (2·H5, 4·H11).

**Fuera de las cinco, y por qué:**

- `pp-item` en todas las listas: en mis tareas me costó una sola duda, y la miniatura de la placa ya va en la 4.
- La cabecera de ficha: su parte que importa, la acción principal deducida, va en la 1.
- Por cobrar en grupos, WhatsApp, Métricas, Conteo: no me trabaron ninguna de las siete tareas.
- Una línea **«Entró hoy S/ 85 · Salió S/ 27»** en Hoy (S): nadie la propuso y respondería la mitad de la tarea 7. Si sobra una hora, es esa.

## Mis siete tareas con las propuestas

Cuento clics aproximados, dudas (las filas de las tablas «Dónde dudé» de R1) y cosas escritas dos veces. La columna «Con las propuestas» es una **estimación hecha leyendo los informes, no una medición**.

| Tarea | Hoy (clics · dudas · dos veces) | Con las propuestas | Qué propuesta lo logra | Duda que queda o que aparece |
|---|---|---|---|---|
| T1. Compra del mercado | 35 · 9 · 3 | ~14 · 2 · 0 | 3·H3 (cómo pagaste), 3·H4 (total de la línea), 3·H11 (crear en el buscador, sin piezas), 3·H9 (el tipo lo pone la pantalla) | Queda: ¿las gomitas son los «Dulces surtidos»? Solo la quita una foto del dulce en el buscador. Y los textos que hablan de «rollos» en Compras |
| T2. Pedido de María con adelanto | 18 · 7 · 1 | ~13 · 2 · 0 | 5·H1 (¿te pagó algo ya?), 5·H3 y 2 (¿para cuándo?), 6·H1 (variante con foto), 2·H12 (las piezas con costo) | Queda: el canal WhatsApp (nadie propone canal en el pedido nuevo). Aparece: «separado» y «libre», si no van con nombre y fecha |
| T3. ¿Cuándo? y dejar en cola | 25 · 8 · 3 | ~8 · 2 · 0 | 2·H7 (situación en la ficha), 4·H2 (falta imprimir con cantidad), 4·H3 (en lote), 4·H6 (miniatura y título) | Aparece: ¿encolo lo de todos o solo lo de María? (se resuelve con «de estas, 10 son para María»), y el aviso del separo de Ana si quiero usar el estante |
| T4. Cerrar y armar | 16 · 6 · 1 | ~7 · 1 · 0 | 4·H5 («Salió bien: 9 tapas» y «→ Armar»), 2·H9 (Armar ya lleno) | Aparece una decisión nueva, pero honesta: armar las de María con botellas separadas para Ana dispara el aviso. Hoy esa decisión la tomé sin saberlo |
| T5. Entregar y cobrar | 8 · 4 · 0, y el estante no bajó | ~4 · 0 · 0 | 2·H6 (entregar y cobrar), 2·H7 (cerrado deducido), 5·H4.4 (lista de cobros) | Ninguna |
| T6. Cotizar el llavero | 20 · 8 · 0, y si acepta no hay pedido posible | ~15 · 4 · 0, y si acepta el pedido sale solo | 5·H7 (cliente al vuelo), 5·H8 (WhatsApp), 5·H3 (plazo relativo), 5·H1 (aceptar) | Quedan: sin archivo, tiempo, gramos y color siguen inventados; el tiempo de diseño no tiene campo; la argolla no existe como insumo |
| T7. Cierre del día | ~8 · 5 · 1 (la fecha), en 6 pantallas | ~4 · 1 · 0, en 3 pantallas | 5·H5 (Por cobrar en grupos), 3·H2 (Por comprar en Hoy) | Queda: «cuánto entró hoy» sigue siendo Caja con dos filtros, salvo la línea en Hoy que propongo arriba |
| **Total** | **~130 clics · 47 dudas · 9 repeticiones** | **~65 clics · 12 dudas · 0 repeticiones** | | La mitad de los clics y una cuarta parte de las dudas. Las 12 que quedan son, sobre todo, datos que el sistema no puede saber sin el archivo laminado o sin una foto |
