# Recorrido desde cero, segunda vuelta (2026-10-07)

Es la misma prueba de la fase A ([recorrido-desde-cero.md](recorrido-desde-cero.md)), repetida después de los arreglos. La base se borró: quedaron solo el taller y el usuario, y las 53 migraciones corrieron sin error desde cero. Todo se cargó por pantallas, en cinco etapas:

1. Arranque, configuración y compras.
2. La calavera desde el archivo laminado.
3. Producción: falla, molde, armado y conteo.
4. Venta de 2 calaveras: entrega, cobros y un pedido a medida cancelado.
5. Caja, cuentas, Resultados e inventario.

Cada hallazgo pasó por un revisor que intentó refutarlo con el código y la base. De 59 hallazgos, 40 se confirmaron y 19 se descartaron. Tres estaban repetidos entre etapas, así que quedan **37 distintos: ninguno grave, 12 medios y 25 menores**.

## Lo que cuadró

Cuadraron 101 de 105 comprobaciones. Las cuatro restantes son hallazgos de esta lista o cosas que se probaron en la etapa siguiente.

- **Compras, como en la fase A.** Hora de máquina S/ 0.42. Envío 3.13 + 3.12 + 3.75, con los rollos `PLA-BLANCO-01`, `PLA-NEGRO-01` y `PETG-NEGRO-01` a 53.13, 53.12 y 63.75. Las compras por gramo, sus categorías y el pago posterior también cuadran.
- **Costo real de las piezas, como en la fase A.** Frente 0.71 y trasera 0.48. Tapa y gancho 0.049286 cada uno, que el conteo lleva a 0.048571.
- **El lote de 2 da S/ 18.69 en todas partes:** cotizador, cotización, `order_lines` (9.345), pedido y Resultados. En la fase A daba 15.69; los +3.00 son una segunda lámina por unidad que tenía esta receta. La producción y los arreglos no cambiaron el número.
- **Resultados de octubre:**
  - ventas 38 y costo 18.69, utilidad bruta 19.31;
  - producción no vendida 7.77 (molde 7.72 + conteo 0.05);
  - utilidad neta 11.54;
  - fallas 0.38 de 11.16 impreso.

  El corte de mes va en hora de Lima: un egreso del 30/09 a las 21:00 cayó en setiembre.
- **Saldos:** Efectivo 350 y Yape 161, total 511. Por cobrar vacío. El kardex de los 8 artículos y los 3 rollos cuadra con su saldo.

**Los seis graves de la fase A no volvieron.** La pantalla ya no ofrece cancelar un pedido entregado y cobrado. El rechazo de la base se comprobó leyendo el disparador, porque el entorno no permitió llamar la API directamente.

## Medios

- **E2-01 · Recién importadas, las piezas aparecen como 4 insumos vacíos y «Piezas impresas por unidad» queda vacía hasta recargar.** `apps/web/src/app/features/catalogo/receta-editor.ts:186-196, producto.page.ts:189`
  - Propuesta: Recargar lookups en producto.page tras una importación que creó piezas (emitir un evento hasta el padre), o añadir las piezas creadas a lookups. Mejor aún: clasificar las filas por el kind del propio recipe_item y no por la lista de opciones.
- **E2-02 · «Probar un costo para insumos sin registro» ofrece las 4 piezas impresas.** `apps/web/src/app/features/catalogo/costo-variante.ts:151-158`
  - Propuesta: Filtrar con partsMadeByPlates(recipe) igual que computeCost (y, si se quiere, excluir kind 'part' en general, cuyo costo sale de producción).
- **E2-03 · «+ Pieza nueva» crea la pieza en el acto, aunque la importación dice «Nada se guarda hasta que lo confirmes».** `apps/web/src/app/features/catalogo/importar-placa.ts:~287, importar-placas.ts:40, importar-placas.ts:65`
  - Propuesta: Crear las piezas nuevas dentro de save() de la importación (guardar solo el nombre en el borrador), o borrar las recién creadas al descartar y corregir el texto.
- **E3-01 · El cierre de impresión muestra las piezas con un ícono genérico, sin foto.** `apps/web/src/app/features/produccion/print-job-outputs.ts:27`
  - Propuesta: Importar `borrowedPhoto` en PrintJobOutputs y añadir `[photo]="borrowedPhoto(parts()[i]!.inventoryItemId, 'part')"`, igual que en print-job-card.
- **E3-02 · Resultados dice que la reserva por fallos «alcanza» porque el molde infla el denominador.** `supabase/migrations/20261013120000_unsold_production.sql:101, apps/web/src/app/features/finanzas/results.ts:88, resultados.page.ts:164`
  - Propuesta: En una migración nueva, que `print_cost` excluya los trabajos success con units_produced = 0 sin línea de pedido (o calcular el share en results.ts como failedPrints / (printCost - toolsAndTests)). Corregir también la redacción de ADR-023, punto 4.
- **E3-04 · «Armar» consume los componentes al primer clic, sin confirmar.** `apps/web/src/app/features/inventario/armar.page.ts:83`
  - Propuesta: Añadir una señal `confirming` como en PrintJobClose: «Esto no se puede deshacer. Salen del estante: … Entra: N × producto» con «Sí, armar» y «Volver».
- **E4-01 · Cancelar un pedido deja su trabajo de impresión planificado en la cola, primero en la fila.** `apps/web/src/app/features/pedidos/pedido-avance.ts:63`
  - Propuesta: En una migración nueva, al pasar a cancelled cancelar los print_jobs planned de sus líneas (o rechazar con P0001 si hay alguno en printing). Como mínimo, que la confirmación los mencione y que la cola/plan ignore trabajos de pedidos cancelados.
- **E4-02 · Cerrar como «Cancelada» un trabajo que nunca empezó le guarda el tiempo estimado como real y le pone costo.** `apps/web/src/app/features/produccion/print-job-close.ts:194, apps/web/src/app/features/produccion/produccion.data.ts:655`
  - Propuesta: Para result = cancelled en un trabajo sin started_at, no enviar tiempo y poner energía y máquina en 0. En realCosts no caer al estimado si el resultado es cancelled. Al elegir «Cancelada», vaciar el campo o pedir confirmarlo.
- **E4-03 · El plan dice que la línea a medida «no sabe cuánto tarda» aunque ya tiene su trabajo en cola con 20 min.** `packages/domain/src/plan.ts:610-616`
  - Propuesta: Calcular `queued` y `left` primero, y condicionar el aviso y unknownLine a `left > 0 && custom.plates.length === 0`. Añadir un test en el dominio.
- **E5-01 · Un «Ingreso» que la Caja describe como ganancia no entra en la utilidad.** `apps/web/src/app/features/finanzas/transaction-form.ts:27, supabase/migrations/20261013130000_line_cost_keeps_the_batch.sql:214, resultados.page.ts:31-48`
  - Propuesta: Lo decide el dueño. Opción A: cambiar el texto de la Caja para decir que no entra en la utilidad y que las ventas se registran por Pedidos, y explicar «Otros ingresos» en Resultados. Opción B: sumar other_income a net_profit con una migración nueva (nunca editando una ya aplicada), sabiendo que ese ingreso no trae costo de ventas.
- **E5-02 · Un movimiento anterior a la fecha de apertura de la cuenta igual cambia el saldo.** `supabase/migrations/20261004130000_finance.sql:309-324, apps/web/src/app/features/finanzas/transaction-form.ts`
  - Propuesta: Avisar en el formulario (y validar en la base con una migración nueva) cuando occurred_at, en hora de Lima, sea anterior a opening_balance_on de la cuenta o de la contracuenta. Otra opción es excluir esos movimientos del saldo y decirlo en Cuentas.
- **E5-04 · La historia del cliente muestra un saldo de S/ 10 en un pedido cancelado.** `apps/web/src/app/features/clientes/cliente-historia.ts:99-101, apps/web/src/app/features/clientes/clientes.data.ts:85`
  - Propuesta: En la historia, con status 'cancelled' mostrar «—» en Cobro y Saldo, como pedidos.page.ts:78. Contar los pedidos de la lista con el mismo criterio que customer_history, por ejemplo leyendo customer_history.orders en vez de contar en el navegador.

## Menores

- **E1-04 · Textos que suponen datos que no hay.** `apps/web/src/app/features/panel/panel.page.ts:182, por-lanzar-card.ts:69, produccion.page.ts:180`
  - Propuesta: Distinguir el caso sin datos: «Todavía no hay planes de mantenimiento», «Todavía no hay pedidos confirmados», «Todavía no hay pedidos entregados», según los conteos que ya trae setupCounts o la propia consulta.
- **E1-05 · La confirmación de una compra sin filamento dice «Se crearán 0 rollos» y llama insumo al empaque.** `apps/web/src/app/features/inventario/compra-form.ts:258-262, compra-form.ts:414-417`
  - Propuesta: Armar la frase por partes: omitir la de rollos si rollCount es 0 y contar los artículos por tipo (insumos, empaque, repuestos) con ITEM_KIND_LABELS.
- **E1-06 · Resultados dice que las compras están «ya contadas en el costo de ventas» con costo de ventas en cero.** `apps/web/src/app/features/finanzas/resultados.page.ts:176`
  - Propuesta: Cambiar el subtítulo a algo como «no restan aquí: su costo entra en el costo de ventas cuando se vende lo hecho con ellas».
- **E1-08 · El subtítulo de Insumos dice «todo lo que se cuenta por unidad», pero los dulces van en gramos.** `apps/web/src/app/app.routes.ts:36, insumos.page.ts:176`
  - Propuesta: Reescribir el subtítulo sin «por unidad», por ejemplo «Dulces, imanes, boquillas: lo que se compra y se gasta, por unidad, gramo o ml».
- **E2-04 · Las ranuras de los moldes no dicen su material aunque el archivo dice PETG.** `apps/web/src/app/features/catalogo/importacion.ts:305`
  - Propuesta: Si no hay SKU sugerido, resolver materialId buscando en materials el code que coincida con filament.type (sin distinguir mayúsculas), y usarlo de respaldo en confirmedFilaments.
- **E2-05 · La fila «Producción» del desglose sale desalineada.** `apps/web/src/styles.scss:195, catalogo/costo-variante.ts:80, cotizador/desglose.ts:44`
  - Propuesta: Renombrar la clase de las filas (p. ej. tr.subtotal), o acotar la utilidad global a :not(tr)/small/span.
- **E2-10 · «Todavía no hay nada para elegir» cuando todas las piezas ya están en la receta.** `apps/web/src/app/features/catalogo/suministro-fila.ts:33, ui/item-picker.ts:190`
  - Propuesta: Pasar [emptyText] desde suministro-fila: si supplies() no está vacío pero options() sí, decir «Todas tus piezas ya están en la receta» (o «…tus insumos…»).
- **E2-12 · Plurales con paréntesis.** `apps/web/src/app/features/catalogo/importar-placas.ts:63, receta-editor.ts:252-258, importar-placa.ts:259`
  - Propuesta: Usar singular o plural según el número, como en otras pantallas (n === 1 ? 'placa' : 'placas').
- **E3-06 · La cola guarda el tiempo de la placa en minutos enteros y el costo real pierde un céntimo.** `apps/web/src/app/features/produccion/print-job-form.ts:354`
  - Propuesta: Guardar aparte los segundos de la placa y enviarlos tal cual mientras la persona no edite los minutos (o enviar plate.printTimeS cuando el valor coincide con el redondeo propuesto).
- **E3-07 · El mensaje «Se armó 1…» queda debajo de la tabla y junto al botón aparece «Falta stock».** `apps/web/src/app/features/inventario/armar.page.ts:86-88`
  - Propuesta: Mostrar `result()` dentro de `.qty`, junto al botón, y ocultar «Falta stock…» mientras haya un resultado recién puesto (o reformularlo como «Ya no alcanza para otra»).
- **E3-08 · Un trabajo suelto no explica adónde va su costo, y el ejemplo invita a imprimir stock por ahí.** `apps/web/src/app/features/produccion/print-job-form.ts:55`
  - Propuesta: Cambiar el ejemplo (p. ej. «molde, prueba de soporte»). Con hasLine() falso y sin placa, mostrar «Sin placa no entra nada al estante: su costo va a Producción no vendida. Para stock de piezas elige su placa».
- **E3-09 · Hoy dice «las impresoras están al día» aunque no hay ningún plan de mantenimiento.** `apps/web/src/app/features/panel/panel.page.ts:182, apps/web/src/app/features/impresoras/maintenance-tab.ts:126`
  - Propuesta: En maintenance-tab, si statuses() está vacío devolver «Sin planes de mantenimiento». En el panel, contar planes (por ejemplo en setupCounts) y decir «No hay planes de mantenimiento: crea uno en Impresoras».
- **E3-10 · La impresión fallida cobra hora de máquina pero no suma horas a la impresora.** `apps/web/src/app/features/impresoras/impresoras.data.ts:366, printer-detail.ts:79`
  - Propuesta: Sumar actual_time_s de success y failed (y de los cancelled que llegaron a iniciarse), y ajustar el texto a «h de impresión».
- **E3-11 · Textos sin plural: «7 Tapa de calavera» y «rollo(s)».** `apps/web/src/app/features/produccion/print-job-close.ts:246, apps/web/src/app/features/produccion/produccion.outputs.ts:71`
  - Propuesta: Usar `n === 1 ? 'rollo' : 'rollos'`. Para las piezas, formato «Nombre × N» en lugar de anteponer el número al nombre en singular.
- **E4-05 · Recorte del tiempo real a minutos enteros al cerrar: la trasera cuesta 0.48 en vez de 0.49.** `apps/web/src/app/features/produccion/print-job-close.ts:194`
  - Propuesta: Si la persona no toca el campo, enviar job.estimatedTimeS tal cual (marcar el control como pristine y usar los segundos originales). Solo convertir minutos cuando se editó.
- **E4-06 · Un pedido cancelado sigue mostrando saldo pendiente y «Vendido por».** `apps/web/src/app/features/pedidos/pedido-cobro.ts:38, apps/web/src/app/features/pedidos/pedido-estimado.ts:57`
  - Propuesta: Con cancelled(), mostrar el saldo como «no aplica» o S/ 0 sin `.owed`. En PedidoEstimado, recibir el estado y ocultar «Vendido por» y la ganancia si el pedido está cancelado.
- **E4-07 · «No hay cuentas activas donde recibir el dinero» aparece mientras cargan las cuentas.** `apps/web/src/app/features/pedidos/pedido-cobro.ts:48-50`
  - Propuesta: Añadir `accountsLoading = signal(true)`, apagarlo en un finally de loadAccounts y mostrar «Cargando cuentas…» mientras tanto (o usar pp-async).
- **E4-08 · El aviso «Pusiste 1 corrida… Están abajo, en Planificado» no se va.** `apps/web/src/app/features/produccion/por-lanzar-card.ts:49-53`
  - Propuesta: Limpiar `done` cuando cambian los trabajos de la cola (al recargar tras iniciar o cerrar), o reformularlo en pasado sin afirmar dónde están ahora.
- **E4-09 · «Datos › Entrega —» después de entregar todo.** `apps/web/src/app/features/pedidos/pedido.page.ts:82`
  - Propuesta: Rotular «Fecha comprometida» o «Para cuándo». Si el pedido ya se entregó, mostrar la fecha de la última entrega.
- **E4-10 · Textos: «1 unidades», «rollo(s)» y cantidades sin unidad.** `apps/web/src/app/features/cotizador/desglose.ts:88, apps/web/src/app/features/produccion/print-job-close.ts:246, apps/web/src/app/features/cotizaciones/cotizacion.page.html:191`
  - Propuesta: Un helper de plural («1 unidad», «N unidades», «rollo/rollos») y el pipe `qty` con la unidad del insumo. Mover las multiplicaciones de dinero a pricing.ts.
- **E4-12 · «Causa más común» se decide por orden alfabético en un empate.** `apps/web/src/app/features/panel/panel.page.ts:216`
  - Propuesta: En una migración nueva, calcular la causa con count(*) y desempatar por la falla más reciente (o devolver null si hay empate), y que el panel diga «sin una causa dominante».
- **E5-06 · Al anular una transferencia, el texto dice una sola cuenta.** `apps/web/src/app/features/finanzas/void-form.ts:21-23`
  - Propuesta: Si type === 'transfer', decir «de {origen} a {destino}». Con isCounterLeg, el origen es otherAccountName y el destino accountName. Aclarar que se anulan las dos patas.
- **E5-08 · Editar una pieza dice que deja de ofrecerse «al comprar» y no muestra su foto.** `apps/web/src/app/features/inventario/item-form.ts:79`
  - Propuesta: Que el texto dependa del tipo; para una pieza, algo como «deja de ofrecerse en recetas y armados y sale de la lista». Opcional: mostrar en el campo la foto de la placa como referencia mientras no tenga la suya.
- **E5-11 · Dos tasas de falla distintas sin explicación.** `apps/web/src/app/features/finanzas/resultados.page.ts:162-164, apps/web/src/app/features/configuracion/cost-profile-form.ts:56, apps/web/src/app/features/panel/panel.page.ts:215`
  - Propuesta: Decir en Resultados «medido por costo, no por cantidad de impresiones» y corregir la ayuda de la configuración a «parte de lo impreso que se pierde, en costo». Si se mantiene la tasa por cantidad en Hoy, rotularla así.
- **E5-13 · Las dos patas de una transferencia quedan separadas en la lista de Caja.** `apps/web/src/app/features/finanzas/finanzas.data.ts:306`
  - Propuesta: Desempatar por transaction_id (y por is_counter_leg) en la consulta y en el sort, así las dos patas de una transferencia quedan juntas y la paginación es determinista.

## Descartados por el revisor

No son errores, pero algunos podrían servir como mejoras si el dueño los quiere.

- E1-01 · La impresora no admite foto. *La regla de fotos (AGENTS.md, memoria imagenes-en-todo y M11 en docs/07-plan-de-trabajo.md) enumera los artículos: producto, variante, pieza impresa, insumo, empaque y repuesto.*
- E1-02 · Insumos y Empaque no dicen a qué costo vale cada artículo (Filamentos sí). *La pantalla nunca tuvo columna de costo: el historial de git de insumos.page.ts no la muestra en ninguna versión.*
- E1-03 · «Primeros pasos» no pide cuentas ni la primera compra, y da por hechos los filamentos sin costo. *panel.setup.ts declara a propósito qué hace falta para que la app «pueda responder»: cotizar, fechar y costear.*
- E1-07 · El detalle de una compra no dice qué rollos generó ni cómo se pagó. *El detalle funciona y la lista ya muestra «· N rollos» (compras.page.ts:84-86), que cumple de forma literal el subtítulo.*
- E2-06 · «Sale del bolsillo» más «Costo asignado» no suman el costo. *Es la definición del dominio: packages/domain/src/cost.ts:96-97 y :192-193 calculan cashOutOfPocket = material + energía + insumos y assigned = máquina + trabajo, y docs/02-dominio.md clasifica igual (desembolsable frente a asignado), sin incluir la reserva por fallos en ninguno.*
- E2-07 · El costo por unidad se muestra con 3 decimales, pero el margen se calcula con 2. *El margen usa breakdown.costPerUnit = roundMoney(total/units) (packages/domain/src/cost.ts:194), conforme a la regla de AGENTS.md de redondear cada componente de dinero a céntimos.*
- E2-08 · Guardar los tiempos de la receta no avisa «Guardado». *Sí guarda (setup_minutes 10, minutes_per_unit 8).*
- E2-09 · Las etiquetas de placa salen con los nombres en inglés del archivo. *La etiqueta se propone desde los nombres de objeto del archivo (plateLabel en importacion.ts) y es un campo editable antes de guardar.*
- E2-11 · Las piezas nuevas dicen «Sin costo · Sin registrar» en amarillo. *Es exacto: part_stock da cost_source 'unknown' y cost_per_unit null porque la pieza no se ha impreso ni tiene costo estándar, y piezas.page.ts:200-206 lo traduce a «Sin registrar».*
- E3-03 · Impresoras promete «qué ha fallado», pero no muestra las fallas de impresión. *La pestaña Incidentes se presenta como «Fallas de la máquina: síntoma, causa, solución, parada y costo» (incidents-tab.ts:14).*
- E3-05 · Ninguna pantalla muestra lo que costó lo armado, y el kardex no está valorizado. *Los costos de la base son coherentes: la producción de la calavera a 5.637142 y el ajuste a 0.048571 vienen de assemble_product y count_shelf.*
- E4-04 · La ficha del pedido no lista sus cobros. *La tarjeta Cobro cumple el contrato de docs/06-frontend.md:123: «total, cobrado, saldo y el formulario que llama a record_payment».*
- E4-11 · El costo unitario × la cantidad no da el costo del trabajo. *Es deliberado.*
- E4-13 · La tabla «Líneas» del pedido se desborda. *La tabla de Líneas está dentro de `.scroll { overflow-x: auto }` (pedido.page.ts:118 y :216).*
- E5-03 · El kardex no muestra el saldo ni el costo del artículo filtrado. *Es una mejora, no un error.*
- E5-09 · «De una impresión» como origen de un costo que promedia varias. *El número está bien: part_stock (20261009130000_part_stock_image.sql) calcula el promedio ponderado de las entradas con costo: Frente 0.71 y 0.71, Trasera 0.48 y 0.48.*
- E5-12 · El aporte del dueño ofrece la categoría «Ventas» y pregunta «De quién lo recibiste». *Es comportamiento por diseño y no cambia ninguna cifra.*
- E5-14 · La tarjeta «Piezas e insumos bajo mínimo» de Hoy no tiene enlace. *La tarjeta sí tiene enlaces: cada fila pasa [link]="item.route" (panel.page.ts:139) y la ruta sale de ROUTES en panel.stock.ts:36-41 (pieza a /inventario/piezas, insumo a /inventario/insumos, empaque a /inventario/empaque).*
- E5-15 · Tapa y Gancho muestran la misma foto. *Funciona como se diseñó (arreglo H20, commit 2ef8c2d).*

## Datos que dejó la prueba

Todo está en la base local de prueba, que se borra antes de la fase B:

- COT-2026-0001 y ORD-2026-0001, entregado y cobrado, de María Torres;
- ORD-2026-0002, a medida y cancelado;
- cinco movimientos de Caja de prueba, ya anulados.
