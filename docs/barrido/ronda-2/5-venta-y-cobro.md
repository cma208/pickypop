# Venta y cobro — ronda 2

Leí los cinco informes de la ronda 1 y las respuestas del dueño de `00-encargo-ronda-2.md`. Dos de esas respuestas contradicen lo que yo había escrito: la prioridad por fecha de entrega y "una cotización no compromete nada". Las corrijo abajo, en "Lo que cambio de mi informe".

Como pidió el coordinador, el separo y el aviso de prioridad están diseñados pantalla por pantalla dentro de "Las contradicciones", en el apartado "El separo, pantalla por pantalla".

## De acuerdo

- **2·H1 (`accept_quote`) es mi H1, y le agrega tres cosas que yo no vi:**
  - El costo estimado de la línea tiene que copiarse congelado de `quote_lines.unit_cost`, no recalcularse con los costos de hoy.
  - "Hoy" no consulta `quotes`, así que una cotización aceptada sin pedido no aparece en ninguna parte (`panel.data.ts`).
  - `createOrder` **borra** el pedido si fallan las líneas (`pedidos.data.ts:419-421`). Eso deja un hueco en la numeración y, para un operador, falla: `orders_delete` es solo del dueño.

  Las tres entran en la misma función.
- **2·H12 y 1·T2 extienden mi H2 al pedido nuevo.** El aviso falso de que las piezas no tienen costo no sale solo en el cotizador: también en la línea del pedido (`cost-estimate.ts:111-128`, `pedido-linea.ts:90-95`). Es la excepción de AGENTS.md, y aparece justo en el momento de poner el precio.
- **3·H1 trae el mejor argumento para calcular lo comprometido en vez de escribir reservas.** Un movimiento apunta a un rollo **o** a un artículo (`stock_movements_one_target`, `20260929231000_inventory.sql:178`). Para apartar 233 g de rosado habría que elegir el carrete en el momento de vender, y la venta necesita gramos de un color, no un carrete. Lo uso en la contradicción 2.
- **2·H6 (`deliver_order`) es la mitad física de un problema de dinero que no vi en la ronda 1.** Lo agrego como hallazgo nuevo (ver "Lo que cambio"): el costo de ventas de Resultados.
- **2·H8 deja el dinero del pedido cancelado "para el agente de finanzas"**, que soy yo. La respuesta está en mi H4.5, completada abajo con una tercera salida que el esquema ya permite: pasar el adelanto a otro pedido.
- **1·T7 confirma mi H5 con números.** "Por cobrar" decía S/ 90.00 y había otros S/ 450 sin cobrar en cuatro pedidos en curso (PED-0003, 0005, 0006, 0008), que la persona sumó a mano. También echó de menos ver en "Hoy" cuánto entró y cuánto le deben.
- **1·T2: un aviso falso mientras se calcula.** Durante la espera de 300 ms (`pedido-linea.ts:9`), la línea dice *"Esta variante no tiene precio de lista ni escalera"* y *"Sin receta"* en lugar de "Calculando…" (`:71-97`), y la persona fue al catálogo a comprobarlo. Es de mi lado y no lo vi. Tamaño S.
- **1·T6: canales duplicados y un margen que no cuadra.**
  - El cotizador ofrece "Venta directa" (la opción vacía, `cotizador.page.html:338`) junto al canal sembrado "Directo (0 %)".
  - El margen se muestra sobre el precio antes del redondeo: dice "S/ 5.60 (50 %)" con un precio de S/ 11.50.
  - Los dos son de venta y van con mi H2.
- **6·H9: "Mover a: Nuevo" en todas las tarjetas del tablero.** El `[value]="stage"` se asigna antes de que existan las opciones (`oportunidades.page.ts:171`). Es de mi tablero y no lo vi. Tamaño S.
- **6·H5: el botón principal de la cotización aceptada es "Crear pedido".** Mismo corte que mi H1, visto desde la cabecera de la ficha.
- **6, escala de fotos: 64 px para las líneas de pedido y de cotización.** Las llama "fila protagonista". Reemplazo mi mínimo de 40 px (H9) por ese.
- **4·H11: la pieza a medida se imprime con las placas que el cotizador ya leyó** (`quote_lines.plates`). Depende de que `accept_quote` copie `quote_line_id`. Es el motivo para que mi H1 vaya antes que el plan.
- **3·H5: lo que sale del estante se valoriza al promedio ponderado.** El último precio puede seguir sirviendo para cotizar. Lo adopto para el costo de ventas.

## En desacuerdo

1. **6·H5 propone el siguiente estado como único botón primario del pedido ("Pasar a Post-proceso").** No estoy de acuerdo, por dos razones:
   - **Los estados empujados a mano no describen nada.** En la prueba, ORD-2026-0001 pasó por cuatro estados en cinco segundos, con las impresiones ya cerradas (2·H7, `order_status_history`). Darle el botón principal a eso premia el clic sin sentido. El primario tiene que ser la acción real que sigue: *Registrar adelanto*, *Armar 2*, *Entregar* o *Cobrar saldo*, según la situación deducida que propone 2·H7.
   - **6·H5 deja "Registrar cobro" como primario solo cuando el pedido está entregado.** Eso esconde el adelanto, que se cobra **antes** de producir, justo en las compras grandes (ADR-015: "las compras grandes llevan adelanto"). Mientras lo cobrado esté por debajo del adelanto pedido, el primario es "Registrar adelanto". Después de entregar, "Cobrar saldo".
2. **6 le pone 5 de 5 a "Por cobrar" en "¿Qué hago aquí?".** El diseño de la fila es bueno, pero la lista está incompleta:
   - deja fuera los S/ 450 de pedidos en curso (1·T7);
   - el número de pedido no es un enlace (`por-cobrar.page.ts:95`).

   Una buena fila no compensa que falte la mitad de la deuda.
3. **4·H8 quiere mostrar el plazo como rango ("listo en 4 a 6 días") y calcularlo con las horas impresas por día.** No estoy de acuerdo, por tres razones:
   - **El horario del dueño hace obsoleta la división entre 5.5 horas.** Con una placa que puede empezar de 6:00 a 23:00 y terminar antes de medianoche, la fecha sale de **acomodar las corridas en el calendario**, no de dividir horas entre un promedio. Esos 5.5 h/día los usé yo en la ronda 1 y los usa 4·H8 (`printers.expected_hours_per_year` = 2000). Con ellos, las 29 h 27 min de botellas que faltan (3·H1) saldrían en unos 6 días. Con la ventana del dueño, que deja hasta 18 horas de placas encadenadas, saldrían en unos 2.
   - **Al cliente se le promete un día, no un rango.** "¿Entonces el 4 o el 6?" es la siguiente pregunta por WhatsApp. La incertidumbre (fallos y separos ajenos que pueden cerrarse) va **dentro** del cálculo, como hace 2 con su 10 % de fallos, y se explica en el desglose.
   - **El factor real contra estimado de los últimos 90 días hoy vale 1 por construcción**, porque el cierre copia el estimado (4·H5 lo prueba: 1.000 exacto). Sirve el día que los datos sean reales; hoy no agrega nada.
4. **4·H2.3 ordena las corridas por la fecha de entrega más próxima.** No puede ser así si el estante se reparte por orden de confirmación, que es lo que decidió el dueño. Lo muestro en la contradicción 1.
5. **3·H1.2 ("nunca con la cotización") y mi propia H3 ("una cotización no compromete nada") quedan superados por el dueño.** Una proforma enviada **sí** aparta, por poco tiempo. Lo diseño en la contradicción 2.

## Las contradicciones

### 1. ¿A qué pedido le toca primero lo que hay?

**Lo decidió el dueño:** primero el que confirmó antes, salvo que una persona elija otro, y en ese caso con un aviso a la vista. Agrego tres cosas.

**Una sola clave para el estante, la cola y el "¿para cuándo?".** Cada pedido, y cada proforma con separo vigente, tiene un `priority_at`. Por defecto es el momento en que tomó su lugar: cuando se envió la proforma con separo o, si no hubo separo, cuando se confirmó el pedido. El reparto del estante, el orden en que el plan propone las corridas y la fecha de cada pedido salen de esa misma clave. La fecha de entrega solo sirve para avisar "va a llegar tarde". Hoy no hay ninguna columna así: la consulta a `information_schema.columns` no devuelve nada que contenga *confirm*, *hold*, *priority*, *accepted* ni *sent* en `orders` ni en `quotes`.

**Por qué no pueden ser dos claves.** Un ejemplo:
- A se confirmó el lunes y vence en 10 días. Le faltan 6.
- B se confirmó el martes y vence mañana. Le faltan 6.
- No hay nada en el estante.

La cola imprime 6 "por fecha", es decir, para B. Pero el reparto, que va por orden de confirmación, se las da a A, y B llega tarde igual. O la cola sigue la misma prioridad que el reparto, o los números de ventas y de producción no coinciden. Para que B vaya primero, alguien lo pasa adelante a propósito, y el sistema le muestra a quién atrasa.

**Por qué el orden de confirmación también es mejor para la venta:**
- **Protege lo prometido.** Una venta nueva entra al final de la fila, así que nunca mueve en silencio la fecha de otro. Con la fecha de entrega como clave, una venta urgente de mañana le cambia la fecha a la proforma que se mandó ayer.
- **Funciona sin fecha.** `due_date` es opcional (`pedido-nuevo.page.ts:88-90`), y un pedido sin fecha no tiene lugar en una fila ordenada por fecha.
- **Casi siempre da el mismo orden.** Si cada fecha prometida sale del "¿para cuándo?" calculado al final de la fila, el orden de confirmación y el de vencimiento coinciden casi siempre. Las excepciones son justo los casos que tiene que decidir una persona.

**El aviso.** Es el mismo componente en los cuatro lugares donde se puede saltar la fila:

| Dónde | Qué dispara el aviso |
|---|---|
| "¿Para cuándo?" del cotizador y del pedido nuevo | "Tomar igual" lo que otro tiene separado |
| Panel "El cliente aceptó" | Igual que arriba |
| Ficha del pedido | "Pasar adelante" |
| Cola de producción | Subir una corrida por encima de otra de mayor prioridad |

Así se ve:

```
⚠ María Pérez hizo un separo antes (mié 7, 16:20 · vence jue 8, 18:00).
  3 de las 4 armadas son suyas.
  Si las tomas: tu pedido sale hoy · el de María pasa de "hoy" a "sáb 10".
  [Tomar igual]   [Mejor no]
```

"Tomar igual" no pide motivo, porque el dueño pidió aviso, no permiso. Lo que sí hace:
- deja una fila de historial en los dos documentos (quién, cuándo y a quién adelantó);
- la proforma de María muestra al abrirla *"Quedó detrás de PED-0014 (Carlos, mié 7, 17:05). Ahora: 1 armada, 3 por imprimir, listo sáb 10"*. Así, quien le conteste a María lo sabe antes de escribirle.

### 2. ¿Se escribe la reserva o se calcula?

**Se calcula, con el vencimiento adentro.** El separo es una decisión de una persona ("te lo aparto hasta el jueves") y se guarda como un dato del documento: `hold_until` en `quotes` y en `orders` (para el pedido en espera), más el `priority_at` de arriba. Lo que el separo aparta, en unidades y gramos, **no se guarda**: lo deduce la vista de reparto, que cuenta solo los separos con `hold_until > now()`. Hay tres razones para no usar `reservation` y `release`:

1. **El filamento no se puede reservar por rollo** (3·H1, `stock_movements_one_target`).
2. **El vencimiento escrito necesita alguien que lo escriba.** Con movimientos, a las 18:00 del jueves algo tendría que insertar el `release`, y si no corre, el disponible miente para siempre. Calculado, a las 18:01 la vista ya no lo cuenta, sin tarea programada. Acortar el plazo a cero es poner `hold_until = now()`.
3. **Hay seis lugares donde habría que liberar** (2·H4): entregar, cancelar, poner en espera, cambiar la cantidad, cambiar la receta y borrar una línea. Es la clase de error que más caro le costó al proyecto ("un cálculo que nunca se recalculaba").

**Qué hacer con los movimientos que ya existen.** Hoy hay 0 filas de `reservation` y de `release` (consulta a `stock_movements` agrupada por tipo: solo `purchase`, `consumption`, `waste`, `adjustment` y `maintenance`). Un valor de enum no se borra en una migración de ida, así que propongo:
- una restricción `check (type not in ('reservation','release'))` con un comentario que lleve a la vista de reparto, para que nadie los estrene y lo apartado se reste dos veces;
- que las columnas `reserved` y `available` de `inventory_balances` y `filament_sku_stock`, que las pantallas ya leen, pasen a salir del reparto. Los nombres se quedan (`create or replace view` no los cambia) y por fin dicen la verdad.

**El plazo por defecto: 48 horas desde que la proforma se envía.**
- Es configurable en Configuración y se puede cambiar en cada documento; 0 significa "sin separo".
- La vigencia del **precio** sigue siendo de 15 días (`DEFAULT_VALIDITY_DAYS`, `cotizador.page.ts:57`). Son dos promesas distintas: el precio se puede sostener dos semanas, el estante no.
- 48 horas cubren el "ya, déjame ver y te aviso" de un chat de WhatsApp sin congelar el estante.
- Shopify obliga a ponerle vencimiento a toda reserva de un borrador ([draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)): nadie deja un separo abierto sin fecha.
- El pedido en espera usa el mismo plazo desde que se pone en espera.

**Qué aparta un separo y qué no:**
- **Aparta lo que existe:** armadas, piezas, insumos y gramos de filamento.
- **Tiene su lugar en la fila** para calcular las fechas de los demás. Mientras está vigente cuenta como un pedido, porque si se confirma va a necesitar su tiempo de impresora.
- **No hace imprimir nada.** La producción ve solo los pedidos cerrados (aclaración del dueño). En el plan de producción, los separos aparecen en gris, como "podría venir", sin botón.
- **Un borrador no separa:** todavía no se le ofreció a nadie. El separo empieza al "Enviar" (PDF o WhatsApp).
- **Aceptar dentro del plazo conserva el lugar:** el pedido hereda el `priority_at` de la proforma. Aceptar **vencido** entra al final de la fila, y el panel de aceptar lo dice: *"Tu separo venció el jue 18:00; desde entonces PED-0014 tomó 3 de las 4"*.
- **Un pedido en espera con el separo vencido** sigue en espera, pero no aparta nada. Al retomarlo entra al final de la fila.

#### El separo, pantalla por pantalla

**"¿Para cuándo?"** (cotizador, pedido nuevo y panel de aceptar). Es mi bloque de la ronda 1 con dos filas más:

```
Pediste 10
  [verde]  1 armada libre · se entrega hoy
  [gris]   3 armadas separadas para María Pérez hasta jue 8, 18:00   [Tomar igual]
           → si no confirma, se liberan el jue a las 18:00
  [ámbar]  9 por fabricar · 9 placas de botella + 1 de tapas · 6 h 50 min
  [rojo]   Falta: dulces surtidos 120 g
  [reloj]  Listo el vie 9 por la mañana (placas de 6:00 a 23:00, terminan antes de medianoche; incluye 10 % de fallos)
           Si esperas al separo de María: listo el jue 8 por la noche
```

La línea "si esperas" es la que le sirve al vendedor: le deja ofrecer "el jueves en la noche, si me confirmas hoy".

**Proforma (la cotización en pantalla),** bajo el estado:

```
Separo: 4 Botellas de poción y 264 g de dulces · vence jue 8, 18:00 (en 26 h)
[Extender 24 h]  [Soltar ahora]
```

Cuando vence: *"El separo venció el jue 18:00. Lo que estaba apartado ya puede ser de otro; al aceptar se vuelve a calcular."*

**PDF que recibe el cliente.** Dos fechas, cada una con su promesa:

> Te separamos 4 unidades hasta el **jueves 8 a las 6:00 p. m.** Con el adelanto de S/ 42.50 (Yape al 9xx xxx xxx) tu pedido queda confirmado y no pierde su lugar.
> Precios válidos hasta el 21 de octubre. Entrega: 2 días desde que confirmes.

"Te lo separo" es como se vende por WhatsApp en Lima. Escrito así, el separo deja de ser una regla interna y se convierte en un argumento de venta. Sin separo (plazo 0), esa línea no se imprime.

**Pedido en espera:**

```
En espera desde mar 6 · aparta 6 armadas hasta jue 8, 18:00     [Soltar ahora]
→ después se liberan y, al retomarlo, el pedido entra al final de la fila
```

**Hoy** gana una tarea de venta:

```
Vence el separo de María Pérez (4 pociones) a las 18:00
[Escribirle por WhatsApp]  [Extender 24 h]  [Soltar]
```

El botón de WhatsApp es el enlace `wa.me` de mi H5. Es la única tarea de seguimiento comercial que tendría "Hoy", y no es inventada: el separo vence y alguien tiene que decidir.

**Tarjeta del trato:** una insignia "Separo hasta jue 18:00", junto a la marca de adelanto de mi H4.

### 3. ¿De dónde sale la foto de una pieza?

**De las dos fuentes, con este orden:** la foto que sube una persona; si no hay, la miniatura `Metadata/plate_N.png` del archivo laminado, guardada al importarlo; si tampoco hay, un icono por tipo (6, escala de fotos). Coincido con 2·H10, 4·H6 y 6·H1.4. Desde la venta agrego dos matices:

- **Una línea de catálogo muestra la foto del producto o de la variante, nunca la de la placa.** El cliente compra la botella armada con dulces, no la cama con nueve tapas. La miniatura de la placa sirve para reconocer un trabajo de impresión o una pieza, y es más pobre para vender. Por eso la foto subida gana cuando existe.
- **Una línea a medida solo tiene la miniatura de la placa,** así que esa va a la cotización, al pedido y al PDF. Al importar el archivo, el cotizador tiene que guardarla en `quote_lines.plates[].thumbnailPath`, como propone 2·H10.

**No lo verifiqué:** cómo se ve y cuánto pesa `plate_N.png` en un archivo real. En el repositorio solo hay los `.config` de prueba (`packages/slicer-files/test/fixtures`), no el `.3mf` entero.

### 4. ¿Dónde vive el "¿para cuándo?" y quién es su dueño?

**Se muestra en los cuatro lugares de venta, sale de una sola cuenta y la ven todos con el mismo componente:**

| Dónde | Qué dice |
|---|---|
| Cotizador | Por línea y para la cotización entera |
| Pedido nuevo | Por línea |
| Panel "El cliente aceptó" | Recalculado hoy, comparado con lo que dijo el día que se cotizó (mi H3) |
| Ficha del pedido | Su situación, calculada desde su lugar en la fila (2·H7) |

**Dónde no va:**
- **En la ficha del producto**, de donde ya salió el "plazo de entrega". Además, `producto-nuevo.ts:40` todavía lo pide (4·H8).
- **Como fecha absoluta en el PDF:** allí va el plazo relativo y el separo.

**Su dueño es el lado de producción.** La cuenta se arma con datos que conoce y mantiene producción: la cola, las placas, el horario, la tasa de fallos y lo que hay en el estante. Y la pantalla de la opción B lee exactamente lo mismo. Vive en una sola migración con las tres piezas que nombra 2: `order_allocation`, `production_plan` y `capable_to_promise`, con sus pruebas en `pnpm test`.

**Ventas solo la consume,** a través de un servicio y un componente (`pp-promesa`), y nunca la recalcula en el navegador. Es la misma regla que para el dinero: una sola fuente, como `core/pricing.ts`.

**El horario es un dato del taller, no una constante,** porque el dueño ya avisó que va a cambiar: hora mínima de inicio, hora máxima de inicio y hora límite de fin.

### 5. ¿La compra crea su egreso sola, o se liga desde Caja?

**La crea sola, en la misma función, y "lo pago después" es una opción del mismo campo.**

- **El campo "Pagado con"** tiene cinco botones: *Efectivo · Yape · Plin · Banco · Lo pago después*. Viene preseleccionada la última cuenta usada (3·H3). `register_purchase` escribe el egreso con `purchase_id` en la misma transacción.
- **"Lo pago después" no crea nada nuevo: deja la compra con saldo.** Lo que se debe se deriva igual que el cobro de un pedido (ADR-014, regla 4): total de la compra menos los egresos ligados a ella. Hace falta el total, que hoy no existe como columna (`\d purchases`): se deriva de las líneas, el envío y otros costos.
- **Pagarla después se hace de dos maneras:**
  - con un botón "Pagar" en la compra, que es la otra mitad de `record_payment`;
  - desde Caja, eligiendo la compra en un selector que solo muestra las que tienen saldo.

  Los pagos parciales valen. La compra a crédito es el mismo caso.
- **Un "Por pagar" junto a "Por cobrar"**, con el mismo diseño. Para un taller que paga en el mostrador casi siempre va a estar vacío, y eso está bien.

**Lo que nadie dijo: esto no se puede hacer antes de arreglar el costo de ventas.**
- **Hoy los insumos solo llegan a Resultados por accidente.** El costo de ventas usa el costo real **si es mayor que cero**, y si no, el estimado (`20261004130000_finance.sql:431`). El costo real solo suma filamento, luz y máquina de las impresiones ligadas al pedido (`:404-414`). Los dulces y las bolsas nunca entran.
- **El caso de la prueba:** una venta de S/ 85 quedó con S/ 2.70 de costo en lugar del estimado de S/ 52.30 (1, punto 6 de "Lo que creí que pasó").
- **Lo que lo compensa sin querer:** el egreso suelto de la compra, que hoy cuenta como gasto operativo (3·H3).
- **Ligar la compra sin arreglar lo otro empeora Resultados.** La compra pasa a "compras de inventario" (`:441-442`), que no resta de la utilidad (`:458` solo resta los gastos operativos), y entonces los dulces y las bolsas desaparecen del estado de resultados.
- **Por eso las dos cosas salen juntas:** la compra con su egreso, y el costo de ventas igual al valor de lo que salió del estante para ese pedido (`deliver_order`, 2·H6, valorizado como pide 3·H5) más las impresiones de sus líneas a medida.

### Otras contradicciones que encontré

- **¿El pedido nuevo admite líneas a medida?** Yo dije que sí (H1); 2·H1 dice que solo el catálogo. Me paso a la posición de 2 (ver "Lo que cambio").
- **¿Cuál es el botón principal del pedido?** 6·H5 contra 2·H7 y yo: ver "En desacuerdo", punto 1.
- **¿Rango o fecha?** 4·H8 contra 2·H3: ver "En desacuerdo", punto 3.
- **¿Qué pasa con lo apartado de un pedido en espera?** 2 (pregunta 3) y 3 (pregunta 1) recomendaban que lo conserve sin plazo. El dueño lo resolvió: lo conserva con plazo y después lo suelta.
- **¿Cómo se valoriza lo que se consume?** 3·H5 propone el promedio ponderado y mi costo de ventas lo necesita. No es una contradicción, pero las dos cosas tienen que salir con el mismo criterio.

## Lo que cambio de mi informe

- **Retiro (H3):** *"Una cotización no compromete nada, igual que un borrador de Shopify sin Reserve items."* El dueño decidió que la proforma enviada aparta por un plazo corto. El diseño está en la contradicción 2.
- **Corrijo (H3):** *"Lo comprometido sale de los pedidos abiertos … por orden de fecha de entrega."* Pasa a orden de confirmación, con un "Pasar adelante" o un "Tomar igual" que muestra el aviso. Es la decisión del dueño, y además el argumento de la contradicción 1 muestra que la fecha de entrega no puede ser la clave del reparto si no es también la de la cola.
- **Corrijo (H3 y pregunta 3):** las *"5.5 h de impresión al día"* salen de la cuenta y la pregunta 3 queda contestada. La fecha se calcula con el horario del dueño (inicio de 6:00 a 23:00, fin antes de medianoche, configurable).
- **Retiro (H1):** *"«Nuevo pedido» usa el mismo panel … Admite líneas a medida."* Me quedo con lo de 2·H1:
  - una pieza a medida necesita sus placas, y solo el cotizador lee el `.gcode.3mf`;
  - como mi H1 permite aceptar desde el borrador en un paso, la venta a medida en el momento es cotizar y aceptar en la misma sentada;
  - el pedido nuevo queda para el catálogo, con un enlace "¿Es a medida? Cotízala".
- **Corrijo (H3, evidencia):** *"hoy: 41 comprometidas, 10 armadas, 31 faltan"*. Las 10 armadas eran las del pedido ORD-2026-0001 de la prueba, ya entregado y no descontado (2·H4, 3·H1), así que faltaban 41. Es el tercer corte, no un dato del estante.
- **Agrego un hallazgo nuevo, H11. "Vendí S/ 85 y el sistema dice que me costó S/ 2.70".** Es del costo de ventas de Resultados.
  - **Qué pasa:**
    - Basta con que exista **una** impresión ligada al pedido para que su costo real reemplace **todo** el estimado (`finance.sql:431`).
    - Ese costo real nunca incluye insumos, empaque, piezas sacadas del estante ni mano de obra (`:404-414`).
    - El estimado sí incluye la mano de obra, que es un costo asignado. Así, dos pedidos iguales tienen costos de distinta naturaleza según se haya ligado o no una impresión.
    - Con la opción B, los trabajos de catálogo ya no se ligan a un pedido (2 y 4), y todo el catálogo caería al estimado congelado.
  - **Propuesta:** el costo de ventas de un pedido es el valor de lo que salió del estante al entregarlo (`deliver_order`), más las impresiones de sus líneas a medida. La venta y su costo se cuentan en el mismo mes: el de la entrega (es la pregunta 2 de abajo).
  - **Gravedad:** bloquea, porque la utilidad del mes sale inflada sin que nadie lo vea.
  - **Tamaño:** M, y va con 2·H6.
- **Agrego a H4 (cancelar con dinero) una tercera salida: pasar el adelanto a otro pedido del mismo cliente.**
  - Es lo que pasa cuando "mejor cámbiamelo por la venenosa".
  - El esquema ya lo prevé: el disparador refresca los dos pedidos cuando un cobro cambia de pedido (`finance.sql:231`, *"a payment moved from one order to another leaves two orders to put right"*).
  - Para que quede rastro, se hace como "anular con motivo y registrar el mismo monto en el otro pedido", en una sola función, no con un `update` del `order_id`.
- **Agrego a H4 la categoría de los cobros.** Los cobros hechos desde el pedido quedan con categoría vacía. `PedidosData.recordPayment` no manda `p_category_id` (`pedidos.data.ts:267-278`); `finanzas.data.ts:365` sí lo hace. En Caja aparecen con "—" en vez de "Venta de productos" (1·T7). `record_payment` debería usar la categoría de ventas cuando no le pasan ninguna. Tamaño S.
- **Agrego a H6:** el selector "Mover a" de las tarjetas (6·H9). Tamaño S.
- **Ajusto H9:** las fotos de las líneas van a 64 px, no a 40.
- **Ajusto H5:** "Por cobrar" se queda en *confunde*, pero sube de orden de trabajo, porque 1·T7 mostró que la pregunta "¿cuánto me deben?" hoy se contesta sumando a mano.
- **No cambio la gravedad de los demás.**

## Si solo se pudieran hacer cinco cosas

1. **Que el estante y el costo digan la verdad.**
   - **Qué es:** `complete_print_job` recibe las unidades buenas (2·H2 y 4·H1; tamaño S). `deliver_order`, con entrega parcial, descuenta lo entregado (2·H6; tamaño M). El costo de ventas pasa a ser el valor de lo que salió del estante (mi H11).
   - **Qué destraba:** "¿cuántas tengo de verdad?" y "¿cuánto gané este mes?".
   - **Por qué primero:** todo lo demás se calcula encima de estas cifras. Hoy el estante ofrecía a otros cuatro pedidos 10 pociones ya entregadas (`production_needs`: 41 · 10 · 31). Una promesa calculada sobre eso promete fantasmas.
2. **"El cliente aceptó" en un solo paso** (mi H1 y 2·H1).
   - **Qué es:** se puede aceptar desde el borrador. Se copian las líneas, también las a medida, con su `quote_line_id`, y con el precio y el costo congelados. El adelanto se cobra en el mismo panel, y el pedido queda ligado al trato y al canal. Además, el cotizador cobra el catálogo con su escalera de precios (mi H2).
   - **Qué destraba:** cerrar una venta sin reescribirla (17 entradas pasan a unas 8) y que una pieza a medida pueda llegar a producción (4·H11).
   - **Por qué antes que la tercera:** el reparto necesita pedidos que traigan sus placas y el momento en que se confirmaron. Y es la fricción más repetida del día.
3. **Una sola cuenta con prioridad y separo.**
   - **Qué es:** `order_allocation`, `production_plan` y `capable_to_promise`, más `priority_at`, `hold_until` y el horario del taller. Ventas la lee como "¿Para cuándo?" en sus cuatro pantallas y producción como "Por lanzar" (opción B). Lleva el aviso "María Pérez hizo un separo antes".
   - **Qué destraba:** la idea no negociable del dueño (el plazo sale del stock y de la cola) y que dos ventas no prometan el mismo rollo rojo.
   - **Por qué en tercer lugar:** es la más grande (L), y sin las dos anteriores calcularía sobre un estante falso y sobre pedidos sin placas.
4. **Que la plata cuadre.**
   - **Qué es:**
     - la compra con "Pagado con" o "Lo pago después", y un "Por pagar" derivado;
     - cancelar con dinero, con tres salidas: devolver, retener o pasar a otro pedido;
     - la lista de cobros dentro del pedido, con el adelanto separado del saldo;
     - "Por cobrar" con todo lo abierto y el recordatorio por WhatsApp.
   - **Qué destraba:** "¿cuánto entró hoy, cuánto me deben, cuánto debo?", que 1·T7 respondió con tres pantallas y una suma a mano.
   - **Por qué después de la primera:** ligar las compras sin el costo de ventas nuevo hace desaparecer los insumos de Resultados (contradicción 5).
5. **Lo que ve el cliente, y la foto en la venta.**
   - **Qué es:** un PDF con el plazo relativo, el separo, el adelanto y cómo pagar. Un botón "Enviar por WhatsApp" (`navigator.share`, o `wa.me` como respaldo) que de paso marca la cotización como enviada y empieza el separo. `pp-item` a 64 px en todas las líneas de venta, y la miniatura de la placa para lo hecho a medida (mis H8 y H9, 6·H1).
   - **Qué destraba:** mandar la proforma desde el teléfono sin que el cliente pregunte dos veces, y cumplir la regla de la foto donde se vende.
   - **Por qué al final:** lo que el PDF promete (plazo y separo) sale de la tercera. Sin ella, el PDF volvería a prometer a ciegas.
