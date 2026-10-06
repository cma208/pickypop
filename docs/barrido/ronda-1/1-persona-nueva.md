# Persona nueva — ronda 1

## En cinco líneas

1. Terminé las siete tareas, pero ninguna "se entendió sola". En cinco de las siete tuve que calcular, adivinar o pasar por tres o cuatro pantallas para sacar algo que el sistema ya sabía.
2. La duda más cara: **ninguna pantalla responde "¿cuándo lo entrego y qué tengo que imprimir?"**. Lo saqué yo cruzando Piezas impresas, Armar productos, Cola de impresión y la receta, y aun así no supe si las piezas del estante ya eran de otros pedidos (la cola decía "faltan 51" repartidas en 5 pedidos).
3. Se pierde información entre pantallas. La compra no registra el pago, así que escribí el monto otra vez en Caja, sin poder ligarlo, y Resultados lo contó como gasto. El armado no queda ligado al pedido. Entregar no saca nada del estante.
4. Comprobado en la base: después de entregar quedaron **10 pociones "armadas"**, y `production_needs` las ofrece a los demás pedidos. Además, el **costo de ventas de mi venta de S/ 85 quedó en S/ 2.70**: solo cuenta lo que se imprimió hoy, no lo que se sacó del estante.
5. Lo que sí se entendió solo: crear la clienta desde el pedido, el precio que propone la escalera, el cobro con el saldo ya calculado y el cierre de impresión con los datos ya llenos.

## Tarea por tarea

### T1. Registrar la compra del mercado (500 g de gomitas a S/ 15 y 50 bolsas de celofán a S/ 12, en efectivo)
- **¿Lo logré?:** a medias. El stock y el costo entraron bien. El pago lo tuve que registrar aparte en Caja, sin ligarlo a la compra, y Resultados lo contó como gasto.
- **Pasos:** Hoy → Compras (menú Inventario) → «+ Nueva compra» → buscador «Elige un filamento o insumo» → escribí «gomitas»: «Nada coincide con «gomitas»» → abrí la lista entera y elegí «Dulces surtidos» → Cantidad 500, Precio unitario 0.03 → «+ Agregar otro producto» → busqué «celof»: nada, y no hay opción de crearlo → salí a Empaque (no me avisó que perdía la compra a medio llenar) → «+ Nuevo artículo» → cambié el Tipo de «Insumo» a «Empaque» → nombre «Bolsa de celofán», mínimo 10, sin foto → Guardar → volví a Compras → «+ Nueva compra»: **el formulario estaba vacío** → cargué otra vez las gomitas → bolsa de celofán 50 × 0.24 → «Revisar y guardar» → «Se crearán 0 rollos con sus movimientos de entrada, más la entrada de 2 insumos. Después no se puede editar.» → «Confirmar y guardar» → busqué el egreso en Caja: no estaba → «Registrar movimiento» → Egreso, Cuenta Efectivo, Categoría «Dulces y empaque», Monto 27, Medio de pago Efectivo, A quién «Mercado», Nota → Registrar. Unos 35 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Compras › buscador de producto | «+ Crear «celofán»» dentro del buscador cuando no lo encuentra | «Nada coincide con «celof».» y nada más |
  | Compras › encabezado | Una pantalla de compras para cualquier cosa | Habla de rollos: «Cada rollo entra con su costo real», «Cómo repartirlos entre los rollos», columna ROLLOS = 0. Dudé si servía para dulces y bolsas |
  | Compras › línea | Escribir lo que pagué por la línea (S/ 15) | Pide **precio unitario**: tuve que dividir 15 ÷ 500 g = 0.03 y 12 ÷ 50 = 0.24 |
  | Compras › buscador | Solo lo que se compra | Ofrece «Botella impresa» y «Tapa impresa» (piezas impresas) como comprables (`compra-form.ts:266` mete todos los artículos) |
  | Compras › confirmación | «Entran 500 g de dulces y 50 bolsas» | «0 rollos … más la entrada de 2 insumos»: llama insumo a la bolsa, que es empaque |
  | Compras | Elegir con qué pagué (efectivo, Yape) | No hay campo. La compra no toca la caja |
  | Empaque › Nuevo artículo | Tipo «Empaque» ya elegido, porque estoy en Empaque | Viene «Insumo» |
  | Empaque › Nuevo artículo | Que me pida la foto (regla del taller) | La foto es opcional y guardó sin ella |
  | Caja › Registrar movimiento | Ligar el egreso a la compra que acababa de hacer | No hay forma. Además pide Cuenta y Medio de pago, que aquí dicen lo mismo |
- **Lo que tuve que adivinar o recordar:** si las «gomitas» son los «Dulces surtidos» del taller (lo asumí, porque el pedido de la tarea 2 es «con dulces surtidos»). Si «el mercado» es «Sin proveedor» o «Tienda local». La categoría del egreso. El mínimo de la bolsa (10, inventado).
- **Lo que escribí dos veces:** la línea de gomitas entera, porque el formulario se vació al salir a crear la bolsa. El monto (S/ 27) y la descripción de lo comprado, en la compra y otra vez en Caja. «Efectivo» dos veces en el mismo formulario de Caja.

### T2. Registrar el pedido de María Barrido (10 «Botella de poción» con dulces surtidos para el viernes, adelanto de S/ 50 por Yape)
- **¿Lo logré?:** sí.
- **Pasos:** Pedidos → «Nuevo pedido» → Propósito «Venta» (ya marcado) → «+ Crear cliente rápido» → nombre y teléfono → «Crear y elegir» → Fecha de entrega 09/10/2026 (el viernes lo calculé yo) → Nota → Producto y variante «Botella de poción — Con dulces surtidos» → Cantidad 10 → precio sugerido S/ 8.50 → «Guardar pedido» → en la ficha, «Registrar un cobro»: Cuenta Yape, Monto 50 (venía 85), Referencia «Adelanto» → «Registrar cobro». Unos 18 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Nuevo pedido › línea | Ver el precio al elegir la variante | Durante un instante dice «Esta variante no tiene precio de lista ni escalera: escribe el precio.» y «Sin receta: no hay costo estimado.». Luego cambia a «Sugerido por la escalera: S/ 10.00». Lo creí y fui al Catálogo a comprobarlo. Es la espera de 300 ms (`pedido-linea.ts:9`): mientras corre esa espera no muestra «Calculando…» sino el mensaje de «sin precio» (`pedido-linea.ts:71-97`). Al cambiar la cantidad a 10 pasó lo mismo: un instante siguió diciendo S/ 10.00, hasta que pasó a S/ 8.50 |
  | Nuevo pedido › línea | Costo estimado completo | «Es un mínimo: Botella impresa, Tapa impresa no tienen costo registrado y no suman.», aunque en Piezas impresas sí tienen costo (S/ 0.603 y S/ 0.131, «De una impresión») |
  | Nuevo pedido | Saber si hay stock y para cuándo estaría | Nada: ni cuántas hay armadas ni cuánto tarda |
  | Nuevo pedido | Registrar el adelanto al crear el pedido | Hay que guardar primero y cobrar en la ficha |
  | Nuevo pedido / Crear cliente rápido | Anotar el canal (WhatsApp) | Ni el pedido ni el cliente rápido tienen canal. Los canales que existen son «Directo» e «Instagram» |
  | Ficha del pedido | Un número como los demás (PED-00xx) | **ORD-2026-0001** al lado de PED-0001…PED-0010 |
  | Ficha del pedido › cobro | Que el monto por defecto fuera lo que me están pagando | Viene el saldo completo (85); lo cambié a 50 |
- **Lo que tuve que adivinar o recordar:** la fecha del viernes. Si el precio de la escalera era el bueno (el mensaje falso de «sin precio» me hizo dudar).
- **Lo que escribí dos veces:** nada grave. Solo corregí el monto del cobro de 85 a 50.

### T3. ¿Cuándo se lo puedo entregar? ¿Qué hay que imprimir y armar? Dejarlo en la cola
- **¿Lo logré?:** a medias. Dejé tres trabajos en la cola, ligados al pedido. **La fecha de entrega la calculé yo**: la app no la da.
- **Mi respuesta:** el estante tenía 8 botellas y 5 tapas, y Armar productos decía «Alcanza para 5». Faltaban 2 botellas y 5 tapas. Según la receta, la placa Botella da 1 por corrida (43 min) y la placa Tapas da 9 (20 min). Eso son 2 × 43 + 20 = 106 min de impresión, más el armado (10 min por lote + 5 min × 10 ≈ 1 h). Saldría para mañana, mucho antes del viernes, **si la impresora está libre**. Pero la cola tiene un trabajo «Imprimiendo» abierto hace 54 h («Botellas de Ana (repetida)»). Además, «Falta producir para los pedidos» dice que faltan 51 botellas en 5 pedidos, con la primera entrega el 05 oct. Es probable que esas 8 botellas del estante ya estuvieran prometidas a pedidos anteriores al de María. No supe si tomarlas o imprimir las 10.
- **Pasos:** ficha del pedido (no dice nada de stock) → Piezas impresas (8 botellas, 5 tapas) → Armar productos → tarjeta de la variante («Alcanza para 5», con tabla de componentes) → Cola de impresión («faltan 51») → vuelta al pedido → «Crear trabajo» → impresora ya elegida → Placa «Botella» (llena el tiempo y 3 rollos con sus gramos; «Una corrida de esta placa produce 1 unidad(es).») → «Crear trabajo» → otra vez «Crear trabajo» (la placa vuelve a «Sin placa (a mano)») → Botella → crear → otra vez → Tapas → crear → «Pasar a En cola». Unos 25 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Ficha del pedido | «Hay X armadas, faltan Y, imprime estas placas, estaría el día Z» | Solo «Crear trabajo» por línea, sin decir si hay stock |
  | Armar productos | Saber cuántas piezas del estante ya son de otros pedidos | «Alcanza para 5» sin restar lo prometido |
  | Cola › Falta producir | Que reste lo que ya está en cola | Sigue «51» después de crear mis trabajos (el texto lo advierte: «No descuenta… lo que ya está en la cola») |
  | Nuevo trabajo de impresión | Pedir «2 corridas» o «10 botellas» de una vez | Un trabajo es una corrida. Para 10 botellas serían 10 formularios |
  | Nuevo trabajo de impresión | Que recuerde la placa después de crear uno | Vuelve a «Sin placa (a mano)» cada vez |
  | Trabajos creados | Nombres que distingan la botella de la tapa | Los tres se llaman «Botella de poción — Con dulces surtidos». Solo cambia «Placa Botella / Tapas» en letra chica |
  | Pedido | Que pase a «En cola» al crear los trabajos | Siguió en «Confirmado»; lo cambié a mano |
  | Trabajo › Iniciar | Un aviso de que la A1 mini está ocupada | Me dejó iniciar el trabajo de tapas con otro «Imprimiendo» abierto en la misma impresora |
- **Lo que tuve que adivinar o recordar:** todo el cálculo del plazo. Cuántas unidades da cada placa (lo vi recién al elegirla). Si imprimir lo que faltaba o las 10 completas.
- **Lo que escribí dos veces:** elegí la placa tres veces y abrí el formulario tres veces.

### T4. Cerrar las impresiones como exitosas y armar el pedido
- **¿Lo logré?:** a medias. Las impresiones quedaron cerradas y las 10 pociones armadas, pero **el armado no quedó ligado al pedido**.
- **Pasos:** en la ficha del pedido, trabajo de tapas: «Iniciar» → «Cerrar…» (todo venía lleno: Exitosa, 20 min, 9 unidades, 15 g) → «Revisar y cerrar» → «Esto no se puede deshacer. Se descontarán 15 g de 1 rollo(s).» → «Sí, cerrar impresión». Las dos botellas: «Cerrar…» directo, sin «Iniciar» (lo permitió) → Revisar → Sí. Luego Armar productos → tarjeta → ¿Cuántas? 10 → «Armar 10». Unos 16 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Cerrar impresión | «Entran 9 tapas al estante» | Solo habla de los gramos que se descuentan |
  | Ficha del pedido, después de cerrar | Un costo real creíble | «Ganancia real S/ 82.30» con un costo real de S/ 2.70: tomó solo las tres impresiones y dejó de lado el estimado de S/ 52.30 |
  | Armar productos | Armar «para el pedido de María» | No hay forma. `assemble_product(p_variant_id, p_units, p_note)` no recibe el pedido |
  | Armar productos, después de armar | «Listo: 10 armadas» | La tarjeta cambia a «No alcanza» y «Falta stock para 10. Alcanza para 0.» en rojo. Lo único que confirma el armado es el «10 armadas en el estante» |
  | Kardex | Las piezas impresas como «Producción» | «Compra · Botella impresa +1 unidad · Impresión». También aparecen orígenes sin traducir: «assembly», «maintenance» |
  | Pedido | Que pase a «Listo» solo | Siguió en «En cola» |
- **Lo que tuve que adivinar o recordar:** que tenía que ir a otra pantalla (Armar productos) para armar; el pedido no lo sugiere.
- **Lo que escribí dos veces:** la variante y la cantidad, que ya estaban en el pedido.

### T5. Entregar el pedido y cobrar el saldo
- **¿Lo logré?:** a medias. El pedido quedó «Entregado» y «Cobrado», pero **el estante no bajó**.
- **Pasos:** ficha del pedido → «Pasar a Imprimiendo» → «Pasar a Post-proceso» → «Pasar a Listo» → «Pasar a Entregado» (cuatro clics para algo que ya pasó, sin pedir confirmación) → «Registrar un cobro»: Cuenta Efectivo, Monto 35 (venía bien), Referencia → «Registrar cobro» → «Este pedido está cobrado por completo.». Unos 8 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Ficha del pedido | Un botón «Entregar» | Hay que recorrer los cuatro estados uno por uno |
  | Después de entregar | Que salgan 10 pociones del estante | Armar productos sigue diciendo «10 armadas en el estante» |
  | Entregado / Cerrado | Saber en qué se diferencian | Queda «Pasar a Cerrado» sin explicación. Lo dejé en Entregado |
  | Cobro | Ver la lista de cobros (adelanto y saldo) | Solo «Último cobro: 06 oct. 2026» y los totales |
- **Lo que tuve que adivinar o recordar:** con qué pagó el saldo (supuse efectivo contra entrega).
- **Lo que escribí dos veces:** nada.

### T6. Cotizar un llavero a medida, listo para mandar
- **¿Lo logré?:** a medias. Quedó la cotización COT-2026-0001 en borrador, sin archivo laminado, sin cliente y sin forma de mandarla por WhatsApp.
- **Pasos:** Cotizador → no tengo un `.gcode.3mf` y el navegador de la prueba no sube archivos (**anotado**: seguí a mano) → «Agregar una placa» → Nombre «Llavero», 30 min, filamento negro, 6 g (todo inventado) → «Qué se cotiza» «Llavero a medida», 1 unidad, Preparación 15 min, Trabajo por unidad 5 min → «Agregar a la cotización» → Cliente «Sin cliente todavía» → Vigencia 15 → Nota para el cliente → «Guardar como cotización» → ficha con «Descargar PDF», «Marcar como enviada» y «Crear versión nueva». No descargué el PDF. Unos 20 clics.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Cotizador › Cliente | Crear el cliente desde aquí, como en el pedido | Solo la lista de clientes que ya existen |
  | Cotizador › Canal de venta | «WhatsApp» | «Venta directa», «Directo (0 %)» e «Instagram (0 %)»: las dos primeras parecen la misma |
  | Cotizador › El lote | Un lugar para el tiempo de diseño (es a medida) | Solo «Preparación del lote»; puse el diseño ahí |
  | Cotizador › Insumos | La argolla del llavero | No existe; habría que salir a crearla |
  | Cotizador › Costo y precio | «Margen que queda» con el precio redondeado | Dice «S/ 5.60 (50 %)», aunque el precio subió de S/ 11.20 a S/ 11.50 |
  | Cotización guardada | «Copiar para WhatsApp» o un enlace | Solo el PDF y «Marcar como enviada» |
  | Cotizaciones | Una sola numeración | COT-2026-0001 junto a COT-0001…0003 |
  | Oportunidades | Saber si el pedido de WhatsApp va primero como oportunidad | El cotizador no lo sugiere; no lo hice |
- **Lo que tuve que adivinar o recordar:** tiempo, gramos y color del llavero (sin el archivo no hay de dónde sacarlos), el tiempo de diseño y la vigencia.
- **Lo que escribí dos veces:** nada.

### T7. Al final del día: plata que entró, cuánto me deben, qué filamento se acaba
- **¿Lo logré?:** sí, pero con tres pantallas y una suma hecha a mano.
- **Respuestas:**
  - **Entró hoy:** S/ 85.00 (S/ 50 por Yape y S/ 35 en efectivo). Salió S/ 27.00 y el neto es S/ 58.00. Lo saqué de Caja, filtrando Desde y Hasta con la fecha de hoy. La pantalla «Hoy» no muestra dinero.
  - **Me deben:** Por cobrar dice S/ 90.00 (PED-0002, Café Lima, 8 días de atraso). Pero solo cuenta pedidos **entregados**. En Pedidos hay otros S/ 450 «Sin cobrar» en pedidos en curso (PED-0003 85, PED-0005 51, PED-0006 170, PED-0008 144), y esa suma la hice yo.
  - **Filamento por acabarse:** «Hoy» → «Filamentos bajo mínimo: Krear3D PLA Básico Verde lima, 380 g (mínimo 500 g)». En Filamentos, el Rosado (613 g, mínimo 500) va camino al mínimo y no hay ningún aviso.
- **Pasos:** Hoy → Caja (dos filtros de fecha) → Por cobrar → Pedidos → Filamentos → Resultados.
- **Dónde dudé:**

  | Pantalla | Qué esperaba | Qué encontré |
  |---|---|---|
  | Hoy | «Entró hoy S/ X, te deben S/ Y» | Vencimientos, filamento bajo mínimo y mantenimiento, pero ni un sol |
  | Caja | Un botón «Hoy» | Dos campos de fecha que llenar a mano |
  | Por cobrar | Todo lo que me deben | Solo los pedidos entregados |
  | Caja | Que los cobros digan «Venta de productos» como los anteriores | Mis dos cobros quedaron con categoría «—» |
  | Resultados | Que la compra de dulces vaya a «Compras de inventario» | Octubre muestra «Gastos S/ 27.00» (mi egreso de la compra) y «Compras de inventario S/ 0.00» |
- **Lo que tuve que adivinar o recordar:** que «Por cobrar» no incluye los pedidos en curso.
- **Lo que escribí dos veces:** la fecha de hoy, dos veces.

## Lo que creí que pasó y no pasó (comprobado en la base)

1. **Creí que la compra sacaba S/ 27 de la caja de efectivo. No pasó.** `purchases` no tiene medio de pago y ninguna pantalla escribe `transactions.purchase_id`: aparece solo en `core/database.types.ts`, y `inventario.data.ts:624` inserta la compra y nada más. Mi egreso manual quedó con `purchase_id` null. Por eso `monthly_income_statement` lo cuenta en `operating_expenses` (27.00) y no en `inventory_purchases` (0). El costo de los dulces cuenta dos veces: como gasto y como costo de ventas cuando se consumen. Es justo lo que la pantalla Resultados dice evitar.
2. **Creí que la compra subía el stock y el costo: sí pasó.** `stock_movements` de tipo `purchase`: Dulces surtidos +500 g a 0.03 y Bolsa de celofán +50 a 0.24. `inventory_item_costs` dio `cost_per_unit` 0.0300 y 0.2400.
3. **Creí que el pedido quedaba ligado a todo. Solo en parte.**
   - Los tres trabajos sí quedaron ligados (`print_jobs.order_line_id`).
   - El armado no: los 5 movimientos `assembly` tienen `source_id` null.
   - `orders.quote_id`, `opportunity_id` y `channel_id` quedaron en null.
4. **Creí que entregar sacaba las 10 pociones del estante. No pasó.** `order_status_history` registra ready → delivered, pero no hubo ningún `stock_movement`: el producto terminado quedó en +10. Después `production_needs` mostraba `assembled_units = 10` y `missing_units = 31` para los otros cuatro pedidos. Las pociones de María, ya entregadas, se ofrecen a los demás.
5. **Creí que el adelanto y el saldo eran dinero: sí.** Son dos `transactions` de tipo `income` con `order_id`: Yape 50.00 y Efectivo 35.00, y `payment_status = paid`. Pero tienen `category_id` null.
6. **Creí que el costo de mi venta sería unos S/ 52 (el estimado), o al menos el del armado (10 × S/ 3.24 = S/ 32.40). No.** `real_cost` = 2.70, solo las tres impresiones de hoy. Como es mayor que 0, `monthly_income_statement` lo usa en lugar del estimado de 52.30. El costo de ventas de una venta de S/ 85 quedó en S/ 2.70, sin contar las 8 botellas y 5 tapas del estante, los 660 g de dulces ni las 10 bolsas.
7. **Creí que el costo estimado del pedido incluía las piezas. No.** `features/pedidos/cost-estimate.ts:116` lee `inventory_item_costs`, que para «Botella impresa» y «Tapa impresa» da `cost_source = unknown`. Es el error que AGENTS.md ya marca: «piezas sin costo en pantalla».
8. **Creí que las piezas impresas entraban como producción. Entran como compra.** `20261008110000_parts_and_assembly.sql:226` las inserta con `type = 'purchase'` y por eso el Kardex dice «Compra». Los orígenes `assembly` y `maintenance` no tienen etiqueta en `inventario.format.ts:50-57` y se ven en inglés.
9. **Creí que el artículo nuevo pediría foto. No la pidió:** «Bolsa de celofán» quedó con `image_path` null.
10. **Algo que no esperaba:** armar creó solo un artículo `finished_good` («Botella de poción · Con dulces surtidos»). Está bien, pero ninguna pantalla lo avisa.

## Las diez dudas más caras

1. **¿Cuándo lo entrego y qué imprimo?** (Ficha del pedido, Armar productos y Cola). Ninguna pantalla lo responde. Lo calculé con cuatro pantallas y la receta, sin saber si las piezas del estante eran de otros pedidos.
2. **No puedo crear el artículo desde la compra, y al salir a crearlo se borra la compra a medio llenar** (Compras → Empaque → Compras).
3. **La compra no registra el pago** (Compras → Caja). Tuve que escribir otra vez el monto y la descripción, sin poder ligarlo, y Resultados lo cuenta como gasto.
4. **Un trabajo por corrida** (Nuevo trabajo de impresión). Diez botellas son diez formularios, y la placa no se recuerda de un trabajo al siguiente.
5. **Entregar son cuatro clics de estado y el estante no baja** (ficha del pedido y Armar productos).
6. **El armado no se liga al pedido**, y justo después de armar sale en rojo «Falta stock para 10. Alcanza para 0.» (Armar productos).
7. **Un aviso falso de «no tiene precio de lista ni escalera» y «Sin receta» mientras calcula** (Nuevo pedido, línea). Me mandó al Catálogo a comprobarlo.
8. **Precio unitario en lugar del total de la línea** (Nueva compra). Tuve que dividir 15 ÷ 500 y 12 ÷ 50.
9. **«¿Cuánto me deben?»** (Por cobrar). Solo cuenta los pedidos entregados; los S/ 450 de pedidos en curso hay que sumarlos aparte.
10. **Dos numeraciones a la vez** (Pedidos y Cotizaciones): ORD-2026-0001 junto a PED-0001…, y COT-2026-0001 junto a COT-0003. Me hizo pensar que mi pedido había entrado en otro lado. Sospecho que el seed usa PED- y la base genera ORD- (`20260930020000_numbering_for_trusted_callers.sql:32`), pero no lo comprobé en producción.

## Qué esperaba encontrar porque lo hacen otras aplicaciones

Es lo que busqué por costumbre. En esta ronda no revisé sus páginas, así que no pongo enlaces.

- **Shopify y Mercado Libre:** al confirmar una venta, el stock queda comprometido, y al despacharla («Fulfill») baja solo. Aquí busqué «Entregar» y el estante no se movió.
- **Cualquier POS (Square, Loyverse):** el adelanto se cobra en el mismo momento de crear la venta, con su medio de pago, y el cierre del día dice cuánto entró. Aquí el adelanto va en la ficha y el «cierre» es filtrar Caja a mano.
- **Hoja de cálculo o Odoo:** en la compra se anota cómo se pagó, o queda como cuenta por pagar. Aquí la compra y el pago son dos mundos.
- **Buscadores con «+ Crear "…"»** (Notion, Linear, el selector de productos de Shopify): si no existe, se crea ahí mismo.
- **Línea de compra por importe:** cantidad e importe, y el sistema calcula el unitario.
- **Katana o MRPeasy (fabricación a pedido):** el pedido muestra si alcanzan los materiales y una fecha estimada.
- **Cotizaciones que se mandan** (los borradores de pedido de Shopify, los sistemas de facturación latinoamericanos): un enlace o un texto para pegar en WhatsApp, no solo un PDF.

## Datos de prueba creados y borrados

Creé todo lo siguiente desde la pantalla y lo borré en **una sola transacción**, en orden de dependencias:

| Tabla | Filas | Qué era |
|---|---|---|
| `transactions` | 3 | Egreso de S/ 27 («Mercado»), cobro de S/ 50 por Yape y cobro de S/ 35 en efectivo de María Barrido |
| `print_job_filaments` | 7 | Rollos de los tres trabajos |
| `print_jobs` | 3 | Dos placas Botella y una placa Tapas, del pedido de María |
| `stock_movements` | 17 | Compra (2), consumo de rollos (7), piezas producidas (3), armado (5) |
| `order_status_history` | 6 | confirmed → … → delivered |
| `order_lines` / `orders` | 1 / 1 | ORD-2026-0001 |
| `quote_lines` / `quotes` | 1 / 1 | COT-2026-0001, llavero a medida |
| `purchase_lines` / `purchases` | 2 / 1 | Compra del 6 oct. por S/ 27 |
| `inventory_items` | 2 | «Bolsa de celofán» y el producto terminado que creó el armado |
| `customers` | 1 | María Barrido |
| `document_counters` | 2 | Contadores `order` y `quote` de 2026, creados por mi primer pedido y mi primera cotización (al empezar había 0 filas) |

- **Comprobación:** el conteo de las 44 tablas de `public` volvió exactamente al del inicio (customers 5, orders 10, quotes 3, print_jobs 7, stock_movements 24, inventory_items 5, purchases 3, transactions 13…). Ninguna fila anterior quedó modificada: `updated_at` posterior al inicio solo aparecía en filas mías. Los saldos de los rollos y del estante volvieron a los de antes: botellas 8, tapas 5, dulces 520 g, y los rollos NEGRO-01 en 861.1 g, ROJO-01 936 g, ROSA-01 624.5 g y VERDE-01 380 g. `storage.objects` sigue en 1: no subí fotos.
- **No quedó nada mío.** No toqué el trabajo abierto «Botellas de Ana (repetida)» ni ningún otro dato que no fuera mío.
- **Nota de método:** el panel del navegador estuvo oculto a ratos. En esos tramos llené los campos con `form_input` y pulsé algunos botones con un clic del DOM en lugar del ratón. El recorrido fue el mismo que habría hecho a mano, pero en esos pasos no vi la disposición en pantalla. Dejé la pestaña en tamaño `desktop` y cerré la pestaña auxiliar que usé para consultar el Catálogo.
