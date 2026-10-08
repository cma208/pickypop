# Recorrido desde cero, tercera pasada: romperlo a propósito (2026-10-08)

Es la misma base de las pasadas anteriores, borrada otra vez, con el taller, el dueño y un operador que no es dueño. Esta vez las seis etapas buscaron errores a propósito:

- valores inválidos;
- doble clic;
- dos y tres pestañas a la vez;
- el orden equivocado;
- fechas raras;
- permisos.

Cada hallazgo pasó por un revisor que intentó refutarlo. Quedaron **85 confirmados: 3 graves, 25 medios y 57 menores**. Se descartaron 14.

La etapa de permisos y API (T6) corrió, pero un clasificador de seguridad del entorno retuvo su informe. Lo esencial de permisos sí quedó probado en T1, T3 y T5, leyendo las políticas de la base, y vuelve a revisarse después de los arreglos.

## El patrón

**Lo que pasa por una función de la base aguantó.** Por ejemplo:
- dos pestañas vendiendo la última unidad;
- la cotización aceptada dos veces;
- la entrega doble;
- el cobro del mismo saldo en dos pestañas;
- el sobrepago;
- la cancelación con impresiones.

**Lo que falló está donde la regla vive solo en la pantalla:**
- **Doble clic:** cobros, pagos de compras, guardar un pedido y crear una receta.
- **Pestañas viejas:** reabren trabajos, rechazan cotizaciones ya aceptadas o anotan en cuentas desactivadas.
- **Guardados en varios pasos que no son atómicos:** importación, pedido con líneas y cotización.
- **Políticas de la base demasiado abiertas:** cualquier miembro puede editar por la API movimientos de dinero, de stock y trabajos cerrados.

## Lo que aguantó

- **T1 · Arranque, configuración y compras:** 16 intentos aguantaron. Por ejemplo: Parámetros de costo: rechaza merma, tarifas y mínimo negativos, fallo del 100 %, margen del 100 % e IGV del 150 % con mensajes claros. También una fecha pasada («La fecha no puede ser anterior a hoy») y una fecha ya usada. El doble clic en «Guardar» crea una sola versión.
- **T2 · Catálogo e importación:** 19 intentos aguantaron. Por ejemplo: Doble clic real en «Crear producto»: crea un solo producto. Las etiquetas «halloween, , Dulces,HALLOWEEN, ,» quedan en {halloween,dulces}.
- **T3 · Producción e inventario:** 20 intentos aguantaron. Por ejemplo: Nuevo trabajo: «Qué se imprime» vacío o solo con espacios, minutos 0 o 1.5, gramos negativos y sin rollo: todo bloqueado con su mensaje.
- **T4 · Ventas, pedidos y Venta rápida:** 38 intentos aguantaron. Por ejemplo: Venta rápida, precio y cantidad: precio 0 y negativo, cantidad mayor que lo libre, 1.5 y 1e0. Los bloquea la pantalla y el botón queda deshabilitado.
- **T5 · Finanzas:** 16 intentos aguantaron. Por ejemplo: Transferencia a la misma cuenta: la lista de destino excluye la cuenta de origen, se vacía si cambias el origen, y la base tiene el check transactions_transfer_needs_two_accounts.

## Graves

- **T2-01 · Eliminar una variante que está en una cotización deja la línea huérfana y le cambia el precio.** `apps/web/src/app/features/catalogo/catalogo.data.ts:267-270, supabase/migrations/20260930010000_sales_and_production.sql:161,210, 20261009150000_assembled_goods.sql:13`
  - Propuesta: Cambiar esas FKs a ON DELETE RESTRICT con una migración nueva, o agregar un disparador BEFORE DELETE con un P0001 que diga dónde se usa. En la pantalla, ofrecer «Desactivar» cuando la variante tiene cotizaciones, pedidos o stock.
- **T3-01 · «Iniciar con estos rollos» desde una pestaña vieja devuelve a «Planificado» un trabajo ya iniciado, o incluso ya cerrado como exitoso.** `apps/web/src/app/features/produccion/produccion.data.ts:486-492`
  - Propuesta: Mover el inicio a una RPC start_print_job(p_job_id, p_rolls) que bloquee la fila, exija status='planned' con un raise P0001 «Este trabajo ya no está planificado» e inserte los rollos en la misma transacción. Mientras tanto: en startJob, .select('id') y fallar si no volvió ninguna fila, y en el deshacer, .eq('status','printing'). En una migración nueva, un disparador BEFORE UPDATE OF status que rechace salir de un estado cerrado.
- **T4-01 · Doble clic en «Registrar cobro» registra el cobro dos veces.** `apps/web/src/app/features/pedidos/pedido-cobro.ts:227-234`
  - Propuesta: Poner la guardia de saving al principio de submit(). Para blindarlo de verdad, pasar una clave de idempotencia (uuid generado al abrir el formulario) a record_payment, con un índice único que rechace la repetición.

## Medios

- **T1-01 · Doble clic en «Registrar pago» de una compra registra el pago dos veces.** `apps/web/src/app/features/inventario/compra-pago.ts:146, pedido-cobro.ts:231`
  - Propuesta: Usar `if (this.form.invalid || this.saving()) return;` en compra-pago y pedido-cobro. Como defensa de fondo, una llave de idempotencia en el RPC, como p_sale_key de quick_sale.
- **T1-02 · Cualquier miembro puede cambiar montos, desanular o borrar movimientos de dinero, compras y stock por la API.** `supabase/migrations/20260929230000_foundation.sql:98-117`
  - Propuesta: Un disparador BEFORE UPDATE en transactions que rechace cambios fuera de voided_at, void_reason y voided_by (y solo desde null), más un BEFORE DELETE que lo prohíba también al dueño. O pasar la anulación a un RPC y dar permisos de UPDATE por columna. Lo de los roles va con M9.
- **T1-04 · «Deshacer lo creado» del operador dice «Se deshizo» y no borra nada.** `apps/web/src/app/features/inventario/inventario.data.ts:823-840`
  - Propuesta: Hacer `.delete().select('id')` y lanzar permissionError() si no vuelve ninguna fila. La solución de fondo es registrar la compra en un RPC atómico, así no queda nada que deshacer (cubre también T1-05 y T1-06).
- **T1-08 · Un rollo marcado «Descartado» o «Agotado» a mano sigue contando sus gramos como libres.** `supabase/migrations/20260929231000_inventory.sql:211-226, inventario.data.ts:591-598`
  - Propuesta: Que el plan y el stock excluyan los rollos 'discarded' (filtrarlos en la vista con una migración nueva). O, al descartar, escribir un ajuste que deje el rollo en cero con motivo, para que el kardex lo explique.
- **T1-09 · Se acepta un pago de compra con fecha futura y descuenta el saldo de hoy.** `apps/web/src/app/features/inventario/compra-pago.ts:96`
  - Propuesta: Rechazarlo en la base (occurred_at <= now() + un margen pequeño) dentro de los RPC de dinero y en el insert de Caja, y agregar un validador notInTheFuture compartido a los formularios de dinero.
- **T1-15 · Un escalón de precio agregado después de las 19:00 en Lima no aparece hasta medianoche (verificado con código y base).** `apps/web/src/app/features/catalogo/catalogo.data.ts:685-690`
  - Propuesta: Mandar valid_from: todayLocal() en addTier y, en la base, cambiar el default a (now() at time zone 'America/Lima')::date (o la zona del taller) con una migración nueva.
- **T2-05 · «Duplicar» falla en toda variante cuyas placas sacan piezas.** `supabase/migrations/20261010110000_plate_outputs.sql:169-172, 20261013110000_plate_outputs_join_recipe.sql:15-28`
  - Propuesta: En una migración nueva, recrear duplicate_variant con `on conflict (recipe_id, inventory_item_id) do update set quantity_per_unit = excluded.quantity_per_unit`, para conservar la cantidad del original. O copiar recipe_items antes de las salidas.
- **T2-06 · La copia de «Duplicar» deja de ser «Sale tal cual».** `supabase/migrations/20261010110000_plate_outputs.sql:133-136, 20261010130000_assembly_guards.sql`
  - Propuesta: En la misma migración nueva que arregle T2-05, copiar assembled en el insert de recipes.
- **T2-07 · Quitar la única placa que imprime una pieza: sin aviso, el costo baja y la pantalla dice algo falso.** `apps/web/src/app/features/catalogo/suministro-fila.ts:52-56, costing.ts:190-193, placa-editor.ts:182`
  - Propuesta: Distinguir «no la imprime ninguna placa» de «la imprime otra receta» (consultando recipe_plate_outputs de las recetas activas), y en la confirmación avisar qué piezas quedan sin placa.
- **T2-08 · Un escalón a S/ 0.00 pasa como «alcanza el margen objetivo».** `apps/web/src/app/features/catalogo/costing.ts:242-258, escalera-precios.ts:127`
  - Propuesta: Exigir unitPrice > 0 en el escalón (Validators.min(0.01)) y que isBelowTarget trate un margen null con precio 0 como bajo el objetivo.
- **T3-02 · Un pesaje desde una pantalla vieja se aplica dos veces: el rollo queda con gramos que la balanza no dijo.** `apps/web/src/app/features/inventario/weigh-form.ts:120-124, apps/web/src/app/features/inventario/inventario.data.ts:606-616`
  - Propuesta: Una RPC weigh_spool(p_spool_id, p_net_g, p_gross_g, p_tare_g) que bloquee el rollo, calcule la diferencia contra el saldo vigente e inserte el ajuste, igual que count_shelf. El diálogo solo mostraría la diferencia como vista previa.
- **T3-03 · Cualquier miembro, operador incluido, puede reescribir el kardex y los trabajos cerrados por la API.** `supabase/migrations/20260929230000_foundation.sql:98-117`
  - Propuesta: En una migración nueva, un disparador BEFORE UPDATE en stock_movements que rechace los cambios de quantity, unit_cost, spool_id, inventory_item_id y type (o quitar la política UPDATE), y otro en print_jobs que congele las filas cerradas. Los roles de verdad quedan para M9.
- **T3-04 · Se cierra una impresión con piezas fraccionarias: entraron 6.5 tapas al estante y eso bloquea Contar el estante.** `apps/web/src/app/features/produccion/print-job-outputs.ts:8-10, 20261010110000_plate_outputs.sql, 20261010130000_assembly_guards.sql`
  - Propuesta: Añadir Validators.pattern(/^\d+$/) al control de piezas. En una migración nueva, rechazar en complete_print_job y en assemble_product las unidades no enteras («Las piezas salen enteras»). Arreglar a mano la tapa fraccionaria que dejaron las pruebas.
- **T3-07 · Un rollo «Agotado» con 1 kg dentro sigue sumando en Filamentos y en el plan, pero no se puede elegir; y aun así se inicia y se cierra un trabajo con él.** `supabase/migrations/20260929231000_inventory.sql:211-226, apps/web/src/app/features/inventario/filamentos.page.ts:401-404, inventario.data.ts`
  - Propuesta: En una migración nueva, filtrar en la vista los rollos empty y discarded, o mejor: al marcarlos así con gramos, ofrecer pesarlos o registrar un ajuste a 0. Avisar al iniciar o cerrar con un rollo que no está en un estado usable.
- **T3-08 · Una impresión «Cancelada» a mitad cobra máquina y luz, pero no descuenta el filamento que gastó, y su costo no llega a Resultados.** `supabase/migrations/20261019110000_other_income_in_net_profit.sql:~112, apps/web/src/app/features/produccion/print-job-close.ts:87-89`
  - Propuesta: Pedir los gramos en una cancelada con tiempo (o proponerlos en proporción al porcentaje) y registrarlos como waste. En una migración nueva, incluir en el CTE jobs las canceladas con actual_time_s y tratarlas como falla o como herramienta según tengan pedido.
- **T3-10 · El plan ignora los gramos de los trabajos sin placa: un rollo comprometido aparece como libre.** `supabase/migrations/20261017110000_custom_line_printed_like_the_queue.sql:114`
  - Propuesta: En una migración nueva: si el trabajo tiene filas en print_job_filaments, usar sus estimated_g, con el SKU del rollo, y caer en la placa solo si no las tiene (los trabajos en cola de «Por lanzar»).
- **T4-02 · Si fallan las líneas de un pedido se pierde su número, y con el operador queda un pedido sin líneas.** `apps/web/src/app/features/pedidos/pedidos.data.ts:499-548, cotizador.data.ts`
  - Propuesta: Una RPC create_order(p_order jsonb, p_lines jsonb) que pida el número, inserte el pedido y las líneas en una sola transacción. Mientras tanto, Validators.max en cantidad y precio, y comprobar el resultado del delete.
- **T4-03 · Una cotización aceptada pasa a «Rechazada» desde una pestaña vieja, y su pedido sigue vivo.** `apps/web/src/app/features/cotizador/cotizador.data.ts:1049-1052`
  - Propuesta: En una migración nueva, un disparador BEFORE UPDATE OF status en quotes que rechace salir de accepted, o tener pedido y no estar accepted. En el front, .eq('status', estadoVisto) y avisar si no cambió nada.
- **T4-04 · Doble clic en «Guardar pedido» crea dos pedidos iguales.** `apps/web/src/app/features/pedidos/pedido-nuevo.page.ts:282-292`
  - Propuesta: Poner la guardia de saving al principio de save(). Si se crea la RPC create_order, una clave de idempotencia.
- **T4-08 · Una línea a medida se entrega sin imprimir, y su trabajo queda en la cola de un pedido entregado.** `20261010140000_deliveries.sql:~77-78, apps/web/src/app/features/pedidos/pedido-entrega.ts:270, pedidos.delivery.ts:82-87`
  - Propuesta: Al entregar una línea a medida con impresiones planned o printing: avisar en la pantalla y, en la base, cancelarlas o soltarlas como hace cancel_order (o rechazar con P0001 si hay alguna imprimiendo). Que la confirmación no diga «hecha» si no hay ninguna impresión exitosa.
- **T4-09 · Una versión vieja de una cotización ya aceptada se puede marcar como enviada y separa.** `apps/web/src/app/features/cotizaciones/cotizacion.page.ts:221`
  - Propuesta: canSend = draft && !hasNewerVersion && !order. En una migración nueva, rechazar el paso a sent de una versión que no sea la última del número, o archivar la versión anterior al crear la nueva.
- **T5-01 · El libro de dinero se puede editar y borrar por API: la anulación, el sobrepago y la cuenta activa solo los cuida la pantalla.** `supabase/migrations/20260929230000_foundation.sql:98-117, supabase/migrations/20261004130000_finance.sql:599-601, apps/web/src/app/features/configuracion/categories-section.ts:37-39`
  - Propuesta: Una migración nueva. 1) drop policy transactions_delete. 2) Un disparador BEFORE UPDATE en transactions que solo deje pasar voided_at, void_reason y voided_by de null a no null, y rechace con P0001 cualquier otro cambio, incluido desanular. 3) Un disparador BEFORE INSERT que repita las reglas de record_payment y record_purchase_payment cuando hay order_id o purchase_id (pedido cancelado, sobrepago, cuenta inactiva), o pasar Caja a una RPC y revocar INSERT y UPDATE directos. 4) Que las políticas de update de transaction_categories y accounts pidan app.is_owner, para alinearlas con la pantalla, o quitar el aviso de la pantalla. Lo del operator y stock_movements queda dentro de M9.
- **T5-02 · La fecha de apertura acepta el futuro y cambiarla saca movimientos del saldo sin avisar.** `apps/web/src/app/features/finanzas/account-form.ts:52-59, supabase/migrations/20261004130000_finance.sql:36-37, supabase/migrations/20261018110000_balance_starts_at_opening.sql`
  - Propuesta: Reusar notInTheFuture de inventario/compra-form.ts:94 y poner [max] = todayLocal() en el input. Respaldarlo en la base con un disparador BEFORE INSERT OR UPDATE en accounts que rechace opening_balance_on > (now() at time zone timezone)::date con P0001 (un CHECK con now() no sirve). Al editar la fecha de una cuenta con movimientos, contar los que quedarían antes de la apertura y pedir confirmación. Redondear con roundMoney.
- **T5-05 · Anular el cobro de una venta rápida deja una deuda a nombre de «Cliente al paso».** `apps/web/src/app/features/finanzas/void-summary.ts:26-40, void-form.ts:21-24, apps/web/src/app/features/finanzas/finanzas.data.ts:363-376`
  - Propuesta: En void-form, si la fila tiene origen de pedido o compra, decir «El pedido ORD-… vuelve a deber S/ X» o «La compra vuelve a Por pagar». Para un pedido cuyo cliente es walk_in, pedir antes el cliente real o rechazarlo: con un disparador en la base al anular un income con order_id cuyo cliente sea walk_in y quede saldo, o pasando la anulación a una RPC que lo revise.
- **T5-08 · Caja acepta movimientos con fecha futura: el saldo cambia hoy y Resultados abre un mes que no ha llegado.** `apps/web/src/app/features/finanzas/transaction-draft.ts:58-60, supabase/migrations/20261004130000_finance.sql:83`
  - Propuesta: En draftProblem, rechazar fechas posteriores a ahora más un margen («Esa fecha todavía no llega»). Respaldarlo con un disparador BEFORE INSERT en transactions que rechace occurred_at > now() + interval '5 minutes' con P0001, el mismo margen de quick_sale. Así queda cubierto también record_payment.

## Menores

- **T1-05 · Dos compras simultáneas del mismo color chocan en el código del rollo y la segunda queda a medias.** `apps/web/src/app/features/inventario/inventario.data.ts:919-950`
  - Propuesta: Mover el registro de la compra y la asignación de códigos a un RPC con bloqueo (o una secuencia por prefijo). Mientras tanto, al chocar el código, decir el motivo y reintentar con el siguiente número.
- **T1-06 · La compra acepta cantidades enormes, queda «sin líneas» y no dice por qué.** `apps/web/src/app/features/inventario/compra-form.ts:605-606, compra-form.ts:243-244, inventario.data.ts:729-787`
  - Propuesta: Poner Validators.max según la precisión de la columna, corregir los textos a «Filamentos y Kardex» y, de fondo, registrar la compra en un RPC atómico.
- **T1-07 · Editar la impresora guarda el costo del activo y dice que no se guardó nada.** `apps/web/src/app/features/impresoras/impresoras.data.ts:181-201`
  - Propuesta: Guardar la impresora y su activo en un RPC, o validar max en el formulario y, si printers falla, restaurar el costo anterior del activo.
- **T1-10 · Una cuenta acepta fecha de apertura futura, y lo que pasa hoy no cambia su saldo.** `apps/web/src/app/features/finanzas/account-form.ts:111`
  - Propuesta: Poner [max]=todayLocal() y un validador de fecha no futura en el formulario, más un check en la base.
- **T1-11 · Se guardan duplicados que solo cambian en mayúsculas: canales, categorías, cuentas y filamentos.** `apps/web/src/app/features/impresoras/impresoras.data.ts:266-273`
  - Propuesta: Agregar índices únicos sobre lower(btrim(name)) en una migración nueva, después de revisar los duplicados actuales, y mapear esos nombres de restricción en friendlyError.
- **T1-12 · Se guardan un filamento sin nombre de color y un insumo sin unidad.** `apps/web/src/app/features/inventario/inventario.data.ts:524, sku-form.ts:169, item-form.ts:156`
  - Propuesta: Un validador compartido de «no solo espacios» y checks length(btrim(color_name)) > 0 y length(btrim(unit)) > 0 en una migración nueva.
- **T1-13 · El operador puede cambiar los parámetros de costo (margen, hora de trabajo) pero no el horario.** `apps/web/src/app/features/configuracion/schedule-section.ts:144`
  - Propuesta: Al definir M9 con el dueño, escribir esa regla en la política (is_owner para update de workshop_settings y, si se decide, de cost_profiles) y que la pantalla lea el rol solo para explicarlo.
- **T1-14 · Una versión programada de los parámetros no se puede quitar ni corregir.** `apps/web/src/app/features/configuracion/cost-profile-section.ts:60-73`
  - Propuesta: Permitir que el dueño borre o edite una versión con valid_from > hoy (en Lima), y rechazarlo en la base para las que ya rigen.
- **T1-16 · Con un precio de 8 decimales, la vista previa de la compra no cuadra.** `apps/web/src/app/features/inventario/compra-form.ts:387, packages/domain/src/purchase.ts:98`
  - Propuesta: Redondear unitPrice a 6 decimales, la precisión de la columna, antes de planificar y de insertar, o rechazar más de 6 decimales con un mensaje.
- **T1-18 · Números enormes dan «Inténtalo de nuevo» y nombres de solo espacios dan un error genérico.** `apps/web/src/app/core/friendly-error.ts:43-64, workshop-section.ts:105,, account-form.ts:109`
  - Propuesta: Mapear 22003 a «Uno de los números es demasiado grande» y 22P02 a «Un número no es válido», agregar Validators.max por columna y un validador de no-solo-espacios compartido.
- **T1-20 · Con una hora del horario vacía, «Guardar horario» no hace nada ni dice por qué.** `apps/web/src/app/features/configuracion/schedule-section.ts:122-123, schedule.model.ts:45-48`
  - Propuesta: Que scheduleProblem devuelva «Indica la hora …» cuando falta un campo, o mostrar [error] en cada pp-field.
- **T1-21 · Anular el mismo movimiento en dos pestañas: las dos dicen «anulado» y se pierde un motivo.** `apps/web/src/app/features/finanzas/finanzas.data.ts:363-376`
  - Propuesta: `.select('id')` y, si no vuelve ninguna fila, lanzar UserFacingError('Este movimiento ya estaba anulado.') y recargar.
- **T1-22 · El aviso de una cuenta desactivada pide mover su dinero, pero Caja no la ofrece como origen.** `apps/web/src/app/features/finanzas/cuentas.page.ts:69-70, transaction-form.ts:232`
  - Propuesta: Permitir una cuenta desactivada con saldo como origen de una transferencia, o cambiar el aviso a «reactívala, transfiere el saldo y vuelve a desactivarla».
- **T1-23 · Moneda y zona horaria se pueden cambiar, pero la app sigue en soles y en hora de Lima.** `apps/web/src/app/core/format.ts:5,21,36, apps/web/src/app/core/dates.ts:3, workshop-section.ts:40-50`
  - Propuesta: Quitar los selectores (o mostrarlos solo como lectura) hasta que la pantalla lea la moneda y la zona de CurrentWorkspace.
- **T1-24 · Textos que confunden en Compras.** `apps/web/src/app/features/inventario/form-helpers.ts:9,, compra-pago.ts:139,, compras.page.ts:222,`
  - Propuesta: Mensajes específicos: «Al menos 1 rollo», «El monto mínimo es S/ 0.01», «Se creó 1 rollo», y explicar que el reparto por peso solo considera los rollos. Además, una fecha mínima razonable para la compra.
- **T2-02 · Un doble clic, o dos pestañas, en «Crear receta» crean dos versiones activas, y lo guardado en una desaparece.** `apps/web/src/app/features/catalogo/receta-editor.ts:318, catalogo.data.ts:368-384`
  - Propuesta: Agregar `if (this.busy()) return;` y crear la receta en un RPC que la rechace si la variante ya tiene una activa (o un índice único parcial sobre variant_id where active).
- **T2-09 · Se aceptan piezas fraccionarias por corrida y por unidad.** `apps/web/src/app/features/catalogo/salida-fila.ts:86,, importar-placa.ts:23, suministro-fila.ts:136`
  - Propuesta: Validators.pattern(/^[0-9]+$/) para las salidas de placa y para las cantidades de las piezas (kind = 'part'), más un check en la base para recipe_plate_outputs.units_per_run = trunc(units_per_run).
- **T2-10 · Como operador, todos los «Quitar» y «Eliminar» del catálogo confirman y no hacen nada, sin mensaje.** `apps/web/src/app/features/catalogo/catalogo.data.ts:267-270,`
  - Propuesta: Hacer `.delete().eq(...).select('id')` y lanzar permissionError() si no vuelve ninguna fila, como impresoras.data.ts:233-235. O no mostrar el botón a quien no es dueño.
- **T2-12 · Cantidades inválidas en la receta: el botón no hace nada y no dice por qué.** `apps/web/src/app/features/catalogo/suministro-fila.ts:148-150`
  - Propuesta: Mostrar «La cantidad tiene que ser mayor que cero» cuando quantity está touched e inválida.
- **T2-13 · Desactivar una pieza que usa una receta: sin aviso, y su salida en la placa se ve vacía.** `apps/web/src/app/features/catalogo/catalogo.data.ts:404-413, salida-fila.ts:89-101`
  - Propuesta: Incluir en las opciones la pieza actual aunque esté inactiva, con el sufijo «(desactivada)», y al desactivar una pieza avisar qué recetas la usan.
- **T2-15 · Nombres duplicados en el catálogo.** `producto-nuevo.ts, variante-form.ts`
  - Propuesta: Reutilizar la normalización de la importación en el alta y la edición de variantes y piezas, e índices únicos sobre lower(btrim(name)).
- **T2-16 · Decimales en campos enteros y números fuera de rango dan errores genéricos.** `apps/web/src/app/features/catalogo/producto-nuevo.ts:73, escalera-precios.ts, placa-editor.ts:134-135`
  - Propuesta: Validators.pattern de entero y Validators.max según la columna, con mensaje por campo.
- **T2-17 · Precios y cantidades con más decimales se redondean en silencio.** `apps/web/src/app/features/catalogo/variante-form.ts, escalera-precios.ts:127`
  - Propuesta: Un validador compartido de máximo 2 decimales para soles (y 3 para cantidades), con mensaje, o redondear con roundMoney y mostrarlo.
- **T2-19 · Un nombre de solo espacios da un error que no dice cuál es el campo.** `apps/web/src/app/features/catalogo/producto-nuevo.ts:65`
  - Propuesta: Un validador de no-solo-espacios en name, para que salga el nameError() que ya existe.
- **T2-20 · Mensajes de validación que no corresponden.** `apps/web/src/app/features/catalogo/producto-nuevo.ts:99-104,, escalera-precios.ts:131-136, placa-editor.ts:67`
  - Propuesta: Limpiar error() antes de validar, y cambiar el texto de la placa a «tiempo de al menos 1 minuto».
- **T2-21 · La búsqueda del catálogo distingue tildes.** `apps/web/src/app/features/catalogo/catalogo.page.ts:155-159`
  - Propuesta: Exportar la normalización de item-picker a core y usarla en la búsqueda del catálogo.
- **T3-05 · Al cerrar como «Fallida» un trabajo que nunca se inició, el formulario propone 1000 h y 2000 g y los deja confirmar sin aviso.** `apps/web/src/app/features/produccion/print-job-close.ts:199-209`
  - Propuesta: Con «Fallida», vaciar el tiempo y los gramos o calcularlos en proporción al porcentaje completado (editables), y pedir el porcentaje antes que los gramos.
- **T3-11 · Un doble clic muy rápido en «Crear trabajo» crea dos trabajos.** `apps/web/src/app/features/produccion/print-job-form.ts:307-319`
  - Propuesta: Al principio de save(): if (this.saving()) return. Revisar el patrón en todos los submit (cobro, pedido, cliente rápido, cierre).
- **T3-12 · El aviso del plan llama «placa» a la impresora en los trabajos sueltos.** `packages/domain/src/plan.ts:430-438`
  - Propuesta: Añadir 'label' a cada job en planning_snapshot (migración nueva) y a PlanJob, y usarlo en jobName antes de caer en la impresora (o en «Trabajo sin nombre»).
- **T3-13 · Un «Qué se imprime» largo sin espacios estira la página a 25 572 px.** `apps/web/src/app/features/produccion/print-job-form.ts, apps/web/src/app/features/produccion/print-job-card.ts:139`
  - Propuesta: Validators.maxLength(200) en la etiqueta y overflow-wrap: anywhere en el título de la tarjeta y del historial (o como regla global para los títulos).
- **T3-14 · Con números enormes sale un error genérico que invita a reintentar.** `apps/web/src/app/core/friendly-error.ts:56-63, apps/web/src/app/features/pedidos/pedidos.errors.ts`
  - Propuesta: Mapear el 22003 a «Ese número es demasiado grande. Revísalo.» en friendlyError y en explainError, y poner Validators.max razonables en minutos y conteos.
- **T3-15 · En Armar, el campo y el botón dicen cantidades distintas.** `apps/web/src/app/features/inventario/armar.page.ts:279-286`
  - Propuesta: Guardar el texto crudo, validar que sea un entero ≥ 1, mostrar «Escribe un número entero mayor que cero» y deshabilitar Armar mientras no lo sea, sin reemplazar el valor en silencio.
- **T3-16 · Después de un rechazo de la base, las pantallas se quedan con datos viejos y se contradicen.** `apps/web/src/app/features/inventario/armar.page.ts:334-336, apps/web/src/app/features/produccion/print-job-close.ts:313-315`
  - Propuesta: En el catch, recargar las opciones y el plan (y volver a elegir la variante). En el cierre, emitir un evento para que la cola recargue cuando el error es un P0001 de estado.
- **T3-17 · Textos: «1 unidades», y nombres de placa cortados a «M…».** `20261010130000_assembly_guards.sql:81, apps/web/src/app/ui/item-picker.ts:160`
  - Propuesta: En una migración nueva, concordar con unidad/unidades. En item-picker, dar al grupo flex: 0 1 auto con su propio ellipsis y un ancho mínimo para la etiqueta, o poner el grupo en una segunda línea.
- **T3-18 · Los gramos se redondean distinto en el trabajo (50.13) y en el kardex (−50.126).**
  - Propuesta: En una migración nueva, redondear v_grams a 2 decimales antes de usarlo, o limitar el input a step 0.01 con un validador.
- **T4-05 · Una deuda queda a nombre de un cliente nuevo llamado «cliente al paso».** `apps/web/src/app/features/pedidos/quick-sale.ts:343-353, 20261019100000_quick_sale.sql:~325`
  - Propuesta: Si el nombre escrito coincide (con nameKey) con el del cliente genérico, decir «Ese es el cliente genérico: una deuda necesita el nombre de quien te debe». Opcionalmente, rechazarlo también en quick_sale.
- **T4-06 · Un cobro de pedido acepta fecha futura: entra hoy al saldo y crea un mes 2027 en Resultados.** `20261004130000_finance.sql:480-570, apps/web/src/app/features/pedidos/pedido-cobro.ts:148`
  - Propuesta: En una migración nueva, que record_payment (y el insert de transactions de la Caja) rechace occurred_at > now() + un margen pequeño con el mismo texto que quick_sale, y que el formulario lo valide.
- **T4-10 · Clientes repetidos sin aviso: Cotizador, Nuevo pedido y doble clic en «Crear y elegir».** `apps/web/src/app/features/pedidos/pedido-nuevo.page.ts:262-267, apps/web/src/app/features/cotizador/cliente-rapido.ts:72`
  - Propuesta: Poner if (this.quickBusy()) return, usar el patrón NOT_BLANK en el nombre y reutilizar sameCustomer para ofrecer «Ya tienes a …» en el Cotizador y en Nuevo pedido.
- **T4-11 · Por cobrar calcula el atraso con el día UTC: después de las 19:00 en Lima, lo que vence hoy sale atrasado.** `20261004130000_finance.sql:375-376,`
  - Propuesta: En una migración nueva, recrear la vista con (now() at time zone w.timezone)::date en lugar de current_date, uniéndola con workspaces.
- **T4-12 · Hoy marca «Atrasado» todo lo que falta cobrar, y Por cobrar dice «Al día».** `apps/web/src/app/features/panel/panel.data.ts:398-418`
  - Propuesta: Leer receivables.days_overdue (después de arreglar T4-11) y usar 'late' solo si es > 0, y una urgencia normal («Por cobrar») en otro caso.
- **T4-13 · El Cotizador cotiza 2.5 unidades como 3 sin avisar.** `apps/web/src/app/features/cotizador/cotizador.page.ts:137, apps/web/src/app/features/cotizador/quote-model.ts:221`
  - Propuesta: Añadir Validators.pattern(/^\d+$/) con el mensaje «Escribe un número entero», como Nuevo pedido, y decir por qué se deshabilita «Agregar».
- **T4-14 · Un precio por debajo del costo se cotiza sin aviso, y los descuentos se recortan en silencio.** `apps/web/src/app/features/cotizador/cotizador.page.ts:52-55, cotizador.page.html`
  - Propuesta: Mostrar el mismo banner cuando el precio < costo en cualquier línea, y validar los rangos con un mensaje (0–90 %, vigencia ≥ 1) en lugar de recortar en silencio.
- **T4-15 · El mensaje de cobro muestra «S/ #########.##» con montos grandes.** `20261004130000_finance.sql:539-542`
  - Propuesta: En una migración nueva, usar 'FM999999999990.00' o round(x, 2)::text, y añadir un tope de monto en el formulario.
- **T4-16 · Nuevo pedido crea una venta de S/ 0, y su ficha dice «Sin cobrar» y «cobrado por completo» a la vez.** `apps/web/src/app/features/pedidos/pedido-linea.ts:43, apps/web/src/app/features/pedidos/pedido-cobro.ts:54`
  - Propuesta: En Nuevo pedido de venta, rechazar el total 0 con el mismo texto que la Venta rápida (y en la base, en el insert de orders con purpose sale). En la ficha, para total 0 no decir «cobrado».
- **T4-17 · La entrega deja pedir «Entregar 5» de 3 pendientes, y 1.5, hasta que la base lo rechaza.** `apps/web/src/app/features/pedidos/pedido-entrega.ts:80`
  - Propuesta: Validators.max(line.pending) y un patrón de entero en cada control de cantidad, y no dejar llegar a «Entregar» con valores inválidos.
- **T4-18 · Al vencer el separo, la tarjeta Situación sigue diciendo que separa.** `apps/web/src/app/features/cotizaciones/cotizacion-situacion.ts, cotizacion-separo.ts:123-129`
  - Propuesta: Compartir el reloj (por ejemplo un servicio o un input now desde la página) o hacer que la página recargue la situación cuando venza el separo.
- **T4-19 · Nuevo pedido ofrece vender la herramienta inactiva «Molde de calavera».** `apps/web/src/app/features/pedidos/pedidos.data.ts:471-483`
  - Propuesta: Filtrar variant.active (llevando active en la consulta de workshop.ts:80) y, si ya existe esa marca, excluir también las herramientas.
- **T4-21 · Textos que confunden.** `apps/web/src/app/features/pedidos/quick-sale.ts:296, apps/web/src/app/features/cotizador/desglose.ts:160-162, supabase/migrations/20261017100000_cancel_order_with_its_prints.sql:177-210`
  - Propuesta: (1) Separar los casos null y < 0 («El precio no puede ser negativo»). (2) Mostrar el redondeo solo si roundingStep > 0. (3) En una migración nueva, al principio de cancel_order: si ya está cancelado, decir «El pedido ya estaba cancelado» (o devolverlo sin error).
- **T5-03 · Caja registra movimientos en una cuenta desactivada desde una pestaña vieja.** `supabase/migrations/20261004130000_finance.sql:69-140, apps/web/src/app/features/finanzas/transaction-form.ts:232, apps/web/src/app/features/finanzas/finanzas.data.ts:339-356`
  - Propuesta: Un disparador BEFORE INSERT en transactions que rechace con P0001 «La cuenta X está desactivada.» si account_id o counter_account_id está inactiva. Antes hay que decidir junto con T5-12 si una transferencia de salida puede vaciar una cuenta desactivada; si puede, esa sería la única excepción.
- **T5-04 · Una transferencia, un egreso o un retiro mayor que el saldo deja la cuenta en negativo sin ningún aviso.** `apps/web/src/app/features/finanzas/transaction-draft.ts:129-147, apps/web/src/app/features/finanzas/transaction-form.ts:153-176`
  - Propuesta: Agregar a BalancePreview un campo goesNegative (after < 0 && before >= 0) y mostrar un alert-warn del tipo «Yape quedaría en −S/ 800: ¿falta registrar un ingreso?» para cuentas cash y wallet, sin bloquear el guardado.
- **T5-06 · Un «Ingreso» con la categoría «Aporte del dueño» suma a la utilidad, sin ningún aviso.** `apps/web/src/app/features/finanzas/finanzas.models.ts:89-96, apps/web/src/app/features/finanzas/transaction-form.ts:245-249, payment-form.ts:151`
  - Propuesta: Una advertencia análoga a saysSale para nombres de capital (aporte, capital, retiro) en el tipo Ingreso y en el cobro de un pedido, con un enlace para cambiar el tipo a «Aporte del dueño». Una solución más de fondo sería marcar la categoría como de capital, pero esa decisión le corresponde al dueño.
- **T5-07 · Desactivar «Venta de productos» anota todos los cobros de pedidos como «Aporte del dueño».** `supabase/migrations/20261015120000_default_payment_categories.sql:44-77, apps/web/src/app/features/configuracion/categories-section.ts`
  - Propuesta: Al desactivar la categoría elegida para cobros o pagos en workshop_settings, avisar y pedir otra. Cuando el dueño eligió una y quedó inactiva, quizá mejor dejar el cobro sin categoría en vez de usar la única que quede. Si se marcan las categorías de capital (ver T5-06), excluirlas del respaldo.
- **T5-09 · Editar una cuenta desde una pestaña vieja la reactiva sin decirlo.** `apps/web/src/app/features/finanzas/account-form.ts:137-145, apps/web/src/app/features/finanzas/finanzas.data.ts:184-199`
  - Propuesta: Mandar solo los campos modificados (dirty), o sacar active del formulario de edición, porque ya existe el botón Activar/Desactivar. Para lo demás, concurrencia optimista con .eq('updated_at', leído): si no cambia ninguna fila, avisar que la cuenta cambió en otro lado.
- **T5-10 · Anular en dos pestañas: la segunda dice «Movimiento anulado» y descarta su motivo.** `apps/web/src/app/features/finanzas/finanzas.data.ts:363-376, apps/web/src/app/features/finanzas/void-form.ts:75-76`
  - Propuesta: Agregar .select('id') y, si devuelve 0 filas, leer el movimiento y lanzar un UserFacingError «Este movimiento ya estaba anulado (motivo: …)».
- **T5-11 · Errores genéricos: el monto enorme y el nombre en blanco no dicen qué está mal, y el error no se va.** `apps/web/src/app/core/friendly-error.ts:56-64, apps/web/src/app/features/finanzas/account-form.ts:108, apps/web/src/app/features/finanzas/transaction-form.ts:304-318`
  - Propuesta: Mapear 22003 a «El monto es demasiado grande (máximo S/ 9,999,999,999.99).». Usar un validador que recorte espacios (o Validators.pattern(/\S/)) en el nombre. Validar un máximo en los inputs de monto. Limpiar failure en form.valueChanges.
- **T5-12 · Cuentas dice «muevas ese dinero a otra cuenta», pero Caja no ofrece las cuentas desactivadas.** `apps/web/src/app/features/finanzas/cuentas.page.ts:67-72, apps/web/src/app/features/finanzas/transaction-form.ts:232`
  - Propuesta: Una de dos: ofrecer las cuentas inactivas con saldo solo como origen de una transferencia (y que el disparador de T5-03 lo permita), o cambiar el aviso a «reactívala, transfiere el saldo y vuelve a desactivarla». En el confirm, mencionar el saldo actual de la cuenta.
- **T5-14 · El formulario de anular se abre arriba de la página, fuera de la vista.** `apps/web/src/app/features/finanzas/movimientos.page.ts:53-57`
  - Propuesta: Después de abrir el formulario, llevarlo a la vista con afterNextRender, o abrir el formulario de anular en una fila debajo de la seleccionada; igual con «Registrar movimiento» si la página ya bajó.

## Descartados por el revisor

- T1-03 · El saldo de apertura se puede reescribir en cualquier momento, por cualquier miembro y sin rastro. *Editar el saldo de apertura es parte del diseño.*
- T1-17 · El costo de los insumos se redondea a 4 decimales aunque la compra guarda 6. *Los 4 decimales fueron una decisión consciente.*
- T1-19 · Una caja de efectivo acepta saldo de apertura negativo. *La app no impone saldo no negativo en ninguna parte: no hay check en accounts, Caja no avisa si una cuenta queda en negativo, y la misma prueba muestra «Efectivo · -S/ 50.13».*
- T2-03 · La importación no es atómica: recargar o ir «Atrás» a mitad del guardado deja placas a medias, sin aviso. *Que la importación no sea atómica es una decisión documentada en el propio código (catalogo.data.ts:505-515): «Si algo falla a medio camino, lo ya creado se queda: son placas visibles y borrables… El error dice en cuál se quedó».*
- T2-04 · Volver a importar el mismo archivo duplica placas sin aviso y el costo sube. *La app hace exactamente lo que se le pide: importar una placa otra vez la agrega, y la receta la muestra y la cobra.*
- T2-11 · Se guarda una cotización «Sin cliente», contra la regla del dueño. *La cotización sin cliente es parte del diseño: el cotizador ofrece «Sin cliente todavía», y al aceptar se pide el cliente (cotizacion-aceptar.ts:69: «La cotización se hizo sin cliente, y un pedido de venta lo necesita»).*
- T2-14 · Dos pestañas sobre la misma receta: la segunda pisa lo que guardó la primera. *Es el «último en guardar gana», como en todos los formularios de edición de la app (cuentas, productos, impresoras).*
- T2-18 · Una escalera desordenada se guarda sin aviso. *Nada en el dominio ni en la documentación exige que la escalera baje de forma monótona.*
- T3-06 · El cierre deja un rollo en negativo sin avisar. *El saldo de un rollo es teórico por diseño (docs/02-dominio.md: peso «teórico y pesado», con pesaje mensual para conciliar).*
- T3-09 · Se acepta un tiempo real absurdo (1000 h para una placa de 3 h 28 min) sin ningún aviso. *La app acepta lo que la persona escribe y la confirmación lo repite («con 60000 min de máquina y luz»).*
- T3-19 · Un conteo en dos pestañas registra otra diferencia que la que mostró, sin avisar, y se guarda sin confirmación. *Un conteo dice cuánto hay, y count_shelf calcula la diferencia contra el saldo al guardar (ADR-020, punto 10).*
- T4-07 · «Entregar» saca del estante lo separado para otro pedido, con solo un aviso suave. *Es deliberado.*
- T4-20 · Las fechas no tienen límite hacia atrás: venta antes de que existiera el producto, y cobro antes del pedido. *Fechar en el pasado es una función buscada («Fue otro día»), y el dueño acaba de decir que tiene ventas anteriores sin registrar, así que va a necesitar cargar fechas pasadas.*
- T5-13 · Los totales de Caja cuentan lo anterior a la apertura sin decirlo, y el Neto no cuadra con Cuentas. *Las cifras son ciertas: Entradas 29 incluye el cobro de S/ 5 por Yape del 06/10, anterior a la apertura del 07/10, y Cuentas cambió −201 frente al Neto de −196.*

## Datos que dejó la prueba

Todo está en la base local de prueba, que se vuelve a borrar antes de la próxima pasada. Lo que creó y deshizo cada etapa está en el resultado del workflow `tercera-pasada-adversarial`.
