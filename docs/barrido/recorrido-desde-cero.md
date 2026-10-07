# Recorrido desde cero (fase A), 2026-10-07

Taller nuevo en local: solo el usuario y el taller, sin semilla ni `bootstrap.sql`. Todo lo demás se cargó por pantallas, como alguien que solo sabe qué hay que hacer:

- configuración, cuentas, impresora, materiales y filamentos (PLA blanco, PLA negro y PETG negro);
- insumos y empaque con foto, y dos compras (una pagada, otra pendiente);
- la calavera desde `Skull_-_AMS.gcode.3mf`: placas 6, 8 y 9, y los moldes como herramienta;
- impresiones (una fallida), armado, cotización de 2 calaveras con 1 en el estante, separo, pedido, «Por lanzar», entrega, cobro parcial y sobrepago;
- pago de compra, caja, resultados, conteo del estante y kardex.

Cada número se comprobó a mano y contra la base. Lo que funcionó está al final.

## Antes de empezar (ya arreglado y publicado)

- `20261008110000` no corría en una base nueva ni en producción: la vista `purchase_payment_status` bloqueaba el `alter column`.
- Las recetas cargadas antes de las piezas impresas no decían qué sale de cada placa. Se arregló con la migración 30 y con un cambio en el plan para los trabajos ligados a líneas de catálogo.

## Graves: rompen datos o el flujo

1. **Se puede cancelar un pedido entregado y cobrado.** ORD-2026-0001 quedó «Cancelado» con 2 unidades entregadas y S/ 38 cobrados.
   - Resultados pasó a ventas S/ 0.
   - La plata sigue en las cuentas y las calaveras ya salieron del estante.
   - La base tiene que rechazarlo si hay entregas o cobros vigentes, y la pantalla no debe ofrecerlo.
2. **La importación no pone las piezas en la receta.** Guarda qué pieza sale de cada placa, pero `recipe_items` queda sin piezas.
   - Sin ellas, «Armar» no las consume y el plan no sabe que hay que imprimirlas.
   - La única forma de agregarlas es «Insumos por unidad» («dulces, empaque, imanes…»).
   - Ahí la pieza aparece como «no se ha comprado este insumo… costo provisional» y «Frente de calavera (sin costo) S/ 0.00», con aviso. En el cotizador sale igual.
   - La importación ya supone «una de cada pieza por producto»; tiene que escribirlo.
   - La receta necesita una sección «Piezas por unidad», separada de los insumos, sin aviso de costo, porque su costo son las placas.
3. **En un taller nuevo, la importación no deja crear piezas.**
   - Todo objeto queda en «No va al estante» y el desplegable dice «Nada coincide con «»».
   - Hay que descartar, ir a Inventario › Piezas impresas y volver a importar.
   - Falta «Crear «Cap» como pieza nueva» en el mismo lugar, con la miniatura de la placa como foto.
4. **Cotizador sin cliente nuevo.**
   - Solo ofrece «Sin cliente todavía».
   - Ir a Clientes y volver **borra la cotización en curso**.
5. **El cotizador parece vacío al cargar una variante.**
   - Los filamentos dicen «Elige el filamento…» y los insumos, «Otro (a mano)».
   - Por dentro los datos están: los gramos, el costo y el desglose salen bien.
   - Invita a elegir todo de nuevo.
6. **Los rollos no dicen su material.**
   - El PETG negro quedó como «NEGRO-02», como si fuera el segundo PLA negro.
   - En la cola, al elegir rollo, «NEGRO-01 · Negro» y «NEGRO-02 · Negro» no se distinguen.

## Decisiones del dueño

7. **¿Dónde va lo que se imprime y no se vende?**
   - El molde (S/ 7.72), la impresión fallida (S/ 0.28) y el ajuste del conteo consumen inventario, pero no llegan a ningún gasto de Resultados.
   - El costo de ventas es el estimado (ADR-022) y las compras no restan.
   - Va junto con ADR-022. Una opción es un renglón mensual «producción no vendida»: fallas, pruebas, herramientas y ajustes, al costo real.
8. **Las herramientas no existen como concepto.** Los moldes se imprimen como trabajo suelto que «no deja nada en el estante». Hay dos opciones:
   - un artículo de tipo herramienta, con su costo amortizado;
   - un trabajo «para el taller» que va a gasto.
9. **«Crear trabajo» en la línea de catálogo de un pedido**, más «Impresiones de este pedido: crea uno desde una línea».
   - Con ADR-021 eso lo hace «Por lanzar», así que esos trabajos nunca van a estar atados al pedido.
   - Propuesta: quitarlo para catálogo y dejarlo solo para lo hecho a medida.
10. **La causa de falla «Warping / deformación» no existe.** Es la causa real de las placas dobles; usé «Adhesión».

## Medios

- Hoy, taller vacío:
  - no hay guía de primeros pasos;
  - los mensajes suponen datos («las impresoras están al día» sin impresoras, «todo el filamento está sobre su mínimo» sin filamentos).
- Hoy solo avisa de filamentos bajo mínimo. Piezas e insumos bajo mínimo no aparecen: frente 0/2, trasera 0/2, tapa y gancho 5/7.
- Caja: cobros y pagos de compras quedan sin categoría, y las categorías de Configuración no se usan solas.
- Una pieza sin foto propia muestra «Sin foto · Agregar» y un ícono genérico en los selectores, aunque su placa tiene miniatura.
- Al agregar un insumo a la receta, la fila nueva conserva la cantidad y el costo del anterior. Casi agrego 2 g de dulces en vez de 50.
- La entrega viene llena con «Entregar todo (2 unidades)» cuando había 1 armada.
- Entregar no pide confirmación.
- El rollo usado sigue «sellado».
- «Qué se imprime» no se llena con la etiqueta de la placa elegida, y es obligatorio.
- La importación no muestra qué rollo va a asignar a cada placa antes de guardar. Ahí se elegiría PETG negro para un molde que el archivo dice rojo.
- Compras en gramos:
  - pide «Precio unitario (S/)» por gramo (0.015);
  - la revisión dice «1000 g × S/ 0.02 = S/ 15.00»;
  - y «20 unidad».
- La cotización guardada dice «Precio base · margen del 50 % · S/ 19.00» para un producto de catálogo. El 50 % daría S/ 16; S/ 19 es el precio de lista.
- Costo por unidad «S/ 1.510» junto a «Producción S/ 1.512». Costo del pedido S/ 15.70 contra S/ 15.69 del lote.
- El tiempo de placa importada se muestra como «44.433333333333» minutos en el campo.
- No hay forma de crear el taller desde la app. El disparador `workspaces_add_creator_as_owner` no hace dueño a nadie si el taller se crea por SQL.

## Menores (texto)

- «Parte de los valores vigentes» en los primeros parámetros, cuando todavía no hay ninguno.
- La cuenta de efectivo nace con «Sin medio por defecto».
- «Los rollos se crean al registrar una compra», sin enlace a Compras.
- «Aún no hay empaque registrados».
- «Faltan 1 unidad».
- Sin mensaje «Se armó 1» después de armar.
- «Plazo de entrega» se pide al crear el producto y no aparece en la ficha.

## Lo que funcionó y cuadró

- **Parámetros de costo, cuentas e impresora.** Hora de máquina S/ 0.42 = 0.30 + 0.12.
- **Compra con envío repartido por monto.**
  - Envío: 3.13 + 3.12 + 3.75 = S/ 10.
  - Rollos a S/ 53.13, S/ 53.12 y S/ 63.75.
  - Compra por pagar y su pago posterior.
- **Importación.** Lee bien las 9 placas (minutos, gramos, objetos, miniaturas), propone «Cap» → Tapa y asigna los rollos por color.
- **Costo de receta, lote 10:** material 8.64 + energía 0.46 + máquina 4.51 + fallos 1.51 = 15.12, más preparación 2.50, trabajo 20.00 e insumos 28.50 = **S/ 66.12, S/ 6.61 por unidad**.
- **Escalera de precios.**
  - Lote 1: S/ 9.47 de costo. Precio S/ 19, margen 50.16 %.
  - Desde 5: S/ 15, margen 54.27 %.
  - Desde 10: S/ 13.50, margen 51.04 %.
- **Cola.**
  - Llena tiempo, rollos y gramos desde la placa, y dice qué deja en el estante.
  - Horarios con 15 min de cambio de placa, aun sin la fila de horario guardada.
  - Al cerrar, «Stock que quedó».
- **Costo real de las piezas.**
  - Tapas y ganchos: 0.69 / 14 = 0.049286 cada uno.
  - Frente: 0.71. Trasera: 0.48.
  - Falla: S/ 0.28, con 3.45 g de merma, y «Por lanzar» vuelve a proponer la placa.
- **Armado.** «Alcanza para 1». La calavera entra a S/ 4.1386, la suma exacta de lo consumido.
- **Cotizador, 2 calaveras con 1 en el estante.**
  - «Listo hoy 13:15» = 11:47 + 33 + 15 + 22 + 18 de armado.
  - «Si falla una placa 14:03».
  - «1 en el estante · 1 por fabricar».
  - Lote S/ 15.69, precio de lista S/ 19, margen 58.68 %.
- **Separo.** Otro vendedor ve «Separado para María Torres (COT-2026-0001) hasta el jueves 8 de octubre, 23:00… Si no confirma, listo ya».
- **Aceptar.**
  - El pedido conserva su lugar en la fila.
  - Compara la promesa: «Cuando se cotizó 13:16. Hoy 13:18».
  - «Por lanzar» propone solo el frente y la trasera.
- **Entrega y cobro.**
  - Entrega de 2.
  - Cobro parcial de S/ 20.
  - Sobrepago rechazado con el mensaje de la base.
  - Saldo de S/ 18.
  - «Lo entregado S/ 8.28» = 2 × 4.1386.
- **Cuentas y caja.** Efectivo S/ 462 y Yape S/ 150. Caja, historial con costo real, Hoy (85.71 % de éxito), conteo del estante en el kardex y kardex con fotos.

## Estado después de los arreglos (2026-10-07)

Los arreglos están en la rama `recorrido-desde-cero`, en tres ramas mezcladas (`arreglos-catalogo`, `arreglos-ventas` y `arreglos-inventario`). Pasan 299 pruebas de dominio y migraciones y 476 de la web, y el build compila.

**Graves: los seis, arreglados.**
1. Un pedido entregado o con cobros no se cancela. Lo impide la base, y la pantalla ya no lo ofrece.
2. La importación mete las piezas en la receta, una por unidad.
3. La importación crea piezas con «+ Pieza nueva».
4. El cotizador crea el cliente ahí mismo, y la cotización en curso sobrevive a salir y a recargar.
5. Los selectores del cotizador muestran lo cargado.
6. Los rollos llevan su material en el código y en todas las listas (`PETG-NEGRO-01`).

**Decisiones: las cuatro, aplicadas.**
- Producción no vendida y herramientas: ADR-023.
- «Crear trabajo» en el pedido:
  - una línea a medida tiene «Imprimir para este pedido»;
  - una de catálogo tiene «Ver qué falta imprimir», que lleva a «Por lanzar» filtrado.
- Causa de falla «Warping / deformación».

**Medios y menores: arreglados.** Con estas excepciones:
- **Crear el taller desde la aplicación:** sigue sin existir.
- **Movimientos de Caja que ya están sin categoría:** no se reclasificaron. Las categorías por defecto rigen desde ahora.
- **Costo de ventas (ADR-022):** sigue esperando la decisión del dueño.

**Hecho además de lo pedido:**
- El costo de una línea de pedido es el de su lote, al céntimo: 15.69, ya no 15.70.
- Los meses de Resultados se cortan en la hora del taller.
- Compras ya no ofrece piezas ni productos armados.
- Las piezas sin foto muestran su placa en el catálogo y en la cola.
