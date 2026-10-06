# 7. Plan de trabajo

> Estado: vigente · Reescrito el 2026-10-05 tras la conversación de flujos con el dueño
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

M2 Navegación y nombres ──── M3 Identidad visual

M4 Piezas, composición ───┬── M5 Disponible para prometer
   y costeo exacto        └── M7 Packs anidados

M6 Oportunidades (kanban) ───────── (independiente)
M8 PDF de cotización ────────────── (independiente)
M9 Usuarios y roles ─────────────── (independiente)
```

**Se pueden hacer a la vez:** M2, M4, M6, M8 y M9. Son carpetas distintas y no se pisan.

**Hay que esperar:** M3 va después de M2 (no se viste algo que vas a mover). M5 y M7 van después de M4, y los dos son **aditivos** sobre él: M7 en particular es una columna más en una tabla que M4 ya habrá creado, no una reescritura.

**Reparto sugerido.** M4 es el de más criterio y toca el modelo de datos: conviene al agente con más contexto. M6, M8 y M9 están bien acotados y se pueden delegar enteros. M2 ya está acordado con el dueño (ver 7.4) y se puede tomar tal cual.

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
| Lo visual va **después** de la navegación, y no se repinta la paleta | Sí |

## 7.5 Hitos cerrados

**M0 · Seguridad y respaldo** (2026-10-05). Registro público cerrado, contraseña endurecida, respaldo diario a un repositorio privado (`pickypop-respaldos`) con verificación de tamaño antes de commitear. Los trabajos de GitHub Actions llevan `timeout-minutes` porque un colgado bloqueó la cola entera durante nueve horas.
**Queda pendiente probar una restauración.** Un respaldo que nadie restauró nunca es una suposición, no un respaldo.

**M1 · Datos maestros** (2026-10-05). Marcas, materiales, acabados e impresoras se administran desde la aplicación. El acabado pasó de texto libre a catálogo con bandera de abrasivo; un filamento es abrasivo si lo es su material **o** su acabado, y eso se resuelve en un solo sitio, la vista `filament_sku_details`.

## 7.6 Dudas abiertas para el dueño

Ninguna de estas la debe decidir quien implementa:

1. **Qué pierde un `operator`** frente a un dueño (M9).
2. **Si `viewer` se vuelve de solo lectura o se elimina** (M9).
3. **Si un ingreso sin pedido asociado** —una venta de mostrador anotada solo como dinero que entró— debe sumar a la utilidad del mes. Hoy se informa aparte y **no** suma. Si venden así a menudo, la utilidad se lee más baja de lo real.
4. **Saldos de apertura** de las cuatro cuentas de dinero, y la **compra real del rollo negro**, que entró como saldo inicial a S/ 50 sin compra registrada.
5. **Cuánto rinde un plumón de acrílico.** Hasta saberlo, los consumibles que se usan en todo (plumón, alcohol, pegamento) van como **gasto indirecto** y no entran a la receta. Criterio acordado: si el consumible se ve en el producto, va en la receta con rendimiento estimado; si se usa en todo por igual, va a gasto. Y si cuesta menos del 1 % del precio del producto, no entra a la receta: el riesgo no es errar por tres céntimos, es que la receta se vuelva tan fastidiosa que nadie la llene.
6. **Publicar o no la tarjeta de Pickypop** en el portafolio: está commiteada en `~/Developer/cma208.github.io` sin publicar, esperando su visto bueno.
