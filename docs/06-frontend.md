# 6. Plan del frontend

> Estado: en construcción · Actualizado: 2026-10-04
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
- **Un insumo cuesta lo que dice la vista `inventory_item_costs`**, nunca un promedio calculado en el navegador. Si `cost_source` es `unknown`, el costo es cero y la pantalla tiene que decirlo: cotizar a ciegas es peor que no cotizar.
- Los ayudantes compartidos viven en `core/`: `dates.ts`, `fetch-all.ts` (PostgREST corta en 1000 filas), `form-errors.ts`, `friendly-error.ts` y `styles.ts`.

## 6.4 Sistema de diseño

Tokens en `styles.scss`, con claro y oscuro automáticos: `--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--danger`, `--good`, `--warn` y sus variantes `-soft`.

Componentes en `ui/`:

| Componente | Uso |
|---|---|
| `<pp-page title subtitle>` | Marco de página, con ranura `[actions]` |
| `<pp-card heading>` | Bloque de contenido |
| `<pp-badge tone>` | Estados: `neutral`, `good`, `warn`, `bad`, `info` |
| `<pp-async [loading] [error]>` | Envuelve lo que carga datos: muestra cargando, error o contenido |
| `<pp-empty message>` | Lista vacía |
| `<pp-field label hint error required>` | Etiqueta y control de formulario |

Pipes: `money` (acepta decimales: `valor \| money:3`), `grams`, `duration`, `fecha`, `percent1`.

Clases útiles: `.muted`, `.error`, `.num` (números alineados a la derecha), `.row`, `.grid.two`. Las tablas se escriben con `<table>` normal y ya tienen estilo. Botones: por defecto, `.secondary`, `.ghost`, `.danger`.

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
Dos mitades que responden preguntas distintas. Arriba, **Lo que vence**: la cola de trabajo, ordenada por urgencia, con todo lo que está atrasado o vence en los próximos días —pedidos por entregar, impresiones sin cerrar, pedidos entregados sin cobrar y mantenimiento vencido—. Cada fila enlaza a donde se resuelve. Abajo, las tarjetas de estado: filamentos bajo mínimo, pedidos en curso por estado, mantenimiento, impresiones de la semana con su tasa de éxito, y los parámetros vigentes.

El filamento bajo mínimo **no** entra en la cola de arriba: es una condición, no un vencimiento, y repetirlo ahogaría lo que sí caduca. Las partes puras (el texto de cada fila y el orden) viven en `panel.tasks.ts`, con pruebas: "se entregaba ayer" y "se entrega hoy" se diferencian en un día.

`/panel` redirige aquí.

### Inventario
- **Filamentos** (`/inventario/filamentos`): una sola pantalla para las dos mitades de lo mismo. La tabla lista los filamentos con su stock disponible, costo por gramo ponderado, mínimo y aviso de bajo stock; cada fila **se despliega** y muestra dentro los rollos físicos de ese filamento, con su código, estado, ubicación, gramos restantes y costo. Alta y edición del filamento; sobre cada rollo: cambiar estado, registrar pesaje (crea un ajuste) y cambiar ubicación.
  `/inventario/rollos` existía como pantalla aparte y hoy redirige aquí. La distinción producto/unidad física es correcta, pero dos entradas en el menú no la enseñaban: anidada se explica sola.
- **Compras** (`/inventario/compras`): lista y alta. El alta es el formulario más importante del área: proveedor, fecha, líneas (SKU o insumo, cantidad, precio), costo de envío y su reparto por monto o por peso. Al guardar crea los rollos con su costo real y los movimientos de entrada. Muestra el costo final por rollo antes de confirmar.
- **Insumos y repuestos** (`/inventario/insumos`): artículos con existencias, mínimos y perecibles. Entradas y salidas manuales.
- **Kardex** (`/inventario/movimientos`): con filtros por tipo, rollo, artículo y fechas. Es la pantalla que explica por qué el stock dice lo que dice.

### Catálogo
- **Catálogo** (`/catalogo`): productos con estado, variantes y precios. Crear y archivar.
- **Producto** (`/catalogo/:id`): ficha completa. Datos, variantes, **receta** (placas con sus filamentos y gramos, insumos por unidad, minutos de preparación por lote y por unidad) y **escalera de precios**. Muestra el costo calculado actual de cada variante con `@pickypop/domain` y avisa si el margen quedó por debajo del objetivo.

### Cotizador y cotizaciones
- **Cotizador** (`/cotizador`): el corazón. Se arrastra un `.gcode.3mf`, se lee en el navegador con `@pickypop/slicer-files` y se llenan tiempo y gramos por filamento; también se puede cargar todo a mano o partir de una variante del catálogo. Permite varias placas y una cantidad, y calcula con `calculateBatchCost` y `calculatePrice`. Muestra **el desglose completo** y el costo por unidad. Se guarda como cotización.
- **Cotizaciones** (`/cotizaciones`, `/cotizaciones/:id`): lista con estado y vigencia; detalle con el desglose congelado, cambio de estado y creación de una versión nueva.

### Pedidos y producción
- **Pedidos** (`/pedidos`): lista filtrable por estado y propósito.
- **Nuevo pedido** (`/pedidos/nuevo`): propósito (venta, uso personal o regalo con su categoría), cliente cuando es venta, líneas con variante, cantidad y precio sugerido por la escalera.
- **Pedido** (`/pedidos/:id`): detalle, avance de estado, trabajos de impresión asociados, el resumen de estimado contra real, y el **cobro**: total, cobrado, saldo y el formulario que llama a `record_payment`. Cuando la base rechaza un cobro, su mensaje se muestra tal cual, porque ya trae los importes exactos.
- **Impresiones** (`/produccion`): cola y historial. Crear un trabajo desde una línea de pedido o suelto, iniciarlo, y **cerrarlo** indicando resultado, tiempo real y gramos por rollo. El cierre llama a `complete_print_job`, que descuenta el stock. Si falla, pide la causa.

### Finanzas
- **Cuentas** (`/finanzas/cuentas`): caja, banco y billeteras con su saldo de apertura y su saldo actual, que sale de los movimientos. Alta y edición.
- **Movimientos de dinero** (`/finanzas/movimientos`): el libro, con filtros. Registra los cinco tipos; la transferencia es **un** formulario con dos cuentas, nunca dos registros. Un movimiento se anula con motivo, no se borra.
- **Por cobrar** (`/finanzas/por-cobrar`): pedidos entregados con saldo pendiente y días de atraso; desde aquí también se cobra.
- **Resultados** (`/finanzas/resultados`): estado de resultados por mes. Las compras de inventario se informan aparte porque su costo ya llega por el costo de ventas; los aportes y retiros del dueño son capital y no utilidad.

### Resto
- **Impresoras** (`/impresoras`): fichas con horas acumuladas y hora de máquina, mantenimientos pendientes y vencidos, registrar mantenimiento, historial e incidentes.
- **Clientes** (`/clientes`): lista y alta con documento, contacto y notas.
- **Configuración** (`/configuracion`): parámetros de costo con vigencia (crear una versión nueva, nunca editar la vigente), datos del taller y régimen tributario, miembros con su tarifa por hora, canales de venta y categorías de regalo.

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
