# Producción — ronda 1

> Mirada: la cola de impresión, el historial, los trabajos, las placas de las recetas, la importación del `.gcode.3mf`, las impresoras y su mantenimiento. Todo lo de abajo sale del código y de la base local (`supabase_db_pickypop`), sin navegador. Los datos locales son de la semilla: sirven para ver la forma, no para sacar promedios del taller.

## En cinco líneas

1. **Si una placa sale con 7 tapas de 9, al estante entran 9.** `complete_print_job` lee `units_produced` antes de que la pantalla lo guarde, así que siempre mete la placa entera y reparte el costo entre 9. El historial dice 7 y el kardex dice 9.
2. **La cola no responde "¿qué imprimo ahora?".** Dice "faltan 41 botellas de poción", pero la máquina imprime placas de piezas. La persona tiene que explotar la receta de cabeza, restar el estante y la cola, y crear **un trabajo por corrida**: no hay campo de cantidad. En cada trabajo elige otra vez pedido, etiqueta, placa y rollo.
3. **La opción B, diseñada:** un bloque *Por lanzar* arriba de la cola. Suma los pedidos, los baja a piezas y a corridas de placa, y descuenta el estante y lo que ya está en cola. Cada propuesta lleva su foto, su tiempo y su filamento, y entra a la cola con un toque. Los trabajos de catálogo no se atan a un pedido: el pedido de cada uno se calcula por fecha de entrega, como hace Katana. Solo lo hecho a medida va atado a su pedido.
4. **Los rollos se eligen a ciegas y en mal momento.** El formulario propone el rollo **más lleno** (un sellado del estante antes que el que está en el AMS) y no sabe qué hay en las cuatro ranuras. Hay que proponerlos desde lo que está cargado y confirmarlos al **iniciar**, no al planificar.
5. **Para que el plazo de venta sea creíble** hacen falta horas de cola, horas por corrida, real contra estimado, tasa de falla y horas que la A1 mini imprime de verdad por día. Los datos existen, pero hoy salen sucios: el cierre deja como "reales" los gramos y el tiempo estimados (la relación da 1.000 exacto) y las horas de la impresora ignoran las fallidas. La foto del trabajo **no depende de la variante**: sale de la pieza que produce la placa y de la miniatura que ya trae el `.gcode.3mf`.

## Hallazgos

### H1. "Salieron 7 tapas de 9 y el estante dice 9"

- **Qué pasa:** al cerrar, `ProduccionData.closeJob` llama primero al RPC y **después** guarda las unidades (`apps/web/src/app/features/produccion/produccion.data.ts:395-414` y `460-471`). Dentro del RPC, `update public.print_jobs … returning * into v_job` no toca `units_produced` (`supabase/migrations/20261008110000_parts_and_assembly.sql:197-206`). Luego calcula `coalesce(nullif(v_job.units_produced, 0), rp.units_per_run)` (`:210`), y como el trabajo se creó con `units_produced = 0` (`createJob` no lo escribe, `produccion.data.ts:341-353`), **siempre** entran `units_per_run` piezas, al costo de la placa dividido entre esas mismas `units_per_run` (`:219-229`). Lo verifiqué contra la función que está en la base (`pg_get_functiondef('app.complete_print_job')`, líneas 68-85). No la ejecuté, para no escribir en la base.
- **Qué tarea traba:** la persona quiere anotar que de la placa de 9 tapas salieron 7 buenas. Escribe 7 y el sistema guarda 9 en el estante y 7 en el historial. Armar cree que hay 2 tapas que no existen, y cada tapa queda costeada a 1/9 de la placa en vez de 1/7.
- **Cómo lo resuelven otros:** no aplica: es un defecto. Lo que sí hacen otros es registrar el resultado **por objeto**. SimplyPrint cuenta impresas y fallidas por ítem de cola ([cola de SimplyPrint](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/)).
- **Propuesta:** una migración nueva que añada `p_units_produced` (y `p_percent_complete`, `p_note`) a `complete_print_job` y lo resuelva todo en la misma transacción. `saveOutcomeDetails` desaparece y, con él, el aviso de "se cerró pero no pudimos guardar las unidades".
- **Tamaño:** S
- **Gravedad:** bloquea (el inventario de piezas miente sin avisar)

### H2. "¿Qué imprimo ahora?" no tiene respuesta en la cola (la opción B, diseñada)

- **Qué pasa:**
  - La tarjeta *Falta producir para los pedidos* (`produccion.page.ts:34-78`) lee `production_needs`, que cuenta **productos**: hoy dice "Botella de poción · Con dulces surtidos · Faltan 41 · 4 pedidos". Pero la impresora no imprime productos, imprime placas de piezas. La vista no descuenta las piezas sueltas ni lo que ya está en cola (lo confiesa en `20261009160000_production_needs.sql:12-15` y en la propia tarjeta). Además cuenta como faltante el pedido en `post_processing` (`:40`), que por definición ya se imprimió: de los 41, 20 son de `PED-0006`, en post-proceso.
  - En la misma base, `assembly_options` dice que **5 se pueden armar ya** (8 botellas impresas y 5 tapas en el estante). La cola dice "imprime 41" y Armar dice "arma 5": son dos pantallas que no se miran.
  - Lo que de verdad falta imprimir sale de la receta. Con los datos locales, tras restar el estante y el trabajo que está imprimiendo:

    | Pieza | Hace falta | Hay | En cola | Faltan | Corridas | Tiempo |
    |---|---|---|---|---|---|---|
    | Botella impresa (1 por placa, 43 min) | 41 | 8 | 1 | 32 | 32 | 23 h |
    | Tapa impresa (9 por placa, 20 min) | 41 | 5 | 0 | 36 | 4 | 1 h 20 min |
    | Dulces surtidos (no se imprime) | 2,706 g | 520 g | — | 2,186 g | → comprar | — |

    Nada de eso aparece en ninguna pantalla. La tarjeta no tiene ningún botón: solo un enlace a "Ver pedidos".
- **Qué tarea traba:** de "¿qué imprimo?" a cerrar el trabajo, hoy:

  | Paso | Hoy | Lo que la persona tiene que recordar o calcular |
  |---|---|---|
  | 1 | Cola → leer "faltan 41" | Que 20 ya están en post-proceso |
  | 2 | Ir a Inventario › Armar, elegir el producto, escribir 41, leer qué piezas faltan | Que el faltante está en otra pantalla |
  | 3 | Dividir entre lo que da cada placa y restar lo que ya está en cola | Cuántas piezas da cada placa; qué hay en cola |
  | 4 | "Nuevo trabajo": elegir línea de pedido **o** escribir una etiqueta (`print-job-form.ts:46-60`) | A qué pedido "pertenece" una placa de 9 tapas que sirve a cuatro pedidos |
  | 5 | Elegir la placa en un `select` de texto (`:72-79`) | Cuál es "Botella de poción — Con dulces surtidos · Tapas" |
  | 6 | Revisar los rollos que propuso (H4) | Qué rollo está en qué ranura del AMS |
  | 7 | Crear trabajo. **Repetir 36 veces**: un trabajo es una corrida, sin cantidad (H3) | Cuántas van creadas |
  | 8 | Iniciar, imprimir, Cerrar → Revisar → Confirmar (H5) | — |
  | 9 | Ir a Armar, y luego al pedido a "Pasar a…" el estado (H7) | Que hay que armar y mover el pedido a mano |

  Son unas seis decisiones por corrida y cinco cosas que el sistema ya sabía.
- **Cómo lo resuelven otros:**
  - **Odoo, informe de reabastecimiento:** propone la cantidad que hay que reponer (comprar o fabricar) y la persona la convierte en orden con el botón *Order*. Las reglas automáticas existen, pero están ocultas por defecto ([Odoo](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/report.html)). Es la opción B con otro nombre.
  - **Printago:** los pedidos de Shopify llegan solos, pero **por defecto requieren acción manual**; "Automatically Print Orders" es opcional ([Printago, Shopify](https://docs.printago.io/docs/integrations/shopify)). No mira el inventario antes de imprimir.
  - **Katana:** los materiales "no están ligados directamente a ninguna orden": se reservan **por prioridad**, y al arrastrar una orden de fabricación se recalcula qué queda cubierto ([Katana, prioridades](https://support.katanamrp.com/en/articles/5914369-managing-the-priority-of-manufacturing-orders)). Es justo el modelo para una placa de 9 tapas que sirve a cuatro pedidos.
  - **SimplyPrint:** cada ítem de cola tiene **cantidad**, con impresas y fallidas, y la cola se puede ordenar por **fecha límite** ([cola de SimplyPrint](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/)).
  - Las que crean los trabajos solas (la opción C), como Direct2Print de 3DQue ([Fabbaloo](https://www.fabbaloo.com/news/3dques-direct2print-links-3d-printers-directly-with-etsy-and-shopify)), lo hacen porque además **despachan solas** a una granja. Aquí no hay despacho: hay una persona que retira cada placa.
- **Propuesta (opción B, confirmada por el dueño):**
  1. **Una sola cuenta, en la base:** una vista o función `production_plan` que sustituye a `production_needs` y que M5 reutiliza del lado de la venta:
     ```
     demanda por variante  = Σ líneas de pedidos comprometidos sin entregar − producto armado en el estante
     demanda por pieza     = Σ demanda de cada variante × quantity_per_unit (recipe_items de tipo part)
                             − stock de la pieza − Σ corridas planificadas o imprimiéndose × units_per_run
     corridas              = ceil(faltante / units_per_run de la placa que produce esa pieza)
     también falta comprar = mismos pasos para insumos y empaque
     ```
     La demanda de una pieza se suma **entre variantes**: la botella impresa sirve a poción de amor y a poción venenosa. Cada fila lleva la fecha de entrega más próxima de los pedidos que la piden. Los pedidos `on_hold` se muestran aparte, sin proponer.
  2. **Un bloque *Por lanzar*, arriba de la cola**, que reemplaza la tabla de productos. Una fila por pieza:

     > [foto de la pieza, 64 px] [miniatura de la placa] **Botella impresa** — faltan 32 · para PED-0003 (venció ayer), PED-0004 (hoy) y 2 más
     > 32 corridas × 43 min = 23 h · por corrida: ● rosado 5.7 g ● negro 4.6 g ● rojo 1.0 g · en total 182 / 148 / 33 g · **alcanza**
     > [− 32 +] **[Poner en cola]**

     Debajo, en gris: *No se imprime, se compra: Dulces surtidos, faltan 2,186 g → Registrar compra*. Al final, **[Poner todo en cola]**. Al aceptar, la fila se encoge en el acto, porque lo encolado se resta: esa es la confirmación.
  3. **La persona decide lo que el dueño dijo que decide:**
     - **Impresora:** preelegida si hay una sola (ya lo hace, `print-job-form.ts:315`).
     - **Rollos:** propuestos desde lo que está en el AMS (H4) y cambiables.
     - **Orden:** las corridas entran ordenadas por la fecha de entrega más próxima, y se suben o bajan con flechas. Hace falta una columna `print_jobs.queue_position`.
  4. **A qué pedido pertenece un trabajo de catálogo: se calcula, no se elige.** La salida de la cola se asigna a los pedidos por fecha de entrega, como en Katana, y la tarjeta dice "cubre PED-0003 y PED-0004 · sobran 6 para stock". `order_line_id` queda para lo hecho a medida, donde la pieza solo sirve a ese pedido.
  5. **Lo hecho a medida** (pedido sin receta) aparece en el mismo bloque con las placas que ya leyó el cotizador (`quote_lines.plates`, `20260930010000_sales_and_production.sql:165`), a través de `order_lines.quote_line_id` (`:211`). Hoy está vacío en las 10 líneas locales: depende del primer corte. Si no hay datos, la fila ofrece arrastrar ahí mismo el `.gcode.3mf`.
  6. **Para stock, aparte y debajo:** las piezas bajo su `min_stock`, con el mismo botón. Es "trabajo que puede esperar", tal como pedía M12.
  7. **Cuidado:** hoy una placa declara **una** pieza (`recipe_plates.produces_item_id`). La placa de *Love potion* trae dos objetos, la cara frontal y la trasera (`packages/slicer-files/test/fixtures/love-potion.sliced.config`), y en la receta se modelaron como una sola pieza, "Botella impresa". Sirve mientras siempre salgan juntas. Si alguna vez llenan la cama con botella y tres tapas, el modelo no alcanza (ver preguntas).
- **Tamaño:** L (la vista y la explosión, M; el bloque y el encolado en lote, M)
- **Gravedad:** bloquea

### H3. Un trabajo es una sola corrida, la cola está al revés y no se puede corregir

- **Qué pasa:**
  - `NewJob` no tiene cantidad (`produccion.data.ts:141-149`): diez botellas son diez formularios. La semilla lo refleja sola: etiquetas "Botellas 1/3", "2/3", "3/3", numeradas a mano.
  - Después de una falla no hay "Reimprimir": hay que crear otro trabajo, y la semilla lo llama "(repetida)".
  - La cola trae los trabajos ordenados por `created_at` **descendente** (`produccion.data.ts:188`) y los agrupa por estado sin reordenar (`produccion.page.ts:157-162`). Dentro de *Planificado*, lo último que se creó sale primero: es una cola LIFO.
  - Un trabajo planificado solo se puede *Iniciar* o *Cerrar…* (`print-job-card.ts:79-90`). No se puede cambiar su rollo ni su placa, ni quitarlo. Para deshacer un error hay que cerrarlo como "Cancelado", y queda en el historial.
  - Y la lista se corta en 150 sin `fetchAll` (`produccion.data.ts:11,189`), contra lo que pide `AGENTS.md`. Cuando haya 150 trabajos más nuevos, un planificado viejo desaparece de la cola sin aviso, y el historial se trunca.
- **Qué tarea traba:** la persona quiere lanzar las 4 placas de tapas que faltan y tiene que llenar 4 formularios iguales. Quiere imprimir primero lo que vence antes, y la cola le muestra primero lo último que creó.
- **Cómo lo resuelven otros:** SimplyPrint tiene "amount" por ítem, ordena "de arriba hacia abajo" con arrastre o número, y reordena por fecha límite. Con "Keep in queue when done", un ítem vuelve a servir para reponer ([cola de SimplyPrint](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/)). Bambu Farm Manager deja indicar "el número de veces" que se imprime un archivo al mandarlo a la cola ([wiki de Bambu, Farm Manager](https://wiki.bambulab.com/en/software/bambu-farm-manager); lo vi en el extracto del buscador, y la página de funciones me devolvió 402).
- **Propuesta:**
  - Una fila de `print_jobs` sigue siendo una corrida, porque el costo, la falla y el stock son por corrida. Pero se **crean en lote** con un RPC `queue_print_runs(plate, runs, spools, position)`, y la cola **agrupa** las corridas iguales y seguidas: "Botella impresa · corrida 4 de 32".
  - Orden por `queue_position`, que de entrada sigue la fecha de entrega.
  - Un trabajo planificado se puede editar o quitar. Como todavía no movió nada, quitarlo es borrarlo, y no choca con "nada se borra, se anula", que habla de dinero.
  - Al cerrar como fallida aparece **[Volver a ponerla en cola]**, arriba de todo.
  - `jobs()` se parte en dos: la cola pide solo `planned` y `printing`, sin límite; el historial pagina con `fetchAll` o por rango de fechas.
- **Tamaño:** M
- **Gravedad:** confunde

### H4. El sistema no sabe qué rollo está en el AMS y propone el equivocado

- **Qué pasa:**
  - `suggestSpool` elige, entre los rollos del mismo SKU, **el que tiene más gramos** (`print-job-form.ts:296-301`). Y `spools()` trae también los **sellados** (`produccion.data.ts:13,312-335`). El día que compren un segundo rollo negro, el formulario va a proponer el sellado de 1 kg del estante en vez del abierto que está en la ranura 3. Al cerrar, los gramos se descuentan del rollo equivocado y los dos saldos quedan mal.
  - `spools.location` existe (`20260929231000_inventory.sql:149`, "'AMS 1', 'estante A'"), pero es texto libre, ninguno de los 4 rollos locales lo tiene lleno y el formulario de trabajo ni lo lee.
  - El aviso de que un rollo no alcanza es por fila y contra ese trabajo solo (`print-job-form.ts:234-239`). No suma lo que el resto de la cola le va a sacar al mismo rollo, no propone otro rollo del mismo color y muestra los gramos sin formato.
  - Usar un rollo sellado no lo pasa a "abierto" ni "en uso".
- **Qué tarea traba:** la persona quiere lanzar la placa y tiene que acordarse de qué rollo puso en cada ranura y corregir la propuesta. Si no se acuerda, el kardex de rollos se desvía en silencio.
- **Cómo lo resuelven otros:**
  - El plugin SpoolManager de OctoPrint obliga a elegir rollo antes de imprimir y avisa si no alcanza ([SpoolManager](https://github.com/dojohnso/OctoPrint-SpoolManager)).
  - Con Spoolman, Moonraker y Mainsail se marca el **rollo activo** y el consumo se descuenta de ese ([Mainsail](https://docs.mainsail.xyz/features/spool-management/), [Spoolman](https://github.com/Donkie/Spoolman)).
  - La *lista de tareas* de la cola de SimplyPrint dice qué cambiar físicamente para desbloquear trabajos, del tipo "carga PLA y puede imprimir 16 ítems" ([SimplyPrint](https://help.simplyprint.io/en/article/the-print-queue-to-do-list-what-to-change-to-unlock-more-prints-1rrldti/)).
  - Bambuddy enlaza rollos a ranuras del AMS, pero lo hace hablando con la impresora, que aquí no se hace.
- **Propuesta:**
  - **Memoria del AMS sin conectarse:** cuatro ranuras por impresora (`spools.ams_slot`, o `location` con valores cerrados). Al **Iniciar**, la tarjeta muestra "Filamento 1 rosado → ROSA-01 (ranura 1)", prellenado con lo último que se usó ahí. Si la persona cambia un rollo, el sistema recuerda el cambio y pasa el rollo a "en uso".
  - La propuesta de rollos, en este orden: el que está en el AMS, luego el abierto, luego el sellado. Nunca "el más lleno".
  - "Alcanza" se calcula sumando toda la cola sobre ese rollo, y si no alcanza propone partir o usar otro rollo del mismo SKU.
  - En el bloque *Por lanzar*, un aviso al estilo SimplyPrint: "Para las 4 placas de tapas cambia el verde lima de la ranura 2 por el negro".
- **Tamaño:** M
- **Gravedad:** confunde (y desvía el stock de rollos)

### H5. Cerrar: el camino feliz es corto, pero lo que pide escribir no informa, y lo que importa no se ve

- **Qué pasa:**
  - **Salió bien:** son tres clics (Cerrar… → Revisar y cerrar → Sí, cerrar). El tiempo, los gramos y las unidades vienen prellenados del estimado (`print-job-close.ts:177-183`). Bien.
  - Pero los rótulos dicen **"Tiempo real"** y **"Gramos reales"**, como si hubiera que medir, y en la práctica nadie corrige. En la base local, la relación real/estimado de gramos en trabajos exitosos da **1.000 exacto**:
    ```sql
    select round(sum(actual_g)/nullif(sum(estimated_g),0),3) from print_job_filaments f
    join print_jobs j on j.id=f.print_job_id where j.status='success';  -- 1.000
    ```
    El dato "real" es el estimado copiado, y la métrica de precisión que promete el dominio (§2.8, punto 4) sale vacía de contenido.
  - **Falló a la mitad:** el porcentaje es opcional y está **debajo** del resultado (`:59-63`). Los gramos desperdiciados y el tiempo vienen al **100 %** del estimado (`:177-182`) aunque haya fallado al 28 %. Hay que calcular a mano la proporción de cada rollo.
  - **Cancelada a la mitad:** muestra el porcentaje, pero "no descuenta filamento" (`:82-84`; `produccion.data.ts:491` y `print-job-close.ts:247` mandan la lista vacía). Una placa cancelada al 60 % desaparece del kardex de rollos. "Cancelada" mezcla "nunca empezó" con "la paré".
  - **Menos piezas:** "Unidades producidas" no dice de qué ni enseña la pieza (`:75-79`). Si la placa no declara `produces_item_id`, o no tiene placa, las unidades se piden igual y **no entra nada** al stock, sin aviso (`parts_and_assembly.sql:209-231`). Y por H1, lo escrito no se respeta.
  - **Después de cerrar:** la tarjeta *Stock que quedó* enseña solo los rollos (`produccion.page.ts:80-101`, `produccion.data.ts:426-432`): "ROJO-01 936 g → 921 g". Lo que el taller fue a buscar, "Tapa impresa 5 → 14", no aparece, y nada lleva a Armar.
- **Qué tarea traba:** la persona quiere decir "salió bien" o "falló al 30 % por atasco" y seguir. Hoy tiene que adivinar qué quiere decir "real", calcular proporciones, y luego ir a otra pantalla a ver si las piezas entraron.
- **Cómo lo resuelven otros:**
  - En Prusa Connect, al terminar se retira la pieza y se pulsa **"Set ready"**: con eso la impresora queda lista para el siguiente de la cola ([blog de Prusa](https://blog.prusa3d.com/prusa-connect-a-network-solution-for-remote-control-of-3d-printers_90364/)). Un gesto cierra uno y abre el siguiente.
  - SimplyPrint registra el motivo de cancelación de cada trabajo y luego lo grafica ([estadísticas de SimplyPrint](https://help.simplyprint.io/en/article/the-statistics-dashboard-track-your-printing-at-a-glance-1fr128y/)).
- **Propuesta:**
  - En la tarjeta que imprime, tres botones grandes: **[Salió bien: 9 tapas]** (cierra con lo estimado, un toque más para confirmar), **[Falló…]** y **[Otra cosa…]**.
  - *Falló…* pide primero el porcentaje que marca la pantalla de la A1 mini y la causa, y **calcula** tiempo y gramos en proporción, editables.
  - "Cancelada" se parte en dos: "No llegó a empezar" (no mueve nada) y "La paré" (merma proporcional).
  - "Gramos reales" sale del cierre normal: la corrección real llega con el **pesaje del rollo**, que ya existe (`weigh-form.ts`) y que el cierre de mes del dominio (§2.11 E) ya pide.
  - Unidades: "**Tapas impresas** que salieron bien: [9] de 9", con la foto. Si quedan menos, un menú opcional con "¿qué pasó con las otras 2?" y las mismas causas.
  - Tras cerrar: "+9 Tapa impresa (ahora 14) · Ya puedes armar 8 botellas → **Armar**".
  - Y **[Salió bien e iniciar la siguiente]**, al estilo *Set ready* de Prusa.
- **Tamaño:** M
- **Gravedad:** confunde

### H6. La cola no se entiende de un vistazo: sin foto, con el título equivocado y sin "para cuándo"

- **Qué pasa:**
  - **Foto.** La tarjeta no tiene ninguna (`print-job-card.ts:16-91`). El plan la deja pendiente "porque hace falta saber qué variante produce cada trabajo" (`docs/07-plan-de-trabajo.md`, 7.5.1), pero esa no es la pregunta: un trabajo produce una **pieza**, `print_jobs.recipe_plate_id → recipe_plates.produces_item_id → inventory_items.image_path`, y esa foto ya existe (`20261009130000_part_stock_image.sql`). Además `recipe_plates.thumbnail_path` existe desde el inicio (`20260930000000_catalog.sql:95`) y **nadie lo llena**: la importación del `.gcode.3mf` (`receta-editor.ts:150-205`) ignora `Metadata/plate_N.png`, que es exactamente la imagen de la cama con las piezas en sus colores (`docs/01-investigacion.md`, §1.2). La carpeta `'impresiones'` de `Media` está declarada y sin usar (`core/media.ts:7`).
  - **Título.** Es `label ?? lineDescription ?? plateLabel` (`print-job-card.ts:138-141`), y el formulario oculta la etiqueta cuando se elige una línea (`print-job-form.ts:56-60`). Un trabajo de la placa *Tapas* para la línea "Botella de poción con dulces surtidos × 10" se titula "Botella de poción con dulces surtidos". La placa sale en gris en la línea de abajo.
  - **"Para cuándo".** M12 pedía "con cuál y para cuándo", y la consulta trae `orders(number)` sin `due_date` (`produccion.data.ts:18`).
  - **Dos a la vez.** Nada impide tener dos trabajos "Imprimiendo" a la vez en una sola A1 mini: `startJob` no lo comprueba (`produccion.data.ts:374-381`) y la tabla no tiene ningún disparador.
- **Qué tarea traba:** el dueño entra por la mañana y quiere reconocer cada placa por su imagen, como en Bambu Studio. Lo que encuentra es una lista de textos que repiten el nombre del producto.
- **Cómo lo resuelven otros:** la cola de SimplyPrint muestra "la vista previa renderizada de cada archivo", la cantidad, las impresas y las fallidas, y "la hora estimada de fin" de cada una ([cola de SimplyPrint](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/)). 3DPrinterOS muestra en cada trabajo su visualización, tiempo y peso ([3DPrinterOS](https://3dprinteros.helpdocs.io/3dpos-basics/3-d-printer-in-3-dprinter-os)).
- **Propuesta (cómo se ve la cola):**
  1. **En la impresora** (una sola tarjeta grande): la miniatura de la placa (96 px o más) y la foto de la pieza; "Tapa impresa × 9"; "62 % · termina 14:20"; los rollos con su punto de color; los botones de H5. Si hay un mantenimiento vencido, una línea: "Antes de la siguiente: lubricar ejes (pasado por 3 h)".
  2. **Sigue:** la próxima corrida, con [Iniciar]. Si ya hay una imprimiendo, [Iniciar] pregunta "¿Terminó la anterior?" y la cierra antes.
  3. **En cola (6 h 10 min · termina ~jueves):** grupos de corridas con miniatura de 64 px, "cubre PED-0003 (venció ayer)" en rojo si está vencido, y flechas para reordenar.
  4. **Por lanzar** (H2) y **Para stock**.

  En la importación: guardar `plate_N.png` comprimida en `thumbnail_path`. Hace falta leer una entrada binaria del zip; hoy `core/zip.ts` solo expone lectura de texto. Y proponer `units_per_run` igual al número de copias del mismo objeto: `objectNames` ya trae un `<object>` por cada objeto de la placa. Falta comprobarlo con una placa de nueve tapas, porque los dos archivos reales del repositorio tienen dos objetos distintos cada uno. Hoy queda en 1 a propósito (`receta-editor.ts:144-149`).
- **Tamaño:** M
- **Gravedad:** confunde (afea, en lo visual; confunde, en el título)

### H7. El pedido y la producción no se hablan: todo se mueve a mano en los dos lados

- **Qué pasa:**
  - El estado del pedido (`queued`, `printing`, `post_processing`) se mueve con "Pasar a…" (`pedido.page.ts:78-80`), y ninguna función ni disparador lo liga a `print_jobs`: la tabla solo tiene `print_jobs_touch_updated_at`. Lo comprobé con `pg_trigger`.
  - El botón "Crear trabajo" por línea (`pedido.page.ts:116`) empuja trabajos desde el pedido, que es justo lo que el dueño acaba de decir que **no** se hace.
  - Desde Armar, una pieza que falta se pinta en rojo, "Faltan 5 Tapa impresa" (`armar.page.ts:110-111`), y ahí termina: no ofrece imprimirlas. Desde la cola, nada ofrece armar.
  - Armar vive en *Inventario* (`layout/shell.ts:72`), lejos de *Producción*, aunque el flujo validado es Imprimir → Piezas → Armar.
- **Qué tarea traba:** la persona quiere saber si el pedido de Ana está cubierto. Tiene que cruzar el estado escrito a mano en el pedido, las tarjetas de la cola y el estante de piezas.
- **Cómo lo resuelven otros:** en Katana, el pedido de venta muestra su estado de producción y la disponibilidad ("In stock / Expected / Not available"), y "Expected" se calcula mirando las órdenes de fabricación abiertas ([Katana, prioridades](https://support.katanamrp.com/en/articles/5914369-managing-the-priority-of-manufacturing-orders)). Printago enseña en cada pedido "1/1 jobs" y escribe el avance de vuelta en la tienda ([Printago, Shopify](https://docs.printago.io/docs/integrations/shopify)).
- **Propuesta:**
  - En el pedido, cambiar "Crear trabajo" por una línea derivada del mismo `production_plan`: "5 armadas · 12 cubiertas por la cola (listas ~jueves) · faltan 3 → Ver en producción".
  - Que "Imprimiendo" y "En cola" del pedido se **calculen** y dejen de moverse a mano. Lo decide el agente de pedidos, pero la cuenta es la misma.
  - En Armar, al lado de "Faltan 5 tapas": **[Poner 1 placa en cola (9)]**. En la cola, tras cerrar: **[Armar]** (H5).
  - Mover *Armar productos* al grupo *Producción* del menú.
- **Tamaño:** M
- **Gravedad:** confunde

### H8. El plazo de entrega: qué datos de producción hacen falta para que sea creíble

- **Qué pasa:**
  - Hoy no se calcula ningún plazo. `lead_time_days` no lo lee ninguna pantalla de ventas. Además el alta de producto **todavía lo pide**, "Plazo de entrega (días)" (`catalogo/producto-nuevo.ts:40`), aunque M13 dice que salió del formulario.
  - Los ingredientes del plazo existen, pero dispersos o sucios:

    | Dato | Dónde está | Problema |
    |---|---|---|
    | Horas de lo que ya está en cola | `print_jobs.estimated_time_s` de los `planned` más lo que le queda al `printing` | No hay orden de cola (H3) |
    | Horas de lo comprometido que todavía no se lanzó | No existe | Hace falta `production_plan` (H2) |
    | Horas de lo que pide esta venta | `recipe_plates.print_time_s` × corridas | Bien |
    | Real contra estimado | `actual_time_s / estimated_time_s` (local: 1.016) | El cierre prellena el estimado, así que la relación tiende a 1 por construcción (H5) |
    | Tasa de falla | `failure_stats`, por impresora, histórica | Sin ventana de tiempo; el parámetro está en 10 % y lo real local es 33 % |
    | Horas que la A1 mini imprime por día | No existe; `printers.expected_hours_per_year` = 2,000 h, unas 5.5 h al día | Solo es real si **todas** las impresiones se registran |
    | Armado y empaque | `recipes.minutes_per_unit` | Bien |
    | Compra de lo que falta | No existe | No inventarlo: decir "más lo que tarde la compra" |
- **Qué tarea traba:** quien vende quiere decir "estaría el viernes" y no hay número. Si se lo inventa, la cola de ese día lo desmiente.
- **Cómo lo resuelven otros:** SimplyPrint aprende "el uso diario promedio de cada impresora" para adelantar el mantenimiento ([mantenimiento de SimplyPrint](https://help.simplyprint.io/en/article/maintenance-schedules-automate-recurring-maintenance-i4of7u/)), y en la cola enseña la hora estimada de fin de cada ítem. Es el mismo dato que hace falta aquí: horas reales por día.
- **Propuesta:**
  ```
  horas = (horas de la cola + horas de lo comprometido antes por fecha + horas de este pedido)
          × (real/estimado de los últimos 90 días) ÷ (1 − tasa de falla de los últimos 90 días)
  días  = horas ÷ horas impresas por día (promedio de los últimos 30 días;
          si no hay historia, expected_hours_per_year ÷ 365)
  ```
  - Mostrarlo como rango ("listo en 4 a 6 días") y no como hora exacta. Con los datos locales: 32 botellas y 4 placas de tapas suman 24 h, que divididas entre 0.9 dan 27 h, y a 5.5 h por día salen **unos 5 días**.
  - **Condición para que sea creíble:** que se registren todas las impresiones, que se pulse Iniciar al empezar y que se cierren a tiempo. Por eso el cierre de un toque de H5 es un requisito del plazo, no un adorno.
  - Que el tiempo real salga de `finished_at − started_at` cuando los dos existan y la diferencia sea razonable, en vez de un campo que se copia del estimado.
  - Una sola función en la base, compartida con M5, y borrar el campo del alta de producto.
- **Tamaño:** M (sobre H2)
- **Gravedad:** bloquea (la promesa del dueño, "el plazo sale del stock y de la cola", hoy no tiene número)

### H9. Mantenimiento: el ciclo casi se cierra solo, pero tiene cuatro fugas

- **Qué pasa:** la pantalla se entiende. "Qué toca ahora", con estado y una frase como "toca en 3 días · faltan 45 h de impresión", y "Registrar" con su lista de verificación (`maintenance-tab.ts:46-69`). Las horas se suman solas desde los trabajos. Pero tiene cuatro fugas:
  1. **Un plan solo por horas nunca arranca** hasta que alguien registra el primero: "Sin registro: las horas se cuentan desde el primer mantenimiento" (`maintenance-due.ts:85-95`). En local, "Limpiar y lubricar los ejes cada 150 h" lleva ese estado y lo va a llevar siempre.
  2. **Las horas cuentan solo las impresiones exitosas** (`impresoras.data.ts:352-370`). Una placa que falla al 90 % también gastó la máquina. En local son 2.93 h exitosas y 0.62 h fallidas que no cuentan: el 17 % del uso.
  3. **El registro no consume repuestos ni anota el gasto.** El formulario pide "Costo (S/)" a mano (`log-form.ts:58-60`) y ahí acaba: `logMaintenance` solo inserta en `maintenance_logs` (`impresoras.data.ts:297-310`). Ninguna pantalla escribe movimientos `maintenance` ni `transactions.maintenance_log_id`; el único movimiento `maintenance` local lo puso la semilla. `maintenance_plans.expected_parts` existe y no se lee (`impresoras.data.ts:58`). El dominio (§2.4) prometía que los repuestos usados generan movimientos de stock.
  4. **"Limpiar la placa" es un plan diario**, de 1 día. Mañana sale como *Vencido* en Hoy, y pasado también: es ruido. En el dominio es "cada impresión", es decir, un paso de la impresión, no un mantenimiento con fecha.

  Aparte: una impresión fallida por "Atasco de boquilla" y el incidente "atasco" se escriben dos veces en dos sitios, y el formulario de incidente no permite enlazar el trabajo aunque la columna `incidents.print_job_id` existe.
- **Qué tarea traba:** la persona cambia la boquilla, la anota, y el estante sigue con la boquilla, Finanzas no se entera del gasto y el contador de 150 h nunca empezó.
- **Cómo lo resuelven otros:** en SimplyPrint, al completar una tarea con repuesto "se descuenta automáticamente del inventario", y se devuelve si se deshace ([repuestos de SimplyPrint](https://help.simplyprint.io/en/article/spare-parts-inventory-track-and-manage-maintenance-supplies-12ixp35/)). Sus planes por horas cuentan "desde el último mantenimiento" y crean el trabajo **antes** de que venza, según el uso diario ([planes de SimplyPrint](https://help.simplyprint.io/en/article/maintenance-schedules-automate-recurring-maintenance-i4of7u/)). Atlas CMMS ya estaba en la investigación por lo de "lo que ocurra primero".
- **Propuesta:**
  1. Sin registro previo, el contador de horas arranca en las horas que tenía la impresora cuando se creó el plan. Se puede derivar de los trabajos cerrados antes de `created_at` más `initial_hours`, sin columna nueva.
  2. Las horas suman el tiempo de las exitosas **y** de las fallidas.
  3. El registro ofrece los repuestos esperados del plan con el selector buscable con foto, los descuenta y crea el egreso con `maintenance_log_id`.
  4. "Limpiar la placa" pasa a ser una casilla al **Iniciar**.
  5. Al cerrar una fallida con causa mecánica (atasco, capa desplazada), ofrecer "¿hubo que arreglar algo?", que abre el incidente ya ligado.
- **Tamaño:** M
- **Gravedad:** confunde

### H10. Métricas: qué debería haber y dónde

- **Qué pasa:** la tasa de éxito salió de la cola, pero sigue en **Hoy**, en la tarjeta *Impresiones de la semana* (`panel.page.ts:137-160`, `panel.data.ts:135-168`), que es la pantalla de "qué hago ahora". `ProduccionData.failureSummary` quedó huérfana (`produccion.data.ts:231`). Y ninguna métrica alimenta lo que calibra: el parámetro `failure_rate` (10 %) y la `material_waste_rate` (3 %) se escriben a mano, aunque el dominio dibuja la flecha "PROD → real vs estimado → PAR" (§2.1).
- **Qué tarea traba:** el dueño quiere saber si la tasa de falla del 10 % con la que cotiza es verdad, y no hay dónde mirarlo.
- **Cómo lo resuelven otros:** el tablero de SimplyPrint tiene tasa de éxito, horas de impresión, impresiones por día, *run time* en porcentaje del período, filamento por día, motivos de cancelación y filtro por fechas ([estadísticas de SimplyPrint](https://help.simplyprint.io/en/article/the-statistics-dashboard-track-your-printing-at-a-glance-1fr128y/)).
- **Propuesta:** una entrada **Taller › Métricas**, junto a Hoy, con la producción como primera sección. Pocas cifras, cada una diciendo qué parámetro calibra:
  1. **Tasa de falla**, últimos 90 días, contra el parámetro: "Cotizas con 10 %; lo real es 14 % → [Usar 14 %]" (solo el dueño).
  2. **Causas de falla**: barras, con los soles perdidos en merma (movimientos `waste` × `unit_cost`).
  3. **Horas impresas por día** (barras de 30 días) y su promedio: es el número del plazo de H8.
  4. **Real contra estimado** del tiempo, solo cuando venga de Iniciar y cerrar a tiempo.
  5. **Merma por pesaje:** ajustes de rollos contra la `material_waste_rate`.
  6. **Costo real por pieza** contra el de la receta, en las tres piezas más impresas.

  En Hoy, la tarjeta de la semana se cambia por una de **impresora**: "Imprimiendo tapas, termina 14:20 · siguen 5 placas (6 h) · faltan 36 placas para pedidos".
- **Tamaño:** M
- **Gravedad:** confunde

### H11. Lo hecho a medida vuelve a pedir lo que el cotizador ya leyó

- **Qué pasa:** el cotizador guarda las placas leídas del `.gcode.3mf` en `quote_lines.plates`, con tiempo, unidades por corrida y filamentos (`cotizador/quote-model.ts:47-55`). La línea de pedido tiene `quote_line_id` (`20260930010000_sales_and_production.sql:211`), pero está vacío en las 10 líneas locales (primer corte). El trabajo de una pieza hecha a medida va por "Sin placa (a mano)" (`print-job-form.ts:74`), y se vuelven a escribir minutos y gramos de cada rollo.
- **Qué tarea traba:** la persona quiere imprimir la pieza que cotizó la semana pasada y tiene que volver a sacar los datos del archivo, o arrastrarlo de nuevo a otra pantalla que no lo acepta: el formulario de trabajo no tiene dónde soltar un archivo.
- **Cómo lo resuelven otros:** Bambu Farm Manager crea la tarea directamente con el "plate sliced file" (`.gcode.3mf`) ([wiki de Bambu](https://wiki.bambulab.com/en/software/bambu-farm-manager)).
- **Propuesta:** cuando exista el vínculo cotización → pedido, la fila "a medida" de *Por lanzar* usa `quote_lines.plates`. Mientras tanto, una zona para soltar el `.gcode.3mf` en el propio trabajo, que reutilice `core/sliced-file.ts` y `core/filament-match.ts`.
- **Tamaño:** S (sobre el primer corte)
- **Gravedad:** confunde

## Referencias revisadas

| Aplicación | Por qué sirve de referencia | Qué tomar | Qué NO tomar | Enlace |
|---|---|---|---|---|
| SimplyPrint, cola | Es la cola de impresión más documentada | Cantidad por ítem, miniatura, hora de fin, orden de arriba abajo, reordenar por fecha límite | Grupos de cola, emparejamiento por boquilla o cama, AutoPrint a varias impresoras | [cola](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/) |
| SimplyPrint, lista de tareas | Dice qué cambiar físicamente para destrabar trabajos | "Cambia el verde de la ranura 2 por el negro y lanzas 4 placas" | La versión de flota, con muchas impresoras | [lista de tareas](https://help.simplyprint.io/en/article/the-print-queue-to-do-list-what-to-change-to-unlock-more-prints-1rrldti/) |
| SimplyPrint, mantenimiento y repuestos | Mantenimiento ligado al inventario | Descontar el repuesto al completar; contar horas desde el último; adelantarse según el uso diario | Trabajos asignados a técnicos | [planes](https://help.simplyprint.io/en/article/maintenance-schedules-automate-recurring-maintenance-i4of7u/), [repuestos](https://help.simplyprint.io/en/article/spare-parts-inventory-track-and-manage-maintenance-supplies-12ixp35/) |
| SimplyPrint, estadísticas | Tablero de métricas de impresión | Tasa de éxito, horas por día, motivos de falla, filamento por día | "AI money saved" y comparativas de flota | [estadísticas](https://help.simplyprint.io/en/article/the-statistics-dashboard-track-your-printing-at-a-glance-1fr128y/) |
| SimplyPrint Shop | Pedidos de Etsy y Shopify a la cola (piloto cerrado) | Variante y cantidad ya puestas | Un trabajo por artículo vendido: no junta 9 tapas para 4 pedidos | [Etsy](https://simplyprint.io/integrations/etsy) |
| Printago | Pedidos de tienda → trabajos, por SKU | Pedidos que **esperan acción manual** por defecto; avance "1/1 jobs" por pedido | Imprimir solo, sin mirar el stock (no revisa inventario) | [Shopify](https://docs.printago.io/docs/integrations/shopify), [Etsy](https://docs.printago.io/docs/integrations/etsy) |
| Katana MRP | Fabricación a pedido para negocios chicos | Materiales asignados **por prioridad**, no atados a una orden; In stock / Expected / Not available | Planificación por centros de trabajo y la parte de compras | [prioridades](https://support.katanamrp.com/en/articles/5914369-managing-the-priority-of-manufacturing-orders), [a pedido](https://support.katanamrp.com/en/articles/5908804-make-to-order-workflow) |
| Odoo, reabastecimiento | El patrón "propone y la persona confirma" | Cantidad sugerida con botón *Order*; posponer una sugerencia | Reglas mín./máx., rutas, MPS | [informe](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/report.html) |
| Prusa Connect | Cola de una impresora con persona en medio | "Set ready": retirar la pieza y abrir la siguiente en un gesto | Mandar el G-code a la máquina | [blog de Prusa](https://blog.prusa3d.com/prusa-connect-a-network-solution-for-remote-control-of-3d-printers_90364/) |
| OctoPrint SpoolManager | Rollo obligatorio por impresión | Forzar el rollo antes de imprimir; avisar si no alcanza | Leer el G-code en vivo | [GitHub](https://github.com/dojohnso/OctoPrint-SpoolManager) |
| Spoolman y Mainsail | Inventario por rollo con rollo activo | El concepto de "rollo activo" por ranura | Descontar en vivo por telemetría | [Spoolman](https://github.com/Donkie/Spoolman), [Mainsail](https://docs.mainsail.xyz/features/spool-management/) |
| Bambu Farm Manager | El propio de Bambu, lee el `.gcode.3mf` | Crear la tarea desde el archivo laminado; "número de veces" | Servidor en la LAN y control de la máquina | [wiki](https://wiki.bambulab.com/en/software/bambu-farm-manager) (la página de funciones dio 402) |
| Bambu Handy | Lo que el dueño ya tiene en el teléfono | El historial con tiempo y filamento sirve para contrastar | Su inventario de filamento: no liga rollo a ranura ([foro, 2026-06](https://forum.bambulab.com/t/bambu-handy-update-next-gen-ui-smarter-controls-and-filament-inventory/254777)) | — |
| Bambuddy | Rollos ligados a ranuras del AMS | La idea de ranura → rollo | Configurar el AMS por la red | [GitHub](https://github.com/maziggy/bambuddy) |
| 3DQue AutoFarm3D / Direct2Print | Pedidos que se imprimen solos (opción C) | Nada aquí | Encolar y despachar sin persona | [Fabbaloo](https://www.fabbaloo.com/news/3dques-direct2print-links-3d-printers-directly-with-etsy-and-shopify) |
| 3DPrinterOS | Colas de laboratorios universitarios | Miniatura, tiempo y peso en cada trabajo | Aprobación por personal y cupos por usuario | [ayuda](https://3dprinteros.helpdocs.io/3dpos-basics/3-d-printer-in-3-dprinter-os) |
| FDM Monster / OctoFarm | Tableros de granja | Nada | Plano de piso con decenas de impresoras | [SimplyPrint vs OctoFarm](https://simplyprint.io/alternatives/octofarm) |
| Obico | Detección de fallas por cámara con IA | Nada por ahora | Necesita cámara y conexión a la máquina | [Obico](https://www.obico.io/blog/ai-failure-detection-in-3d-printing/) |

## Lo que no hay que copiar

- **Crear los trabajos solos (opción C).** Printago lo tiene apagado por defecto. 3DQue lo hace porque despacha a una granja. Aquí una persona retira cada placa: un trabajo creado sin ella es solo una fila más.
- **Un trabajo por artículo vendido.** Es el modelo de SimplyPrint Shop y de Printago, y aquí rompe el negocio: una placa de 9 tapas sirve a cuatro pedidos. La producción va por pieza; el pedido se asigna por fecha.
- **Emparejar impresora, boquilla, cama y etiquetas, y grupos de cola.** Con una A1 mini sobra todo. Lo único que se empareja son los 4 colores del AMS.
- **Telemetría, cámara e IA.** La aplicación no habla con la máquina, y eso no se negocia. El porcentaje lo da el tiempo transcurrido (ya existe) o la persona al cerrar.
- **Diagramas de Gantt al minuto.** Con 5.5 h impresas por día de media, la hora exacta engaña. Basta con "termina 14:20" para lo que corre y "~jueves" para la cola.
- **MRP completo** (MPS, stock de seguridad, desfases de plazo por nivel, capacidad por centro). Basta una explosión de un nivel, pedido → pieza → placa, y la prioridad por fecha.
- **Pedir "gramos reales" en cada impresión.** Nadie pesa una placa de 11 g. La corrección viene del pesaje del rollo.
- **Aprobaciones y cupos por usuario** (3DPrinterOS). Son dos personas.

## Preguntas para el dueño

1. **¿Las piezas de catálogo se imprimen "para la bolsa común" y el sistema dice a qué pedido le tocan por fecha, o cada placa tiene que llevar un pedido escrito?** Recomiendo la bolsa común: la placa de 9 tapas ya sirve a varios pedidos, y atarla a uno obliga a mentir. Solo lo hecho a medida va atado a su pedido.
2. **¿Alguna vez ponen en la misma cama piezas distintas** (una botella y tres tapas para aprovechar el espacio)? Si la respuesta es sí, una placa tiene que poder producir varias piezas, y eso es un cambio de modelo. Si es no, se queda como está. Recomiendo preguntarlo antes de construir H2.
3. **¿Se registran todas las impresiones, también las pruebas y las piezas personales?** Si no, el plazo y el mantenimiento salen cortos. Recomiendo que sí, con el cierre de un toque y "Salió bien e iniciar la siguiente".
4. **¿El rollo se decide al planificar o al empezar?** Recomiendo proponerlo al planificar y confirmarlo al **iniciar**, desde lo que está en las 4 ranuras, porque entre una cosa y otra el AMS cambia.
5. **"Limpiar la placa", ¿es un mantenimiento con fecha o un paso de cada impresión?** Recomiendo que sea un paso al iniciar, para que Hoy no lo marque como vencido todos los días.
6. **¿Dónde quiere las métricas?** Recomiendo *Taller › Métricas*, fuera de Hoy, y que cada cifra diga qué parámetro corrige, con botón para actualizarlo.
