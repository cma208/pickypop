# Visual — ronda 2

> En esta ronda no usé el navegador. Leí los otros cinco informes enteros, la aclaración del dueño en `00-encargo.md` y sus tres respuestas en `ronda-2/00-encargo-ronda-2.md`. Volví al código solo para comprobar lo que cito. La referencia `3·H10` quiere decir: informe 3, hallazgo H10.

## De acuerdo

- **La foto de la pieza y de la placa (2·H10, 4·H6, 5·H9).** Los tres llegan, por caminos distintos, a lo mismo que mi H1: el `.gcode.3mf` ya trae la imagen de cada placa.
  - 4·H6 encuentra algo que se me pasó: **la columna para guardarla ya existe**, `recipe_plates.thumbnail_path` (`20260930000000_catalog.sql:95`). La función que duplica variantes ya la copia (`20261009110000_duplicate_variant.sql:71,75`). Nadie la llena.
  - También tiene razón en que falta una pieza: `core/zip.ts` solo exporta la lectura de texto (`readEntryAsText`, `:122`; `readTextEntry`, `:155`). La función que descomprime (`inflateRaw`, `:109`) ya devuelve bytes; exportar una `readEntryAsBytes` es de una hora.
- **No hay dónde crear ni editar una pieza (3·H9).** Es la causa de raíz del «no se le puede poner foto» que el encargo da por comprobado. `ItemForm` ofrece los cinco tipos y elige «Insumo» por defecto (`item-form.ts:87,96`), y lo creado desaparece de la lista donde se creó. Lo que propone 3·H9 (cada pantalla decide el tipo, y Piezas tiene «+ Nueva pieza» con foto) es lo mismo que el punto 3 de mi H1, mejor argumentado.
- **El selector buscable tiene que arreglarse antes de usarlo en todas partes (3·H11).**
  - Al abrirse no pone el cursor en el buscador.
  - No se cierra al hacer clic afuera.
  - Ofrece piezas y productos terminados en la compra.
  - No deja crear un artículo nuevo desde ahí.

  Yo propuse llevar `pp-item-picker` a nueve sitios más (mi H1). Sin estos arreglos, multiplicaría los defectos por nueve. Pasa a ser condición previa.
- **Cuatro nombres para el mismo número (3·H1).** «Disponible», «Existencias», «En el estante» y «Hay» (`filamentos.page.ts:77`, `insumos.page.ts:61`, `piezas.page.ts:55`, `armar.page.ts:91`). Es un hallazgo de consistencia que yo no vi, y pesa más que mis 20 tamaños de letra: el ojo puede perdonar un tamaño de letra distinto, pero una palabra distinta para lo mismo obliga a pensar.
- **Los trabajos se titulan todos igual (1·T3, 4·H6).** El título de la tarjeta es `label ?? lineDescription ?? plateLabel` (`print-job-card.ts:138-141`). Una placa de tapas sale titulada «Botella de poción con dulces surtidos». Refuerza mi H7: la foto de la placa y el título «Tapa impresa × 9» resuelven las dos cosas a la vez.
- **El éxito se ve como error (1·T4).** Justo después de armar 10, la tarjeta pasa a «No alcanza» en rojo (`armar.page.ts:48`) y a «Falta stock para 10. Alcanza para 0.» (`:74`). Es el caso extremo de mi H6: el color dice lo contrario de lo que pasó. La confirmación de lo hecho («10 armadas: entraron al estante») tiene que ir antes que la disponibilidad nueva, y en verde.
- **Una sola «situación» en lugar de estados movidos a mano (2·H7, 4·H7).** Visualmente es justo lo que yo pedía en H6: una insignia de color por fila, en lugar de tres píldoras (propósito, estado, cobro). La situación deducida («Falta imprimir: 3 placas, terminan el jueves») es una insignia más una frase.
- **El cierre en un toque (4·H5)**, con «Salió bien: 9 tapas», «Falló…» y «Otra cosa…», es la cabecera de ficha de mi H5 aplicada a la tarjeta del trabajo: **una** acción grande, la siguiente.
- **Armar pertenece a Producción (4·H7)** y el estante merece su pantalla (3·H8). Estoy de acuerdo con las dos cosas, y no chocan: Armar es una acción del lado de producción, y el Estante es inventario.
- **La foto en las líneas de venta, con 40 px como mínimo (5·H9).** Coincide con mi escala. Y el PDF con foto (5·H8) es otro motivo para la miniatura de 256 px: incrustar el original de 768×1024 en cada línea del PDF lo engorda sin ganancia.
- **«Cuenta» como cuatro botones en el cobro (5·H5).** Es el mismo control que debería pedir «Pagado con» en la compra (3·H3). Un solo componente para las dos cosas.

## En desacuerdo

1. **Sobre el tamaño en selectores (3·H10 propone 80 px) y la cuadrícula en Insumos, Empaque y Piezas.**
   - El panel del selector mide como máximo 18rem, unos 288 px (`item-picker.ts:104`). Descontando el buscador, con fotos de 40 px se ven unas cinco opciones; con fotos de 80 px, unas dos y media. El selector está para recorrer muchos artículos; con dos y media por pantalla se recorre a ciegas. Polaris usa 40 px en sus listas, y las de 80 las reserva para cuando la imagen es el foco.
   - Una cuadrícula pierde la columna alineada de los números (hay, mínimo, libre), que es lo que se mira en Insumos y Empaque. Además, es una segunda vista que mantener.
   - **Mi posición:** cuadrícula donde la decisión es *cuál* (Catálogo, Armar, elegir producto en la venta) y tabla donde la decisión es *cuánto* (inventario).
   - **Lo que sí tomo de 3·H10:** 48 px en las filas de artículos. Esas filas siempre tienen dos líneas (nombre y dato) y miden unos 57 px de alto (15 px × 1.5 + 0.78 rem × 1.5 + 2 × 0.5 rem de relleno). Una foto de 48 entra sin agrandar la fila; con 40 se desperdician 8 px de reconocimiento. Corrijo mi escala (ver «Lo que cambio»).
2. **Sobre el semáforo de tres colores en «¿Para cuándo?» (5·H3).** El ejemplo pinta verde «4 armadas», ámbar «6 por fabricar» y rojo «Falta». Fabricar es lo normal en un taller que trabaja contra pedido: pintarlo de ámbar lo vuelve una alerta permanente, y tres colores en un bloque de cinco líneas es el ruido de mi H6.
   - Katana usa el rojo solo cuando algo no está o llega tarde ([Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability)).
   - **Mi posición:** el reparto va en una barra sin alarma, y el color se reserva para lo que pide hacer algo (falta material sin plazo, o llega después de lo prometido). Ver el diseño más abajo.
3. **Sobre dos imágenes por fila en «Por lanzar» (4·H2, «[foto de la pieza, 64 px] [miniatura de la placa]»).** Dos imágenes en cada fila duplican el peso visual y compiten entre sí. Una imagen por fila, elegida según el contexto (ver la contradicción 3). En la cola manda la placa, porque eso es lo que se pone en la cama. La foto de la pieza aparece solo si la placa no tiene miniatura.
4. **Sobre «Poner en cola» como botón relleno en cada fila (2 «Opción B», 4·H2).** Con cinco propuestas son cinco botones primarios, que es el problema de Impresoras (cinco primarios a la vez). Cada fila lleva «Poner en cola» como secundario, y el bloque lleva **un** primario arriba: «Poner todo en cola».
5. **Sobre cuatro cifras en cada fila (3·H1, `pp-stock` con «En mano · Apartado · Libre · Falta» en todas las pantallas).** Cuatro números por fila convierten Insumos en una hoja de cálculo. En las listas se muestra **una** cifra, la que decide, y el resto como segunda línea en gris. Las cuatro se ven juntas en la ficha y en la historia del artículo. Y la palabra es la del dueño, «separado», no «apartado» ni «comprometido» (ver «Otras contradicciones»).

## Las contradicciones

**1. ¿A qué pedido le toca primero lo que hay?** El dueño ya decidió: por defecto, el que confirma primero; una persona puede cambiarlo, con aviso. Lo que falta resolver es que **la cola y el estante lean el mismo orden**.
- 2 proponía repartir el estante por confirmación e imprimir primero lo que vence antes. 4 proponía asignar lo impreso por fecha de entrega. Si conviven dos órdenes, un pedido confirmado antes y con entrega más tarde se queda con lo que acaba de salir de la impresora, mientras el urgente espera. La pantalla mostraría dos verdades.
- **Posición:** una sola fila de pedidos, en orden de confirmación, que leen el estante, el plan y la cola. La fecha de entrega no reordena sola: se ve como aviso en la fila que llega tarde («vence el miér 7 · sale el jue 8»), con un botón «Pasar adelante» que es el cambio a mano que pidió el dueño, y que deja rastro.
- Visualmente, esa fila es una lista de `pp-item` numerados (1, 2, 3…), la misma en la ficha del artículo («quién tiene separado»), en «Por lanzar» («cubre a») y en la cola.

**2. ¿Se escribe la reserva o se calcula?** **Se calcula, con el vencimiento guardado en el documento.** El separo no es un saldo: es una fecha de vencimiento de la proforma o del pedido. Una columna `separado_hasta` en `quotes` y en `orders` basta:
- vale para la proforma y para el pedido en espera, como pidió el dueño;
- un pedido confirmado no la usa, porque separa sin vencer;
- «Acortar a cero» es escribir la hora actual;
- la cuenta solo cuenta los separos con `separado_hasta > now()`.

Los movimientos `reservation` y `release` se quedan en el enum sin usarse, porque las migraciones son de ida. Pero hoy las vistas los restan para dar «disponible» (`20260929231000_inventory.sql:200-203,239-242`). Esas vistas tienen que pasar a leer la cuenta nueva, para que no haya dos «disponibles».

Lo digo desde lo visual: un separo que se escribe como movimiento no puede mostrar «vence en 5 h» sin una segunda fuente, y la cuenta regresiva es lo que hace entender el separo sin explicación. **Plazo por defecto: 48 horas, configurable** (como el horario de impresión). Es lo que tarda en decidir un cliente de WhatsApp que tiene que consultarlo, y no deja congeladas por una semana las 8 botellas de un estante tan chico.

**3. ¿De dónde sale la foto de una pieza?** **De las dos fuentes, con un orden fijo y sin copiar una en la otra.**
1. La foto que sube una persona (`inventory_items.image_path`), si existe.
2. Si no, la miniatura de la placa que la produce (`recipe_plates.thumbnail_path`, que se llena al importar el `.gcode.3mf`).
3. Si no hay ninguna, el icono del tipo (mi H2).

No se copia la miniatura de la placa en `image_path`. Si se copiara, al volver a importar la placa la foto de la pieza quedaría vieja, y una foto real cargada después competiría con una copia en lugar de reemplazar a un respaldo. Es la regla de la casa aplicada a las imágenes: lo que se puede deducir no se guarda dos veces.

**Qué se muestra en cada contexto:**
- **En la cola, en «Por lanzar» y en el trabajo que se está imprimiendo** manda la **placa**: la persona busca lo que va en la cama («9 tapas en negro»), no la tapa sola.
- **En el estante, Armar, la receta, la compra y el pedido** manda la **pieza**: lo que se tiene en la mano. Ahí la placa es solo el respaldo.
- En la ficha de la pieza, si se está usando la placa, una línea lo dice: «Foto de la placa, sacada del archivo laminado · [Subir una foto real]».

**Lo que no verifiqué:** el repositorio no tiene ningún `.gcode.3mf` real (`packages/slicer-files/test/fixtures/` solo trae los `.config`). No sé si `plate_N.png` encuadra las piezas o la cama entera. Si encuadra la cama, nueve tapas chicas a 48 px se leen como puntos, y la foto real se vuelve necesaria en el estante. Hay que mirarlo con un archivo del taller antes de decidir el tamaño en las filas del estante.

**4. ¿Dónde vive el «¿para cuándo?»?** **Una función en la base y un componente en `ui/`.**
- Se ve en cuatro sitios: el cotizador, el pedido nuevo, el panel de aceptar y la ficha del pedido. En los cuatro es el mismo componente, `pp-promise`, en dos tamaños: compacto debajo de cada línea, y completo en el resumen y en el panel de aceptar.
- **Dueño de la cuenta:** la planificación de producción, porque la fecha sale de la cola y del horario (respuesta 1 del dueño). Es la misma cuenta que `production_plan`, pero con las líneas nuevas al final de la fila (2, «Dónde vive»).
- **Dueño del componente:** `ui/`, para que ninguna pantalla lo pinte a su manera. Hoy hay cinco versiones de una cifra grande (mi H4); no puede haber cuatro versiones de una promesa.

**5. ¿La compra crea su egreso sola, o se liga desde Caja?** **Lo crea sola, en la misma operación (3·H3, `register_purchase`).**
- «Pagado con» usa el mismo control de cuatro botones que el cobro (5·H5), con una quinta opción: «Lo pago después».
- Esa opción deja la compra con una insignia «Por pagar S/ 27» en la lista de Compras, y la cuenta en Hoy dentro de «Lo que vence».
- La ficha de la compra tiene **un** botón primario, «Registrar el pago», que crea el egreso ligado.
- Desde Caja, un egreso de categoría inventario ofrece elegir entre las compras por pagar, y nada más. Así una compra pagada después también queda bien en Resultados, sin agregar un circuito de cuentas por pagar.

**Otras contradicciones que encontré:**
- **El vocabulario del stock no coincide entre informes.** 2 dice «en el estante · por armar · por imprimir»; 3 dice «en mano · apartado · libre · falta»; 5 dice «armadas · por fabricar · libres» y «comprometido»; y el dueño dice «separo» y «disponible». Si cada pantalla nueva toma el de su informe, el problema de 3·H1 se repite multiplicado.
  - **Propuesta, una sola vez y para todas las pantallas:** **Hay · Separado · Libre · Falta** para un artículo; **en el estante · por armar · por imprimir** para las unidades de una línea de venta; y **separo** para el acto de apartar.
  - «Comprometido», «apartado», «reservado», «disponible» y «existencias» salen de la pantalla.
- **Los tamaños de foto no coinciden:** 3 propone 48 en filas y 80 en selectores, 5 propone 40 como mínimo, y yo 40 en filas y 64 en la fila protagonista. Se resuelve en la escala corregida de abajo.
- **Qué va en Hoy.** 4·H10 cambia «Impresiones de la semana» por una tarjeta de la impresora; 1·T7 buscó en Hoy cuánto entró y cuánto le deben. Caben las dos, como una franja de tres cifras (`pp-stat`) bajo «Lo que vence»:
  - «Imprimiendo tapas · termina 14:20»;
  - «Entró hoy S/ 85»;
  - «Te deben S/ 540».

  Las métricas se van a su pantalla, como pide 4·H10.

## Cómo se ven los bloques nuevos

Todos usan las mismas piezas:
- **`pp-item`**: la fila de artículo, con foto, nombre y dato.
- **`pp-resource-header`**: la cabecera de ficha, con **una** acción principal.
- **`pp-stat`**: la cifra con su etiqueta.
- **`pp-promise`**: el bloque «¿Para cuándo?».
- **La escala de letra:** 12 / 13.5 / 15 / 18 / 26.
- **La escala de fotos corregida:** 24 en línea · 40 opción de selector · **48 fila de artículo** · 64 fila protagonista · **96 lo que está en la impresora** · ancho completo en tarjeta · 240 en ficha.
- **El color** se reserva para lo que pide hacer algo, con un máximo de una insignia de color por fila.

### «Por lanzar», en la cola (2 «Opción B», 4·H2)

```
Por lanzar                                         7 h 40 min   [ Poner todo en cola ]
──────────────────────────────────────────────────────────────────────────────────────
Para pedidos
[placa 64]  Tapa impresa × 9 por placa                       4 placas · 1 h 20 min
            ● Negro 60 g · alcanza                        [− 4 +]  [Poner en cola]
            cubre 1 PED-0003 · 2 PED-0004 · 3 PED-0005

[placa 64]  Botella impresa × 1 por placa                   32 placas · 23 h
            ● Rosado 182 g ● Negro 148 g ● Rojo 33 g · alcanza
            cubre 1 PED-0003  (vence ayer)        [llega tarde]   [− 32 +]  [Poner en cola]

Para comprar
[foto 48]   Dulces surtidos · faltan 2,186 g                 [Registrar compra]
            La última vez: 500 g a S/ 15 en Tienda local

Para armar
[foto 48]   Botella de poción · Con dulces surtidos · ya alcanza para 5      [Armar 5]

▸ Para reponer el mínimo (2)
```

- **La imagen es la de la placa** (contradicción 3). Si la placa no tiene miniatura, va la foto de la pieza.
- **El título dice la pieza y cuántas da cada placa.** La cantidad que se propone lanzar va a la derecha, con números tabulares (alineados), para que las cifras queden en columna.
- **Los pedidos que cubre van numerados en el orden de la fila** (contradicción 1). La única insignia de color es «llega tarde», y solo aparece cuando corresponde.
- **Un solo botón primario**, el del encabezado. En cada fila, el botón es secundario.
- **Al aceptar, la fila se encoge en el momento** (4·H2). Esa es toda la confirmación: no hay aviso aparte.
- **En el celular**, cada fila se apila: la imagen y el texto arriba, el control de cantidad y el botón abajo, a todo lo ancho.
- **Si no hay nada que lanzar**, un estado vacío de una sola frase: «Nada por lanzar: los pedidos están cubiertos.»

### «¿Para cuándo?» en la venta (`pp-promise`; 2·H3, 5·H3)

**Compacto, debajo de la cantidad de cada línea** (cotizador, pedido nuevo):

```
Listo el jue 8 oct                                    ← 18 px, la cifra que se busca
▇▇▇▇▇▇▇▇▇▇▇▇░░░░░░░░▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢
4 en el estante · 2 por armar · 4 por imprimir (4 placas, 3 h 12 min)
Ver el detalle
```

- La barra reparte las 10 unidades:
  - **en el estante**: relleno de `--good-soft`;
  - **por armar**: relleno de `--info-soft`;
  - **por imprimir**: solo el contorno, sin color.

  Así no hay alarma en lo normal. Los colores salen de los tokens, nunca escritos a mano.
- **Si falta material**, aparece **una** línea más, en `--warn` y con la foto: `[foto 40] Faltan 36 g de Dulces surtidos · Tienda local, sin plazo registrado`. Si nada falta, la línea no existe. No hay un «alcanza» verde que leer.
- **Si la fecha que se va a prometer es anterior a la que da el taller**, la cifra pasa a `--danger` con la frase «El taller da jue 8; prometiste miér 7». **Ningún botón se apaga** (aclaración del dueño).
- **«Ver el detalle»** abre la explosión por componente, cada uno con `pp-item` de 48: hace falta, libre, y de quién es lo separado.

**Completo**, en el resumen de la cotización y en el panel de aceptar: es la misma barra por línea, más la fecha del documento, que es la de la línea más lenta, como `pp-stat`.

**En el PDF** va solo la frase relativa: «Entrega: 2 días desde que confirmes» (5·H3).

### La posición de un artículo (3·H1)

**En las listas** (Insumos, Empaque, Estante): una cifra por fila, la que decide.

```
[foto 48]  Dulces surtidos                      Libre 0 g      [Falta 2,346 g]
           Hay 360 g · Separado 2,706 g · mínimo 1,000 g
```

- La cifra principal es **Libre**. Las otras tres van en la segunda línea, en gris. **«Falta» es la única insignia**, y solo aparece si es mayor que cero.
- La columna se titula **«Libre»**, y ese nombre es igual en Filamentos, Insumos, Empaque, Estante, Armar y la venta.

**En la ficha y en la historia del artículo** van cuatro `pp-stat` en fila: **Hay 360 g · Separado 2,706 g · Libre 0 g · Falta 2,346 g**.

«Separado» es un enlace. Abre **quién tiene qué, en el orden de la fila** (contradicción 1):

```
1  PED-0003 · Ana Quispe        660 g    pedido
2  PED-0004 · Lucía Ramos       330 g    pedido
3  COT-0012 · María Pérez       660 g    ⏱ separo hasta jue 8, 18:00
4  …
```

### Aceptar la cotización (2·H1, 5·H1)

- **En la cabecera de la cotización:** el título es humano, «Colegio San Martín · 30 pociones». El número y la fecha van en el subtítulo, con la insignia de estado. **El primario es «El cliente aceptó»**, disponible también desde el borrador (5·H1). «Descargar PDF», «Enviar por WhatsApp» y «Crear versión» pasan a un menú «Más».
- **El panel se abre en la misma pantalla**, en una sola columna:
  1. **Cliente**: un `pp-item` con iniciales. Si falta, «Crear «María»» ahí mismo.
  2. **Líneas**: `pp-item` de 64, con la foto (o la placa, si es a medida), la cantidad y el precio congelado. Si la cotización venció, se ven los dos precios, como pide 5·H3.
  3. **Entrega**: `pp-promise` completo, comparando «Cuando cotizaste (6 oct): entrega inmediata» con «Hoy: listo el jue 8». La fecha propuesta es editable.
  4. **Adelanto**: tres botones (0 %, 50 %, 100 %) y la cuenta como cuatro botones (5·H5).
  5. **Un solo primario abajo, «Crear pedido»**, fijo al pie de la pantalla en el celular.
- **Al confirmar**, la pantalla salta al pedido. Su cabecera dice «Viene de COT-0004», con enlace.

### El separo con su vencimiento (respuesta 2 del dueño)

Es un chip con reloj, siempre junto a la insignia de estado. Cambia de aspecto según el tiempo que le queda:

| Cuánto le queda | Cómo se ve | Acciones |
|---|---|---|
| Más de 24 h | Neutro: `⏱ Separado hasta jue 8, 18:00` | «Extender 1 día» · «Soltar ahora» |
| Menos de 24 h | `--warn`: `⏱ El separo vence en 5 h` | Las mismas |
| Vencido | Gris y tachado: `Separo vencido el jue 8 · el material volvió a estar libre` | «Volver a separar» (avisa si ya no alcanza) |

- **En la proforma**, el chip va en la cabecera. En la lista de Cotizaciones va como segunda línea de la fila. En el **PDF** va una frase para el cliente: «Te separamos el material hasta el jueves 8 a las 18:00». Le da al cliente el motivo para decidir pronto, que es lo que buscaba el dueño.
- **En el pedido en espera**, el chip va al lado de «En espera», en la cabecera.
- **En la posición de inventario**, el chip va en la lista «quién tiene qué» de arriba. Un pedido confirmado dice solo «pedido», sin reloj, porque no vence.
- **«Soltar ahora»** es «acortar a cero». Va como acción secundaria con texto de peligro y una confirmación de una línea: «El material de María vuelve a estar libre. ¿Soltar?».
- **En Hoy**, en «Lo que vence»: «El separo de María Pérez vence hoy a las 18:00 · COT-0012», con «Extender» y «Soltar» en la misma fila. Es un vencimiento, así que va ahí y no en otra tarjeta.

### El aviso «María Pérez hizo un separo antes» (respuesta 3 del dueño)

Aparece **pegado a la elección**, no en una ventana: en Armar «para» un pedido, en Entregar, en el «Pasar adelante» de la fila y en «Por lanzar». Lleva cuatro datos, en el orden en que se leen:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ (MP)  María Pérez separó 6 de estas botellas antes                         │  ← 15 px, negrita
│       el lun 5 a las 10:12 · su separo vence el jue 8, 18:00 · COT-0012    │  ← 13.5 px, gris
│       Si se las das a Café Lima, a María le faltarán 6                     │
│       y su entrega pasa del jue 8 al sáb 10.                               │
│                                                                            │
│       [ Respetar el separo de María ]   Dárselas igual a Café Lima         │
└────────────────────────────────────────────────────────────────────────────┘
```

- **El nombre del cliente va primero y en negrita**, con un círculo de iniciales. Es lo único que hay que leer para entender el aviso. Abajo va, en chico, quién registró el separo, si fue otra persona del taller: «lo registró Carlos».
- **La consecuencia se dice en fechas, no en unidades sueltas:** «su entrega pasa del jue 8 al sáb 10». Sale de la misma cuenta del «¿para cuándo?».
- **«Respetar» es la opción por defecto** (es el orden de confirmación): botón secundario con el foco puesto. «Dárselas igual» es un botón de texto, y al usarlo pide una línea de motivo opcional.
- **Va en `--warn`, no en `--danger`.** No es un error: es una decisión permitida.
- **Deja rastro en los dos documentos**:
  - en el de María: «Café Lima tomó 6 botellas de tu separo · Carlos, 6 oct 15:20»;
  - en el de Café Lima: «Pasó adelante de María Pérez».

## Lo que cambio de mi informe

- **Corrijo: la miniatura de la placa no necesita «carpeta nueva» ni convención; tiene columna.** `recipe_plates.thumbnail_path` existe (`20260930000000_catalog.sql:95`). En la ronda 1 la planteé como si hiciera falta inventarle un lugar (H1, punto 4, y «Escala de fotos y miniaturas»). Sí hace falta la lectura binaria del zip (4·H6).
- **Corrijo la escala de fotos:**
  - **fila de artículo: 48 px** (antes 40), porque cabe en la fila de dos líneas sin agrandarla;
  - **opción de selector: 40 px**;
  - **lo que está en la impresora: 96 px**, que agrego tomándolo de 4·H6.

  La miniatura de 256 px sigue alcanzando para todo hasta 96 px a doble densidad de pantalla (192 px reales).
- **Agrego al H4 (consistencia):** el vocabulario del stock (3·H1, cuatro nombres para el mismo número) y la propuesta única «Hay · Separado · Libre · Falta». Es más grave que los tamaños de letra.
- **Agrego al H6 (colores):** el «No alcanza» en rojo justo después de un armado que salió bien (1·T4, `armar.page.ts:48,74`). Un aviso que contradice lo que acaba de pasar confunde más que un color mal elegido.
- **Subo H1 (fotos) de «confunde» a «bloquea» en el caso de las piezas.** Tres informes (3·H9, 4·H6 y el encargo de la ronda 2) confirman que no hay ninguna pantalla para crear o editar una pieza, así que la regla del dueño no se puede cumplir para ellas. El resto de H1 se queda en «confunde».
- **Subo H5 (fichas sin siguiente paso).** Sigue siendo «confunde» por sí solo, pero es donde van a vivir las dos acciones que bloquean (aceptar la cotización y entregar, 2·H1, 2·H6, 5·H1). Si se agregan como un botón más en la tercera tarjeta, quedan tan escondidas como hoy «Registrar cobro». Por eso pasa al tercer lugar de mis cinco.
- **Retiro de la escala la «tarjeta de galería» para Insumos y Empaque.** Nunca la propuse ahí, pero 3·H10 sí, y la descarto con el argumento de arriba.
- **Mantengo** el resto: H2, H3, H7, H8, H9, H10 y H11.

## Si solo se pudieran hacer cinco cosas

1. **La base visual compartida, antes de construir nada nuevo.**
   - Qué incluye:
     - `pp-item` (fotos de 24, 40, 48, 64 y 96 px);
     - la miniatura de 256 px al subir una foto;
     - las utilidades llevadas a `styles.scss`;
     - la escala de letra y de botones;
     - el token `--info`;
     - el vocabulario «Hay · Separado · Libre · Falta»;
     - los arreglos de `pp-item-picker` de 3·H11.
   - **Qué destraba:** que lo que se construya después se vea como una sola aplicación.
   - **Por qué primero:** los cuatro bloques nuevos de los otros informes («Por lanzar», «¿Para cuándo?», la posición del artículo, aceptar la cotización) son listas de artículos con estados. Si se construyen antes, cada uno inventa su fila, su color y su palabra, como pasó con `.with-thumb`, que solo existe en un paquete (`inventario.styles.ts:38`) y la Cola usa sin importarlo. **S–M.**
2. **La foto de la pieza:** «+ Nueva pieza» y «Editar» con foto en Piezas (3·H9), la lectura de `plate_N.png` hacia `recipe_plates.thumbnail_path`, y el orden «foto real, luego placa, luego icono».
   - **Qué destraba:** reconocer la tapa y la botella en el estante, en Armar, en la receta y en la cola, que es la regla permanente del dueño y hoy no se puede cumplir.
   - **Por qué antes que la 3:** «Por lanzar» y Armar están hechos de piezas. Sin su foto, nacen con letras. **M.**
3. **La cabecera de ficha con una sola acción principal, empezando por «El cliente aceptó»** (con `accept_quote` de 2·H1 y 5·H1) **y por «Entregar»** (`deliver_order`, 2·H6).
   - **Qué destraba:** pasar de la proforma al pedido sin escribirlo de nuevo, y entregar sin recorrer cuatro estados.
   - **Por qué antes que la 4:** el «¿para cuándo?» y el adelanto viven dentro del panel de aceptar. Primero tiene que existir el lugar donde se acepta. **M**, más lo que cueste la base de datos según 2 y 5.
4. **`pp-promise` y el separo con vencimiento**, en el cotizador, el pedido nuevo, el panel de aceptar y la ficha del pedido, con el aviso «María Pérez hizo un separo antes».
   - **Qué destraba:** la decisión del vendedor entre proforma y venta, que el dueño puso como no negociable: cuántas hay, qué falta y para cuándo, sin bloquear nada.
   - **Por qué antes que la 5:** es la misma cuenta que «Por lanzar», pero se lee del lado de la venta, que es el que el dueño nombró primero. Además, el separo hace falta para que dos proformas no prometan el mismo rollo rojo. **L** en la base y **M** en la pantalla.
5. **«Por lanzar» en la cola**, con la miniatura de la placa, la fila numerada de pedidos que cubre, un solo primario y la tarjeta del trabajo con la foto de 96 px.
   - **Qué destraba:** responder «¿qué imprimo ahora?» a las nueve de la mañana, que es la opción B que el dueño confirmó.
   - **Por qué al final:** reutiliza todo lo anterior (fila, foto de pieza, vocabulario, la misma cuenta). Construida sobre la base, es casi solo armar piezas que ya existen. **L** en la base y **M** en la pantalla.
