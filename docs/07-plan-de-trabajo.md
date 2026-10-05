# 7. Plan de trabajo

> Estado: vigente · Escrito el 2026-10-05, con el sistema ya en producción
> Este documento es el reparto de trabajo. Está escrito para que lo pueda tomar cualquier agente (Claude, Codex, o un subagente de cualquiera de los dos) sin haber estado en las conversaciones previas.

## 7.1 Cómo leer esto

Cada hito tiene: **por qué existe**, **qué hay que hacer** con los archivos concretos, **cómo se sabe que terminó**, y **de qué depende**. Un hito no está terminado si solo compila: hay que haberlo usado en el navegador contra la base real.

Las reglas que no se negocian están en [AGENTS.md](../AGENTS.md), en la raíz del repositorio. **Léelo antes de tocar código.**

## 7.2 De dónde partimos

El sistema está desplegado y funcionando en `https://cma208.github.io/pickypop/` contra un proyecto de Supabase real. Las once migraciones están aplicadas, el taller está creado y hay un dueño. Funciona el costeo, el cotizador, el catálogo, los pedidos, la producción, el inventario, el mantenimiento y todo el módulo de finanzas.

Lo que se descubrió al intentar cargar datos reales, y que define este plan:

| Hallazgo | Comprobado |
|---|---|
| No se pueden crear **marcas** de filamento | `brands` solo se lee; no hay insert/update/delete en `apps/web` |
| No se pueden crear **materiales** | Igual: `materials` solo se lee |
| No se pueden registrar **impresoras** | Igual: `printers` solo se lee. La pantalla de impresoras muestra las que existan |
| El **acabado** del filamento es texto libre | `filament_skus.finish` es `text`, sin catálogo ni validación |
| El registro público de usuarios está **abierto** | `disable_signup: false` en el proyecto |
| No hay **respaldos** | El plan gratuito de Supabase no los incluye |
| La navegación tiene 21 enlaces planos y dos cosas distintas llamadas "Movimientos" | `apps/web/src/app/layout/shell.ts` |
| `operator` y `viewer` son el mismo rol en la práctica | Las políticas solo distinguen miembro de dueño |

## 7.3 Mapa de dependencias

```
M0 Seguridad y respaldo ──────────── (independiente, va primero)

M1 Datos maestros ───┬── M2 Navegación y experiencia
                     └── M4 Productos compuestos

M3 CRM de pedidos ───────────────── (independiente)

M5 Usuarios y roles ─────────────── (independiente)

M6 PDF de cotización ───────────── (independiente)
```

**Se pueden hacer a la vez:** M0, M1, M3, M5 y M6. Son carpetas distintas y no se pisan.
**Hay que esperar:** M2 necesita que M1 exista, porque reorganiza una navegación que tiene que incluir las pantallas nuevas. M4 necesita de M1 los materiales y acabados.

**Reparto sugerido.** M1 y M4 son los de más criterio y tocan el modelo de datos: convienen al agente con más contexto. M3, M5 y M6 están bien acotados y se pueden delegar enteros. M2 necesita conversación con el dueño antes de escribir código.

---

## M0 · Seguridad y respaldo

**Por qué.** Se van a cargar pedidos reales. El plan gratuito de Supabase no tiene respaldos de ningún tipo, y el registro de usuarios está abierto a cualquiera.

**Bloquea a:** nada técnicamente, pero **debe estar antes de que haya datos que doler**.

### Tareas

1. **Cerrar el registro público.** En el panel: Authentication → Sign In / Providers → tarjeta **User Signups** → desactivar que se puedan registrar usuarios nuevos. No está dentro del panel de Email; está en la página de atrás. Las invitaciones del administrador siguen funcionando.
2. **Endurecer la contraseña.** En el panel, Email provider: longitud mínima a 12, y en *Password requirements* exigir letras, dígitos y símbolos. `Prevent use of leaked passwords` solo está en el plan de pago; anotarlo como pendiente.
3. **Respaldo diario.** Repositorio privado aparte, con una tarea programada que haga `pg_dump` y lo versione.
   - El repositorio es privado porque el volcado lleva datos de clientes y ventas.
   - La tarea vive **en el repositorio de respaldos**, no en este: GitHub desactiva las tareas programadas tras 60 días sin actividad, y el repositorio de respaldos recibe un commit cada día.
   - La cadena de conexión va en un secreto del repositorio, nunca en el código.
   - Efecto secundario útil: la actividad diaria evita que el proyecto gratuito se pause por inactividad.

**Terminado cuando:** un intento de registro desde fuera es rechazado, y existen al menos dos commits de respaldo de días distintos que se pueden restaurar sobre una base local vacía. **Probar la restauración, no solo el volcado.** Un respaldo que nadie restauró nunca es una suposición.

---

## M1 · Datos maestros y módulo de administración

**Por qué.** Hoy el dueño no puede dar de alta una marca, un material ni una impresora sin escribir SQL. Son cosas que se hacen una vez y casi nunca se tocan, pero sin ellas no se puede cargar el inventario real.

**Bloquea a:** M2 y M4.

### Tareas

1. **Nueva zona de administración** dentro de Configuración, o como sección propia. Decidir con el dueño; por defecto, pestañas nuevas dentro de `/configuracion`, que ya es la pantalla de ajustes y ya tiene pestañas.

2. **Marcas** (`brands`): listar, crear, renombrar, desactivar. Hay un detalle: la tabla no tiene columna `active`, así que o se añade o se borra de verdad. Preferir añadir `active`, porque una marca referenciada por SKU no se puede borrar.

3. **Materiales** (`materials`): listar, crear, editar. Columnas que ya existen y hay que exponer: `code`, `density_g_cm3`, `hygroscopic`, `abrasive`. Son las que alimentan los avisos de secado y de boquilla de acero.

4. **Acabados como catálogo.** Hoy `filament_skus.finish` es texto libre. Migración nueva:
   - Tabla `filament_finishes` con `workspace_id`, `name`, `abrasive boolean`, `active`, y único por `(workspace_id, name)`.
   - Sembrar los comunes: básico/mate/seda (silk)/translúcido/brillante/madera/fibra de carbono/metálico/luminoso (glow).
   - Marcar como abrasivos los que lo son de verdad: fibra de carbono, madera, luminoso, metálico. Seda y mate **no** lo son.
   - `filament_skus.finish_id` referenciando la tabla, migrando el texto existente. Mantener la columna vieja hasta que todo lea la nueva, y quitarla en una migración posterior.
   - **El material también tiene su propio `abrasive`.** Un SKU es abrasivo si lo es el material **o** el acabado. Esa combinación va en una vista o en una función, en un solo sitio, no repetida en cada pantalla.

5. **Impresoras**: alta, edición y baja. Hoy no existe. Una impresora necesita además su activo (`assets`) para que la tarifa de máquina salga: el formulario debe crear ambos o explicar claramente que falta el activo. Revisar `printer_machine_rates` para no romper el cálculo de la hora de máquina.

**Terminado cuando:** el dueño puede registrar desde cero una marca nueva, un material nuevo, un acabado y una impresora, y luego dar de alta un rollo de esa marca con ese acabado sin tocar SQL.

---

## M2 · Navegación y experiencia de uso

**Por qué.** El dueño entró a cargar datos y no supo por dónde empezar. Hay 21 enlaces planos, dos secciones distintas llamadas "Movimientos", y el catálogo —que es lo que se vende— vive bajo Producción.

**Depende de:** M1. No tiene sentido reorganizar una navegación a la que todavía le faltan pantallas.

### Tareas

1. **Comparar con lo que ya existe** antes de rediseñar. Está en [01-investigacion.md](01-investigacion.md). La pregunta concreta a responder: cómo resuelven el inventario de filamento los sistemas del sector, qué distinción hacen entre producto y rollo físico, y qué pone cada uno en su pantalla de inicio.

2. **Arreglar lo que ya se sabe que confunde:**
   - Dos "Movimientos". Renombrar: el de inventario a *Movimientos de stock*, el de dinero a *Caja y movimientos*, o separarlos mejor.
   - *Filamentos* y *Rollos* es la distinción correcta —producto frente a unidad física— pero los nombres no la enseñan. Probar *Tipos de filamento* y *Rollos en el estante*.
   - *Catálogo* es lo que se vende: va con Ventas, no con Producción.
   - *Impresoras* es mantenimiento de activos: va en Administración con el resto.

3. **Estados vacíos que enseñen.** Cada pantalla sin datos debe decir qué es eso y cuál es el primer paso, con el botón que lleva ahí. Hoy dicen que está vacío y nada más. Esto es la mitad del problema que reportó el dueño.

4. **Una ruta diaria clara.** El panel debe responder "qué hago hoy", no solo mostrar tarjetas.

**Terminado cuando:** alguien que no construyó el sistema puede, sin que le expliquen, registrar una compra de filamento, cotizar un producto y cerrar una impresión.

**Antes de escribir código:** acordar la estructura nueva con el dueño. Es una decisión suya, no de quien implementa.

---

## M3 · Pedidos como CRM

**Por qué.** El dueño espera un tablero con el avance de cada pedido, y que un estado pueda retroceder. Hoy la lista es una tabla y el avance es de ida.

**Independiente.** No lo bloquea nada.

### Tareas

1. **Historial de estados.** Migración nueva: `order_status_history` con `order_id`, `from_status`, `to_status`, `changed_by`, `changed_at` y `note`. Se escribe por disparador en cada cambio de `orders.status`, para que no dependa de que la aplicación se acuerde.

2. **Permitir el retroceso.** Comprobado: la base **no** tiene ninguna restricción que obligue a avanzar; el candado está solo en la interfaz. Hay que permitirlo en la pantalla y registrar el motivo cuando se retrocede, que es lo que lo vuelve auditable en vez de un botón de deshacer.

3. **Tablero tipo CRM.** Columnas por estado, cada pedido como tarjeta con cliente, total, saldo por cobrar y días desde el último movimiento. Arrastrar entre columnas cambia el estado.

4. **Ficha del cliente con su historia:** sus pedidos, lo que ha comprado, lo que debe.

**Terminado cuando:** un pedido se puede mover adelante y atrás desde el tablero, el historial muestra quién lo movió y cuándo, y la ficha del cliente cuenta su relación completa.

---

## M4 · Productos compuestos desde stock de piezas

**Por qué.** Hoy una impresión descuenta gramos y no produce nada contable: la botella y las tapas no existen como inventario. Eso obliga a cargar una placa entera de nueve tapas a la venta de una sola botella, y por eso el costo de una unidad suelta sale en S/ 7.28 con un margen del 27 %, cuando la escalera real de precios es 10 / 9 / 8.50.

Con piezas en stock, la placa se reparte entre las nueve ventas que respalda, imprimir y vender se independizan, y un pedido se puede atender sin imprimir nada.

**Depende de:** M1 (materiales y acabados). Es el hito más grande y el que más valor da.

### Tareas

1. **Las piezas impresas son inventario.** Una placa produce N unidades de una pieza; al cerrar la impresión, esas unidades entran al stock. Revisar `print_jobs.units_produced`, que ya existe, y `inventory_item_kind`, que ya tiene el valor `finished_good` sin usar. Decidir si una pieza es un `inventory_item` de un tipo nuevo (`part`) o una tabla propia.

2. **Receta de armado.** Un producto terminado se compone de piezas más insumos no impresos (dulces, bolsa). La tabla `recipe_items` ya cubre los insumos; falta la parte de piezas.

3. **La operación de armar.** Consume piezas e insumos y produce producto terminado, todo o nada, con el patrón de `app.complete_print_job`.

4. **Valorización.** Una pieza entra a stock a un costo. Reutilizar la regla que ya está en los parámetros (`material_valuation`, hoy *costo promedio del stock*) en vez de inventar un criterio nuevo.

5. **Atender un pedido desde stock**, sin imprimir.

**Terminado cuando:** se imprime una placa de nueve tapas, las nueve entran a stock, se arma una botella consumiendo una tapa y sus dulces, las ocho restantes siguen en inventario, y el costo por unidad refleja el reparto en vez de cargar la placa entera.

**Ojo con esto:** es aditivo. Los pedidos cargados antes siguen siendo válidos. No migrar históricos hacia atrás.

---

## M5 · Usuarios, roles e invitaciones

**Por qué.** Hoy un usuario se crea desde el panel de Supabase. Y los roles son nombres sin contenido: `operator` y `viewer` pueden lo mismo, y un no-dueño puede casi todo salvo borrar.

**Independiente.** Urge antes de que entre una tercera persona, no antes.

### Tareas

1. **Invitar por correo desde la aplicación.** Pantalla de administración que llame a `inviteUserByEmail`. Requiere la llave de servicio, que **nunca** puede estar en el navegador: va en una Edge Function de Supabase. Sin herramientas nuevas.
   - El correo de invitación lo manda Supabase. Su servidor por defecto tiene tope bajo y sale de un dominio compartido, así que puede caer en spam. Si pasa, se configura SMTP propio en Authentication → Emails, que es un ajuste, no otra plataforma.
2. **Dar contenido real a los roles.** Hoy las políticas solo distinguen `app.is_member` de `app.is_owner`. Definir con el dueño qué puede cada rol y **escribirlo en las políticas de la base**, no escondiendo botones: ocultar un menú no impide llamar a la API.
   - Acordado hasta ahora: los dos fundadores son `owner`, con acceso completo incluida la parte financiera. El siguiente que entre será `operator`.
   - Falta decidir qué pierde exactamente un `operator`, y si `viewer` se vuelve de solo lectura de verdad o se elimina.
3. **Pantalla de cuenta** para cambiar el nombre visible y la contraseña, y **ajustes generales** del sistema.

**Terminado cuando:** el dueño invita a alguien desde la aplicación, esa persona entra con el rol que le tocó, y una llamada directa a la API con su sesión es rechazada en lo que no le corresponde. **Probar lo segundo, no solo lo primero.**

---

## M6 · PDF de cotización

**Por qué.** Una cotización hay que poder mandarla por WhatsApp.

**Independiente y pequeño.**

### Tareas

Generar un PDF desde el navegador con jsPDF, sin servidor. Debe llevar: el taller, el cliente, las líneas con cantidad y precio unitario, el total, la validez y las condiciones. Usar los valores **congelados** de la cotización, no recalcular con los precios de hoy.

**Terminado cuando:** una cotización guardada produce un archivo que se abre bien en el móvil y cuyos números coinciden exactamente con los de la pantalla.

---

## 7.4 Dudas abiertas para el dueño

Ninguna de estas la debe decidir quien implementa:

1. **La navegación nueva** (M2): hay que acordarla antes de tocarla.
2. **Qué pierde un `operator`** frente a un dueño (M5).
3. **Si `viewer` se vuelve de solo lectura o se elimina** (M5).
4. **Si un ingreso sin pedido asociado** —una venta de mostrador anotada solo como dinero que entró— debe sumar a la utilidad del mes. Hoy se informa aparte y **no** suma. Si venden así a menudo, la utilidad se lee más baja de lo real.
5. **Saldos de apertura** de las cuatro cuentas de dinero, y la **compra real del rollo negro**, que entró como saldo inicial a S/ 50 sin compra registrada.
