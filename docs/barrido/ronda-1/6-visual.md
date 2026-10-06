# Visual — ronda 1

> **Sobre el navegador.** Sí tuve las herramientas `mcp__Claude_Browser__*`, pero el panel estaba oculto y las capturas fallaban ("the Browser pane is not displayed"). Usé mi pestaña del panel solo para medir el DOM con JavaScript. Las capturas las tomé con un Chromium sin interfaz (el `puppeteer-core` que trae `marp-cli` y el Chromium de Playwright, los dos ya instalados), con un perfil propio. Así no toqué la apariencia ni el `localStorage` que comparte el otro agente. Recorrí las 26 rutas a 1440 px. Las seis más usadas, y seis más, también a 375 px. Hice capturas en modo oscuro (Terracota y Grafito), en Índigo claro y en Ciruela oscuro en celular. Al terminar devolví mi pestaña a `desktop` y la cerré. La apariencia guardada sigue como estaba: `auto`, `terracota`, `comfortable`, menú abierto. Las capturas están en el scratchpad de la sesión, no en el repositorio.

## En cinco líneas

1. **La foto existe, pero no llega a las pantallas donde se trabaja.** `pp-thumb` aparece en 8 de las 26 rutas. No está en pedidos, cotizaciones, la cola, el historial, el kardex, las compras ni en Hoy. Hay al menos 9 selectores de artículos que todavía son `<select>` de texto. Y una pieza impresa **no puede tener foto**: ninguna pantalla deja cargársela.
2. **Donde sí hay foto, no sirve para reconocer el artículo.** Se ve a 28 px y recortada al centro (`object-fit: cover`). Cuando falta, se muestra la inicial, así que «Bolsa» y «Botella» quedan las dos como «B». Para pintar esos 28 px se descarga la foto original de 768×1024 (74 kB), y la URL firmada cambia en cada sesión, así que el navegador no la reutiliza al recargar. **Propuesta:** guardar dos versiones al subir la foto (256 px y 1024 px) y usar una escala de cinco tamaños. Las transformaciones de imagen de Supabase solo existen desde el plan Pro y no se pueden pedir en la firma por lotes que usa la aplicación.
3. **Las pantallas parecen de aplicaciones distintas:** hay 20 tamaños de letra, 7 alturas de botón, tres estilos de pestañas, cuatro de filtros y tablas dentro y fuera de tarjetas. En 11 lugares hay un botón metido dentro de un enlace, y por eso sale del color del acento. La causa: las clases utilitarias están copiadas en cada paquete. La cola de impresión no las importa, y en el celular su tabla se sale de la tarjeta.
4. **Las fichas no dicen qué hacer después.** El título es un código («PED-0003», «COT-0001»). La acción que sigue queda en la tercera tarjeta, o compite con otras 12 que dicen «Guardar». El tono `info` es el color de acento, así que el mismo estado cambia de significado con la paleta: «Imprimiendo» parece una alerta en Terracota y no se distingue de lo neutro en Grafito.
5. **Lo que más cambiaría la sensación:** un componente de artículo con foto (`pp-item`), una cabecera de ficha con título humano y una sola acción, una escala de letra y de botones, un token `--info` fijo, y **tomar la miniatura de la placa que ya trae el `.gcode.3mf`** (`Metadata/plate_N.png`, anotado en `docs/01-investigacion.md:43` y nunca leído) para dar foto a las piezas y a los trabajos sin que nadie la cargue.

## Hallazgos

### H1. «Las fotos no aparecen donde trabajo»
- **Qué pasa:**
  - `pp-thumb` solo se usa en `catalogo.page.ts:91,117`, `piezas.page.ts:66`, `insumos.page.ts:72` (que es también la pantalla de Empaque), `armar.page.ts:39,100`, `produccion.page.ts:56` y en el selector `item-picker.ts` de `compra-form.ts:110`. Más `pp-image-field` en los formularios. En total, 8 de 26 rutas.
  - **Sin foto, aunque son listas de artículos:** las líneas de pedido (`pedido.page.ts:94`), las líneas del nuevo pedido, el desglose de cotización, las tarjetas de trabajo de impresión (`print-job-card.ts:23-31`, en Cola, Historial y dentro del pedido), el kardex, la lista de compras (no dice *qué* se compró, y la columna «Rollos» marca 0 cuando se compraron dulces), «Lo que vence» de Hoy, la historia del cliente y el PDF de cotización.
  - **Al menos nueve selectores de artículos siguen siendo `<select>` de texto:** variante en el nuevo pedido (`pedido-linea.ts:50`), variante en el cotizador (`cotizador.page.html:47`), insumo en el cotizador (`:254`), pieza que produce una placa (`placa-editor.ts:38`), insumo de la receta (`suministro-fila.ts:27`), filamento de la placa (`filamento-fila.ts:46`), y línea de pedido, placa y rollo al crear un trabajo (`print-job-form.ts:47,73,91`). El rollo es justamente el caso en que el color ayuda más, y se elige leyendo «Elige un rollo…».
  - **Una pieza impresa no puede recibir foto.** `piezas.page.ts` no tiene ningún botón (líneas 30-100). Insumos y Empaque filtran por `scope` (`app.routes.ts:30-47`), así que una pieza no aparece en ninguna de las dos. `ItemForm` solo se usa desde `insumos.page.ts`. En la base local, `select kind, count(*), count(image_path) from inventory_items group by kind` da `part|2|0`.
- **Qué tarea traba:** la persona quiere saber qué pedido es «el de las botellas rojas» y tiene que abrirlos uno por uno. Quiere elegir el rollo de la placa y tiene que leer códigos. Quiere que «Botella impresa» tenga foto y no hay pantalla donde ponérsela.
- **Cómo lo resuelven otros:**
  - Shopify pone una miniatura de 40 px en cada fila del índice de recursos ([plantilla resource index](https://shopify.dev/docs/api/app-home/patterns/templates/resource-index.md)).
  - Printago dibuja la miniatura de cada pieza y la muestra en la lista de piezas, en la ficha, en la cola y en cada trabajo. Si no puede renderizarla, usa la imagen que guardó el laminador dentro del archivo ([Part thumbnails](https://docs.printago.io/docs/parts/part-thumbnails)).
  - SimplyPrint muestra una tarjeta con miniatura por cada placa cuando divide un 3MF de varias placas ([print queue](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/)).
- **Propuesta:**
  1. Un componente `pp-item` (foto + nombre + línea secundaria) y usarlo en todas las listas de arriba.
  2. Reemplazar los nueve `<select>` por el `pp-item-picker` que ya existe. Para rollos y filamentos, el picker ya acepta `color` (`item-picker.ts:12`).
  3. Agregar en Piezas una acción «Editar» que abra `ItemForm` con su foto.
  4. Al leer un `.gcode.3mf` en la receta, ofrecer `Metadata/plate_N.png` como foto de la pieza que produce esa placa, si todavía no tiene una. La carpeta `impresiones` ya está prevista en `MediaFolder` (`core/media.ts:7`) y nadie la usa.
- **Tamaño:** M (pp-item y selectores) + M (miniatura de la placa).
- **Gravedad:** confunde (y rompe la regla permanente del dueño).

### H2. «A 28 px no distingo una botella de una tapa»
- **Qué pasa:**
  - Casi todas las listas usan `size="sm"`, que son 28 px (`thumb.ts:34`). El tamaño por defecto es 40 px y `lg`, 80 px. Medido en pantalla: Catálogo 40/28 px, Piezas, Insumos, Empaque y los componentes de Armar 28 px, Falta producir 28 px.
  - La foto se recorta al centro (`thumb.ts:37`, `object-fit: cover`). La foto real es vertical (768×1024), así que en el cuadrado se pierde la silueta de la botella, que es lo que la distingue.
  - Sin foto, se pinta la inicial (`thumb.ts:18`). En Armar salen «B» para Bolsa con etiqueta y «B» para Botella impresa, una debajo de la otra.
  - En Armar, la foto mide 80 px dentro de una tarjeta de unos 176 px de ancho (`armar.page.ts:39`). Las dos variantes muestran la misma foto heredada del producto, así que la foto no ayuda a elegir entre ellas.
  - En la ficha, la variante sin foto propia muestra una «C» (`variante-form.ts:22-27`), aunque el texto de ayuda dice que se usa la del producto y el Catálogo sí la usa (`catalogo.page.ts:119`, `variant.imagePath ?? product.imagePath`).
- **Qué tarea traba:** la persona quiere reconocer la tapa chica sin leer el nombre, y tiene que leerlo.
- **Cómo lo resuelven otros:**
  - Polaris tiene cuatro tamaños de miniatura (24, 40, 60 y 80 px), siempre cuadrados, y encaja la imagen con `max-width/max-height: 100%`: la muestra entera, no la recorta ([Thumbnail.module.css](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Thumbnail/Thumbnail.module.css)).
  - Shopify recomienda una sola proporción, cuadrada, para las fotos principales ([product media](https://help.shopify.com/en/manual/products/product-media/product-media-types)).
  - Airtable deja elegir entre «encajar» y «recortar» la portada de cada tarjeta de galería ([gallery views](https://support.airtable.com/docs/getting-started-with-airtable-gallery-views)).
- **Propuesta:** la escala de tamaños de la sección «Escala de fotos y miniaturas». En miniaturas, mostrar la foto entera (`contain`) sobre `--surface`. Sin foto, un icono por tipo (pieza, insumo, empaque, repuesto, producto) del sprite que ya existe (`layout/nav-icons.ts`) en lugar de la inicial. La variante hereda la foto del producto también en su formulario.
- **Tamaño:** S.
- **Gravedad:** confunde.

### H3. «Cada miniatura pesa lo que la foto entera»
- **Qué pasa:**
  - `pp-thumb` pide la URL firmada del archivo original (`thumb.ts:53-63` → `media.ts:108`). Medido: catálogo, Armar y Falta producir cargan una imagen de **768×1024** para pintar 26 y 38 px. El archivo pesa 74 190 bytes (`storage.objects`).
  - La URL firmada lleva un token con `iat`/`exp`; lo decodifiqué en la página. Cambia cada vez que se firma, y la caché de `Media` solo vive en memoria (`media.ts:42`). Cada recarga vuelve a bajar todas las fotos completas.
  - Probé con esa misma foto: en WebP calidad 80, 256 px de lado mayor pesa **9,1 kB** y 128 px pesa **3,2 kB**. Una lista de 40 insumos pasaría de ~2,9 MB a ~0,4 MB.
- **Qué tarea traba:** en el celular del taller, con datos móviles, cada lista de insumos tarda en mostrar las fotos.
- **Cómo lo resuelven otros:** Supabase transforma imágenes al vuelo, pero solo desde el plan Pro. Incluye 100 imágenes de origen y cobra US$5 por cada 1000 adicionales ([Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)). La transformación va en `createSignedUrl` (en singular). La firma por lotes `createSignedUrls`, que es la que usa `media.ts:108`, no acepta `transform` (`@supabase/storage-js@2.117.2`, `dist/index.d.mts:1408`). En este plan no sirve, y en Pro obligaría a una petición por imagen.
- **Propuesta:** la estrategia de la sección «Escala de fotos y miniaturas». Son dos versiones generadas en el navegador al subir la foto, con la misma función `shrink()` que ya existe, sin cambiar la base de datos.
- **Tamaño:** S.
- **Gravedad:** afea (y hace lento el celular).

### H4. «Cada pantalla parece de otra aplicación»
- **Qué pasa (medido en las 26 rutas a 1440 px):**
  - **20 tamaños de letra distintos** con texto: 10.6, 10.9, 11.2, 11.5, 11.8, 12, 12.5, 12.8, 13.1, 13.6, 14.4, 15, 15.2, 16, 16.8, 17.6, 18.4, 26.4, 32 y 33.6 px. En los estilos de `features/` hay 17 valores `rem` distintos.
  - **7 alturas de botón:** 20, 26, 29, 33, 34, 35 y 39 px.
  - **Pestañas de tres estilos:** solapa rellena en Configuración y en Impresoras (las dos copiadas: `configuracion.page.ts:35-37` y `printer-detail.ts:35-37`), botones-chip en las variantes del producto (`producto.page.ts:27-29`) y chips rellenos como filtro en Cotizaciones.
  - **Filtros de cuatro estilos:**
    - chips (Cotizaciones);
    - `select` con etiqueta (Pedidos, Kardex, Caja, Historial);
    - búsqueda con la etiqueta «Buscar» (Filamentos, Insumos, Por cobrar);
    - búsqueda sin etiqueta (Catálogo, Clientes).
  - **Tablas:** dentro de una tarjeta en Cotizaciones, Piezas, Pedido y Cola; sueltas sobre el fondo en Clientes, Filamentos, Insumos, Compras, Cuentas y Caja.
  - **Cifras grandes (KPI), cinco versiones:** `.big` de 2 rem en Hoy (`panel.page.ts:53`, más grande que el título de la página), `.big` de 1.8 rem en Producción (`produccion.page.ts:131`), y totales de 18.4 px en Cuentas, Caja y Por cobrar con otro marcado.
  - **El botón «Nuevo»:** «+ Nuevo filamento», «+ Nuevo artículo» y «+ Nueva compra» llevan «+»; «Nuevo pedido», «Nuevo producto» y «Nuevo cliente» no.
  - **Las acciones finales de un formulario:** a la izquierda dentro de la tarjeta Resumen en Nuevo pedido, a la derecha y fuera de tarjeta en Nueva compra.
  - **11 botones dentro de un enlace** (`<a><button>`). Ejemplos: `cotizacion.page.html:3`, `pedido.page.ts:29`, `pedidos.page.ts:29`, `cotizador.page.html:6`. Es HTML inválido: dos paradas de tabulación para el mismo control. Además, el botón `.secondary` hereda `color: inherit` del enlace, y por eso «Volver», «Ver cotizaciones» y «Crear versión nueva» salen color acento mientras los demás secundarios salen negros.
  - **La numeración:** la base da a los pedidos nuevos `ORD-2026-0001` (`20260930010000_sales_and_production.sql:61`), en inglés y con año, mientras los de la siembra son `PED-0001`. En la lista de Pedidos se veían los dos formatos juntos.
- **La causa:**
  - Las utilidades están copiadas en cada paquete: `.table-wrap` en `core/styles.ts:23` y `inventario.styles.ts:10`; `.hide-small` en `finanzas.styles.ts:32` e `inventario.styles.ts:19`; `.with-thumb` solo en `inventario.styles.ts:38`; `.alert` en tres archivos; `.as-button` en `image-field.ts:41` y `receta-editor.ts:29`.
  - `produccion.page.ts` usa `with-thumb`, `hide-small` y `table-wrap` sin importar ninguno (líneas 45-65 y 127-138). Por eso, en la Cola la miniatura queda pegada al nombre a cualquier ancho. En el celular, además, no se ocultan «Vendidas» y «Armadas» y la tabla se sale de la tarjeta.
- **Qué tarea traba:** ninguna por sí sola. Pero en conjunto la aplicación no se lee como una sola: el ojo tiene que aprender cada pantalla de nuevo.
- **Cómo lo resuelven otros:**
  - Polaris separa dos plantillas, índice y ficha, y las repite en todo el admin ([resource index](https://shopify.dev/docs/api/app-home/patterns/templates/resource-index.md), [details](https://shopify.dev/docs/api/app-home/patterns/templates/details)).
  - Stripe propone una sola barra de filtros con chips, con «Limpiar filtros» al final ([Filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls.md)).
- **Propuesta:**
  - Pasar las utilidades a `styles.scss` (`.table-wrap`, `.hide-small`, `.alert`, `.notice`, `.stack`, `.toolbar`) y borrar las copias.
  - Agregar `a.button` / `a.button.secondary` para los enlaces que parecen botones.
  - Fijar una **escala de letra de cinco tamaños**: 12 (encabezado de tabla y notas), 13.5 (secundario), 15 (cuerpo), 18 (título de tarjeta y cifra), 26 (título de página). Y **dos alturas de control**: 32 px compacto en tablas y 40 px normal, con 44 px en pantallas táctiles.
  - Los componentes de la sección «Componentes de `ui/`».
- **Tamaño:** M.
- **Gravedad:** afea.

### H5. «Abro un pedido y no sé qué sigue»
- **Qué pasa:**
  - **Pedido** (`pedido.page.ts:28`):
    - El título es el número; el subtítulo es «Pedido del 30 set. 2026». El cliente y el producto no están en la cabecera.
    - El estado está como insignia dentro de la tarjeta «Datos».
    - El hueco de acciones de la cabecera lo ocupa «Volver».
    - El orden es Datos → **Cobro, con el formulario abierto** (`:53`) → Avance (`:58`) → Líneas (`:94`). Con el pedido «Imprimiendo», lo siguiente es avanzar el estado, pero en la primera pantalla se ve un formulario de cobro con su propio botón primario. Hay dos botones primarios.
  - **Cotización aceptada** (`cotizacion.page.html:1`):
    - El título es «COT-0001» y el subtítulo «Aceptada», que repite la insignia.
    - No ofrece crear el pedido. El vínculo es una nota de texto, «Se convirtió en el pedido PED-0001.», sin enlace.
    - Un aviso rojo de error ocupa la parte de arriba.
  - **Producto:**
    - Se abre directamente en edición, con 13 botones «Guardar…», 7 «Agregar…», 19 botones rellenos, 62 campos y 21 `select`.
    - Mide 5 847 px a 1440 y más de 10 000 px en el celular.
    - El subtítulo «Ficha del producto» no agrega nada.
  - **Cola:** al abrir el formulario, el botón primario de la cabecera pasa a decir «Cerrar formulario» (`produccion.page.ts:30`). Cancelar queda como la acción principal.
- **Qué tarea traba:** la persona quiere saber qué falta para entregar este pedido y tiene que bajar hasta la tercera tarjeta, saltándose un formulario de cobro que no venía a llenar.
- **Cómo lo resuelven otros:**
  - En la plantilla de ficha de Shopify, el título es el nombre del recurso, con un enlace para volver y las acciones secundarias arriba. A la derecha va una columna con el estado y los metadatos. Para guardar hay **una** barra que aparece solo cuando hay cambios ([details](https://shopify.dev/docs/api/app-home/patterns/templates/details)).
  - Stripe pone las acciones en la cabecera para que se vean aunque el contenido se desplace ([Action buttons](https://docs.stripe.com/stripe-apps/patterns/action-buttons.md)).
- **Propuesta:** `pp-resource-header`, descrito en la sección «Componentes de `ui/`».
  - En el pedido: «Ana Quispe · 10 botellas» con su foto, «PED-0003 · entrega 05 oct.», una insignia de estado y **un** botón: el siguiente paso («Pasar a Post-proceso»). «Registrar cobro» pasa a ser primario solo cuando el pedido está entregado; antes, el cobro se muestra como resumen con un botón secundario.
  - En la cotización aceptada: el botón primario es «Crear pedido» (es el corte 1 del encargo, visto desde aquí).
  - En el producto: abrir en modo lectura, editar por sección y usar una sola barra «Guardar / Descartar».
- **Tamaño:** M (componente) + M (producto en modo lectura).
- **Gravedad:** confunde.

### H6. «Los colores de estado cambian de significado con la paleta»
- **Qué pasa:**
  - El tono `info` de `pp-badge` es el acento (`badge.ts:20`). Lo usan «En cola», «Imprimiendo», «Post-proceso» y «Cobro parcial» (`pedidos.labels.ts:43-52,109-113`), «Pronto» en Hoy y el atraso «reciente» en Por cobrar (`finanzas.models.ts:122-127`), que a los 8 días se pinta del mismo color que «Imprimiendo».
  - En **Terracota**, el acento tiene un tono de 18°, el peligro de 3° y el aviso de 39°. Los tres quedan dentro de 36° de la rueda de color, así que «Imprimiendo» se ve tan alarmante como «Atrasado».
  - En **Grafito**, el acento es gris azulado (216°), y «Imprimiendo» no se distingue de «Confirmado», que es neutro.
  - En **Índigo** queda azul, y recién ahí se lee como «en curso». Comparado en capturas de Pedidos y Hoy en las tres paletas.
  - Además, los tonos se usan para categorías que no son estados: «Venta» es `good` (verde) y «Regalo» es `warn` (ámbar) (`pedidos.labels.ts:17-21`). Cada fila de Pedidos lleva tres píldoras de color: propósito, estado y cobro.
  - En Cuentas, una salida de «S/ 0.00» se pinta de rojo.
- **Qué tarea traba:** la persona quiere ver de un vistazo qué pedido tiene un problema, y el color no se lo dice.
- **Cómo lo resuelven otros:** Katana resume la disponibilidad de un pedido en **un solo** estado de tres valores (En stock, Esperado, No disponible), en rojo solo si algo falta o se pasa de la fecha ([Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability)).
- **Propuesta:**
  - Un token semántico `--info` (y `--info-soft`) en `$semantic-light` y `$semantic-dark` de `_palettes.scss`, fijo en las cinco paletas como ya lo son el rojo, el verde y el ámbar.
  - El acento queda solo para lo interactivo: enlaces, botón primario, foco y el ítem activo del menú.
  - Una regla escrita: **el color es para estados que piden atención**, y una fila lleva como máximo una insignia de color. El propósito se escribe en texto o con un icono. El cobro se muestra como texto («debe S/ 85») o como una barra fina.
  - Un cero no se pinta.
- **Tamaño:** S.
- **Gravedad:** confunde.

### H7. «En la cola no veo qué se imprime»
- **Qué pasa:**
  - La tarjeta de trabajo (`print-job-card.ts:23-31`) dice impresora, placa, tiempo y pedido. No tiene foto, ni de la placa ni del producto, y en el Historial no dice **cuándo** se imprimió: no hay fecha en la línea de metadatos.
  - El Historial usa tarjetas aireadas para lo que es un registro. El contrato de diseño dice que las pantallas de trabajo son tablas (`docs/06-frontend.md` §6.4).
  - En «Falta producir», la miniatura de 28 px queda pegada al nombre (H4), la fila no ofrece ninguna acción («Imprimir lo que falta», «Armar») y un párrafo de dos líneas explica cómo se calcula.
- **Qué tarea traba:** la persona quiere ver de un vistazo qué hay en la cama de la impresora y qué sigue, y tiene que leer «Botellas de Ana (repetida)».
- **Cómo lo resuelven otros:** Printago y SimplyPrint (H1). SimplyPrint registró el pedido de sus usuarios de ver la miniatura del gcode en la cola ([sugerencia 170](https://suggestions.simplyprint.io/170)).
- **Propuesta:**
  - La tarjeta de trabajo con la miniatura de la placa a 64 px (de `plate_N.png`, o la foto de la pieza o del producto), el nombre del producto, la insignia del pedido y la barra de avance.
  - El Historial como tabla densa con fecha, miniatura de 40 px, resultado y costo.
  - En «Falta producir», foto de 64 px y una acción por fila. Qué acción depende de la decisión A/B/C del dueño.
- **Tamaño:** M.
- **Gravedad:** confunde.

### H8. «El kardex salta de columna en columna»
- **Qué pasa:**
  - Hay una tabla por día (`movimientos.page.ts:104-108`). Cada tabla calcula sus anchos, así que la columna Cantidad empieza en x = 632, 541, 604 y 572 px en días consecutivos (captura a 1440).
  - El Origen muestra `assembly` y `maintenance` en inglés porque faltan en `SOURCE_LABELS` (`inventario.format.ts:50-57`).
  - Las cantidades salen en singular: «+50 unidad», «60 unidad», «Faltan 1 unidad». La pipe `qty` no pluraliza (`inventario.format.ts:83`), mientras Piezas tiene su propio `unitLabel` que sí lo hace (`piezas.page.ts:111`).
  - No hay fotos, y el rollo aparece sin su color.
- **Qué tarea traba:** la persona quiere explicarse por qué el stock dice lo que dice, y tiene que leer cada fila porque nada se alinea.
- **Cómo lo resuelven otros:** Shopify y Stripe usan una sola tabla de datos con filas separadoras de grupo, sin una tabla por grupo ([resource index](https://shopify.dev/docs/api/app-home/patterns/templates/resource-index.md)).
- **Propuesta:** una sola `<table>` con una fila de encabezado por día, que puede quedar fija al desplazarse. `pp-item` de 32 px en la columna Movimiento, con el color para los rollos. Traducir los dos orígenes que faltan y llevar el plural a `qty`.
- **Tamaño:** S.
- **Gravedad:** afea.

### H9. «Mover a: Nuevo», en una tarjeta que está en Negociando
- **Qué pasa:** en Oportunidades, el selector «Mover a» muestra «Nuevo» en **todas** las tarjetas. Medido en el DOM: los selectores de Negociando, Ganado y Perdido tenían `value = "new"`. El `[value]="stage"` se asigna antes de que existan las opciones (`oportunidades.page.ts:171`). Además, cada columna lleva una frase que explica la etapa («Alguien preguntó…»), y en Ganado aparece el selector aunque la etapa se deriva de los pedidos (`docs/06-frontend.md` §6.6).
- **Qué tarea traba:** la persona lee la tarjeta y ve una etapa que no es la suya.
- **Cómo lo resuelven otros:** en Linear el estado se muestra en la tarjeta y se cambia desde un menú que parte del valor actual ([display options](https://linear.app/docs/display-options)).
- **Propuesta:** `[selected]` en cada `option`, o un menú «Mover a…» que no muestre valor, como en `pedido.page.ts:67`. Quitar el selector en las etapas derivadas y pasar la frase explicativa a un `title` del encabezado de la columna.
- **Tamaño:** S.
- **Gravedad:** confunde.

### H10. «Hay más texto que pantalla»
- **Qué pasa:**
  - Párrafos que explican la pantalla en lugar de que la pantalla se explique sola:
    - Resultados: dos párrafos en un recuadro antes de la tabla.
    - Producto: un recuadro de cuatro líneas sobre «Preparación por lote» y «Minutos por unidad».
    - Cola: dos líneas sobre cómo se calcula «Falta producir».
    - Piezas: un párrafo que manda a Armar (`piezas.page.ts:37-41`), en lugar de un botón.
    - Apariencia: «La miniatura es de verdad: está pintada con el tema que muestra…», que es una nota de implementación.
    - Configuración: el subtítulo enumera las nueve pestañas que están justo debajo.
  - **De 52 `pp-empty`, solo 14 tienen un botón.** Varios sin acción la necesitan. Ejemplo: «Aún no hay parámetros de costo vigentes. Sin ellos no se puede cotizar.»
- **Qué tarea traba:** la persona tiene que leer para orientarse, que es justo lo contrario de lo que pidió el dueño.
- **Cómo lo resuelven otros:** Stripe pide que el estado vacío diga qué falta en una frase corta (menos de 14 palabras), y que el título y la acción se respondan entre sí («Sin clientes todavía» y «Agregar cliente»). Cuando la lista está vacía por un filtro, no se ofrece «crear el primero» ([Empty state](https://docs.stripe.com/stripe-apps/patterns/empty-state.md)).
- **Propuesta:**
  - Que `pp-empty` acepte `title`, `description` y `action`, y escribirlos con esa regla.
  - Convertir las explicaciones en estructura: Piezas lleva «Armar productos» como botón en la cabecera; Resultados y la receta, un «¿Por qué?» plegable.
  - Quitar los subtítulos que repiten lo que se ve.
- **Tamaño:** S.
- **Gravedad:** afea.

### H11. «En el celular se esconde lo importante»
- **Qué pasa (375 px):**
  - Lo bueno: **ninguna ruta tiene desplazamiento horizontal de página** (`scrollWidth − innerWidth = 0` en las 26).
  - Lo malo: las tablas se desplazan dentro de la tarjeta sin ninguna señal, y lo que queda fuera es justo la acción o el total:
    - en Insumos, «Editar» aparece cortado como «Ec»;
    - en Cotizaciones no se ve el Total, y «COT-0003» se parte en «COT-» / «0003»;
    - en el Pedido, el subtotal de las líneas queda cortado;
    - en la Cola, la tabla se sale del borde de la tarjeta (H4).
  - Los nombres de artículo se parten en una palabra por renglón («Botella / de / poción»).
  - Producto mide más de 10 000 px de alto.
  - Las pestañas de Configuración ocupan cuatro renglones.
  - Botones chicos: los de desplegar rollos en Filamentos miden **19×20 px**, por debajo del mínimo de 24×24 de [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); los meses de Resultados miden 26 px de alto y el «Mover a» de Oportunidades, 25 px.
- **Qué tarea traba:** en el taller, con el celular, la persona quiere editar un insumo y no encuentra el botón.
- **Cómo lo resuelven otros:** Sortly está pensado para el celular: el inventario se recorre por las fotos, con hasta 8 por artículo ([Item Photos](https://www.sortly.com/features/photos/)).
- **Propuesta:**
  - Debajo de 640 px, `pp-item` se apila: foto, nombre y dato a la izquierda, número y acción a la derecha, sin tabla.
  - Las pestañas se desplazan en horizontal en un solo renglón.
  - En las fichas, la acción primaria queda fija abajo.
  - Ningún control táctil por debajo de 40 px.
- **Tamaño:** M.
- **Gravedad:** confunde.

## Escala de fotos y miniaturas

| Contexto | Medida en pantalla | Ejemplos | Archivo que pide |
|---|---|---|---|
| **En línea** (dentro de un texto o una insignia) | 24 px | pedido en «Lo que vence», chip de pedido en una tarjeta de trabajo | `thumb` |
| **Fila de tabla y selector** | 40 px (32 en densidad compacta) | Insumos, Empaque, Piezas, Kardex, Compras, opción y valor elegido de `pp-item-picker` | `thumb` |
| **Fila protagonista** (la foto es lo que identifica) | 64 px | líneas de pedido y de cotización, Falta producir, componentes de Armar, tarjeta de trabajo de impresión | `thumb` |
| **Tarjeta de galería** | todo el ancho de la tarjeta, cuadrada (160–200 px) | Armar, Catálogo en vista galería, elegir producto en Nuevo pedido | `full` |
| **Ficha** | 240 px en escritorio, todo el ancho (hasta 320) en el celular | cabecera de producto, pieza o insumo | `full` |
| **Portada** | la foto entera, al tocar | ampliación desde cualquier miniatura | `full` |

Reglas:
1. **Siempre cuadrada y entera** (`object-fit: contain` sobre `--surface`), con el mismo borde y radio. Se recorta (`cover`) solo en la tarjeta de galería, y como opción.
2. Sin foto, un **icono por tipo**, no una inicial, y en la fila un enlace discreto «Agregar foto».
3. La variante sin foto propia muestra la del producto **en todas partes**, también en su formulario.

**Estrategia de miniaturas (recomendada): dos versiones al subir, generadas en el navegador.**

- `media.ts` ya achica la foto en un `canvas` antes de subirla (`shrink()`, `media.ts:129-146`). Bastan dos pasadas: **1024 px** (como hoy, `full`) y **256 px** de lado mayor (`thumb`, WebP 0.8, unos 9 kB con la foto real). Se suben las dos en paralelo.
- **Sin cambiar la base:** la miniatura se encuentra por convención, `…/<uuid>.webp` → `…/<uuid>.256.webp`. La firma por lotes sigue igual: `pp-thumb` pide `thumb` cuando el tamaño es de 64 px o menos, y la foto completa en los demás casos.
- **Fotos ya subidas:** si la miniatura no existe, `pp-thumb` usa la original, como hoy. En local hay una sola foto en `storage.objects`. En producción conviene contar con `select count(*) from storage.objects where bucket_id = 'media'` y regenerarlas en una pasada, o cuando se vuelva a editar cada foto.
- **Opcional:** guardar las URLs firmadas en `sessionStorage` hasta que venzan, para que recargar no las vuelva a firmar. Hoy cada firma cambia la URL, y el navegador no reutiliza nada al recargar.
- **Por qué no las transformaciones de Supabase:** están disponibles desde el plan **Pro** (con 100 imágenes de origen incluidas y US$5 por cada 1000 más), no en el gratuito ([documentación](https://supabase.com/docs/guides/storage/serving/image-transformations)). Además, `createSignedUrls`, la firma por lotes en la que se apoya `media.ts`, no acepta `transform` en `storage-js` 2.117.2. Habría que firmar cada imagen por separado y se perdería el agrupamiento de M11.
- **Y una fuente gratis de fotos: la placa del laminado.** Cada `.gcode.3mf` trae `Metadata/plate_N.png` (`docs/01-investigacion.md:43`), y el lector ya abre ese ZIP (`core/zip.ts`, `packages/slicer-files`). Al cargar una placa en la receta, esa imagen puede ser la foto inicial de la pieza que produce y la miniatura del trabajo de impresión. Es lo mismo que hace Printago cuando no puede renderizar el modelo.

## Componentes de `ui/`: qué falta y qué sobra

**Faltan** (en orden de efecto):

| Componente | Qué hace | Reemplaza |
|---|---|---|
| `pp-item` | Foto (24/40/64) + nombre + línea secundaria + hueco a la derecha. En celular se apila | `.with-thumb` (solo en `inventario.styles.ts:38`), las celdas de nombre de 15 tablas y las listas de Hoy, Cola, Kardex y líneas de pedido y cotización |
| `pp-resource-header` | Enlace «‹ Pedidos», foto, título humano, código y fecha, insignia de estado, **una** acción primaria y menú «Más» | Los `pp-page` de Pedido, Cotización, Producto e Impresora, y los «Volver» dentro de `<a>` |
| `pp-filter-bar` | Búsqueda + chips de filtro + contador «6 de 6» + «Limpiar» | Las cuatro versiones de filtros (H4) |
| `pp-tabs` | Una sola pestaña, que en el celular se desplaza en horizontal | Las tres versiones (`configuracion.page.ts:35`, `printer-detail.ts:35`, `producto.page.ts:27`) |
| `pp-stat` | Cifra + etiqueta + variación | `.big` de Hoy (2 rem), de Producción (1.8 rem) y los totales de Cuentas, Caja y Por cobrar |
| `pp-item-card` | Tarjeta de galería con foto a todo lo ancho, nombre, dato y estado | Las opciones de Armar; el Catálogo como galería; el selector de producto del Nuevo pedido |
| `pp-notice` | Aviso `info`, `warn` o `bad` con título opcional | `.alert` en tres archivos y `.notice` en `core/styles.ts` |
| `pp-save-bar` | Una barra «Guardar / Descartar» que aparece cuando hay cambios | Los 13 «Guardar» de Producto |

**Hay que cambiar:**
- `pp-thumb`: tamaños nombrados (`inline`, `row`, `lead`, `card`, `sheet`), `contain`, icono por tipo y pedir `thumb` o `full` según el tamaño.
- `pp-empty`: `title`, `description` y `action`.
- `pp-badge`: tono `info` con su propio token.
- `pp-page`: subtítulo opcional de verdad. Hoy casi todas las pantallas lo usan para describirse.

**Sobran:**
- Las hojas de estilo por paquete: `inventario.styles.ts`, `finanzas.styles.ts`, `catalogo.styles.ts` y `SECTION_STYLES` de `core/styles.ts`. Lo que tienen en común va a `styles.scss`.
- `.as-button`, que está duplicado.
- La inicial como marcador de foto.

## Los diez arreglos visuales que más cambian la sensación

1. **Foto en todas las listas y selectores de artículos** (`pp-item` + cambiar los 9 `<select>`). Es la regla del dueño y lo que más se nota. *M*
2. **Cabecera de ficha** con título humano, foto, estado y el siguiente paso como único botón primario, en Pedido, Cotización, Producto e Impresora. *M*
3. **La miniatura de la placa como foto automática** de piezas y trabajos, y la posibilidad de editar la foto en Piezas. *M*
4. **Una escala de letra (5 tamaños) y de controles (2 alturas)**, con las utilidades en `styles.scss`. Arregla de paso la Cola en el celular y la miniatura pegada al texto. *M*
5. **`--info` fijo y una sola insignia de color por fila.** Pedidos y Hoy dejan de verse alarmados en Terracota y planos en Grafito. *S*
6. **Miniaturas de 256 px, cuadradas, enteras, con icono por tipo** en lugar de la inicial. *S*
7. **Producto en modo lectura**, edición por sección, una barra de guardar y pestañas de variante con foto. *M*
8. **El celular:** filas apiladas en vez de tablas con desplazamiento oculto, la acción fija abajo en las fichas y controles de al menos 40 px. *M*
9. **El kardex en una sola tabla**, con orígenes traducidos y plurales correctos (`qty`). *S*
10. **Menos prosa y estados vacíos con acción** (38 de 52 hoy no la tienen). *S*

Y tres arreglos de una hora que conviene no dejar para después: el selector «Mover a» de Oportunidades (H9), los 11 `<a><button>` y la clase `with-thumb` que falta en la Cola.

## Pantalla por criterio

Notas del 1 (mal) al 5 (bien). «—» significa que la pantalla no lista artículos. Medido a 1440 px y a 375 px.

| Pantalla | ¿Qué hago aquí? | Fotos | Jerarquía | Consistencia | Celular |
|---|---|---|---|---|---|
| Hoy | 4 · la cola de lo que vence enlaza a donde se resuelve | 1 · pedidos e impresiones sin foto ni producto | 3 · la cifra de 32 px pesa más que el título de 26 | 3 · títulos desalineados según el ancho de la insignia (x = 354/369/382 px) | 4 · se lee bien |
| Oportunidades | 3 · «Nuevo trato» claro; cada columna explica su etapa | — | 3 · título centrado y lo demás a la izquierda | 2 · «Mover a: Nuevo» en todas las tarjetas | 3 · una columna por deslizamiento; selector de 25 px |
| Cotizador | 3 · tres vacíos punteados apilados; el primario queda a mitad de página | 1 · la variante y los insumos son `<select>` | 2 · formulario de 1 830 px sin pasos | 3 · «Ver cotizaciones» en color acento | 3 · largo pero no se rompe |
| Cotizaciones | 4 · lista y «Nueva cotización» | 1 · ninguna | 4 · tabla limpia | 3 · único filtro con chips | 2 · el Total queda fuera; «COT-/0003» |
| Cotización | 2 · aceptada y sin «Crear pedido» | 1 · línea sin foto | 3 · título = código; aviso rojo arriba | 2 · tercer estilo de botón (borde de acento) | 4 · cabe |
| Pedidos | 4 · lista y «Nuevo pedido» | 1 · no se sabe qué lleva cada pedido | 3 · tres píldoras de color por fila | 3 · «Venta» en verde en cada fila; `ORD-` junto a `PED-` | 4 · bien |
| Nuevo pedido | 3 · claro, pero no dice si hay stock ni el plazo | 1 · variante en `<select>` | 3 · «+ Crear cliente rápido» pegado al campo siguiente | 3 · acciones a la izquierda (en Compra van a la derecha) | 4 · bien |
| Pedido | 2 · el formulario de cobro antes del avance; dos primarios | 1 · líneas e impresiones sin foto | 2 · título = código; estado dentro de «Datos» | 3 · «Volver» en color acento | 2 · subtotal cortado; nombre en 5 renglones |
| Clientes | 3 · «Editar» y «Ver historia» repetidos en cada fila | — | 3 · el nombre no es enlace | 2 · tabla suelta; botones de 29 px | 3 · cabe |
| Cola de impresión | 3 · «Falta producir» sin acción por fila; «Cerrar formulario» como primario | 2 · 28 px pegada al texto; trabajos sin foto | 3 · párrafo de dos líneas antes de la tabla | 2 · usa clases que no importa | 2 · la tabla se sale de la tarjeta |
| Historial | 4 · filtro y lista | 1 · ni foto ni fecha | 3 · tarjetas aireadas para un registro | 3 · tarjeta en vez de tabla | 4 · bien |
| Catálogo | 4 · «Nuevo producto» y «Abrir ficha» | 3 · 40 y 28 px, recortadas | 3 · lista donde convendría una galería | 4 · coherente | 4 · bien |
| Producto | 2 · todo en edición; 13 «Guardar» | 2 · 80 px; la variante muestra «C»; receta sin fotos | 1 · 19 botones rellenos, 5 847 px de alto | 2 · cuarto estilo de pestaña; 11.5 px en la receta | 1 · más de 10 000 px |
| Impresoras | 4 · lo vencido va primero | — | 3 · cinco botones primarios a la vez | 3 · pestañas copiadas | 3 · el texto se aprieta contra el botón |
| Filamentos | 4 · tabla clara | 4 · el color es la foto correcta (16 px) | 4 · ritmo de tabla | 3 · «+ Nuevo» | 2 · botón de desplegar de 19×20 px |
| Piezas impresas | 2 · sin ninguna acción; manda a Armar con un párrafo | 1 · 28 px con letra; no se puede cargar foto | 3 · bien | 3 · tabla en tarjeta (Insumos no) | 4 · cabe |
| Armar productos | 4 · elegir, cuántas, armar | 3 · 80 px en tarjeta de 176; componentes de 28 px | 4 · bien | 3 · «60 unidad» | 4 · bien |
| Insumos | 4 · «+ Nuevo artículo», Movimiento, Editar | 2 · 28 px; «B» y «D» | 4 · bien | 4 · bien | 2 · «Editar» cortado |
| Empaque | 4 · igual que Insumos | 2 · 28 px | 4 · bien | 4 · bien | 2 · «Editar» cortado |
| Compras | 3 · no dice qué se compró | 1 · ninguna | 4 · tabla limpia | 3 · columna «Rollos» = 0 en compras de insumos | 3 · cabe |
| Kardex | 4 · filtros completos | 1 · ninguna; rollo sin color | 2 · columnas que saltan entre días | 2 · `assembly`/`maintenance` en inglés; «+50 unidad» | 3 · largo (5 130 px) |
| Cuentas | 4 · claro | — | 4 · bien | 3 · «S/ 0.00» en rojo; tercer estilo de cifra | 3 · tabla con desplazamiento |
| Caja | 4 · filtros, totales y libro | — | 3 · «Anular» repetido en cada fila | 4 · bien | 3 · tabla con desplazamiento |
| Por cobrar | 5 · una acción por fila, «Cobrar» | — | 4 · bien | 4 · bien | 4 · cabe |
| Resultados | 3 · dos párrafos antes de la tabla | — | 3 · el texto empuja los números | 4 · bien | 4 · cabe |
| Configuración | 4 · pestañas claras | — | 3 · el subtítulo repite las pestañas; Apariencia explica la implementación | 2 · la pestaña copiada de Impresoras | 2 · pestañas en 4 renglones |

## Inventario de fotos

| Pantalla | Lista o selector | ¿Foto? | Tamaño medido |
|---|---|---|---|
| Hoy | Lo que vence (pedidos, impresiones) | No | — |
| Hoy | Filamentos bajo mínimo | Color | punto de color, sin foto del rollo |
| Cotizador | Partir de una variante | No (`<select>`) | — |
| Cotizador | Filamento por placa, insumos | No (`<select>`) | — |
| Cotización | Líneas del desglose | No | — |
| PDF de cotización | Líneas | No | — |
| Pedidos | Lista | No | — |
| Nuevo pedido | Línea → variante | No (`<select>`) | — |
| Pedido | Líneas | No | — |
| Pedido | Impresiones de este pedido | No | — |
| Cola | Falta producir | Sí | 28 px, sin separación del texto |
| Cola | Tarjetas de trabajo | No | — |
| Cola · Nuevo trabajo | Línea de pedido, placa, rollo | No (`<select>`) | — |
| Historial | Trabajos cerrados | No | — |
| Catálogo | Producto / variantes | Sí | 40 / 28 px, recortadas |
| Producto | Foto del producto / de la variante | Sí / letra | 80 px (`pp-image-field`) |
| Producto | Pestañas de variantes | No | — |
| Producto | Pieza que produce, filamentos, insumos de la receta | No (`<select>`; el filamento tiene un `input color` al lado) | — |
| Producto | Costo actual (líneas de insumo) | No | — |
| Armar | Opciones de variante | Sí | 80 px en tarjeta de ~176 px |
| Armar | Componentes | Sí (letra) | 28 px |
| Piezas impresas | Tabla | Letra, sin forma de cargar foto | 28 px |
| Insumos / Empaque | Tabla | Sí (letra en todos hoy) | 28 px |
| Nuevo artículo (modal) | Foto | Sí | 80 px, apretada en una columna de tres |
| Compras | Lista | No (ni qué se compró) | — |
| Nueva compra | Selector de artículo | Sí / color | 28 px |
| Kardex | Movimientos | No | — |
| Filamentos | Tabla / rollos | Color | punto de 16 px |
| Cliente | Historia: lo comprado | No | — |
| Oportunidades | Tarjetas | No (tratos, no artículos) | — |

## Referencias revisadas

| Aplicación | Por qué sirve de referencia | Qué tomar | Qué NO tomar | Enlace |
|---|---|---|---|---|
| Shopify Polaris · Thumbnail | Es el sistema de miniaturas más usado en comercio | Cuatro tamaños fijos (24/40/60/80), cuadradas, imagen entera | El icono genérico como marcador: aquí conviene un icono por tipo | [CSS del componente](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Thumbnail/Thumbnail.module.css) |
| Shopify · índice de recursos | Listas de productos con foto | Miniatura de 40 px en cada fila, el nombre como enlace, una insignia de estado | Las acciones masivas con casillas | [resource index](https://shopify.dev/docs/api/app-home/patterns/templates/resource-index.md) |
| Shopify · ficha de recurso | Fichas de producto y pedido | Título = nombre, enlace para volver, columna lateral con el estado, una barra de guardar | Tres columnas de metadatos | [details](https://shopify.dev/docs/api/app-home/patterns/templates/details) |
| Shopify · fotos de producto | La proporción de las fotos | Una sola proporción, cuadrada | Las 2048 px: en el taller sobra | [product media](https://help.shopify.com/en/manual/products/product-media/product-media-types) |
| Stripe · patrones | Panel sobrio, muy consistente | Acciones en la cabecera; vacíos de una frase con acción; filtros con chips y «Limpiar» | Gráficos en todas partes | [action buttons](https://docs.stripe.com/stripe-apps/patterns/action-buttons.md), [empty state](https://docs.stripe.com/stripe-apps/patterns/empty-state.md), [filter controls](https://docs.stripe.com/stripe-apps/patterns/filter-controls.md) |
| Linear | Listas y tableros con una sola gramática | La misma propiedad se ve igual en lista y en tablero; un menú de cambio que parte del valor actual | Vistas configurables por persona | [display options](https://linear.app/docs/display-options) |
| Sortly | Inventario de pequeños negocios guiado por fotos | La foto como identificador principal, pensado para el celular | Hasta 8 fotos por artículo y carpetas anidadas | [Item Photos](https://www.sortly.com/features/photos/) |
| Katana MRP | Fabricación para pequeños fabricantes | La disponibilidad del pedido en **un** estado de tres valores | Tablas de MRP con muchas columnas | [Ingredients availability](https://support.katanamrp.com/en/articles/5914374-ingredients-availability) |
| Printago | Gestión de granjas de impresión 3D | Miniatura de cada pieza en la lista, la ficha, la cola y cada trabajo; usa la imagen del laminador | Renderizar geometría en el servidor | [Part thumbnails](https://docs.printago.io/docs/parts/part-thumbnails) |
| SimplyPrint | Cola de impresión 3D | Una tarjeta con miniatura por placa al dividir un 3MF | Dividir y gestionar archivos (aquí no se sube nada) | [print queue](https://help.simplyprint.io/en/article/the-print-queue-manage-schedule-and-automate-your-prints-1syc86o/) |
| Craftybase | Inventario y recetas para artesanos | Lista de materiales con foto, búsqueda y orden | El enfoque contable completo | [guía](https://craftybase.com/blog/your-guide-to-getting-started-with-craftybase) |
| Airtable · galería | Galería con portada | Elegir «encajar» o «recortar» la portada | Personalizar cada vista | [gallery views](https://support.airtable.com/docs/getting-started-with-airtable-gallery-views) |
| Supabase · transformaciones | La alternativa en el servidor | — | Plan Pro, cobro por imagen y sin firma por lotes | [Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) |
| WCAG 2.2 · 2.5.8 | Tamaño mínimo de lo que se toca | 24×24 como piso; apuntar a 40–44 | — | [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |

No verifiqué con capturas propias las pantallas de Sortly, Katana ni Craftybase: lo de arriba sale de su documentación. La plantilla de Polaris en `shopify.dev` no publica medidas en píxeles para los tamaños de sus nuevos componentes web. Las medidas en píxeles salen del CSS del componente de React.

## Lo que no hay que copiar

- **Las casillas y acciones masivas de Shopify.** Dos personas no editan 50 productos de golpe; cada casilla quita espacio a la foto.
- **Vistas configurables al estilo Linear** (qué columnas mostrar, agrupar, ordenar, por persona). Es trabajo para quien diseña y una decisión más para quien usa. Mejor una vista bien elegida por pantalla.
- **Las 8 fotos y carpetas de Sortly.** Una foto buena por artículo alcanza; más fotos son más tiempo de carga en el taller.
- **El renderizado 3D de Printago.** Pide procesar geometría en un servidor; el PNG que ya trae el laminado es gratis y suficiente.
- **Las tablas MRP de Katana**, con disponibilidad, producción y entrega en columnas separadas. Aquí basta un estado por pedido.
- **Ilustraciones en los estados vacíos.** Una frase y un botón; un dibujo por pantalla es otra cosa que mantener en cinco paletas y dos modos.
- **Gráficos en el inicio, como en Stripe.** Hoy como cola de trabajo es la decisión correcta; no hay que convertirla en un tablero.
- **Transformar imágenes en el servidor.** Cuesta, no encaja con la firma por lotes y no hace falta para dos tamaños.

## Preguntas para el dueño

1. **¿Las miniaturas muestran el producto entero (con aire alrededor) o recortado para llenar el cuadro?** Recomiendo **entero**. Con la foto vertical de la botella, el recorte se come la silueta, que es justamente lo que la distingue de la tapa.
2. **¿Usamos la imagen de la placa del laminado como foto inicial de cada pieza impresa?** Recomiendo **sí**: no hay que tomar ninguna foto, siempre está y se puede reemplazar por una real.
3. **¿Catálogo y Armar como galería de tarjetas con foto grande, y el inventario como tabla con foto de 40 px?** Recomiendo **sí**. Son pocos productos que se reconocen por la foto, frente a muchos insumos que se recorren.
4. **¿Que «en curso» (en cola, imprimiendo) sea siempre azul, cualquiera sea la paleta?** Recomiendo **sí**, como ya lo son el rojo, el verde y el ámbar. Si no, el mismo pedido se ve urgente en Terracota y apagado en Grafito.
5. **¿La ficha de producto se abre para mirar, con «Editar» por sección?** Recomiendo **sí**. Hoy se abre editando todo y con 13 botones «Guardar»; casi siempre se entra a consultar.
6. **Sobre la pregunta A/B/C del encargo, desde lo visual:** sea cual sea la respuesta, «Falta producir» tiene que mostrar la foto del producto y la miniatura de cada placa propuesta. Con la opción B, eso es lo que la persona aprueba de un vistazo.
