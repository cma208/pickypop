# Producción — ronda 2

> Leí los cinco informes de la ronda 1 enteros, la aclaración del dueño en `00-encargo.md` y sus tres respuestas en `ronda-2/00-encargo-ronda-2.md`. Las consultas nuevas son de solo lectura sobre `supabase_db_pickypop`. Las dos simulaciones de la cola son un script de 40 líneas sobre los datos locales: no tocan la base.

## De acuerdo

- **1·T3 y 1·T4 confirman en pantalla lo que yo vi en el código.**
  - "Diez botellas son diez formularios", y "la placa vuelve a «Sin placa (a mano)» cada vez" (4·H3).
  - Los tres trabajos del pedido se llamaban igual, "Botella de poción — Con dulces surtidos" (4·H6).
  - Pudo iniciar las tapas con otro trabajo "Imprimiendo" en la misma A1 mini (4·H6).
  - Al cerrar solo se habla de gramos, nunca de "entran 9 tapas" (4·H5).
  - Y **cerró dos trabajos sin pulsar Iniciar**. Lo que ahí se pierde, `started_at`, es justo el dato que necesita el plazo (ver "Lo que cambio", punto 4).
- **2·H2 y 3·H6:** además de las unidades, el mismo arreglo de `complete_print_job` tiene que registrar las piezas como `production` y no como `purchase` (`20261008110000_parts_and_assembly.sql:226`). Me faltó en 4·H1: lo sumo.
- **2·H5, la opción B y "Lo que no hay que copiar":** coincidimos en lo esencial.
  - El plan se calcula en la base.
  - Los trabajos de catálogo van **sin pedido**, y la tarjeta deduce a quién cubren.
  - Lo hecho a medida va atado a su línea, con las placas de `quote_lines.plates`.
  - No se hace una orden de fabricación por pedido, porque una placa de 9 tapas sirve a varios.
  - Tomo de 2 dos cosas que yo no tenía: la fila **"Armados que ya alcanzan" → Armar con variante y cantidad puestas** (2·H9), y las **dos definiciones de "receta vigente"**: `assemble_product` toma la última versión sin mirar `active` y producción filtra por `active = true`. La explosión del plan tiene que usar una sola.
- **2·H11, la pieza suelta como *kit*:** desde producción es la mejor opción, porque `complete_print_job` y la cola **no cambian**: la placa sigue produciendo una pieza. La alternativa de dejar que una placa produzca un `finished_good` parte el estante cuando la tapa también es componente de otra cosa, como argumenta 2.
- **3·H12 (el AMS como ubicación) y 3·H13 (los repuestos no bajan):** son mis 4·H4 y 4·H9 vistos desde el inventario. 3·H12 añade un dato que refuerza mi H4: SimplyPrint asigna un rollo a cada ranura y avisa antes de imprimir si no alcanza ([SimplyPrint, asignar rollos](https://help.simplyprint.io/en/article/assigning-filament-spools-to-printers-1r66t1p/)).
- **3·H7, "Agotado" no pone el rollo en cero:** `filament_sku_stock` cuenta un rollo "Agotado" con gramos teóricos, mientras que el formulario de trabajo solo ofrece `sealed, open, in_use` (`produccion.data.ts:13`). El "alcanza el filamento" de la venta, el de *Por lanzar* y el del formulario tienen que leer el mismo conjunto de rollos, o los tres van a dar respuestas distintas.
- **3·H8, una acción en cada fila que falta de Armar** ("→ Imprimir 5 placas de Tapas"): es mi 4·H7 desde el otro lado. Lo construiría una sola vez, como enlace a la fila de *Por lanzar* de esa pieza.
- **5·H3, pregunta 3:** las "horas de impresión por día" eran el número débil del plazo. El dueño ya respondió con un horario, y eso cambia mi fórmula (ver contradicción 4).
- **6·H1, 6·H7 y 6·H4:**
  - Foto de la placa en la tarjeta de trabajo.
  - Historial como **tabla densa con fecha**: la tarjeta no dice cuándo se imprimió, y tiene razón.
  - La Cola usa `with-thumb`, `hide-small` y `table-wrap` sin importarlos, y por eso su tabla se sale de la tarjeta en el celular. Lo sumo a 4·H6.

## En desacuerdo

1. **2·H5 propone sugerir el rollo "del mismo color, el que más tiene, como ya hace `suggestSpool`".** Esa regla es el defecto de 4·H4, no la solución.
   - `suggestSpool` ordena por gramos y se queda con el primero (`print-job-form.ts:296-301`), y `spools()` incluye los sellados (`produccion.data.ts:13,312-335`).
   - Con un segundo rollo negro comprado, propondrá el sellado de 1 kg del estante en vez del abierto que está en la ranura 3.
   - Al cerrar, se descuenta del rollo equivocado, y los dos saldos quedan mal sin que nadie lo vea.
   - **El orden correcto:** el rollo que está en la ranura, luego un abierto, luego un sellado (3·H12 llega a lo mismo).
2. **2, "Poner en cola… al final, o antes de un trabajo".** Al final no: por defecto, las corridas entran en la posición que les da la **prioridad del pedido** que cubren. Si no, un pedido confirmado antes queda detrás de uno nuevo solo porque su placa se encoló después.
3. **2, caso "Dos pedidos que compiten": "si B vence antes que A, el plan imprime primero lo de B".** Con un reparto por prioridad, imprimir antes las tapas de B no se las da a B: en cuanto entran al estante, el reparto se las asigna a A, que va primero. Lo que ayuda a B es **cambiar la prioridad de B**, la acción con aviso que pidió el dueño. Reordenar la cola mueve fechas, no dueños (contradicción 1).
4. **3 ("la fecha de entrega ordena sola"; pregunta 2: "que gane el que vence antes") y 5·H3 ("por orden de fecha de entrega").** Lo decidió el dueño en contra, y desde producción hay una razón más: **con el reparto por fecha, una venta nueva con entrega más cercana le quita en silencio el estante a un cliente que ya tenía fecha prometida.** Nadie elige atrasarlo, y el sistema lo hace. Con el reparto por confirmación, eso solo pasa si alguien pulsa "dar prioridad" y lee el aviso.
5. **3·H1 y 5·H3: "una cotización no compromete nada".** El dueño respondió lo contrario: una proforma **separa por un plazo corto**. Desde producción importa por una cosa: un separo de proforma retiene stock que ya existe, así que los pedidos confirmados después ven menos libre, y *Por lanzar* propone corridas por ellos. Esas filas tienen que decir que existen por un separo que vence (ver contradicción 2).
6. **Mi propio 4·H2, punto 4: "por fecha de entrega, como en Katana".** Me equivoqué dos veces.
   - El dueño decidió otra cosa.
   - Y la cita era mala: en Katana la prioridad es **la posición del pedido en una lista que se arrastra**, y "los pedidos de mayor prioridad reservan antes" ([Katana, prioridades de pedidos de venta](https://support.katanamrp.com/en/articles/5914297-managing-sales-order-priority); [Katana, entender las prioridades](https://support.katanamrp.com/en/articles/5913596-understanding-order-priorities)). Busqué en esos dos artículos y en el de las fabricaciones cuál es el orden por defecto, y ninguno lo dice.
   - Lo que sí documenta Katana es el modelo que eligió el dueño: un orden propuesto que una persona cambia a mano, con el reparto recalculado al instante.

## Las contradicciones

### 1. ¿A quién le toca primero? — decidido: confirmación primero, cambiable con aviso

Cómo lo bajo a producción, para que ventas y producción den lo mismo:

- **Dos órdenes distintos, con dos papeles.**
  - **La prioridad decide de quién es** cada unidad del estante, cada pieza y cada corrida que termina. La leen igual el reparto, *Por lanzar*, la ficha del pedido y la cuenta de "¿para cuándo?".
  - **La posición en la cola decide cuándo se imprime.** Por defecto sigue a la prioridad. La persona la puede cambiar por razones de taller, por ejemplo juntar las 4 placas de tapas, que solo usan negro, para no cambiar el AMS dos veces. Eso **mueve fechas y no dueños**, y la pantalla dice qué fecha movió: "así, PED-0005 pasa a salir el viernes".
- **No existe una hora de confirmación que sirva:**

  ```sql
  select number, ordered_on, created_at at time zone 'America/Lima' from orders order by created_at;
  -- los 10 pedidos locales: created_at = 2026-10-06 08:07:50.900093 (todos iguales: los sembró una sola sentencia)
  ```

  `ordered_on` es solo una fecha, así que empata dentro del día, y además nace en UTC (5·H10). **Hace falta `orders.priority_at timestamptz`** escrita una sola vez:
  - si el pedido viene de una proforma con separo vigente, la hora de ese separo (es el "María Pérez separó antes");
  - si no, `created_at`;
  - si empatan, se desempata por número.
  "Dar prioridad a PED-0005" mueve `priority_at` justo delante del otro y deja rastro de quién, cuándo y qué aviso vio, igual que `order_status_history`.
- **Un pedido en espera** conserva su `priority_at` mientras su separo esté vigente. Si el separo venció, lo suyo ya pasó a los demás, y al retomarlo entra a la fila con la hora de hoy. Es la consecuencia directa de la respuesta 2 del dueño.
- ***Por lanzar*, ajustado:** las filas se ordenan por la prioridad del primer pedido que cubren, y cada fila dice a quién cubre **en ese orden**. Si con la cola actual alguno llega tarde, se ve ahí mismo:

  > **Botella impresa** — faltan 32 · 32 corridas × 43 min · ● rosado 182 g ● negro 148 g ● rojo 33 g · alcanza
  > Cubre, en este orden: PED-0003 (venció el lun 5) · PED-0004 (vence hoy) · PED-0005 · PED-0006
  > **[Poner en cola]**
  >
  > ⚠ PED-0005 vence el jue 8 y con este orden sale el vie 9 → **[Dar prioridad a PED-0005]** → *"Ana Quispe (PED-0003) separó antes. ¿Pasar PED-0005 adelante?"*

  Con los datos locales y la cola simulada en el horario del dueño, el orden de confirmación no atrasa a nadie que no esté atrasado ya:

  | Pedido | Vence | Piezas listas |
  |---|---|---|
  | PED-0003 | lun 5 | mar 6, 17:44 |
  | PED-0004 | mar 6 | mar 6, 22:42 |
  | PED-0005 | jue 8 | mié 7, 10:18 |
  | PED-0006 | dom 11 | jue 8, 12:12 |

  La simulación supone 36 corridas (32 de botella y 4 de tapas), 10 minutos entre placas, real/estimado de 1.016 (el promedio local) y la cola empezando el martes 6 a las 16:30. El aviso sale en cuanto la cola crece o un pedido nuevo vence antes de lo que su lugar en la fila le permite.
- **Lo que no cambia:** cuántas corridas hay que lanzar. El total no depende de la prioridad, solo de cuánto falta. La prioridad cambia las fechas, el orden propuesto y el "cubre a…".

### 2. ¿Se escribe la reserva o se calcula? — se escribe la decisión, se calculan las cantidades

Con el vencimiento adentro, la respuesta deja de ser "todo derivado" (2·H4, 3·H1, 5·H3):

- **Se escribe:** que existe un separo, de quién, desde cuándo y hasta cuándo. Eso es una decisión de una persona, y no se puede deducir de los pedidos: el plazo, el "acortar a cero" y el "dar prioridad" son hechos. Bastan tres columnas:
  - `quotes.held_until`, para la proforma que separa;
  - `orders.held_until`, para el pedido en espera;
  - `orders.priority_at`.

  "Soltar ahora" es `held_until = now()`.
- **Se calcula:** cuántas botellas, tapas, gramos de cada color y dulces quedan apartados. El reparto lee `held_until > now()` en cada consulta: **un separo vencido se libera solo, sin que nadie escriba un `release`**. Esa es la ventaja de lo derivado que defendían 2, 3 y 5, y se conserva.
- **`reservation` y `release` en `stock_movements` se quedan quietos.** Hay tres razones:
  - un movimiento apunta a un rollo **o** a un artículo (3·H1, `stock_movements_one_target`), y una venta aparta gramos de un color, no un carrete;
  - liberarlo a tiempo exigiría algo que escriba el `release` cuando vence, y la aplicación no tiene ningún proceso programado;
  - un valor de `enum` no se borra sin reescribir el tipo, y las migraciones son de ida.

  Hay que dejarlos documentados en `docs/03-modelo-de-datos.md` como no usados, y por qué.
- **Plazo por defecto: 48 horas**, configurable por taller y editable en cada separo. Es más corto que la vigencia de la cotización, que en la prueba de 1·T6 fue de 15 días, y cubre un fin de semana de WhatsApp: separado el viernes en la noche, vence el domingo en la noche.
- **En producción:** el plan **no** propone imprimir para una proforma. La demanda son los pedidos confirmados, como dice la aclaración del dueño. Pero el separo de una proforma con prioridad retiene estante, y las corridas que eso genera para los pedidos de atrás se marcan: *"4 de estas corridas son por el separo de María Pérez (COT-…, vence mié 7 18:00)"*. Así el taller decide si espera.

### 3. ¿De dónde sale la foto de una pieza? — de las dos, con un orden fijo

| Qué | De dónde | Por qué |
|---|---|---|
| **Placa** (`recipe_plates.thumbnail_path`) | Siempre de `Metadata/plate_N.png`, al importar | Es exactamente lo que sale de la máquina, **en los colores del proyecto**: la placa de la poción de amor es rosada y la de la venenosa es verde. Nadie tiene que tomarla |
| **Trabajo** (cola, historial, *Por lanzar*) | La miniatura de su placa. Si no tiene, la foto de la pieza. Si no tiene, un icono | Responde "¿qué hay en la cama?" |
| **Pieza** (`inventory_items.image_path`) | La sube una persona. Si no tiene, **se copia la miniatura de la placa al ligarla** (en `placa-editor.ts`, cuando se elige "Pieza que produce") | Lo de "foto inicial" de 6·H1 y de su pregunta 2. Copiar la ruta es mejor que deducirla en cada vista: `part_stock`, `assembly_components` y el selector ya leen `image_path`, y no hay que tocarlos. Nunca pisa una foto puesta por una persona |
| **Producto y variante** | Siempre la sube una persona | La placa no muestra el frasco termoformado, los dulces ni la bolsa: eso es lo que se vende |
| **Línea a medida** | La miniatura en `quote_lines.plates[].thumbnailPath` | 2·H10 y 5·H9 |

Cuatro cuidados antes de construirlo:

1. **Hoy no se puede ligar a mano.** Importar no liga la pieza: `importPlates` inserta `produces_item_id: null` (`catalogo.data.ts:419`). Además Piezas no deja editar la foto (6·H1, 3·H9), y hay que agregarlo para poder reemplazar la miniatura.
2. **El lector de ZIP no lee binarios.** `core/zip.ts` solo expone `readEntryAsText` y `readTextEntry`, así que falta leer una entrada como bytes. Tamaño M, como dije en 4·H6.
3. **Solo verifiqué `plate_N.png`.** Lo nombran `docs/01-investigacion.md:43` y Printago ([formato 3MF](https://printago.io/blog/3mf-file-format)). Los otros nombres (`plate_no_light_N`, `top_N`, `pick_N`) cambian entre fuentes, y Printago avisa que **un archivo laminado sin interfaz trae miniaturas en blanco**. Las del dueño salen de Bambu Studio con interfaz, pero conviene descartar una imagen vacía. **No hay un `.gcode.3mf` real en el repositorio** (solo los `.config` de `packages/slicer-files/test/fixtures/`), así que el tamaño y el encuadre hay que verlos con un archivo del dueño. Se achica con `shrink()` a los 256 px de 6·H3.
4. **En una placa de nueve tapas, la miniatura muestra nueve tapas.** Para el trabajo es lo justo. Para la pieza es pasable, porque se reconoce el color y la forma, y es mejor que una "T". Se ve entera (`contain`, 6·H2), nunca recortada.

### 4. ¿Dónde vive el "¿para cuándo?"? — una sola función en la base, cuatro lugares que la muestran

- **Una función** (`promise_for(lines)`, que 2 llama `capable_to_promise` y 5 llama `app.promise_for`). Usa el mismo reparto por prioridad y la **misma simulación de la cola** que *Por lanzar*. Una línea hipotética entra al final de la fila, con la prioridad de ahora.
- **Se muestra en cuatro lugares:**
  - la línea del Cotizador;
  - la línea del Nuevo pedido;
  - el panel "El cliente aceptó", recalculada;
  - la ficha del pedido, como estimada frente a prometida.

  Además, Hoy avisa "va a llegar tarde". En el PDF va relativa ("2 días desde que confirmes"), como propone 5·H3.
- **El dueño de la función es producción, y la venta es dueña de cómo se muestra.** Casi todo lo que la mueve es de producción:
  - el horario de impresión;
  - la cola y su orden;
  - los minutos entre placas;
  - real contra estimado;
  - la tasa de falla;
  - el armado.

  Si la mantiene quien no toca la cola, se desincroniza en el primer cambio.
- **La fecha, con el horario del dueño:** recorrer la cola en orden, empezar cada placa en el primer momento que cumpla las dos condiciones (empieza entre 6:00 y 23:00 **y** termina antes de las 24:00) y, si no cabe, pasarla a las 6:00 del día siguiente. Cada corrida dura el estimado × real/estimado, y entre placa y placa se suman los **minutos entre placas**.
  - El horario se guarda por taller (de momento hay una sola impresora), con tres valores: empieza desde, empieza hasta y termina antes de. Se edita en Configuración.
  - Comprobé el ejemplo del dueño con la simulación: una placa de 3 h pedida a las 20:55 empieza a las 20:55, y pedida a las 21:30 empieza el miércoles a las 6:00.
- **El dato que más mueve la fecha no es el horario, son los minutos entre placas.** Con las mismas 36 corridas, desde el martes 6 a las 16:30:
  - con 10 minutos entre placas, todo termina el **jueves 8 a las 12:05** (19 corridas el miércoles);
  - con 30 minutos, el **viernes 9 a las 6:43**;
  - con mi fórmula de la ronda 1 (5.5 h por día de promedio), **unos 5 días**: hacia el domingo.

  Esos minutos se miden, no se preguntan: `started_at` de una placa menos `finished_at` de la anterior, el mismo día. Mientras no haya historia, 15 minutos editables. Y eso solo funciona si se pulsa Iniciar al empezar y se cierra al terminar, y 1·T4 cerró sin iniciar. Por eso el cierre de un toque y la hora de inicio pasan a ser condición del plazo (ver "Lo que cambio", punto 4).
- **Al pulsar Iniciar, avisar sin bloquear:** "Esta placa de 3 h terminaría a las 00:40: el horario del taller dice empezarla antes de las 21:00".

### 5. ¿La compra crea su egreso sola, o se liga desde Caja? — sola, con "Pagado con", y lo mismo para el mantenimiento

No es mi mirada, pero toca una pantalla mía.

- Coincido con 3·H3: `register_purchase` escribe el egreso con `purchase_id` en la misma transacción.
- Añadiría una opción **"Todavía no (lo pago después)"** al campo "Pagado con". La compra queda entonces "por pagar", sin columna nueva, deducida de que no tenga egreso. El formulario de Caja ofrece "pago de una compra pendiente" y escribe el `purchase_id`.
- **El registro de mantenimiento tiene el mismo hueco** (4·H9.3, 3·H13): pide "Costo (S/)" a mano y no escribe ni el egreso con `maintenance_log_id` ni el movimiento del repuesto. Tiene que seguir **la misma regla** que la compra, para que haya una sola forma de "gastar" en la aplicación.

### Otras contradicciones que encontré

- **Cómo se proyecta la capacidad:** 5·H3 divide entre 5.5 h por día, 2 usa una ventana de 8:00 a 22:00, y yo usé un promedio. La ventana del dueño (6:00–23:00, terminando antes de medianoche) manda. Las horas por día quedan como **métrica** de cuánto se aprovecha esa ventana, no como divisor.
- **La foto, ¿copiada o deducida?** 6·H1 la ofrece como foto de la pieza, y en mi ronda 1 la deducía en cada lectura. Elijo copiarla al ligar la placa, por lo que explico en la contradicción 3.
- **¿Imprimir para la proforma?** La aclaración dice que producción ve "pedidos cerrados" y la respuesta 2 dice que la proforma separa. Las dos se cumplen si el separo retiene lo que ya hay pero **no** genera corridas propias.

## Lo que cambio de mi informe

1. **Retiro 4·H2.4** (pedido de cada trabajo "por fecha de entrega, como Katana") y la cita de Katana tal como estaba. Queda: la prioridad por hora de separo o de confirmación (`orders.priority_at`) decide de quién es cada unidad, y se cambia a mano con el aviso "X separó antes". *Por lanzar* se ordena y se etiqueta por esa prioridad, y marca a quien va a llegar tarde.
2. **4·H3:** `queue_position` sigue de entrada la prioridad, **no** la fecha de entrega. Se reordena libremente por razones de taller, y la pantalla dice qué fecha cambió.
3. **4·H8, la fórmula del plazo:**
   - **Sale:** "÷ horas impresas por día".
   - **Entra:** la simulación de la cola en el horario configurable del dueño, con los minutos entre placas medidos, real contra estimado y las reimpresiones por la tasa de falla.
   - Agrego el aviso al Iniciar una placa que terminaría pasada la medianoche.
   - Hace falta guardar el horario por taller: es dato de la base, no un archivo de configuración.
   - La gravedad sigue siendo "bloquea".
4. **4·H5 sube de "confunde" a "bloquea".**
   - El plazo creíble depende de `started_at` y `finished_at` reales, y hoy se puede cerrar sin iniciar (1·T4).
   - Agrego al RPC de 4·H1 un `p_started_at`: si el trabajo nunca se inició, el cierre pregunta "¿a qué hora empezó?", y propone ahora menos el estimado.
   - El cierre de un toque y **[Salió bien e iniciar la siguiente]** dejan de ser comodidad: son los que miden los minutos entre placas.
5. **4·H1:** el mismo arreglo registra `production` en vez de `purchase` (2·H2, 3·H6) y recibe la hora de inicio. Sigue siendo S.
6. **4·H6, la foto:**
   - La pieza copia la miniatura de la placa al ligarla, sin pisar nunca una foto humana.
   - Piezas deja editar la foto.
   - Hay que leer el PNG del ZIP como bytes.
   - Sumo los estilos de la Cola que no se importan (6·H4) y el Historial como tabla con fecha (6·H7).
7. **4·H2 suma tres cosas:**
   - las filas que existen por un separo de proforma, con su vencimiento;
   - la fila "armados que ya alcanzan" de 2;
   - una sola definición de receta vigente.
8. **4·H10, Métricas:** agrego **minutos entre placas** y **aprovechamiento del horario** (horas impresas ÷ horas de la ventana). El primero es el número que más mueve la fecha prometida.
9. **Preguntas al dueño:**
   - La 1 (¿bolsa común o pedido escrito en cada placa?) queda respondida: bolsa común repartida por prioridad.
   - La 3 (¿se registran todas las impresiones?) sube de importancia, porque sin eso los minutos entre placas salen falsos.
   - La 2 (¿piezas distintas en una misma cama?) y la 4 (¿el rollo se fija al planificar o al iniciar?) siguen abiertas.

## Si solo se pudieran hacer cinco cosas

1. **Cerrar bien una impresión** (`complete_print_job` recibe unidades, porcentaje, nota y hora de inicio, y registra `production`; la tarjeta muestra "+9 Tapa impresa").
   - **Destraba:** saber cuántas piezas hay de verdad. Sin esto, el reparto, *Por lanzar*, Armar y la fecha calculan sobre un estante que miente cada vez que una placa sale con menos piezas.
   - **Va primero porque:** es S y todo lo demás lo lee.
2. **La cuenta única en la base: prioridad, separo y reparto, hasta llegar a corridas por placa.**
   - **Qué incluye:** `orders.priority_at`, `held_until` en cotizaciones y pedidos, y un reparto por prioridad del estante, las piezas y la cola que llega hasta corridas por placa (`production_plan`).
   - **Destraba:** a la vez el "¿cuántas tengo libres?" del vendedor y el "¿qué imprimo?" del taller, con el mismo número.
   - **Va antes que la 3 porque:** *Por lanzar* sin esta cuenta sería otra tabla que "pide de más", como la de hoy.
3. ***Por lanzar* y la cola ordenada.**
   - **Qué incluye:** la propuesta por pieza con foto, a quién cubre y quién llega tarde; "Poner en cola" crea N corridas en su lugar por prioridad, con los rollos propuestos desde la ranura del AMS; la cola tiene orden (`queue_position`), se puede editar o quitar un planificado y hay "Volver a ponerla en cola".
   - **Destraba:** la tarea de cada mañana: de 36 formularios a un toque por pieza.
   - **Va antes que la 4 porque:** la fecha necesita una cola ordenada para simularla.
4. **La fecha.**
   - **Qué incluye:** el horario del taller en la base, la simulación de la cola con minutos entre placas, real contra estimado y fallas, y `promise_for` compartida con la venta; el aviso de "va a llegar tarde" en *Por lanzar*, en el pedido y en Hoy; y el aviso al Iniciar fuera de horario.
   - **Destraba:** la idea no negociable del dueño, que el plazo salga del stock y de la cola, y la decisión del vendedor entre proforma y venta.
   - **Va después de la 3** porque la simula, y **antes que la 5** porque la 5 solo la afina.
5. **La tarjeta de la cola: foto de la placa y cierre de un toque.**
   - **Qué incluye:** la miniatura de `plate_N.png` en placa, trabajo y pieza; [Salió bien: 9 tapas] · [Falló al __ %] con gramos proporcionales · [Salió bien e iniciar la siguiente]; y no dejar dos placas imprimiendo a la vez en la A1 mini.
   - **Destraba:** reconocer la placa sin leer, que es la queja que el dueño repitió, y cerrar en segundos.
   - **Es la última** porque, de las cinco, es la única que nada de lo anterior necesita para funcionar. Aun así es la que vuelve creíble la fecha de la 4 con los días, porque registra los minutos entre placas que esa fecha usa.
