# Venta y cobro — ronda 1

## En cinco líneas

1. **Entre el WhatsApp y la plata, el sistema olvida todo en cada pantalla.** Para cerrar "10 pociones para el sábado, te yapeo la mitad" por el camino completo (trato, cotización, pedido, cobro), la persona hace 17 entradas para 6 datos en 8 pantallas. El cliente se escribe o se elige seis veces, y el producto, la cantidad, el precio y la fecha se escriben dos veces cada uno. Si se salta el trato y la cotización, son unas 8. El sistema premia no usar el embudo comercial.
2. **"Aceptada" es un botón que no hace nada**, y a veces el pedido ni siquiera se puede volver a escribir. Una línea a medida no cabe en un pedido (`pedido-linea.ts:21` exige una variante del catálogo), y el pedido no se puede editar después de guardarlo.
3. **El mismo producto tiene dos precios según la pantalla.** El cotizador ignora la escalera del catálogo y calcula desde el costo. Con los datos locales de hoy, una poción sale S/ 17.00 cotizada y S/ 10.00 en el pedido. Diez salen S/ 10.50 y S/ 8.50.
4. **Nadie le dice al vendedor cuántas hay, qué falta ni para cuándo estaría.** Ni el cotizador ni el pedido nuevo lo dicen, y la cotización no tiene ningún campo de plazo. Abajo va el diseño completo: qué muestra cada línea, cómo sale la fecha que se promete y qué pasa con una proforma vieja. El sistema informa y nunca bloquea.
5. **El adelanto no tiene dónde caer antes del pedido**, "Esperando adelanto" es texto suelto y "Por cobrar" solo ve lo ya entregado. Además, cancelar un pedido que ya tenía adelanto saca ese dinero de Resultados: sigue en Caja, pero no aparece en ninguna línea.

## Hallazgos

### H1. "El cliente aceptó… ¿y ahora tengo que escribir todo otra vez?"

- **Qué pasa:**
  - **Aceptar solo cambia una palabra.** `CotizacionPage.apply()` (`cotizacion.page.ts:220-238`) llama a `setStatus` (`cotizador.data.ts:929-932`), que hace `update quotes set status`. No crea el pedido, no ofrece crearlo y no enlaza a ningún sitio.
  - **No se puede aceptar un borrador.** El botón "Aceptada" solo aparece si la cotización está en `sent` (`cotizacion.page.ts:166`). Si el cliente dice "sí" en el mismo chat, son tres clics: *Marcar como enviada*, *Aceptada* y *Sí, confirmar*.
  - **El pedido nuevo no conoce la cotización.** `createOrder` (`pedidos.data.ts:375-424`) no escribe `quote_id`, `opportunity_id` ni `channel_id`, y cada línea va sin `quote_line_id`, aunque las cuatro columnas existen (`\d orders`, `\d order_lines`).
  - **Una pieza a medida no cabe en un pedido.** `createOrderLineForm` exige `variantId` (`pedido-linea.ts:21`), y el error dice *"Elige una variante del catálogo."* (`:163`). Una cotización que mezcla catálogo y piezas a medida no se puede pasar a pedido, ni siquiera a mano.
  - **El precio propuesto no es el aceptado.** La línea del pedido propone el precio de la escalera (`pedidos.data.ts:362-369`, `price_for_quantity`), no el de la cotización. Ver H2.
  - **El pedido no se corrige.** No hay ningún `update` de `orders` ni de `order_lines` salvo el estado (grep en `features/pedidos`). Si el cliente cambia la cantidad o la fecha, no hay cómo reflejarlo.
  - **Corregir un borrador lo versiona.** "Crear versión nueva" aparece en cualquier estado (`cotizacion.page.html:42-44`), así que arreglar una errata en un borrador que nunca salió genera la v2.
  - **El recorrido contado.** "Hola, ¿cuánto me salen 10 pociones con dulces para el sábado 17? Te yapeo la mitad", con un cliente nuevo y por el camino completo:

    | # | Pantalla | Qué hace la persona | Dato repetido |
    |---|---|---|---|
    | 1 | Clientes → Nuevo cliente | nombre y teléfono | cliente (1) |
    | 2 | Oportunidades → Nuevo trato | título; elige el cliente; en "Esperando algo" escribe "adelanto 50 %" | cliente (2), adelanto (1) |
    | 3 | Cotizador | elige la variante en un `select` sin foto y escribe la cantidad. Aparecen "Botella impresa" y "Tapa impresa" en rojo con *"sin costo registrado: escríbelo a mano"* (ver H2). Pulsa Agregar, vuelve a elegir el cliente y escribe "para el sábado 17" en la nota, porque no hay campo de fecha | producto (1), cantidad (1), cliente (3), fecha (1) |
    | 4 | Cotización | Descargar PDF, adjuntarlo a mano en WhatsApp, Marcar como enviada, Aceptada, Sí, confirmar | — |
    | 5 | Oportunidades → ficha | "Enganchar una cotización suelta" en un `select` de hasta 50 cotizaciones **de todos los clientes** (`oportunidades.data.ts:235-250`) | cliente (4) |
    | 6 | Pedidos → Nuevo pedido | elige el cliente, la fecha, la variante y la cantidad, y corrige el precio que propone la escalera | cliente (5), fecha (2), producto (2), cantidad (2), precio (2) |
    | 7 | Oportunidades → ficha | "Enganchar un pedido suelto" | cliente (6) |
    | 8 | Pedido → Cobro | elige la cuenta, **reemplaza** el monto (propone el saldo completo, `pedido-cobro.ts:157-160`) por la mitad y escribe la referencia | adelanto (2) |
    | 9 | Oportunidades → Editar trato | borra "adelanto 50 %": nada lo limpia solo | adelanto (3) |

    **En total, 17 entradas para 6 datos en 8 pantallas.** El atajo (Nuevo pedido con "Crear cliente rápido", luego el cobro) son unas 8 entradas en 2 pantallas. La aplicación cobra el doble por usar el embudo que ADR-015 quería que se usara.
- **Qué tarea traba:** el vendedor quiere pasar de "el cliente dijo que sí" a "pedido en marcha con su adelanto". Hoy tiene que volver a escribir el pedido, enganchar cosas entre pantallas y acordarse de que el precio aceptado era otro. Con una pieza a medida, directamente no puede.
- **Cómo lo resuelven otros:**
  - **MRPeasy:** la cotización y el pedido son el mismo documento, que pasa de *Quotation* a *Confirmed* ([demo de CRM](https://www.mrpeasy.com/demo-videos/customer-relationship-management)).
  - **Zoho Invoice:** *Mark as Accepted* a mano en un clic, y la conversión deja el documento siguiente ya lleno ([aceptar](https://zstatic.zohostatic.com/invoice/help/estimate/estimate-accept.md); en Zoho Books, la orden de venta queda "autoplena", según [su ayuda](https://www.zoho.com/es-mx/books/help/sales-order/)).
  - **Shopify:** el borrador de pedido se convierte en pedido con cliente, productos, precios y descuentos, y se marca pagado o *payment due later* ([draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)).
  - **Alegra:** "crear la cotización y convertirla en factura al aprobarse", sin volver a digitar ([blog de Alegra](https://blog.alegra.com/costa-rica/lleva-el-control-de-tu-negocio-desde-una-app-movil/)).
  - **AMFG:** pasa de la cotización ganada a la orden de trabajo sin reingresar datos, según su página de producto ([amfg.ai](https://amfg.ai/contract-manufacturing)). Solo vi la página comercial, no la documentación.
- **Propuesta: un solo paso, "El cliente aceptó".** Es un botón en la cotización, disponible desde el borrador (aceptar implica enviada). Abre un panel en la misma pantalla, ya lleno:
  1. **Cliente.** Sale de la cotización. Si no tenía, se crea ahí mismo con nombre y teléfono, porque una venta lo exige (`orders_sale_needs_customer`).
  2. **Líneas.** Se copian de `quote_lines` con su `quote_line_id`, su descripción, su cantidad y el **precio congelado**. Las líneas de catálogo llevan `variant_id`. Las líneas a medida van **sin variante**: `order_lines.variant_id` ya admite nulo, y lo que hay que imprimir se lee de `quote_lines.plates`, que ya guarda placas, gramos y tiempos.
  3. **Fecha de entrega propuesta.** Sale del cálculo de H3, recalculado hoy, y se puede editar.
  4. **"¿Te pagó algo ya?"** Botones de 0 %, 50 % (o el % que pedía la cotización, ver H4) y 100 %, la cuenta como cuatro botones (Yape, Plin, Efectivo, Banco) y una referencia opcional.
  5. **Al confirmar, todo pasa en una sola transacción** con una función de base `accept_quote`. Marca esta versión `accepted`. Crea el pedido con `quote_id`, `opportunity_id`, `channel_id` y su número. Si hubo adelanto, llama a `record_payment`, que ya rechaza el sobrepago. Devuelve el id, y la pantalla salta al pedido.
  - **Varias versiones.** Solo una versión por número puede quedar aceptada: lo garantiza un índice único parcial `(workspace_id, number) where status = 'accepted'`. Las demás se leen como "reemplazada por vN" (se puede derivar de `hasNewerVersion`, sin estado nuevo). Si el cliente acepta una versión vieja, se acepta esa, y las otras quedan reemplazadas.
  - **"Nuevo pedido" usa el mismo panel**, sin cotización detrás, para la venta de mostrador. Admite líneas a medida y un adelanto, y el pedido pasa a ser editable (líneas, fecha y nota) mientras no haya entrado a producción.
- **Tamaño:** L. La función de base, el panel y las líneas sin variante en el pedido son M. Que producción imprima una línea a medida leyendo sus placas de la cotización es otra M.
- **Gravedad:** bloquea.

### H2. "¿Por qué la cotización dice S/ 17 y el pedido S/ 10?"

- **Qué pasa:**
  - **El cotizador carga la escalera y no la usa.** Lee `list_price` y `price_tiers` de cada variante (`cotizador.data.ts:52-57` y `:575-603`), pero ningún archivo del cotizador lee `listPrice` ni `tiers`: el grep en `features/` solo los encuentra en el catálogo y en el pedido. El precio sale siempre de `calculateLine` (`quote-model.ts:217-243`): costo de producir el lote desde cero dividido entre `1 − margen`.
  - **Calculado con `packages/domain` y la receta local de "Con dulces surtidos"** (botella a 1 por corrida y 43 min, tapas a 9 por corrida y 20 min, dulces S/ 0.03 por gramo × 66, bolsa S/ 0.52, margen del 50 %):

    | Unidades | Cotizador | Escalera (pedido nuevo) |
    |---|---|---|
    | 1 | S/ 17.00 | S/ 10.00 |
    | 3 | S/ 12.00 | S/ 10.00 |
    | 5 | S/ 11.00 | S/ 9.00 |
    | 10 | S/ 10.50 | S/ 8.50 |

    Una poción sale más cara cotizada porque la cotización paga una placa entera de nueve tapas para una botella, aunque haya tapas en el estante. La escalera existe justo para no hacer eso (`packages/domain/src/tiers.ts:3-8`). Las cotizaciones sembradas (`COT-0001`, `COT-0003`) dicen S/ 8.50 porque la semilla las escribió así, no porque el cotizador las calculara.
  - **Las piezas impresas aparecen como insumos a S/ 0, en rojo.** `recipeFor` mete los `recipe_items` de la receta como insumos (`cotizador.data.ts:714-724`), piezas incluidas. Una pieza no tiene costo en `inventory_item_costs` (consulta: "Botella impresa" y "Tapa impresa" tienen `cost_source = unknown`), así que se ven con *"sin costo registrado: escríbelo a mano"* (`cotizador.page.html:306-308`). Pero sus placas **ya se costearon** en "Placas del lote". Quien obedece el aviso cuenta la botella dos veces.
  - **Una variante sin placas no se puede cotizar.** `canAddLine` exige placas (`cotizador.page.ts:295-304`). "Con chocolates premium" tiene receta, pero sin placas ni componentes (consulta a `recipes` y `recipe_plates`). Elegirla deja el botón "Agregar a la cotización" apagado para siempre.
- **Qué tarea traba:** el dueño quiere cotizar 10 pociones de catálogo con los precios que ya decidió. Tiene que cargar placas e insumos, desconfiar de dos avisos rojos y corregir el precio a mano para que coincida con el que pondrá en el pedido.
- **Cómo lo resuelven otros:**
  - **Pipedrive:** el producto que se agrega a un trato trae el precio guardado en el producto, que se puede cambiar solo para ese trato ([vincular productos](https://support.pipedrive.com/en/article/how-can-i-link-products-to-a-deal)).
  - **HubSpot:** las líneas de una cotización salen de productos con precio fijo o escalonado ([crear cotizaciones](https://knowledge.hubspot.com/quotes/create-and-send-quotes)).
  - Ninguno recalcula desde el costo para algo que ya tiene precio de lista.
- **Propuesta:**
  1. **Una línea de catálogo se cotiza con dos campos**: producto (por su foto) y cantidad. Su precio sale de `price_for_quantity`, la misma regla que usa el pedido. Al lado se ven el costo y el margen que deja ("a S/ 8.50 el margen es 50 %"), y el precio se puede ajustar a mano. Las placas y los insumos quedan plegados en "De qué está hecho".
  2. **El cálculo desde el costo queda para lo que no tiene precio**: piezas a medida y variantes sin escalera.
  3. **Las piezas no se cargan como insumos.** O se excluyen de `recipeFor` cuando sus placas ya están, o se costean como manda ADR-016. Esto lo tiene que decidir quien mira el catálogo.
- **Tamaño:** M.
- **Gravedad:** bloquea. Una cotización que el cliente ve con un precio y el pedido con otro es dinero o confianza perdidos.

### H3. "¿Para cuándo se lo prometo?" Nadie lo sabe

- **Qué pasa:**
  - **La cotización no tiene ningún campo de plazo ni de fecha.** `quotes` no tiene columna de entrega (`\d quotes`). El formulario pide cliente, vigencia y nota (`cotizador.page.html:449-474`). El PDF no dice nada del plazo (`quote-document.ts:87-95`).
  - **El pedido tiene `due_date`, opcional y escrito a mano** (`pedido-nuevo.page.ts:88-90`). Después de guardar ya no se puede cambiar (H1). Un pedido sin fecha nunca aparece en "Lo que vence" (`panel.data.ts:228-235` filtra `due_date is not null`).
  - **El cotizador solo compara gramos contra el stock en mano.** `shortStock` (`cotizador.page.ts:281-289`) no mira las piezas armadas, las piezas sueltas, los dulces, el empaque, lo que ya prometieron otros pedidos ni la cola. El pedido nuevo no mira nada: `pedido-linea.ts` solo pide precio y costo.
  - **Los datos para responder ya existen, cada uno por su lado:**
    - `assembly_options` (armadas y armables, `20261009170000_assembly_views.sql:13-44`).
    - `assembly_components` (cada componente con su stock).
    - `filament_sku_stock.available_g`.
    - `production_needs` (lo comprometido en pedidos abiertos menos lo armado; hoy: 41 comprometidas, 10 armadas, 31 faltan).
    - `recipe_plates` (`units_per_run`, `print_time_s`, `produces_item_id`).
    - `print_jobs.estimated_time_s` de lo que está en cola.
    - `printers.expected_hours_per_year` (2000, unas 5.5 horas al día).
- **Qué tarea traba:** con la aclaración del dueño, esta es la tarea central de la venta. "Me piden 10, tengo 4 armadas: ¿alcanza el material para el resto, y para cuándo estaría?" Hoy la respuesta está repartida en cuatro pantallas de Inventario y Producción, y sin la cola.
- **Cómo lo resuelven otros:**
  - **Katana:** cada línea de una orden de venta dice *In stock*, *Expected* (con la fecha de la orden de fabricación o de compra que la cubre) o *Not available*. Aparte dice lo mismo de los ingredientes. El stock que ya tomaron órdenes de mayor prioridad no se ofrece dos veces ([sales item availability](https://support.katanamrp.com/en/articles/5914289-sales-item-availability)).
  - **MRPeasy:** al estimar, calcula "the earliest product availability date" con el stock y la producción ([demo de CRM](https://www.mrpeasy.com/demo-videos/customer-relationship-management)).
  - **Shopify:** un borrador **no** aparta stock salvo que se pulse *Reserve items*, y esa reserva vence en una fecha que se elige ([draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)).
  - **Craftcloud:** muestra el precio junto al plazo de entrega de cada oferta ([all3dp](https://all3dp.com/1/craftcloud-by-all3dp-simply-explained/)). Esto lo vi en reseñas, no en su documentación.
- **Propuesta: el bloque "¿Para cuándo?", igual en el cotizador, en el pedido nuevo y en el panel de aceptar.** Va debajo de la cantidad de cada línea, se recalcula al cambiarla y **nunca apaga ningún botón**. Ejemplo para 10 pociones (números ilustrativos):

  ```
  Pediste 10
  [verde]  4 armadas en el estante · se entregan hoy
  [ámbar]  6 por fabricar · hay piezas para 2 · imprimir 4 botellas y 1 placa de tapas (3 h 20 min)
  [rojo]   Falta: dulces surtidos 120 g (hay 240 libres, se necesitan 360)
           Filamento rojo alcanza (necesita 23 g, hay 910 g libres)
  [reloj]  Estaría el jue 8 oct · 3 h 20 min de esta venta + 5 h de lo que ya está prometido · 5.5 h de impresión al día
  ```

  - **"Libres" quiere decir en mano menos lo comprometido.** Lo comprometido sale de los pedidos abiertos (de `confirmed` a `ready`) por orden de fecha de entrega, explotados por receta. **Recomiendo derivarlo y no escribir reservas.** Es la regla de la casa (ADR-014: lo que se puede calcular no se guarda): un pedido entregado o cancelado deja de comprometer solo, sin que nadie se acuerde de "liberar". Hoy los movimientos `reservation` y `release` existen y nadie los escribe (segundo corte). Derivarlo evita estrenarlos con su problema de siempre, la reserva olvidada. Lo llevo a la ronda 2 para contrastarlo con quien mira la producción.
  - **Una cotización no compromete nada**, igual que un borrador de Shopify sin *Reserve items*. Solo el pedido compromete.
  - **Una línea a medida no tiene "armadas".** Dice cuántas corridas son, cuántas horas, si alcanza cada filamento y para cuándo estaría.
  - **El cálculo vive en un solo sitio**, una función de base (`app.promise_for(lines, exclude_order)`), como el dinero vive en `packages/domain`. Así el cotizador, el pedido nuevo, el panel de aceptar y producción dan el mismo número.
- **La fecha que se promete:**
  - **En la cotización y el PDF va un plazo relativo**: "Entrega: 2 días desde que confirmes". La fecha absoluta depende de cuándo acepte el cliente, y un PDF que promete "jueves 8" y se acepta el lunes 12 miente.
  - **En el pedido va la fecha absoluta.** Al aceptar se propone hoy más el plazo recalculado, y se puede editar. Si el vendedor promete antes de lo que da el taller, se le avisa ("el taller da jue 8; prometiste mié 7") y se guarda igual.
  - **La fecha del pedido se puede mover después**, con motivo, igual que el retroceso de estado. Hoy no se puede.
- **La proforma vieja que se acepta cuando el stock ya cambió:**
  - **La disponibilidad del día en que se cotizó queda guardada** dentro de `cost_profile_snapshot`, que ya es `jsonb`: armadas, faltantes y plazo. No hace falta columna nueva.
  - **Al aceptar, el panel compara "cuando cotizaste" con "hoy"**: "6 oct: 4 armadas, entrega inmediata · Hoy: 1 armada, 9 por fabricar, falta dulce, ~3 días". Propone la fecha de hoy, no la vieja.
  - **El precio se respeta** si la cotización está vigente. Si venció, se ven los dos: "Cotizado S/ 85.00 · con los precios de hoy S/ 92.00". Hay dos botones, *Respetar S/ 85* y *Crear versión con S/ 92*, y decide el vendedor.
- **Tamaño:** L. Depende de M5 y de cómo se cuente lo comprometido.
- **Gravedad:** bloquea, según la aclaración del dueño.

### H4. "Me yapeó la mitad… ¿dónde lo anoto?"

- **Qué pasa:**
  - **Antes del pedido, el adelanto no tiene dónde caer.** `transactions` solo se liga a un pedido (`order_id`), y `record_payment` exige uno (`20261004130000_finance.sql:480-515`).
  - **"Esperando adelanto" es texto libre**: `blocked_reason` en `oportunidad-form.ts:49-54`. Nada lo pone ni lo quita al cobrar. El trato sembrado "Pedido grande de Diego" está en *Negociando* con *"Esperando el adelanto del 50 %"* y sin pedido (consulta a `opportunity_board`). Si Diego paga hoy, no hay dónde registrarlo hasta crear el pedido, y después alguien tiene que acordarse de borrar el texto.
  - **El cobro del pedido no ayuda con el adelanto.** Propone siempre el saldo completo (`pedido-cobro.ts:157-160`) y no muestra los cobros uno por uno: solo "Último cobro: fecha" (`:29-31`). No se lee "adelanto 12/09 por transferencia, saldo 19/09".
  - **Cancelar un pedido con adelanto hace desaparecer el dinero.**
    - El botón "Sí, cancelar pedido" no dice nada del dinero (`pedido.page.ts:83-88`).
    - Después, `record_payment` rechaza cualquier movimiento (`finance.sql:514-515`).
    - Ninguna pantalla deja registrar una devolución ligada al pedido: `transaction-form.ts` no tiene campo de pedido.
    - En Resultados, las ventas excluyen los cancelados (`finance.sql:422`) y "otros ingresos" solo cuenta ingresos **sin** pedido (`:445`). El adelanto queda en Caja y no aparece en ninguna línea de Resultados.
    - Si se devuelve como un egreso suelto, resta como gasto operativo un ingreso que nunca se contó: la utilidad se lee mal dos veces.
- **Qué tarea traba:** el vendedor quiere anotar "me pagó S/ 42.50 por Yape" en el momento en que llega, y ver de un vistazo quién no ha pagado su adelanto. Al cancelar, quiere decir si el adelanto se devuelve o se queda.
- **Cómo lo resuelven otros:**
  - **Quotient:** el adelanto es un porcentaje de la cotización, aparece como línea *Deposit Due* en el total y se recalcula si cambian las cantidades ([deposits](https://www.quotientapp.com/help/deposits)).
  - **Zoho:** al aceptar se genera el anticipo por un %, y lo cobrado se descuenta del documento final ([retainer invoices](https://www.zoho.com/books/help/retainer-invoice/functions.html)).
  - **Shopify:** *payment due later* con términos como *due on fulfillment* ([draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft)).
- **Propuesta:**
  1. **"Adelanto para confirmar: 50 %" es un campo de la cotización**, con un valor por defecto del taller. Va impreso en el PDF con el monto en soles.
  2. **El adelanto se registra al aceptar** (H1), contra el pedido que nace en ese momento. No hace falta un documento de anticipo aparte.
  3. **La marca de la tarjeta se deriva**: "Falta adelanto S/ 42.50" mientras lo cobrado esté por debajo del % pedido, y desaparece sola al cobrar. El texto libre queda para otros motivos ("esperando el logo").
  4. **El cobro del pedido lista cada pago** (fecha, cuenta, monto, referencia y anular) y ofrece "Saldo" y "50 %" como montos de un toque.
  5. **Cancelar con dinero cobrado pregunta qué pasa con él**: "Se devuelve" registra un egreso **ligado al pedido**, que `order_amount_paid` ya resta. "Se queda como penalidad" lo hace contar en Resultados. Hay que cambiar la vista para que el ingreso de un pedido cancelado y no devuelto sume a "otros ingresos".
- **Tamaño:** M.
- **Gravedad:** bloquea en la cancelación, porque Resultados queda mal. Confunde en lo demás.

### H5. "¿Quién me debe?" Por cobrar solo ve una parte y no lleva a la acción

- **Qué pasa:**
  - **Solo lista lo ya entregado.** La vista `receivables` filtra `status in ('delivered','closed') and balance > 0` (`finance.sql:382-383`). Un pedido *Listo* con saldo, que se cobra al entregar, no aparece.
  - **Los días de atraso se cuentan desde la fecha prometida de entrega** (`due_date`), no desde que se entregó (`finance.sql:374-378`). Un pedido sin fecha queda en "Al día" para siempre.
  - **El número de pedido no es un enlace** (`por-cobrar.page.ts:95`), y el teléfono es texto plano (`:97`). La tarea "Cobrar el pedido X" de Hoy lleva a la lista, no al pedido (`panel.data.ts:290`).
  - **Hay dos formularios de cobro distintos para lo mismo.** `pedido-cobro.ts` no tiene categoría ni nota y no dice cuánto quedará. `finanzas/payment-form.ts` sí.
  - **Se pide "Cuenta" y "Medio de pago" por separado**, aunque las cuatro cuentas tienen exactamente un medio cada una (consulta a `accounts`: Efectivo→cash, Yape→yape, Plin→plin, Cuenta bancaria→transfer).
- **Qué tarea traba:** el dueño quiere abrir una pantalla, ver a quién llamar hoy y mandarle el recordatorio sin copiar el número a mano.
- **Cómo lo resuelven otros:**
  - **Treinta**, la app de los negocios chicos que venden por WhatsApp en Latinoamérica, manda recibos, cotizaciones y recordatorios de pago por WhatsApp, y lleva las ventas a crédito ([GetApp](https://www.getapp.com/all-software/a/treinta/)). Lo vi en la ficha de GetApp, no en su ayuda.
  - **WhatsApp:** el enlace `https://wa.me/<número>?text=<mensaje>` abre el chat con el mensaje escrito. Lo verifiqué en [dotdigital](https://support.dotdigital.com/en/articles/11331301-click-to-chat-for-whatsapp); la [FAQ oficial](https://faq.whatsapp.com/5913398998672934) no cargó completa.
- **Propuesta:**
  1. **"Por cobrar" lista todo pedido de venta no cancelado con saldo**, en tres grupos: *Entregado y debe* (con días desde la entrega, que salen de `order_status_history`), *Listo: cobrar al entregar* y *En producción*.
  2. **Cada fila lleva** el cliente, el producto con su foto, el enlace al pedido, "Cobrar" en línea y "Recordar por WhatsApp". Ese botón abre `wa.me` con "Hola María, tu pedido PED-0012 (10 pociones) está listo. Saldo: S/ 42.50. Yape: …".
  3. **Un solo formulario de cobro**, donde la cuenta se elige con cuatro botones y el medio sale de la cuenta (desplegable solo si la cuenta no tiene uno).
- **Tamaño:** M.
- **Gravedad:** confunde.

### H6. Dos tableros… pero el trato no se entera de lo que pasa, y el segundo no es un tablero

- **Qué pasa:**
  - **No se cotiza desde el trato.** La ficha (`oportunidad-detalle.ts:80-165`) no tiene "Cotizar" ni "Crear pedido", solo "Enganchar" algo ya hecho, elegido de una lista de 50 sin filtrar por cliente (`oportunidades.data.ts:235-267`). El cotizador no tiene campo de trato (`cotizador.page.html:449-474`).
  - **Una versión nueva se sale del trato.** `saveQuote` no copia `opportunity_id` (`cotizador.data.ts:756-774`). Si se enganchan las dos versiones, el tablero **suma las dos**: `sum(x.total) filter (where x.status <> 'rejected')`, sin mirar la versión (`20261007100000_opportunities.sql:352`).
  - **"Cotizado" no se deriva.** La etapa solo sube sola a *Ganado* cuando hay pedidos (`20261007120000_opportunities_fixes.sql:56-60`). Mandar la cotización no mueve la tarjeta, aunque la ayuda de la columna dice *"Ya se le mandó al menos una cotización"* (`oportunidades.models.ts:34`).
  - **El "tablero del taller" de ADR-015 no existe como tablero.** `/pedidos` es una lista con filtro (`pedidos.page.ts:31-82`), y su filtro "En curso" esconde los entregados con deuda (`:22`, `FINISHED`).
  - **Hay dos "Cerrado" con significados distintos.** El del trato se deriva (entregado y cobrado). El del pedido es un paso manual más después de *Entregado* (`pedidos.labels.ts:56-64`), y nada explica qué agrega.
  - **Hay una tercera puerta de entrada huérfana.** "Responde a un pedido de cotización" (`cotizador.page.html:458-467`) lee `quote_requests`, que tiene 0 filas y ninguna pantalla que las cree (grep: solo `cotizador.data.ts` la nombra). Es lo mismo que un trato en *Nuevo*.
  - **El pedido no dice de dónde vino.** No enlaza ni a su cotización, ni a su trato, ni a su cliente (`pedido.page.ts:40-49`).
- **¿Se entiende por qué hay dos tableros?** La separación es correcta: el trato pregunta "¿compra o no compra?" y el pedido "¿ya está?". Pero hoy la persona tiene que ser el mensajero entre los dos. Como el camino largo cuesta el doble (H1), el tablero comercial va a quedar vacío y el argumento de ADR-015 se pierde.
- **Cómo lo resuelven otros:**
  - **HubSpot:** la cotización se crea **desde** el trato, y si un trato tiene varias, *"the deal amount and line items will reflect the latest published quote"* ([crear cotizaciones](https://knowledge.hubspot.com/quotes/create-and-send-quotes)).
  - **Pipedrive:** el valor del trato sale de sus productos ([vincular productos](https://support.pipedrive.com/en/article/how-can-i-link-products-to-a-deal)). Marca en rojo el trato estancado ([rotting](https://support.pipedrive.com/en/article/the-rotting-feature)), que Pickypop ya hace.
  - **Kommo** (antes amoCRM, muy usado en Latinoamérica): el mensaje de WhatsApp o Instagram entra solo al embudo ([pipelines](https://support.kommo.com/docs/pipelines-overview)).
  - **MRPeasy:** un solo documento que cambia de estado ([demo](https://www.mrpeasy.com/demo-videos/customer-relationship-management)).
- **Propuesta:**
  1. **El contexto viaja de una pantalla a otra.** "Cotizar para este trato" abre `/cotizador?trato=<id>` con el cliente y el trato puestos. La versión nueva hereda el trato. La cotización muestra su trato y su pedido, y el pedido enlaza a su cotización, su trato y su cliente.
  2. **El monto de la tarjeta es la última versión de cada número**, como en HubSpot.
  3. **"Cotizado" se deriva** de que haya al menos una cotización enviada, igual que *Ganado*.
  4. **Se quita "Responde a un pedido de cotización"**: el trato en *Nuevo* cumple ese papel.
  5. **El "Cerrado" del pedido se deriva** (entregado y cobrado), como el del trato, o desaparece. Ver Preguntas.
  6. **El segundo tablero lo diseña quien mira producción.** Desde la venta solo pido que la lista de pedidos muestre el saldo y la fecha prometida.
- **Tamaño:** M.
- **Gravedad:** confunde.

### H7. "¿Y este cliente qué me ha pedido?" Su historia no tiene dirección y le faltan las cotizaciones

- **Qué pasa:**
  - **No hay `/clientes/:id` ni `/oportunidades/:id`** en `app.routes.ts` (líneas 54 y 72), aunque `docs/06-frontend.md:94-95` los promete. La historia del cliente es una tarjeta dentro de la lista (`clientes.page.ts:31-33`): ningún pedido, cobro ni trato puede enlazar al cliente.
  - **La historia no trae cotizaciones.** `ClientesData.story` lee `customer_history`, `opportunities`, `order_payment_summary` y `customer_purchases` (`clientes.data.ts:107-125`). "Lo que se le cotizó" no está, y los tratos de la historia no son enlaces (`cliente-historia.ts:72-75`).
  - **Solo una de tres pantallas deja crear el cliente al vuelo.** El cotizador (`cotizador.page.html:450-457`) y el trato (`oportunidad-form.ts:28-35`) usan un `select` sin búsqueda. Solo el pedido nuevo tiene "Crear cliente rápido" (`pedido-nuevo.page.ts:50-67`).
  - **El cliente no tiene campo de WhatsApp ni de Instagram** (`\d customers`), aunque por ahí se vende, y su teléfono no es un enlace en ninguna parte.
- **Qué tarea traba:** el dueño quiere cotizarle a alguien que le acaba de escribir por Instagram, sin ir antes a Clientes. Y cuando vuelve a escribir, quiere abrir una sola pantalla que diga qué se le cotizó, qué pidió y cuánto debe.
- **Cómo lo resuelven otros:** HubSpot y Pipedrive tienen una ficha de contacto con dirección propia, de la que cuelgan sus tratos, sus cotizaciones y su actividad ([HubSpot](https://knowledge.hubspot.com/quotes/create-and-send-quotes)). Kommo crea la ficha con el nombre y el teléfono del primer mensaje ([pipelines](https://support.kommo.com/docs/pipelines-overview)).
- **Propuesta:**
  1. **Un selector de cliente compartido** en `ui/`, con búsqueda por nombre o teléfono y "Crear «María»", que pide solo el teléfono. Se usa en el trato, el cotizador y el pedido.
  2. **La ruta `/clientes/:id`** con tratos, cotizaciones, pedidos, saldo y el botón de WhatsApp, más "Nuevo trato", "Cotizar" y "Nuevo pedido" ya con el cliente puesto.
  3. **Un campo "Instagram" opcional** en el cliente.
- **Tamaño:** M.
- **Gravedad:** confunde.

### H8. El PDF que recibe el cliente: le falta lo que cualquier proforma de Lima trae, y no sale por WhatsApp

- **Qué pasa:**
  - **Qué imprime hoy** (`buildQuoteDocument`, `quote-document.ts:72-110`): nombre del taller, número, cliente, versión, emisión, validez, líneas (descripción, cantidad, precio unitario y total), totales, nota y un pie.
  - **Qué falta:** el plazo de entrega, el adelanto y las condiciones de pago, a dónde pagar (número de Yape o Plin, cuenta y CCI), el contacto del taller (teléfono, Instagram), si se recoge en Surquillo o hay delivery, y la foto del producto.
  - **Qué sobra o confunde:**
    - "Versión: 1" en una cotización que nunca tuvo otra.
    - "Valor de venta" igual al total cuando no hay IGV. Es un término de SUNAT que el cliente no necesita.
    - "Descuento aplicado" impreso **después** del IGV y antes del Total (`:78-82`). Como el descuento ya está dentro de los precios, se lee como algo que todavía hay que restar.
    - "Sin cliente" cuando falta el nombre.
    - "no genera compromiso de stock" en el pie (`:104-108`), que es lenguaje interno.
  - **No se manda por WhatsApp.** Solo hay "Descargar PDF" (`cotizacion.page.ts:191-207`), y en todo el frontend no hay `navigator.share` ni enlaces `wa.me`. En el teléfono, el archivo se baja, se busca y se adjunta a mano. Después hay que volver y pulsar "Marcar como enviada".
- **Qué tarea traba:** el vendedor quiere mandar la proforma al chat en un toque, y que el cliente sepa cuánto, para cuándo, cuánto adelanta y a dónde yapea, sin preguntar otra vez por el chat.
- **Cómo lo resuelven otros:**
  - **Alegra** comparte el PDF por WhatsApp desde la app ([blog de Alegra](https://blog.alegra.com/costa-rica/lleva-el-control-de-tu-negocio-desde-una-app-movil/)).
  - **Quotient** pone el adelanto en el total ([deposits](https://www.quotientapp.com/help/deposits)).
  - **3YOURMIND** separa la cotización de la confirmación del pedido, que es la que compromete una fecha de envío. Lo vi en el resumen del buscador de su wiki, que no pude abrir.
  - **La Web Share API** comparte un PDF con `navigator.share({ files })` y abre la hoja de compartir del teléfono, con WhatsApp incluido ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)).
- **Propuesta.** El contenido lo decide el dueño (§7.6, pregunta 9); esta es mi recomendación, en este orden:
  1. Logo o nombre, y teléfono o Instagram.
  2. Cliente.
  3. Líneas con foto chica.
  4. El total, y debajo "Adelanto para confirmar: 50 % (S/ 42.50)".
  5. "Entrega: 2 días desde la confirmación · recojo en Surquillo".
  6. "Paga por Yape o Plin al 9xx xxx xxx".
  7. Validez.

  Fuera quedan la versión (salvo en el título si es mayor que 1), "Valor de venta" sin IGV y el pie de stock. El descuento va **dentro** de cada línea ("antes S/ 10, ahora S/ 8.50"). El botón "Enviar por WhatsApp" comparte el PDF con `navigator.share`; si el aparato no puede, abre `wa.me` con el texto y deja el PDF descargado. En los dos casos marca la cotización como enviada. Los datos de pago salen de un campo nuevo "Cómo pagar" en cada cuenta, y el contacto de `workspaces`, que hay que ampliar como ya anota M8.
- **Tamaño:** M.
- **Gravedad:** confunde. Es lo único de la aplicación que ve el cliente.

### H9. Ninguna línea de venta lleva foto

- **Qué pasa:** `pp-thumb` aparece en 5 pantallas (grep: catálogo, armar, insumos, piezas, producción), y **ninguna es de venta**. No hay foto en:
  - el selector de variantes del cotizador (`cotizador.page.html:47-52`);
  - las líneas de la cotización (`:411-425`) ni las de su detalle (`cotizacion.page.html:109-118`);
  - las líneas del pedido nuevo (`pedido-linea.ts:49-55`) ni las del pedido (`pedido.page.ts:105-108`);
  - la lista de pedidos;
  - lo que compró cada cliente;
  - Por cobrar.

  §7.5.1 ya lo anota para las líneas de pedido y de cotización. Para una pieza a medida no hay foto de catálogo, pero el `.gcode.3mf` trae `Metadata/plate_N.png`, la miniatura de cada placa (`docs/01-investigacion.md:43`), y el lector no la extrae (`packages/slicer-files/src` no la nombra).
- **Qué tarea traba:** el dueño quiere distinguir de un vistazo, en un pedido de tres líneas, "la venenosa" de "la de amor", y confirmar que cotizó la pieza correcta.
- **Cómo lo resuelven otros:** el `ItemPicker` de `ui/` ya resuelve el "elegir por foto" en compras (`compra-form.ts:110`); falta usarlo en la venta.
- **Propuesta:**
  1. El selector de producto del cotizador y del pedido usa `pp-item-picker`.
  2. Cada línea de cotización, pedido, aceptar, Por cobrar e historia del cliente lleva `pp-thumb` a un tamaño reconocible: el `md` de 40 px como mínimo en filas, nunca el `sm` de 28 px.
  3. Las líneas a medida guardan la miniatura `plate_1.png` del archivo al importarlo.
  4. El PDF imprime la foto chica.
- **Tamaño:** M. S solo para catálogo; la miniatura del 3MF es aparte.
- **Gravedad:** afea, y es regla permanente del dueño.

### H10. Después de las 7 de la noche, la cotización sale con fecha de mañana

- **Qué pasa:** `quotes.issued_on` y `orders.ordered_on` usan `default current_date` (`20260930010000_sales_and_production.sql:139,190`), y la base corre en UTC (`show timezone` → `UTC`). Entre las 19:00 y las 23:59 de Lima, la cotización y el pedido nacen con la fecha del día siguiente, y esa fecha sale impresa como "Fecha de emisión" en el PDF. El mismo corrimiento aparece en otros cuatro sitios:
  - La validez se calcula con `toISOString()`, en UTC (`cotizador.page.ts:617-620`).
  - "Vencida" usa un `today` en UTC (`cotizaciones.page.ts:131`, `cotizacion.page.ts:77`), así que marca vencida una cotización la noche anterior a su último día.
  - Los días de atraso de Por cobrar usan `current_date` (`finance.sql:376`).
  - Los parámetros vigentes se buscan con una fecha UTC (`cotizador.data.ts:396`).
- **Qué tarea traba:** el dueño cotiza de noche, que es cuando más le escriben por WhatsApp, y el PDF dice otra fecha.
- **Cómo lo resuelven otros:** no aplica: es la misma trampa que `AGENTS.md` ya documenta para las fechas sembradas.
- **Propuesta:** el default pasa a `(now() at time zone 'America/Lima')::date`, en una migración nueva, y el frontend usa la fecha local que ya existe en `core/dates`.
- **Tamaño:** S.
- **Gravedad:** confunde.

## Referencias revisadas

| Aplicación | Por qué sirve de referencia | Qué tomar | Qué NO tomar | Enlace |
|---|---|---|---|---|
| MRPeasy | ERP para fabricantes pequeños; cotización y pedido son el mismo documento | Aceptar = cambiar de estado sin reescribir; fecha más temprana calculada al cotizar | Reservar ítem por ítem con "Book items" | [demo CRM](https://www.mrpeasy.com/demo-videos/customer-relationship-management) |
| Katana MRP | Fabricación chica, *make to order* | Disponibilidad por línea con tres estados y fecha; disponibilidad de ingredientes; lo de mayor prioridad se toma primero | Prioridades arrastrables y órdenes de fabricación formales: aquí basta ordenar por fecha de entrega | [sales item availability](https://support.katanamrp.com/en/articles/5914289-sales-item-availability) |
| Shopify (borradores de pedido) | La cotización que se vuelve pedido | Conversión con cliente, líneas y precios; "pago después" | Reservas con vencimiento y enlace de checkout | [draft orders](https://help.shopify.com/en/manual/orders/create-orders/create-draft) |
| HubSpot CRM | Tratos frente a pedidos | Cotizar desde el trato; monto = última cotización publicada | Firma electrónica y pago en línea | [quotes](https://knowledge.hubspot.com/quotes/create-and-send-quotes) |
| Pipedrive | Embudo de tratos | Valor del trato desde sus productos; trato estancado (ya está) | Estancamiento configurable por etapa, varios embudos | [productos](https://support.pipedrive.com/en/article/how-can-i-link-products-to-a-deal) · [rotting](https://support.pipedrive.com/en/article/the-rotting-feature) |
| Quotient | Cotizaciones que el cliente acepta | Adelanto como % de la cotización, visible en el total | Aceptación en línea con factura de anticipo automática | [deposits](https://www.quotientapp.com/help/deposits) |
| Zoho Invoice / Books | Facturación de pymes, también en Latinoamérica | "Mark as accepted" a mano; anticipo que se descuenta del saldo | Un documento de anticipo aparte | [aceptar](https://zstatic.zohostatic.com/invoice/help/estimate/estimate-accept.md) · [retainer](https://www.zoho.com/books/help/retainer-invoice/functions.html) · [orden de venta](https://www.zoho.com/es-mx/books/help/sales-order/) |
| Alegra | Facturación pyme en Latinoamérica (Perú incluido) | Cotización → documento siguiente sin redigitar; PDF por WhatsApp | Factura electrónica (fuera de alcance por ADR-008) | [blog Alegra](https://blog.alegra.com/costa-rica/lleva-el-control-de-tu-negocio-desde-una-app-movil/) |
| Holded | Presupuesto → factura en España | "Convertir" como acción principal del presupuesto | Numeración separada de proformas | [presupuestos](https://www.holded.com/es/programa-facturacion/presupuestos) (la página no cargó; lo vi en el resumen del buscador) |
| Odoo Ventas | Cotización con "Accept & Pay" | — | Portal del cliente con pago en línea: aquí se paga por Yape y se manda captura | [online payment](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/get_paid_to_validate.html) |
| Treinta | Negocios chicos que venden por WhatsApp en Latinoamérica | Recordatorio de deuda y cotización por WhatsApp | Su punto de venta de tienda de barrio | [GetApp](https://www.getapp.com/all-software/a/treinta/) |
| Kommo | CRM de WhatsApp e Instagram muy usado en Latinoamérica | Crear el trato con nombre y teléfono en segundos | API de WhatsApp de pago y bots (ADR, Pendientes) | [pipelines](https://support.kommo.com/docs/pipelines-overview) |
| AMFG | Cotizador y MES de manufactura aditiva | Cotización ganada → trabajo, sin reingresar | Asignación automática de máquinas y operadores | [amfg.ai](https://amfg.ai/contract-manufacturing) (página comercial) |
| DigiFabster | Cotizador 3D para talleres | Modo "a definir" para lo que no se puede cotizar solo | Tienda en línea con autoservicio | [instant quoting](https://digifabster.com/products/instant-quoting-solution/) (resumen del buscador, no verificado a fondo) |
| Craftcloud | Mercado de impresión 3D | Precio junto al plazo de entrega | Varias ofertas de envío | [all3dp](https://all3dp.com/1/craftcloud-by-all3dp-simply-explained/) (reseña, no documentación) |
| 3YOURMIND | Plataforma de manufactura aditiva | Pedidos → cotizaciones → órdenes; la confirmación compromete la fecha | Portal de compras corporativo | [wiki](https://3yourmind.atlassian.net/wiki/x/jwDZBg) (no cargó; visto en el resumen del buscador) |
| Web Share API, `wa.me` | Mandar el PDF y el recordatorio sin copiar y pegar | `navigator.share({ files })` y `wa.me/<número>?text=` | — | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) · [click to chat](https://support.dotdigital.com/en/articles/11331301-click-to-chat-for-whatsapp) |

## Lo que no hay que copiar

- **El portal del cliente con firma y pago en línea** (Odoo, Quotient, Zoho, HubSpot). En Lima el cliente responde "ya, dale" por WhatsApp y manda la captura del Yape. Lo que sí hace falta es que *Aceptar* lo haga el vendedor en un toque.
- **Un documento de anticipo aparte** (*retainer invoice*). Aquí el adelanto es un cobro más del pedido; basta con que el pedido sepa cuánto se pidió.
- **Reservas a mano con vencimiento** (Shopify *Reserve items*, MRPeasy *Book items*). En un taller de dos personas, la reserva olvidada es el error seguro. Mejor derivar lo comprometido de los pedidos abiertos (H3).
- **Prioridades arrastrables entre pedidos** (Katana). La fecha prometida ya ordena la cola.
- **Varios embudos, estancamiento por etapa, actividades y tareas** (Pipedrive, HubSpot). Seis columnas y "días sin moverse" bastan.
- **Una sección de "pedidos de cotización" separada de los tratos** (`quote_requests`, 3YOURMIND *Requests*). Aquí es lo mismo que un trato en *Nuevo*.
- **Asignación automática a máquinas** (AMFG). Hay una impresora.
- **Proformas con numeración propia y conversión a factura** (Holded). No hay RUC (ADR-008).

## Preguntas para el dueño

1. **¿El adelanto es una regla o se decide caso a caso?** Recomiendo un % por defecto del taller (por ejemplo, 50 % desde cierto monto, 0 % debajo), editable en cada cotización e impreso en el PDF. Así "Falta adelanto" se calcula solo.
2. **Si el cliente acepta una cotización vencida, ¿se respeta el precio?** Recomiendo que lo decida el vendedor en el momento, con los dos precios a la vista y respetarlo como opción por defecto. Lo que nunca se respeta es el plazo viejo: siempre se recalcula.
3. **¿Cuántas horas imprime la A1 mini en un día normal?** El plazo prometido depende de ese número. `expected_hours_per_year` dice 2000, unas 5.5 horas al día. Si imprime de noche, la cifra real es otra. Recomiendo un parámetro "horas de impresión por día" que él ajuste.
4. **Al cancelar con adelanto, ¿se devuelve o se queda?** Recomiendo preguntarlo en cada cancelación y registrar las dos salidas, porque hoy ese dinero desaparece de Resultados.
5. **¿El paso "Cerrado" del pedido significa algo más que "entregado y cobrado"?** Si no, recomiendo derivarlo, como el del trato, y dejar de pedir ese clic.
6. **¿Qué datos de pago y de contacto van en el PDF?** Recomiendo el número de Yape o Plin, la cuenta, el teléfono o Instagram, "recojo en Surquillo" y el adelanto. Es la pregunta 9 de §7.6, con esta propuesta concreta.
7. **¿Un borrador se puede corregir sin crear versión nueva?** Recomiendo que sí: el borrador se edita en su sitio, y solo una cotización ya enviada al cliente genera versión.
