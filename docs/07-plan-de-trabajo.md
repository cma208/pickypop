# 7. Plan de trabajo

> Estado: vigente · Reescrito el 2026-10-05 tras la conversación de flujos con el dueño · Actualizado el 2026-10-06
> Este documento es el reparto de trabajo. Está escrito para que lo pueda tomar cualquier agente (Claude, Codex, o un subagente de cualquiera de los dos) sin haber estado en las conversaciones previas.

## 7.1 Cómo leer esto

Cada hito tiene: **por qué existe**, **qué hay que hacer** con los archivos concretos, **cómo se sabe que terminó**, y **de qué depende**. Un hito no está terminado si solo compila: hay que haberlo usado en el navegador contra la base real.

Las reglas que no se negocian están en [AGENTS.md](../AGENTS.md), en la raíz del repositorio. **Léelo antes de tocar código.**

> **Los hitos se renumeraron el 2026-10-05.** La versión anterior numeraba por área; esta numera por **orden de ejecución**. Si vienes de la versión vieja: el antiguo M3 (CRM de pedidos) es ahora M6 y cambió de alcance, y el antiguo M4 (productos compuestos) se partió en M4, M5 y M7.

## 7.2 De dónde partimos

El sistema está desplegado en `https://cma208.github.io/pickypop/` contra un proyecto de Supabase real, con datos entrando. **M0 y M1 están cerrados** (ver 7.5).

Lo que define el resto del plan salió de una conversación con el dueño sobre cómo trabaja de verdad. Tres hallazgos mandan sobre todo lo demás:

**Son dos tuberías, no una.** El dueño pidió "pedidos como CRM", pero lo que describió —un trato con varias cotizaciones, de las cuales algunas se concretan con fechas de entrega distintas— no es un pedido: es una **oportunidad**. Hay un flujo comercial (cliente → oportunidad → cotización → pedido) y un flujo de taller (impresión → piezas → armado → entrega). Mezclarlos en un solo tablero es lo que vuelve confusos a los sistemas de este tamaño. El `order_status` que ya existe **es** el tablero de taller; falta el comercial.

**Casi todos los productos son compuestos.** El negocio arrancó vendiendo productos que son tres o cuatro piezas impresas más dulces. El dulce no es un adorno del modelo: está en casi todo lo que venden. Un sistema que no sabe componer no sabe costear este negocio.

**Quien vende necesita saber qué puede prometer.** El dueño imprime para stock porque tiene una sola impresora, pero no siempre tiene lo que cree. Antes de comprometer una fecha hay que poder responder: cuántas hay armadas, cuántas más se pueden armar con las piezas que hay, y para cuántas alcanza el filamento.

## 7.3 Mapa de dependencias

```
M0 Seguridad y respaldo ─── CERRADO
M1 Datos maestros ───────── CERRADO

M2 Navegación ──── M3 Identidad ──── M10 Afinado visual y temas
   CERRADO           CERRADO

M4 Piezas, composición ───┬── M5 Disponible para prometer
   CERRADO                └── M7 Packs anidados

M6 Oportunidades (kanban) ── CERRADO
M8 PDF de cotización ─────── CERRADO · falta la segunda vuelta
M9 Usuarios y roles ─────────────── (independiente)

M11 Imágenes en todo ──┬── M12 Cola e historial de impresión
                       ├── M13 Catálogo y recetas
                       └── M14 Armar productos

M15 Lo que se carga por la base ─── (independiente y chico)
```

**La tanda del 2026-10-06, por la tarde.** El dueño recorrió el sistema y trajo una lista de fricciones reales. Salieron M11 a M15 y la tarea 5 de M10. **M11 va primero porque las otras tres lo necesitan**, y porque la regla que dejó —*todo lo que sea un producto lleva su foto*— no es de una pantalla, es del sistema entero.

**Lo que queda, y se puede hacer a la vez:** M5, M7, M9, M10 y la segunda vuelta del PDF. M5 y M7 comparten el modelo de recetas, así que conviene que no los tomen dos agentes distintos al mismo tiempo; los demás no se pisan con nadie.

**Hay que esperar:** M5 y M7 van después de M4 —ya cerrado— y los dos son **aditivos** sobre él: M7 en particular es una columna más en una tabla que M4 ya creó, no una reescritura. M10 va después de M3: no se pinta algo que vas a mover.

**Reparto sugerido.** M7 es el de más criterio y toca el modelo de datos: conviene a quien tenga más contexto. M9 y M10 están bien acotados y se pueden delegar enteros, aunque M10 toca los estilos globales, que son compartidos: quien lo tome trabaja solo en ellos.

---

## M2 · Navegación y nombres

**Por qué.** El dueño entró a cargar datos y no supo por dónde empezar. Hay 21 enlaces planos, dos secciones distintas llamadas "Movimientos", y el catálogo —que es lo que se vende— vive bajo Producción.

**Depende de:** nada ya. Antes dependía de saber qué pantallas iban a existir; la conversación de flujos lo resolvió.

### La estructura acordada

Sustantivos, no verbos: es el estándar (Odoo, ERPNext, Shopify) y el dueño lo pidió explícitamente.

```
Hoy                    qué hay que hacer hoy

Ventas        Oportunidades · Cotizaciones · Pedidos · Clientes
Producción    Cola de impresión · Catálogo y recetas · Impresoras
Inventario    Filamentos · Insumos y empaque · Piezas · Compras · Kardex
Finanzas      Cuentas · Caja · Por cobrar · Resultados

Configuración          marcas, materiales, acabados, parámetros, usuarios
```

*Oportunidades* y *Piezas* son entradas que todavía no tienen pantalla (llegan con M6 y M4). Dejarlas fuera del menú hasta que existan: un enlace a una pantalla vacía es peor que no tenerlo.

### Tareas

1. **Reagrupar y renombrar** en `apps/web/src/app/layout/shell.ts`:
   - Los dos "Movimientos" se separan: el de inventario pasa a **Kardex**, el de dinero a **Caja**.
   - **Catálogo** sale de Producción. Va en Producción igual, pero como *Catálogo y recetas*, porque es donde se define cómo se hace algo; lo que se vende se elige desde la cotización.
   - **Producción** pasa a *Cola de impresión*: dice lo que es.
   - **Impresoras** se queda en Producción, no en Configuración: se usa a diario (mantenimiento), no se configura una vez.

2. **Filamentos y Rollos se funden en una pantalla.** La distinción —producto frente a unidad física— es correcta, pero no merece dos entradas en el menú. Un filamento se despliega y debajo salen sus rollos con su estado y sus gramos. Dos rutas pasan a una.

3. **Estados vacíos que enseñen.** Cada pantalla sin datos debe decir qué es eso y cuál es el primer paso, con el botón que lleva ahí. Hoy dicen que está vacío y nada más. Esto es la mitad del problema que reportó el dueño.

4. **Una ruta diaria clara.** El panel pasa a llamarse **Hoy** y debe responder "qué hago hoy", no solo mostrar tarjetas.

**Terminado cuando:** alguien que no construyó el sistema puede, sin que le expliquen, registrar una compra de filamento, cotizar un producto y cerrar una impresión.

**Cerrado el 2026-10-06.** Las cuatro tareas están hechas. Sobre la 3: al auditar los 35 estados vacíos resultó que casi todos ya tenían su botón y su explicación en la tarjeta; solo dos de impresoras decían qué faltaba sin decir para qué sirve. El hueco real estaba en "Hoy", no en los estados vacíos.

---

## M3 · Identidad visual

**Por qué.** El dueño dice que "los colores y presentación son bastante básicas". La paleta en realidad es una decisión deliberada (terracota sobre crema, con modo oscuro automático) y no es el problema. El problema es la **jerarquía**: todo pesa lo mismo, no hay iconos, las tablas son uniformes y la barra lateral es texto plano.

**Depende de:** M2. No se viste una navegación que va a cambiar.

### Tareas

1. **Jerarquía tipográfica.** Contraste real entre lo importante y lo secundario, dentro de los dos pesos que ya hay. No agregar fuentes nuevas sin acordarlo.
2. **Iconos en la navegación**, para reconocer la sección sin leer. Un juego de iconos de trazo, embebido como sprite SVG; nada de una librería de componentes nueva.
3. **Densidad por tipo de pantalla.** Las de trabajo (tablas, formularios) compactas; las de resumen, aireadas. Hoy todas tienen el mismo aire.

**Terminado cuando:** en una captura de pantalla se distingue de un vistazo qué es lo importante, y el dueño reconoce la sección por el icono antes de leer la etiqueta.

**No hacer:** repintar la paleta. Los tokens de `styles.scss` se quedan.

**Cerrado el 2026-10-06.** Las tres tareas están hechas y la paleta quedó intacta. Los iconos son un sprite en línea (`layout/nav-icons.ts`), no una librería.

---

## M4 · Piezas, composición y costeo exacto

**Por qué.** Hoy una impresión descuenta gramos y no produce nada contable: la botella y las tapas no existen como inventario. Eso obliga a cargar una placa entera de nueve tapas a la venta de una sola botella. Con piezas en stock, la placa se reparte entre las nueve ventas que respalda, imprimir y vender se independizan, y un pedido se puede atender sin imprimir nada.

**Bloquea a:** M5 y M7. Es el hito más grande y el que más valor da.

### Tareas

1. **Las piezas impresas son inventario.** Agregar el valor `part` a `inventory_item_kind`. Una pieza es un `inventory_item`, no una tabla nueva: así la receta, el kardex y la valorización que ya existen sirven sin duplicarse.

2. **Una placa declara qué pieza produce.** `recipe_plates.units_per_run` hoy significa "unidades de producto terminado que aporta una corrida". Agregar `produces_item_id` apuntando a un `inventory_item` de tipo `part`. Cuando es nulo se mantiene el comportamiento de hoy, para no romper las recetas ya cargadas. Al cerrar la impresión, esas unidades entran al stock por `app.complete_print_job`.

3. **Receta de armado de un nivel.** `recipe_items` ya apunta a `inventory_items` y ya cubre dulces y bolsa; con el tipo `part` cubre también las piezas sin cambiar la tabla. Verificar que la pantalla de receta deje elegir los cuatro tipos.

4. **La operación de armar.** Consume piezas e insumos y produce producto terminado, todo o nada, con el patrón de `app.complete_print_job`. Si falta un componente, falla entera y dice cuál falta.

5. **Valorización.** Una pieza entra a stock a un costo. Reutilizar la regla que ya está en los parámetros (`material_valuation`, hoy *costo promedio del stock*) en vez de inventar un criterio nuevo.

6. **Arreglar la precisión del costo unitario de compra.** `purchase_lines.unit_price` es `numeric(12, 2)`. Una bolsa de 350 caramelos a S/ 15 cuesta S/ 0.042857 por caramelo y solo se puede anotar S/ 0.04: la bolsa queda valorizada en S/ 14.00 en vez de S/ 15.00, un 6.7 % menos y **siempre hacia abajo**. Afecta justo al insumo que está en casi todos los productos.
   - La vista `inventory_item_costs` ya redondea a 4 decimales, así que el cuello está solo en la columna de entrada. Migración: ampliar a `numeric(12, 6)`.
   - Además, el formulario de compra debe aceptar **"compré una bolsa de 500 g a S/ 15"** y hacer la división él, en vez de pedir el precio unitario ya calculado. Es donde nace el error.

7. **Atender un pedido desde stock**, sin imprimir.

**Terminado cuando:** se imprime una placa de nueve tapas, las nueve entran a stock, se arma una botella consumiendo una tapa y sus dulces, las ocho restantes siguen en inventario, y el costo por unidad refleja el reparto en vez de cargar la placa entera. Y una compra de 350 caramelos por S/ 15 deja el inventario valorizado en S/ 15.00 exactos.

**Ojo con esto:** es aditivo. Los pedidos cargados antes siguen siendo válidos. **No migrar históricos hacia atrás.**

**Cerrado el 2026-10-06**, salvo el punto 6b: el formulario de compra todavía pide el precio unitario ya calculado en vez de aceptar "compré una bolsa de 500 g a S/ 15". La columna ya aguanta seis decimales, así que el error grande está tapado; falta la comodidad.

Tres cosas aparecieron al usarlo y están resueltas: el costo de una pieza no puede salir de `inventory_item_costs` porque una pieza no se compra nunca (sale del promedio ponderado de lo que costó imprimirla); al armar, las piezas salían del stock con costo nulo por lo mismo; y `friendlyError` no reconocía el código `P0001`, así que el mensaje que la base escribe para una persona —el que dice qué falta y cuánto— se perdía detrás de un "no pudimos".

---

## M5 · Disponible para prometer

**Por qué.** El dueño lo dijo así: *"la persona que realiza la venta tiene que saber qué tiene en stock y cuánto más puede producir"*. Hoy ese dato no está en ninguna pantalla, y sin él se compromete una fecha a ciegas. En los ERP esto se llama *available to promise*.

**Depende de:** M4. Sin piezas en stock no hay nada que responder.

### Tareas

1. **Una vista que responda la pregunta completa** para una variante: cuántas unidades hay armadas, cuántas más se pueden armar con las piezas que hay en stock, y cuántas más se podrían imprimir con el filamento disponible. El tercer número sale de los gramos por placa de la receta contra los gramos en rollos del SKU correspondiente.

2. **Mostrarlo donde se vende**, no en una pantalla aparte: en el cotizador y al armar un pedido, junto a la cantidad. Al pedir 20 debe decir algo como *"6 armadas · 14 más con las piezas que hay · el filamento alcanza para 9"*.

3. **Señalar el cuello de botella.** Cuando el límite es el filamento y no las piezas, decirlo y enlazar a la compra. Es la diferencia entre un aviso y una acción.

**Terminado cuando:** al cotizar una cantidad mayor a la disponible, la pantalla dice exactamente qué falta y cuánto, y el número coincide con lo que dice el inventario.

---

## M6 · Oportunidades (tablero kanban)

**Por qué.** Un trato con un cliente puede implicar varias cotizaciones, de las cuales algunas se concretan y con fechas de entrega distintas. Hoy eso no tiene dónde vivir: `quotes` cuelga del cliente y `orders` de la cotización, sin nada que los agrupe.

**Independiente.** No lo bloquea nada y no bloquea a nadie.

### Tareas

1. **Tabla `opportunities`** (en la interfaz, *oportunidades*): `workspace_id`, `customer_id`, `title`, `stage`, `owner`, `expected_close`, `note`. Las cotizaciones y los pedidos la referencian; **ambas referencias son opcionales**, porque una venta de mostrador no pasa por un trato.

2. **Las etapas, acordadas con el dueño:**

   ```
   Nuevo → Cotizado → Negociando → Ganado → Cerrado
                                 ↘ Perdido
   ```

   - **Ganado** significa que se convirtió en pedido, no que se entregó.
   - **Cerrado se deriva, no se mueve a mano:** la tarjeta llega sola cuando todos los pedidos del trato están entregados y cobrados. Es la misma regla que rige los saldos (ver AGENTS.md). El dueño mueve la tarjeta mientras negocia; de "Ganado" en adelante la mueve el taller con su trabajo.

3. **"Esperando adelanto" es un bloqueo, no una columna.** Las compras grandes llevan adelanto y las chicas no, así que una columna estaría vacía la mayor parte del tiempo. Va como marca en la tarjeta, con su motivo, visible en cualquier etapa.

4. **El tablero.** Arrastrar cambia la etapa. La tarjeta muestra cliente, monto, días sin movimiento y el bloqueo si lo hay. Sin librería de kanban: `draggable` nativo alcanza para cinco columnas.

5. **Historial de etapas.** `opportunity_stage_history` escrito por disparador, no por la aplicación, para que no dependa de que alguien se acuerde.

6. **La ficha del cliente con su historia:** sus tratos, sus pedidos, lo que ha comprado, lo que debe.

**Terminado cuando:** un trato con dos cotizaciones y un pedido se ve completo en una pantalla, la tarjeta llega a "Cerrado" sola al cobrarse el pedido, y el historial dice quién la movió y cuándo.

### Y aparte: el retroceso de estado en los pedidos

Esto venía del alcance viejo y sigue siendo válido, pero es del tablero de **taller**, no del comercial:

- Comprobado: la base **no** tiene ninguna restricción que obligue a avanzar; el candado está solo en la interfaz. Hay que permitirlo en la pantalla y **registrar el motivo** cuando se retrocede, que es lo que lo vuelve auditable en vez de un botón de deshacer.
- `order_status_history` con `order_id`, `from_status`, `to_status`, `changed_by`, `changed_at` y `note`, por disparador.

---

## M7 · Packs anidados y productos que no se venden solos

**Por qué.** El pack de dulces se arma una vez y entra en diez productos. Sin anidamiento hay que copiar la misma lista de dulces en cada receta, y el día que cambia el pack hay que corregir diez.

**Depende de:** M4. Y es **aditivo** sobre él: una columna más en una tabla que ya existirá.

### Tareas

1. **Un componente puede ser otro producto.** `recipe_items` gana `component_variant_id uuid references product_variants`, nullable, con `check (num_nonnulls(inventory_item_id, component_variant_id) = 1)` — el mismo patrón que ya usa `purchase_lines`.

2. **Dos guardas en la base, no en la aplicación:**
   - **Sin ciclos.** Si A contiene a B y alguien mete A dentro de B, la consulta de costo no termina nunca. Un disparador que recorra el árbol hacia arriba y rechace la inserción.
   - **Profundidad máxima.** Tres niveles sobran para este negocio. Un límite explícito evita que un error de captura se convierta en una consulta lenta.

3. **Costo por acumulación.** El costo de un producto compuesto es la suma de sus componentes, recursivamente, con una `with recursive`. **Derivado, nunca guardado.** A esta escala rinde de sobra.

4. **Explosión al vender.** Elegir el producto final expande el árbol solo: tres piezas, cuatro dulces, una bolsa. Esto es lo que alimenta el aviso de *"vamos a necesitar tanto para cerrar esta venta"*, y es la misma operación que M5 usa para contar lo disponible.

5. **Productos que no se venden solos.** `catalog_products.sellable boolean not null default true`. Un pack de dulces tiene `false`: existe para componer, no aparece en el catálogo de venta ni se puede elegir en una cotización.

**Los packs son fijos, no configurables.** Decidido con el dueño: cada combinación de dulces es un producto con su receta. Si algún día piden muchas combinaciones distintas, **volver a conversarlo antes de construir un configurador**: eso cambiaría cómo se congela el precio en la cotización y no es una extensión barata.

**Terminado cuando:** existe un "pack de dulces" que no aparece en el catálogo de venta, está dentro de tres productos distintos, cambiarle un dulce cambia el costo de los tres, y meterlo dentro de sí mismo es rechazado por la base.

---

## M8 · PDF de cotización

**Por qué.** Una cotización hay que poder mandarla por WhatsApp.

**Independiente y pequeño.**

### Tareas

Generar un PDF desde el navegador con jsPDF, sin servidor. Debe llevar: el taller, el cliente, las líneas con cantidad y precio unitario, el total, la validez y las condiciones. Usar los valores **congelados** de la cotización, no recalcular con los precios de hoy.

**Terminado cuando:** una cotización guardada produce un archivo que se abre bien en el móvil y cuyos números coinciden exactamente con los de la pantalla.

**Cerrado el 2026-10-06.** Lleva taller, cliente, número, versión, fechas, líneas, subtotal, descuento, IGV y total, con los importes congelados. Entró la dependencia `jspdf@^4.2.1` con importación diferida: el paquete inicial casi no cambia y los 113 kB solo se bajan al pulsar el botón.

### Segunda vuelta: el PDF escueto de más

El dueño lo vio y dijo que *"pareciera que le falta más información"*. Pidió lo básico al principio y ahora quiere más. **Preguntarle cuáles de estos quiere antes de construirlos**: un PDF cargado de datos se lee peor que uno escueto, y esto lo ve un cliente.

- **RUC y razón social del taller.** La tabla `workspaces` ya los guarda, pero `CurrentWorkspace` (`core/workspace.ts`) solo expone id, nombre, régimen y rol: hay que **ampliar ese servicio**, que es compartido. Hoy no tienen RUC, así que no estorba todavía.
- **Cómo pagar:** las cuentas de `accounts` (Yape, Plin, transferencia) y si hace falta adelanto.
- **Plazo de entrega:** `catalog_products.lead_time_days` existe y el PDF lo ignora.
- **Contacto del taller** (teléfono, correo, Instagram) y **condiciones** al pie.
- **Logo**, cuando tengan uno.
- El desglose por línea queda en duda a propósito: le enseña al cliente más de lo que conviene y no le ayuda a decidir.

---

## M9 · Usuarios, roles e invitaciones

**Por qué.** Hoy un usuario se crea desde el panel de Supabase. Y los roles son nombres sin contenido: `operator` y `viewer` pueden lo mismo, y un no-dueño puede casi todo salvo borrar.

**Independiente.** Urge antes de que entre una tercera persona, no antes.

### Tareas

1. **Invitar por correo desde la aplicación.** Pantalla de administración que llame a `inviteUserByEmail`. Requiere la llave de servicio, que **nunca** puede estar en el navegador: va en una Edge Function de Supabase. Sin herramientas nuevas.
   - El correo lo manda Supabase. Su servidor por defecto tiene tope bajo y sale de un dominio compartido, así que puede caer en spam. Si pasa, se configura SMTP propio en Authentication → Emails, que es un ajuste, no otra plataforma.
2. **Dar contenido real a los roles.** Hoy las políticas solo distinguen `app.is_member` de `app.is_owner`. Definir con el dueño qué puede cada rol y **escribirlo en las políticas de la base**, no escondiendo botones: ocultar un menú no impide llamar a la API.
   - Acordado: los dos fundadores son `owner`, con acceso completo incluida la parte financiera. El siguiente que entre será `operator`.
   - Falta decidir qué pierde exactamente un `operator`, y si `viewer` se vuelve de solo lectura de verdad o se elimina.
3. **Pantalla de cuenta** para cambiar el nombre visible y la contraseña, y **ajustes generales** del sistema.

**Terminado cuando:** el dueño invita a alguien desde la aplicación, esa persona entra con el rol que le tocó, y una llamada directa a la API con su sesión es rechazada en lo que no le corresponde. **Probar lo segundo, no solo lo primero.**

---

## M10 · Afinado visual y temas de color

**Por qué.** M3 arregló la **jerarquía**: ya se distingue lo importante, hay iconos y las tablas aprietan. Lo que no arregló —porque se decidió expresamente no tocarlo— es cómo se ve el conjunto. El dueño lo pidió así: *"que los elementos luzcan bien en su conjunto y sea agradable a la vista"*, y aclaró que cuando dijo *temas* no se refería a claro y oscuro sino a **distintas combinaciones de colores**.

Esa aclaración cambia el modelo que hay hoy, y es lo primero que hay que entender antes de tocar nada:

> **El modo y el tema son dos ejes distintos.** *Modo* es claro, oscuro o automático: lo pide el entorno, muchas veces el sistema operativo. *Tema* es la combinación de colores: lo elige la persona porque le gusta. Son perpendiculares: **cada tema tiene que existir en claro y en oscuro**. Hoy `core/appearance.ts` llama `theme` al modo, y eso hay que separarlo antes de agregar paletas o el nombre miente para siempre.

**Depende de:** M3 (cerrado). No depende de M5, M7 ni M9, y no se pisa con ellos: vive en los tokens y en Configuración.

### Tareas

1. **Separar los dos ejes en `core/appearance.ts`.** `theme` pasa a `mode` (`auto | light | dark`) y entra `palette`. Son dos atributos en `<html>`: `data-mode` y `data-palette`. Cuidado con tres cosas que van juntas y se olvidan por separado:
   - `parseAppearance` ya cae campo por campo, así que una preferencia guardada con el nombre viejo no rompe nada; pero hay que **leer el `theme` viejo como `mode`** o quien ya eligió oscuro vuelve a claro sin motivo.
   - El script de arranque de `index.html` pinta antes de que exista Angular. **Si cambia la clave o el formato, los dos sitios cambian a la vez.** Está dicho en el comentario del archivo y aun así es lo más fácil de olvidar.
   - El atributo explícito tiene que seguir ganándole a la consulta de medios: en `styles.scss` el bloque explícito va **después** del `@media`.

2. **Definir las paletas como juegos completos de tokens, no como un color de acento.** Cada paleta redefine los mismos nombres (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--danger`, `--good`, `--warn` y sus `-soft`) en sus dos modos. Un tema que solo cambia el acento se nota pobre justo porque el resto no acompaña. Cuatro o cinco bastan, cada una con su nombre en español y una razón de ser distinta —una cálida, una fría, una neutra, una de alto contraste—; la terracota sobre crema de hoy se queda como la predeterminada, porque es la identidad del taller.

3. **Cazar los colores escritos a mano.** Esta es la tarea que decide si los temas funcionan o se ven rotos. Buscar hexadecimales y `rgb(` fuera de `styles.scss`: cada uno es una pantalla que no va a cambiar de color con las demás. Incluye los que puse yo en las miniaturas de Configuración.

4. **Que la miniatura salga de la paleta, no de una copia.** Hoy `appearance-section.ts` tiene las paletas escritas a mano porque tiene que pintar un tema que **no** está vigente. Con dos funcionaba; con cinco, cualquier retoque en los tokens deja la miniatura mintiendo. Hay que generarla de una sola definición de las paletas que sirva para el CSS y para la vista previa.

5. **Una pasada de conjunto, pantalla por pantalla.** Que los elementos se vean parte de la misma cosa: una sola escala de espacios, un solo radio de borde, una sola profundidad de sombra, botones del mismo alto, tablas con el mismo ritmo, estados vacíos que no parezcan errores, foco visible que combine con la paleta. Recorrer las pantallas a 1440 px y a 400 px. **Esto es lo que el dueño pidió primero**; las paletas sin esto siguen viéndose desprolijas, solo que de otro color.

6. **Contraste comprobado en cada paleta y en los dos modos.** Mínimo AA (4.5:1) en texto normal y 3:1 en bordes y estados. Una paleta bonita que no se lee a la luz del día es peor que la de ahora. Comprobarlo, no suponerlo.

**Terminado cuando:** el dueño cambia de paleta en Configuración y **toda** la aplicación cambia con ella, sin que ninguna pantalla se quede con el color viejo; la preferencia sobrevive a recargar sin destello; y una captura de cualquier pantalla se ve deliberada y no armada por partes.

**No hacer:** meter una librería de componentes, agregar fuentes sin acordarlo, ni tocar el flujo. Esto es cómo se ve, no cómo se trabaja.

### Lo hecho el 2026-10-06, y lo que falta

Hechas las tareas 1, 2, 3, 4 y 6, y **a medias la 5**, que es la que el dueño nombró primero.

- Los dos ejes están separados: `data-mode` y `data-palette` en `<html>`, con `mode` leyendo el `theme` viejo para no resetear a quien ya había elegido oscuro. Hay prueba de esa migración.
- Cinco paletas —**Terracota** (la predeterminada), Índigo, Turquesa, Ciruela y Grafito—, cada una completa y en sus dos modos, en `apps/web/src/_palettes.scss`, **el único archivo del proyecto donde hay un color escrito**.
- Las miniaturas **no copian** los colores: cada una lleva su `data-palette` y su `data-mode`, así que las pinta la hoja de estilos de verdad. Era la única forma de que cinco paletas no se desincronizaran.
- Dos tokens nuevos que salieron de mirar el contraste: **`on-accent`** (la tinta que va encima del acento, que no puede ser blanca en modo oscuro, y así estaba) y **`line-strong`** (el borde de un campo, que necesita 3:1 cuando la raya entre dos filas de tabla necesita desaparecer).
- Contraste comprobado con cálculo, no a ojo: texto, apagado, acento, semánticos y bordes de campo en las diez combinaciones. Todo por encima de AA.
- Radios unificados a `--radius` y `--radius-sm`: ya no hay 8, 10 y 12 px conviviendo.

**Falta la tarea 5 entera:** la pasada pantalla por pantalla. Lo que se hizo fue lo transversal —radios, bordes de campo, tinta sobre el acento—, no revisar cada pantalla a 1440 y 400 px buscando lo que no encaja. Hay un token `--shadow` definido y todavía sin usar: decidir si las tarjetas llevan profundidad o se quedan planas es parte de esa pasada.

**Y esa pasada ya tiene lista de pendientes**, salida de que el dueño recorriera el sistema: M11 a M15. Lo visual de este hito y lo de esos cuatro es la misma cosa vista desde dos sitios —aquí los tokens, allá las pantallas—, así que conviene cerrarlos en ese orden y no al revés.

---

## M11 · Imágenes en todo

**Por qué.** El dueño lo dejó como **regla, no como pedido**: *"quiero que todo tenga imágenes, guarda esto como regla, todo producto en el sistema debe ir acompañado de su imagen para su rápida identificación en todas partes de la aplicación"*.

No es decoración. En un taller donde casi todo es "la botella roja", "la tapa chica" y "la bolsa de 10×15", el nombre escrito es el peor identificador posible: se lee despacio y se confunde. Una lista de insumos con foto se escanea de un vistazo. Y es la pieza que falta para que el armado y el formulario de compra dejen de ser listas desplegables de texto.

**Bloquea a:** M12, M13 y M14, que son principalmente visuales. Va primero.

### Tareas

1. **Un sitio donde vivan los archivos.** Supabase Storage, cubo `media`, con política por taller: la ruta empieza por el `workspace_id` y la política solo deja entrar a esa carpeta. El plan gratuito da 1 GB; una foto de producto comprimida pesa 80–150 kB, así que no es una preocupación todavía, pero sí hay que **redimensionar en el navegador antes de subir** (lado mayor 1024 px): una foto de celular son 4 MB y nadie quiere esperar eso en el taller.

2. **Qué lleva imagen.** `catalog_products`, `product_variants` e `inventory_items` —y eso cubre insumos, empaque, repuestos y **piezas impresas**—. La variante cae a la imagen del producto cuando no tiene una propia: el dueño dijo que la foto del producto terminado *"puede variar del producto o productos impresos"*, así que las dos capas hacen falta, pero obligar a cargar una por variante sería pesado.

3. **Un componente y uno solo.** `<pp-thumb>` para mostrar y `<pp-image-field>` para cargar. El marcador de posición cuando no hay foto tiene que ser evidente y no feo: inicial del nombre sobre el color del acento, no un icono roto.

4. **Usarlo en todas partes:** catálogo, ficha de producto, piezas impresas, insumos, empaque, armado, líneas de pedido y de cotización, y el selector de compra.

**Terminado cuando:** se sube una foto desde el celular en el taller, se ve en menos de un segundo en todas las listas donde aparece ese artículo, y una lista de veinte insumos se puede recorrer sin leer un solo nombre.

**Ojo:** las imágenes son del taller, no del mundo. El cubo es privado y se sirve con URL firmada.

**Cerrado el 2026-10-06.** Cubo privado por taller, `<pp-thumb>` y `<pp-image-field>`, y las firmas de una misma tanda se piden en una sola llamada. Comprobado: 1.8 MB de foto entraron y se guardaron 9 kB. **Falta llevar la foto a las líneas de pedido y de cotización**, y a las tarjetas de impresión: el dueño pidió que cada trabajo se vea con la imagen de lo que produce.

---

## M12 · Producción: la cola y el historial son dos cosas

**Por qué.** Hoy `/produccion` mezcla tres cosas en una pantalla: lo que está por imprimirse, lo que ya se imprimió y unas métricas. El dueño lo dijo claro: *"cola de impresión y lo que es historial de impresión deberían ser items separados"*. Son dos preguntas distintas —*¿qué hago ahora?* y *¿qué pasó?*— y cada una quiere su orden, sus columnas y su sitio en el menú.

**Depende de:** M11 para las fotos. Lo demás se puede empezar antes.

### Tareas

1. **Partir en dos pantallas**, con su entrada propia en Producción: **Cola de impresión** (lo pendiente y lo que está corriendo) e **Historial de impresiones** (lo cerrado, con su resultado).

2. **Sacar las métricas de ahí.** Tasa de éxito y causa de fallo más común no son trabajo pendiente: son observación. Van a una pantalla de **métricas** que todavía no existe y que hay que acordar con el dueño antes de inventarla. Mientras tanto, fuera.

3. **La cola tiene que decir lo que falta para decidir:**
   - **Avance** de lo que está corriendo, en porcentaje. La columna `percent_complete` ya existe en `print_jobs` y la pantalla no la muestra.
   - **Si va contra un pedido o no**, con cuál y para cuándo. Un trabajo suelto y uno que sostiene una entrega del viernes no se miran igual.
   - **La foto** del resultado esperado.

4. **Lo que falta imprimir para cumplir los pedidos.** Es lo que el dueño llamó *"la cuota que me pide ventas"*: para los pedidos comprometidos y no entregados, cuántas unidades faltan después de descontar lo armado y las piezas en stock, y por lo tanto qué placas hay que lanzar. **Es la misma cuenta de M5 vista del otro lado**: M5 le dice al que vende qué puede prometer; esto le dice al taller qué tiene que producir. Que la cuenta viva en un solo sitio.

**Terminado cuando:** el dueño entra a la cola por la mañana y sabe, sin abrir nada más, qué está corriendo y en qué porcentaje, qué falta lanzar para no quedar mal con un pedido, y qué es trabajo para stock que puede esperar.

**Cerrado el 2026-10-06, salvo la foto.** Dos pantallas, métricas fuera, avance calculado del tiempo transcurrido contra lo estimado, y la vista `production_needs` con lo que falta producir. **Queda pendiente la imagen en cada tarjeta de impresión**, que depende de saber qué variante produce cada trabajo.

---

## M13 · Catálogo y recetas: que cargar un producto no duela

**Por qué.** Es la pantalla donde se define todo lo demás, y es la que más fricción tiene. El dueño encontró cinco cosas seguidas, y todas son ciertas.

**Depende de:** M11 para las fotos.

### Tareas

1. **La placa se carga del archivo laminado, no a mano.** `packages/slicer-files` ya lee un `.gcode.3mf` en el navegador, y el **cotizador ya lo usa**: de ahí salen los minutos y los gramos por filamento. La receta, que es donde ese dato debería vivir para siempre, los pide escritos a mano. Es el mismo lector, la misma caja de arrastrar: reutilizarlo en el editor de placas. **Esta es la tarea de más valor del hito.**

2. **Clonar una variante.** *"Va a ahorrar bastante tiempo"*, y tiene razón: dos variantes de la misma botella se diferencian en el color y en poco más, y hoy hay que volver a cargar la receta entera. Botón *Duplicar*, que copia receta y escalera y abre la copia para editar.

3. **La pantalla no debe saltar al cambiar de variante.** Una variante con más datos que otra hace que todo se mueva un instante. Reservar la altura o mantener el bloque montado.

4. **Explicar el SKU o quitarlo.** `product_variants.sku_code` es un código interno para identificar la variante de un vistazo —en una etiqueta, en una caja del estante—, es opcional y hoy no lo explica nada. O lleva una ayuda que lo diga y una sugerencia automática, o se va. **Preguntarle si usa códigos en el estante.**

5. **El plazo de entrega se va del formulario.** El dueño preguntó para qué está, y la pregunta es mejor que el campo: el plazo real **se deriva** del stock disponible, y si no hay stock, del tiempo de impresión más la cola del momento. Un número escrito a mano en el catálogo va a estar mal el día que la cola crezca. La columna se queda (las migraciones son de ida), pero deja de pedirse y de mostrarse hasta que M5 pueda calcular el plazo de verdad.

**Terminado cuando:** cargar una botella nueva con sus tres variantes se hace arrastrando tres archivos laminados y duplicando dos veces, sin escribir un solo gramo a mano.

**Cerrado el 2026-10-06.** Las cinco tareas están hechas: la placa se carga del `.gcode.3mf` (el lector y la conjetura del rollo se mudaron a `core/`, porque ahora los usan dos pantallas), se duplica una variante entera desde la base, la pantalla ya no salta al cambiar de variante, el SKU se explica y se sugiere, y el plazo de entrega salió del formulario. **Queda preguntarle si usa códigos en el estante**: si no los usa, el campo sobra del todo.

---

## M14 · Armar productos: que se vea lo que se está armando

**Por qué.** La pantalla de piezas impresas mezcla dos cosas —un inventario y una operación— y la operación quedó como un formulario de dos campos. El dueño pidió lo contrario: *"estoy buscando una experiencia bastante visual e interactiva aquí"*. Tiene razón en que el orden está invertido: hoy se elige una variante de una lista y la pantalla responde si alcanza; lo natural es **elegir el producto terminado, decir cuántos, y que la pantalla enseñe la lista de lo que se va a consumir, con foto, y marque lo que no alcanza**.

**Depende de:** M11.

### Tareas

1. **Separar inventario de operación.** *Piezas impresas* se queda como inventario de piezas. **Armar** es su propia pantalla, a la que también se llega desde el producto y desde el pedido.

2. **El armado, de arriba hacia abajo:** se elige el producto terminado (con su foto), se dice la cantidad, y la pantalla muestra la receta explotada con la foto de cada componente, lo que hace falta, lo que hay, y en rojo lo que falta. El botón solo se habilita si alcanza, y si no alcanza dice cuánto falta de qué. La base ya lo calcula —`app.assemble_product` es todo o nada y devuelve el faltante—, pero hoy eso solo se descubre al pulsar.

3. **Decir a dónde va lo armado.** Hoy no se ve que el producto armado entra al inventario de terminados. Después de armar, enseñar el stock nuevo.

4. **Separar insumos de empaque** en el menú de Inventario. Hoy son pocos y conviven; cuando sean cuarenta, una bolsa y un pegamento no se buscan en la misma lista.

5. **El selector de artículos, con foto y con búsqueda.** Lo pidió para el formulario de compra —*"la lista de productos que se puede comprar va a crecer enormemente"*— y vale para la receta, el armado y las líneas de pedido. Un solo componente compartido, en `ui/`.

**Terminado cuando:** alguien que nunca usó el sistema puede armar diez botellas eligiendo la foto correcta, y entiende por qué no puede armar veinte sin que nadie se lo explique.

**Cerrado el 2026-10-06.** Pantalla propia, elección por foto, receta explotada con el faltante en rojo, insumos separados de empaque y el selector buscable en `ui/`. **Falta llevar ese selector a los otros tres sitios** —receta, líneas de pedido y de cotización—, donde hoy sigue habiendo un `select`.

**Y apareció un defecto de fondo al mirarlo:** armar consumía la receta y **no metía el producto terminado a ningún inventario**. Está corregido (ver ADR-018): ahora entra valorizado en lo que costó armarlo, y existe el tipo de movimiento `production`.

---

## M15 · Lo que todavía se carga por la base

**Por qué.** El dueño sospechó bien: *"creo que hay cosas que estás cargando por base de datos y no creándose desde el mismo sistema"*. Comprobado en el código, son dos:

- **Acabados** (`filament_finishes`). Configuración dice administrar "marcas, materiales, acabados", y `friendlyError` hasta tiene preparado el mensaje de nombre repetido, pero **no hay forma de crear uno**. Se quedó a medias en M1.
- **Categorías de movimiento** (`transaction_categories`). Las de la semilla son las únicas que van a existir nunca. El día que quieran anotar un gasto de publicidad, no pueden.

Ninguna de las dos es grande. Las dos son de las que se descubren en el peor momento.

**Terminado cuando:** una búsqueda de `insert` por tabla no deja ninguna tabla de catálogo fuera, y eso se comprueba, no se supone.

**Cerrado el 2026-10-06.** Las dos se administran desde Configuración, y se desactivan en vez de borrarse.

---

## 7.3.1 Datos de demostración en local

`supabase/seed.sql` termina con un bloque de datos inventados que existe para que el entorno local muestre **todos** los flujos con datos encima: cinco clientes, tres cotizaciones en sus tres estados, diez pedidos —uno por cada estado del tablero, incluido un regalo y uno cancelado—, siete impresiones con sus fallas, mantenimiento al día y vencido, compras de insumos y un mes de movimientos de dinero.

**Las fechas son relativas a `current_date`**, a propósito: con fechas fijas, a la semana el entorno muestra todo vencido y deja de ejercitar los avisos de "vence hoy".

Dos trampas que ya mordieron y están resueltas ahí; si agregas datos, cuidado:
- Un movimiento **sin** `occurred_at` cae en `now()`, y el kardex muestra el stock de apertura como si hubiera llegado hoy.
- `(current_date - 14)::timestamptz` es medianoche **UTC**, que en Lima es la tarde anterior: la fila aparece un día antes. Hay que escribirlo como `((current_date - 14)::timestamp + interval '10 hours') at time zone 'America/Lima'`.

Nunca llega a producción: el CLI solo corre este archivo en local, y un proyecto alojado arranca con `supabase/bootstrap.sql`.

## 7.4 Decisiones ya tomadas

No volver a abrirlas sin hablar con el dueño:

| Decisión | Resuelto |
|---|---|
| Hay una capa de **oportunidad** sobre las cotizaciones | Sí |
| Las etapas comerciales son Nuevo · Cotizado · Negociando · Ganado · Cerrado, más Perdido | Sí |
| "Cerrado" se deriva de los pedidos; no se mueve a mano | Sí |
| "Esperando adelanto" es una marca en la tarjeta, no una columna | Sí |
| El menú usa **sustantivos**: Ventas · Producción · Inventario · Finanzas | Sí |
| Los packs de dulces son **fijos**, cada uno su receta. Nada de configurador por ahora | Sí |
| El pack de dulces **no se vende solo**: hace falta una bandera `sellable` | Sí |
| Lo visual va **después** de la navegación | Sí |
| *Modo* (claro/oscuro) y *tema* (combinación de colores) son **dos ejes distintos**, y cada tema existe en los dos modos | Sí |
| La terracota sobre crema se queda como paleta **predeterminada**: es la identidad del taller | Sí |
| La apariencia se guarda en `localStorage`, **no en la base**: es de la pantalla, no de la persona | Sí |
| El tema y la densidad **no se aplican hasta Guardar**; lo del menú sí, al instante | Sí |
| Las piezas impresas son `inventory_items` de tipo `part`, no una tabla nueva | Sí |
| El costo de una pieza sale del **promedio ponderado de lo que costó imprimirla**, nunca de las compras | Sí |
| Armar es **todo o nada**: si falta un componente no se mueve nada y se dice qué falta | Sí |

> **Corregida el 2026-10-06:** la fila que decía *"y no se repinta la paleta"* ya no vale. Valía para M3, donde repintar habría tapado el problema real, que era la jerarquía. El dueño pidió después paletas de verdad, y eso es M10.

## 7.5 Hitos cerrados

**M0 · Seguridad y respaldo** (2026-10-05). Registro público cerrado, contraseña endurecida, respaldo diario a un repositorio privado (`pickypop-respaldos`) con verificación de tamaño antes de commitear. Los trabajos de GitHub Actions llevan `timeout-minutes` porque un colgado bloqueó la cola entera durante nueve horas.
**Queda pendiente probar una restauración.** Un respaldo que nadie restauró nunca es una suposición, no un respaldo.

**M1 · Datos maestros** (2026-10-05). Marcas, materiales, acabados e impresoras se administran desde la aplicación. El acabado pasó de texto libre a catálogo con bandera de abrasivo; un filamento es abrasivo si lo es su material **o** su acabado, y eso se resuelve en un solo sitio, la vista `filament_sku_details`.

**M2 · Navegación y nombres** (2026-10-06). Veintiún enlaces planos agrupados por área de negocio con sustantivos, los dos "Movimientos" separados en Kardex y Caja, Filamentos y Rollos fundidos en una sola pantalla desplegable, y la barra lateral contraíble. El título del navegador dice el nombre de la pantalla, por `core/page-title.ts`.

**M3 · Identidad visual** (2026-10-06). Jerarquía tipográfica, sprite de iconos en línea (`layout/nav-icons.ts`) y densidad configurable. La paleta quedó intacta a propósito; las paletas nuevas son M10.

**M4 · Piezas, composición y costeo exacto** (2026-10-06), salvo la comodidad del formulario de compra. Detalle en la sección del hito.

**M6 · Oportunidades** (2026-10-06). Tablero kanban con arrastre, bloqueos con motivo, historial por disparador e historia del cliente. Comprobado en vivo: una tarjeta sembrada en *ganado* se movió sola a *cerrado* porque su pedido estaba entregado y cobrado, y una sembrada en *cotizado* subió a *ganado* porque tenía pedidos.

**M8 · PDF de cotización** (2026-10-06). Falta la segunda vuelta, en la sección del hito.

**Y aparte:** la pantalla **Hoy** pasó a ser una cola de trabajo ordenada por urgencia, el entorno local se siembra con un taller entero de ejemplo (7.3.1), y Configuración tiene una pestaña **Apariencia**.

## 7.5.1 Lo que queda de la tanda del 2026-10-06

M11 a M15 están cerrados salvo cuatro cabos, todos chicos y todos anotados en su hito:

1. **La foto en las líneas de pedido y de cotización**, y en las tarjetas de la cola de impresión. Lo último necesita saber qué variante produce cada trabajo.
2. **El selector buscable en los otros tres sitios**: receta, líneas de pedido y de cotización. El componente ya existe en `ui/`.
3. **El formulario de compra todavía pide el precio unitario ya calculado** (viene de M4). Debería aceptar "compré una bolsa de 500 g a S/ 15".
4. **Decidir si `complete_print_job` pasa a usar `production`** para las piezas que produce. Mientras no se haga, el kardex mezcla dos criterios (ADR-018).

## 7.6 Dudas abiertas para el dueño

Ninguna de estas la debe decidir quien implementa:

1. **Qué pierde un `operator`** frente a un dueño (M9).
2. **Si `viewer` se vuelve de solo lectura o se elimina** (M9).
3. **Si un ingreso sin pedido asociado** —una venta de mostrador anotada solo como dinero que entró— debe sumar a la utilidad del mes. Hoy se informa aparte y **no** suma. Si venden así a menudo, la utilidad se lee más baja de lo real.
4. **Saldos de apertura** de las cuatro cuentas de dinero, y la **compra real del rollo negro**, que entró como saldo inicial a S/ 50 sin compra registrada.
5. **Cuánto rinde un plumón de acrílico.** Hasta saberlo, los consumibles que se usan en todo (plumón, alcohol, pegamento) van como **gasto indirecto** y no entran a la receta. Criterio acordado: si el consumible se ve en el producto, va en la receta con rendimiento estimado; si se usa en todo por igual, va a gasto. Y si cuesta menos del 1 % del precio del producto, no entra a la receta: el riesgo no es errar por tres céntimos, es que la receta se vuelva tan fastidiosa que nadie la llene.
6. **Publicar o no la tarjeta de Pickypop** en el portafolio: está commiteada en `~/Developer/cma208.github.io` sin publicar, esperando su visto bueno.
7. **Aprobar `jspdf@^4.2.1`**, la dependencia que entró con M8.
8. **Silenciar o no las ~10 advertencias de CommonJS** que emite el build por dependencias opcionales de jspdf. Rompen el criterio de "build sin advertencias nuevas" de `docs/06-frontend.md`. Se apagan con `allowedCommonJsDependencies` en `angular.json`, **que es configuración y necesita su permiso**.
9. **Qué entra en el PDF** de la segunda vuelta (ver M8).
10. **¿Usa códigos en el estante?** Si no etiqueta cajas, el campo SKU de la variante sobra y conviene quitarlo en vez de explicarlo (M13).
11. **La pantalla de métricas.** Tasa de éxito y causa de fallo salieron de la cola de impresión porque son observación, no trabajo pendiente. Falta acordar qué más va ahí antes de inventarla (M12).
12. **Integrar `nav-y-plan` a `main` y desplegar.** Todo lo del 2026-10-06 está commiteado y **sin publicar** por pedido suyo; lo que está en producción va muy por detrás.
