# 6. Plan del frontend

> Estado: en construcción · Actualizado: 2026-10-06
> La app vive en `apps/web`. Angular 22 con componentes standalone, signals y sin zone.js.

## 6.1 Qué estamos construyendo

Una aplicación de taller que se usa todos los días, no un panel de demostración. El criterio para dar una pantalla por terminada es que **una persona pueda hacer su trabajo con ella**: cargar una compra, cotizar un pedido, cerrar una impresión. Una pantalla de solo lectura no cuenta como entregada.

## 6.2 Estructura

```
apps/web/src/app/
├── core/          Cliente de Supabase tipado, sesión, taller actual, guardas, formato,
│                 tipos de la base y los ayudantes que usan varias áreas
├── ui/            Componentes compartidos y pipes de formato
├── layout/        Armazón con navegación lateral
└── features/      Una carpeta por área, con sus páginas y su servicio de datos
```

**Regla de oro:** cada área solo escribe dentro de su carpeta en `features/`. Las rutas, `ui/`, `core/`, `layout/` y los estilos globales ya están hechos y son compartidos; si algo falta ahí, se pide, no se edita por cuenta propia.

## 6.3 Capa de datos

- El cliente se inyecta con el token `SUPABASE` y está tipado con `Database` (generado de la base real con `pnpm supabase gen types`).
- Cada área tiene su servicio, por ejemplo `features/inventario/inventario.data.ts`, con métodos que devuelven tipos propios del dominio en lugar de filas crudas.
- **Las reglas de acceso viven en la base.** El frontend nunca filtra por taller: RLS ya lo hace.
- Las operaciones que tocan varias tablas van por RPC: `next_document_number`, `price_for_quantity`, `complete_print_job`.
- Los cálculos de dinero **no se reescriben**: se usan a través de `core/pricing.ts`, que reexporta `@pickypop/domain`. Ninguna pantalla hace su propia aritmética de centavos.
- **Hay un solo servicio para saber en qué taller estás:** `core/workspace.ts` (`CurrentWorkspace`). Trae id, nombre, régimen tributario y el rol de la persona, resuelve una vez y cachea. Ninguna área consulta la tabla `workspaces` por su cuenta.
- **Y una sola forma de saber el rol (ADR-025):** `CurrentWorkspace.isOwner` (la configuración, anular dinero, borrar) y `canOperate` (el día a día: dueño y operador). `roleKnown` dice si ya se leyó: antes no se ofrece ni se explica nada. El marco (`layout/shell.ts`) lo pide al abrir la app. Ninguna área guarda su propia copia del rol.
  - «Solo lectura» no ve formularios ni botones de escribir: los botones van dentro de `@if (canOperate())`, y un formulario de algo que ya existe se muestra bloqueado con `lockWhileReadOnly` (`core/read-only.ts`), así se lee como el dato que es. La fila vacía que agrega algo no se muestra. Donde hace falta, la pantalla lo dice con `READ_ONLY_NOTE`.
  - Tras un rechazo, cada formulario llama a `CurrentWorkspace.afterRefusal(error)`: si la base dijo que no a quien pide, el rol se vuelve a leer y la pantalla deja de ofrecerlo. Un error ya traducido (`CatalogoError`, `DataError`) es un `UserFacingError` que lleva lo que dijo la base como `cause`, para que se reconozca igual. Cuenta como rechazo de rol un 42501 y también un `raise exception` que empieza con «Solo el dueño del taller puede…» (así responden `void_transaction` y la categoría de ventas).
  - Un formulario que se llena mientras está bloqueado (antes de saber el rol) no reporta `invalid`: para señalar un valor guardado antes de una regla se usa `breaksItsRules` (`core/form-errors.ts`), que lee las reglas aunque el control esté deshabilitado.
  - En las pruebas, `workspaceAs(rol)` (`core/workspace.testing.ts`) da el taller con ese rol.
- **Una sola forma de validar:** `core/form-errors.ts`. `requiredText` (clave `required`; solo espacios es vacío), `wholeNumber` (`integer`), `maxDecimals(n)` (`decimals`, con el número permitido) y `notInFuture` (`future`; una fecha contra el día del taller, una hora con los cinco minutos de holgura de la base, que también da `isInTheFuture` a lo que no es un validador). Cada mapa de mensajes lee esas claves, y el mensaje de `required` sirve igual para el campo vacío que para el de solo espacios. No hay otra copia por área: una regla de área que solo agrega un caso se arma encima de la de core y da la misma clave (la fecha de apertura de una cuenta, `openingDayNotInFuture`, es `notInFuture` salvo el día que la cuenta ya tiene).
- **Un insumo cuesta lo que dice la vista `inventory_item_costs`**, nunca un promedio calculado en el navegador. Si `cost_source` es `unknown`, el costo es cero y la pantalla tiene que decirlo: cotizar a ciegas es peor que no cotizar.
- Los ayudantes compartidos viven en `core/`: `dates.ts`, `fetch-all.ts` (PostgREST corta en 1000 filas), `form-errors.ts`, `friendly-error.ts` y `styles.ts`.

## 6.4 Sistema de diseño

**La jerarquía la dan el peso y la densidad, no el color.** El título de página pesa y es grande; las tarjetas respiran; las tablas aprietan. Esa diferencia es deliberada: las pantallas de trabajo son tablas y rinden cuando entran más filas, y las de resumen son tarjetas y rinden cuando se leen de un vistazo. No se "arregla" igualándolas.

Los iconos del menú viven en `layout/nav-icons.ts`, como un sprite SVG en línea: diecinueve trazos de 24×24, sin relleno, que toman color y grosor de donde estén, así que el estado activo enciende el icono y la palabra a la vez. Son dibujados a mano a propósito: una fuente de iconos sería una dependencia y una petición de red para diecinueve figuras. Si hace falta uno nuevo, se agrega ahí y tiene que ser legible a 18 px, que es el único tamaño al que se dibujan.

**Los colores viven en `_palettes.scss` y en ningún otro sitio.** Es el único archivo del proyecto donde hay un color escrito; `styles.scss` solo tiene la fontanería que decide cuál gana. Los tokens: `--bg`, `--surface`, `--text`, `--muted`, `--line`, `--line-strong`, `--accent`, `--accent-soft`, `--on-accent`, `--danger`, `--good`, `--warn`, `--info` y sus `-soft`. Más `--radius`, `--radius-sm`, `--shadow` y `--row-pad`, y las escalas de `styles.scss` (abajo).

Dos de ellos existen por motivos que no se ven hasta que faltan. **`--on-accent`** es la tinta que va encima del acento, y no puede ser blanca siempre: en modo oscuro el acento es claro, y un `color: #fff` ahí deja el botón en 2.3:1. **`--line-strong`** es el borde de algo en lo que se escribe o se hace clic: la raya que separa dos filas de tabla tiene que desaparecer, y el borde de un campo tiene que verse; con un solo token ganaba la raya.

**Son dos ejes.** El *modo* (`data-mode`: claro, oscuro, o ausente para automático) y el *tema* (`data-palette`: terracota, índigo, turquesa, ciruela, grafito). Cada tema existe en los dos modos. Las reglas se escriben contra `[data-palette]` y no contra `:root[data-palette]` **a propósito**: así un elemento cualquiera —la miniatura de Configuración, por ejemplo— puede llevar un tema que no es el vigente y quedar pintado por estas mismas reglas, sin una segunda copia de los colores. Todas las reglas pesan igual, así que **lo que hace ganar a una elección explícita es estar escrita después**: no reordenes ese bloque.

Si agregas una pantalla, no escribas un color. Si de verdad hace falta uno nuevo, va como token en las cinco paletas, o la próxima paleta lo dejará fuera.

**`--info` es «en curso»** (en cola, imprimiendo, cobro parcial) y es azul en las cinco paletas, como el rojo es rojo en todas. Antes era el acento, y el mismo estado cambiaba de significado con la paleta: en Terracota «Imprimiendo» se leía como alerta, y en Grafito no se distinguía de lo neutro. **El acento queda para lo que se toca**: enlaces, botón principal, foco, el menú activo. Y el color es para lo que pide hacer algo: una fila lleva como mucho una insignia de color.

**Escalas** (en `styles.scss`). Letra, cinco tamaños y no más: `--fs-xs` 12 (encabezado de tabla, notas, insignias) · `--fs-sm` 13.5 (la segunda línea gris, etiquetas) · `--fs-md` 15 (cuerpo) · `--fs-lg` 18 (título de tarjeta y cifras) · `--fs-xl` 26 (título de página). Controles, dos alturas: `--control-h` 40 px y `--control-h-compact` 32 px para un botón dentro de una fila; con pantalla táctil, 44 y 40.

**Fotos**, una escala por contexto (`pp-thumb size`): `inline` 24 (dentro de una frase) · `option` 40 (opción de selector) · `row` 48 (fila de artículo) · `lead` 64 (fila donde la foto es lo que distingue: líneas de pedido y cotización) · `bed` 96 (lo que está en la impresora) · `sheet` 240 (ficha) · `fill` (todo el ancho de una tarjeta de galería). La foto se muestra **entera** (`contain`), nunca recortada: la silueta de una botella es lo que la distingue de una tapa. Sin foto va el ícono del tipo de artículo, nunca la inicial.

Cada foto se guarda dos veces al subirla (`core/media.ts`): la original, de hasta 1024 px, y una miniatura de 256 px al lado, `<uuid>.thumb.webp`. `pp-thumb` pide la miniatura hasta 96 px y la original por encima; si la miniatura no existe (fotos subidas antes) cae a la original. Quitar una foto borra las dos.

Cuando una pantalla solo conoce el id de lo que lista (una línea de pedido, un trabajo, un pedido), `pp-thumb` acepta `[photo]="{ kind, id }"` y `core/article-photos.ts` busca la foto con una regla escrita una sola vez: la variante cae a la foto de su producto; la pieza, a la miniatura de una placa que la produce; el trabajo muestra su placa, después la primera pieza de su lista y al final el producto del pedido.

Componentes en `ui/`:

| Componente | Uso |
|---|---|
| `<pp-page title subtitle>` | Marco de página, con ranura `[actions]`. Una ficha lo usa sin título y abre con `pp-resource-header` |
| `<pp-resource-header heading code meta [action] (acted)>` | Cabecera de ficha: título humano («Ana Quispe · 10 × Botella de poción», con `core/document-title.ts`), el número y el estado debajo (`[status]`), **una** acción principal (la decide la página) y un menú «Más» (`[more]`). En el celular la acción queda fija abajo |
| `<pp-item name sub [path] [photo] kind size>` | Fila de artículo: foto, nombre, segunda línea gris (`sub` o contenido `[sub]`) y hueco al final (`[end]`). Es la fila de toda lista de artículos |
| `<pp-thumb size [path] [photo] kind color>` | La foto sola, con la escala de arriba |
| `<pp-item-picker [options]>` | Elegir un artículo con foto, buscando mientras se escribe. Funciona con `formControlName` o con `value`/`chosen` |
| `<pp-image-field folder [path] (changed)>` | Subir o quitar la foto de un artículo. En un formulario que se puede cancelar va con `removesPrevious="false"` y el formulario borra lo descartado al cerrar (`photosToDelete`) |
| `<pp-card heading>` | Bloque de contenido |
| `<pp-badge tone>` | Estados: `neutral`, `good`, `warn`, `bad`, `info` |
| `<pp-async [loading] [error]>` | Envuelve lo que carga datos: muestra cargando, error o contenido |
| `<pp-empty message>` | Lista vacía |
| `<pp-field label hint error required>` | Etiqueta y control de formulario |

Pipes: `money` (acepta decimales: `valor \| money:3`), `grams`, `duration`, `fecha`, `percent1`.

Clases útiles, todas en `styles.scss` y en ningún paquete: `.muted`, `.error`, `.num` (números alineados a la derecha), `.row`, `.grid.two`, `.table-wrap`, `.hide-small`, `.only-small`, `.sub`, `.strong`, `.alert`, `.alert-warn`, `.actions-cell`, `.sr-only`. Las tablas se escriben con `<table>` normal y ya tienen estilo. Botones: por defecto, `.secondary`, `.ghost`, `.danger`. **Un enlace que hace de botón es `<a class="button">`**, nunca un `<button>` dentro de un `<a>` (dos paradas de tabulación para un control, y el botón hereda el color del enlace). Una acción dentro de una frase («Sin foto · Agregar») es `button.inline-link`.

## 6.5 Convenciones

1. **Interfaz en español, código en inglés.** Nombres de clases, métodos y comentarios en inglés; todo lo que ve el usuario, en español del Perú.
2. **Dinero siempre con el pipe `money`**, nunca `toFixed`.
3. **Los tres estados siempre:** cargando, error y vacío. Nada de pantallas en blanco.
4. **Signals, no RxJS**, salvo que haga falta de verdad. `signal`, `computed`, `resource` cuando aplique.
5. **Formularios reactivos tipados** para cualquier formulario con más de dos campos.
6. **Confirmar lo irreversible** antes de hacerlo.
7. Nada de librerías de componentes nuevas sin acordarlo: el sistema de diseño es el de arriba.
8. Accesible: etiquetas en los campos, foco visible, se navega con teclado.
9. Funciona a 400 px de ancho.

## 6.6 Pantallas

### Hoy (`/hoy`)
Dos mitades que responden preguntas distintas. Arriba, **Lo que vence**: la cola de trabajo, ordenada por urgencia, con todo lo que está atrasado o vence en los próximos días —pedidos por entregar, impresiones sin cerrar, pedidos entregados sin cobrar y mantenimiento vencido—. Cada fila enlaza a donde se resuelve. Abajo, las tarjetas de estado: filamentos bajo mínimo, pedidos en curso por estado, mantenimiento, impresiones de la semana con su tasa de éxito.

El filamento bajo mínimo **no** entra en la cola de arriba: es una condición, no un vencimiento, y repetirlo ahogaría lo que sí caduca. Las partes puras (el texto de cada fila y el orden) viven en `panel.tasks.ts`, con pruebas: "se entregaba ayer" y "se entrega hoy" se diferencian en un día.

Arriba a la derecha, el botón **Venta rápida**: es lo que el taller más hace en el día (ADR-024).

`/panel` redirige aquí.

### Inventario
- **Filamentos** (`/inventario/filamentos`): una sola pantalla para las dos mitades de lo mismo. La tabla lista los filamentos con su stock disponible, costo por gramo ponderado, mínimo y aviso de bajo stock; cada fila **se despliega** y muestra dentro los rollos físicos de ese filamento, con su código, estado, ubicación, gramos restantes y costo. Alta y edición del filamento; sobre cada rollo: cambiar estado, registrar pesaje (crea un ajuste) y cambiar ubicación.
  `/inventario/rollos` existía como pantalla aparte y hoy redirige aquí. La distinción producto/unidad física es correcta, pero dos entradas en el menú no la enseñaban: anidada se explica sola.
- **Compras** (`/inventario/compras`): lista y alta. El alta es el formulario más importante del área: proveedor, fecha, líneas (SKU o insumo, cantidad, precio), costo de envío y su reparto por monto o por peso. Al guardar crea los rollos con su costo real y los movimientos de entrada. Muestra el costo final por rollo antes de confirmar.
- **Insumos y repuestos** (`/inventario/insumos`): artículos con existencias, mínimos y perecibles. Entradas y salidas manuales.
- **Piezas impresas** (`/inventario/piezas`): las piezas que salen de una placa, con su stock y su costo. El costo **no** sale de `inventory_item_costs` —una pieza no se compra nunca— sino del promedio ponderado de lo que costó imprimirla. Desde aquí se **arma** un producto: se elige la variante y las unidades, y se consume la receta entera, todo o nada. Si falta algo, la base dice qué y cuánto, y ese mensaje se muestra tal cual.
- **Kardex** (`/inventario/movimientos`): con filtros por tipo, rollo, artículo y fechas. Es la pantalla que explica por qué el stock dice lo que dice.

### Ventas
- **Oportunidades** (`/oportunidades`): el tablero comercial. Cinco columnas —Nuevo, Cotizado, Negociando, Ganado, Cerrado— más Perdido; se arrastra con `draggable` nativo, sin librería. La tarjeta muestra cliente, monto, días sin movimiento y el bloqueo si lo hay. **Ganado y Cerrado se derivan de los pedidos**, no se mueven a mano: una tarjeta cuyos pedidos están todos entregados y cobrados llega sola a Cerrado.
- **Oportunidad** (`/oportunidades/:id`): el trato con sus cotizaciones, sus pedidos y el historial de etapas.
- **Cliente** (`/clientes/:id`): su historia completa —tratos, pedidos, lo comprado y lo que debe—.

### Catálogo
- **Catálogo** (`/catalogo`): productos con estado, variantes y precios. Crear y archivar.
- **Producto** (`/catalogo/:id`): ficha completa. Datos, variantes, **receta** (placas con sus filamentos y gramos, insumos por unidad, minutos de preparación por lote y por unidad) y **escalera de precios**. Muestra el costo calculado actual de cada variante con `@pickypop/domain` y avisa si el margen quedó por debajo del objetivo.

### Cotizador y cotizaciones
- **Cotizador** (`/cotizador`): el corazón. Se arrastra un `.gcode.3mf`, se lee en el navegador con `@pickypop/slicer-files` y se llenan tiempo y gramos por filamento; también se puede cargar todo a mano o partir de una variante del catálogo. Permite varias placas y una cantidad, y calcula con `calculateBatchCost` y `calculatePrice`. Muestra **el desglose completo** y el costo por unidad. Se guarda como cotización, **siempre con cliente** (decisión del dueño, 2026-10-08: «siempre tiene que haber un nombre»; se crea ahí mismo con «+ Nuevo cliente»), en una sola llamada a `save_quote`. Las unidades son enteras, cada campo dice su rango y una línea que no cubre su costo lo muestra antes de agregarse y de guardarse.
- **Cotizaciones** (`/cotizaciones`, `/cotizaciones/:id`): lista con estado y vigencia; detalle con el desglose congelado, cambio de estado y creación de una versión nueva.

### Pedidos y producción
- **Pedidos** (`/pedidos`): lista filtrable por estado y propósito. Abre en «En curso»; un enlace puede pedir otro filtro con `?estado=` (`todos`, `en-curso` o un estado por su nombre). La Venta rápida enlaza con `?estado=todos`, porque una venta rápida nace entregada y «En curso» nunca la muestra.
- **Nuevo pedido** (`/pedidos/nuevo`): propósito (venta, uso personal o regalo con su categoría), cliente cuando es venta (nunca «Clientes varios», que solo compra en la Venta rápida; tampoco lo ofrecen el cotizador ni los tratos), líneas con variante, cantidad y precio sugerido por la escalera. Se guarda en una sola llamada (`create_order`), con una llave que hace de un doble clic un solo pedido; una venta de S/ 0 no se guarda. Crear un cliente rápido (aquí, en el Cotizador y al aceptar una cotización) ofrece al que ya existe con ese nombre.
- **Venta rápida** (`/pedidos/venta-rapida`, con botón en Pedidos y en Hoy; ADR-024): vender lo que está armado en el estante en un solo paso.
  - **El estante**: cada producto armado con unidades libres, con su foto, su precio de lista y cuántas hay libres. Lo libre sale del plan (`core/plan`, ADR-021), nunca de una cuenta propia; un producto que no se arma o que no tiene nada libre no aparece, y una línea manda lo demás a un pedido normal. Tocar un producto suma una unidad, sin pasar de lo libre.
  - **La venta**: por línea, cantidad con − y +, precio de la escalera para esa cantidad (editable, con «Usar» para volver al de lista; la venta espera a que la escalera conteste) y **lo que vale cada unidad en el estante** (`finished_good_costs`), que es el costo que la línea va a guardar (ADR-022). La pantalla no manda costo: lo pone la base con lo que salió. Los totales salen de `quick-sale.ts`, que usa `totalFor` y `sumMoney` de `core/pricing.ts`, con el precio redondeado como lo guardará la base.
  - **Cliente**: opcional mientras se cobre todo. Vacío es «Clientes varios», y escribirlo a mano también: la pantalla avisa que no es un cliente nuevo y lo manda vacío (`isWalkInName`). Nombre y teléfono crean el cliente al vender; si se parecen a uno que ya existe (mismo teléfono, o mismo nombre con otras tildes o mayúsculas), la pantalla ofrece elegirlo. **Si queda saldo, el nombre es obligatorio**: una deuda de «Clientes varios» no tiene a quién cobrársela, y la base la rechaza igual.
  - **Canal**: los canales activos, con el canal por defecto del taller ya elegido (`default_channel`). Solo si el taller no tiene uno por defecto aparece «Sin canal», con un aviso que manda a Configuración › Canales de venta a elegirlo; sin canales, no se pregunta. La siguiente venta conserva el canal: una feria son muchas ventas por el mismo.
  - **Cobro**: lo cobrado sigue al total mientras nadie escriba otro monto (escribir justo el total lo deja siguiéndolo); «Todo» y «Me paga después» son atajos. Con monto, cuenta y medio; el medio vuelve a «El de la cuenta» al cambiar de cuenta y en cada venta nueva. La fecha es la de vender salvo que se elija otro día, y avisa si cae antes de la apertura de la cuenta.
  - **Vender** es el único que vende: la venta no está en un `<form>`, así que Enter en un campo, o «Ir» en el teclado del teléfono, no la manda. Dice lo que lo detiene antes de pulsarlo (`saleProblem`, con las palabras de la base), vuelve a leer el plan justo antes y llama a `quick_sale` con una **llave** (`saleKey`): la misma venta enviada otra vez sin cambios conserva la llave, y la base devuelve el pedido que ya hizo en vez de otro. Un rechazo de la base se muestra tal cual. Cualquier otro error puede haber llegado después de guardar: la pantalla pregunta a la base por la llave (`findSale`) y, si la venta está, muestra su resumen. Si no se puede saber, pide volver a tocar «Vender» sin cambiar nada y enlaza a los últimos pedidos. Al terminar, un resumen (pedido con enlace, vendido, cobrado y saldo) y la pantalla lista para la siguiente, con la misma cuenta y una llave nueva; el resumen se quita al intentar la siguiente, para que no se lea como suyo.
- **Pedido** (`/pedidos/:id`): detalle, avance de estado, trabajos de impresión asociados, el resumen de estimado contra real, y el **cobro**: total, cobrado, saldo y el formulario que llama a `record_payment`. Cuando la base rechaza un cobro, su mensaje se muestra tal cual, porque ya trae los importes exactos.
- **Impresiones** (`/produccion`): cola y historial. Crear un trabajo desde una línea de pedido o suelto, iniciarlo, y **cerrarlo** indicando resultado, tiempo real y gramos por rollo. El cierre llama a `complete_print_job`, que descuenta el stock. Si falla, pide la causa.

### Finanzas
- **Cuentas** (`/finanzas/cuentas`): caja, banco y billeteras con su saldo de apertura y su saldo actual, que sale de los movimientos. Alta y edición.
- **Movimientos de dinero** (`/finanzas/movimientos`): el libro, con filtros. Registra los cinco tipos; la transferencia es **un** formulario con dos cuentas, nunca dos registros. Un movimiento se anula con motivo, no se borra. Un «Ingreso» es dinero que entra y no es venta, cobro de un pedido ni aporte (un reembolso, la devolución de un proveedor); al elegirlo, el formulario manda las ventas a Pedidos o a la Venta rápida y el cobro de un pedido al pedido o a Por cobrar, porque anotado aquí contaría dos veces (E5-01). **No ofrece las categorías de ventas** (`cashCategoriesFor`, `transaction_categories.sales`) y dice por qué, y si no queda ninguna, dónde crear una (`cashCategoryHint`); la base lo rechaza igual.
- **Por cobrar** (`/finanzas/por-cobrar`): pedidos entregados con saldo pendiente y días de atraso; desde aquí también se cobra.
- **Resultados** (`/finanzas/resultados`): estado de resultados por mes. El costo de ventas es lo que salió del estante, con su mano de obra, y lo pendiente a su estimado (ADR-022); las impresiones fallidas que ningún estimado paga entran en «No vendido». Las compras de inventario se informan aparte porque su costo ya llega por el costo de ventas; los aportes y retiros del dueño son capital y no utilidad. Los otros ingresos suman a la utilidad neta en su propia columna y su propia línea, así la tabla cuadra: utilidad bruta − gastos − no vendido + otros ingresos = utilidad neta.

### Resto
- **Impresoras** (`/impresoras`): fichas con horas acumuladas y hora de máquina, mantenimientos pendientes y vencidos, registrar mantenimiento, historial e incidentes.
- **Clientes** (`/clientes`): lista y alta con documento, contacto y notas.
- **Configuración** (`/configuracion`): parámetros de costo con vigencia (crear una versión nueva, nunca editar la vigente), datos del taller y régimen tributario, miembros con su tarifa por hora, canales de venta (con el **canal por defecto**: «Usar por defecto»), categorías de regalo, categorías de dinero (cada una de ingreso puede marcarse **de ventas**), marcas, materiales y **apariencia**.

  La pestaña **Apariencia** controla el tema de color, claro u oscuro, la densidad de las tablas y si el menú arranca contraído. Vive en `core/appearance.ts` y se guarda en `localStorage`, **no en la base**: la apariencia es una propiedad de la pantalla que estás mirando, no de quién eres, y además tiene que poder aplicarse antes de que cargue nada. Por eso hay un script de seis líneas en `index.html` que lee la preferencia antes de que arranque Angular; sin él la página pinta en claro y luego salta, que se lee como un error. **Si cambias la clave o el formato, los dos sitios tienen que ir a la par.**

  Guarda `mode`, `palette`, `density` y `sidebarCollapsed`. Lo almacenado antes del 2026-10-06 llamaba `theme` al modo; `parseAppearance` lo sigue leyendo, con prueba, para no devolver a claro a quien ya había elegido oscuro.

  El tema y la densidad se eligen con miniatura y **no se aplican hasta Guardar**: cambiarlos bajo los pies de quien los está comparando hace imposible compararlos. La miniatura no es un dibujo ni una copia de la paleta: lleva puestos `data-palette` y `data-mode`, así que la pinta la hoja de estilos de verdad y no puede desincronizarse. Lo del menú sí se aplica al instante, porque es la misma acción que el botón « y verlo moverse es la única forma de saber si te gusta.

## 6.7 Cómo se reparte el trabajo

| Paquete | Carpetas | Pantallas |
|---|---|---|
| P1 Inventario | `features/inventario/` | Filamentos, rollos, compras, insumos, movimientos |
| P2 Catálogo | `features/catalogo/` | Catálogo y producto con receta y precios |
| P3 Cotizador | `features/cotizador/`, `features/cotizaciones/` | Cotizador, lista y detalle |
| P4 Pedidos y producción | `features/pedidos/`, `features/produccion/` | Pedidos, alta, detalle, impresiones |
| P5 Taller | `features/impresoras/`, `features/clientes/`, `features/configuracion/`, `features/panel/` | Impresoras, clientes, configuración, panel |

## 6.8 Qué se considera terminado

1. `pnpm --filter @pickypop/web build` pasa sin advertencias nuevas.
2. La pantalla carga datos reales del Supabase local y las acciones guardan de verdad.
3. Los tres estados están cubiertos y los errores se explican en español, sin volcar mensajes técnicos.
4. Se ve bien a 400 px y en tema oscuro.
5. Nada fuera de la carpeta del paquete quedó modificado.
