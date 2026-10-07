# 5. Registro de decisiones (ADR)

Cada decisión tiene uno de estos estados: **Aceptada** (confirmada por el dueño del proyecto), **Propuesta** (pendiente de confirmar) o **Reemplazada**.

---

## ADR-001 · Gestión y finanzas, sin control de impresoras

**Estado:** Aceptada · 2026-09-14

**Contexto.** Hay buenas herramientas para controlar impresoras Bambu (Bambuddy, SimplyPrint, Printago), y el acceso de terceros a Bambu exige el Modo Desarrollador. El dueño necesita gestión y finanzas.

**Decisión.** La plataforma no se conecta a impresoras. Las horas de uso y los consumos se registran a partir de archivos laminados y de datos ingresados por el usuario.

**Consecuencias.** No depende de los cambios de firmware de Bambu y funciona con cualquier marca. Registrar el tiempo real exige un paso manual.

---

## ADR-002 · El laminado ocurre en la computadora del usuario

**Estado:** Aceptada · 2026-09-14

**Contexto.** Laminar en el servidor (como Quote Engine) cuesta CPU. El dueño no quiere pagar procesamiento por los usuarios.

**Decisión.** El usuario lamina en Bambu Studio y exporta `.gcode.3mf`; el navegador lee `slice_info.config`. La entrada manual queda como alternativa. A futuro, el MCP local podrá invocar el CLI de Bambu Studio en la PC del usuario.

**Consecuencias.** Costo cero y datos idénticos a lo que se imprime. Los bots no pueden cotizar piezas a medida por sí solos: requieren a una persona que lamine.

**Verificación (2026-09-29).** Dos `.3mf` reales confirmaron el punto delicado: un **proyecto** de Bambu Studio no trae gramos ni tiempo, porque su `slice_info.config` solo tiene el encabezado. El flujo exige exportar el archivo **laminado**. Ver [Investigación §1.2](01-investigacion.md#comprobado-con-archivos-reales-2026-09-29).

---

## ADR-003 · Aplicación web SPA con Angular y TypeScript

**Estado:** Aceptada · 2026-09-29

**Contexto.** Tiene que ser web y open source. Es una aplicación con muchos formularios, tablas y reglas. El dueño se inclina por TypeScript y Angular.

**Decisión.** Angular 22 (standalone, signals, zoneless) como SPA estática.

**Consecuencias.**
- A favor: estructura opinada y consistente; buen soporte de formularios tipados (Signal Forms estables desde la versión 22); TypeScript de punta a punta, compartido con el MCP y las Edge Functions.
- En contra: hay menos colaboradores potenciales que con React, y la curva de aprendizaje es mayor.
- Librería de componentes por decidir (Angular Material o PrimeNG).

---

## ADR-004 · Supabase (plan Free) como backend gestionado

**Estado:** Aceptada · 2026-09-29

**Contexto.** El dueño no quiere administrar una base de datos y el costo debe ser cero mientras la use una sola persona.

**Decisión.** Supabase: Postgres, Auth, Storage, RLS y Edge Functions.

**Consecuencias.**
- A favor: costo cero, Postgres real (sin dependencia de un formato propietario) y desarrollo local con Docker.
- En contra: **no hay backups en el plan Free** (se requiere exportación propia) y **el proyecto se pausa tras 1 semana sin actividad**.
- El ingreso con Google y el trabajo de dos personas están incluidos en el plan Free; el consumo estimado a un año entra con holgura (ver [Arquitectura §4.5](04-arquitectura.md#45-equipo-accesos-y-consumo-del-plan-free)).
- Si se aloja una instancia para varios talleres, se pasa a Pro (desde USD 25 al mes).

---

## ADR-005 · Monolito modular con un núcleo de dominio compartido

**Estado:** Aceptada · 2026-09-29

**Decisión.** Un solo repositorio con `apps/web`, `apps/mcp`, `packages/domain`, `packages/slicer-files` y `supabase/`. Las reglas de negocio viven en `packages/domain` (TypeScript puro) y la integridad en Postgres.

**Consecuencias.** Una sola fuente de verdad para las fórmulas y fronteras claras entre módulos. Hay que validar que el paquete compartido funcione tanto en Node como en Deno.

---

## ADR-006 · Movimientos, vigencias y copias de parámetros

**Estado:** Aceptada · 2026-09-29

**Decisión.**
1. El stock y el dinero se calculan a partir de movimientos; no hay saldos editables.
2. Los parámetros de costo se versionan con fecha de vigencia.
3. Las cotizaciones guardan una copia de los parámetros que usaron.
4. Los registros financieros no se borran; se anulan.

**Consecuencias.** Todo es auditable y los números antiguos no cambian. Hace falta algo más de lógica: vistas y operaciones atómicas.

---

## ADR-007 · MCP en dos niveles: privado local y público de catálogo

**Estado:** Aceptada · 2026-09-29

**Decisión.**
- **MCP del taller:** local por stdio, con la sesión del usuario y sujeto a RLS.
- **MCP público:** Edge Function sin estado, de solo lectura sobre una vista pública del catálogo, más la creación de solicitudes.
- Ambos siguen la especificación **2026-07-28**.

**Consecuencias.** Un agente público nunca ve costos ni modifica datos del negocio. La autenticación del MCP remoto queda para cuando Supabase la soporte en Edge Functions.

---

## ADR-008 · Preparados para SUNAT sin emitir comprobantes propios

**Estado:** Aceptada · 2026-09-29

**Decisión.** El régimen tributario es un parámetro (sin RUC, NRUS, RER, RMT o General). Por ahora solo se emite una nota de venta interna. La emisión electrónica futura se hará a través de un proveedor autorizado o registrando comprobantes emitidos por fuera.

**Consecuencias.** No hay que construir ni mantener integración con SUNAT, y el modelo de datos ya tiene los campos necesarios.

---

## ADR-009 · Licencia MIT

**Estado:** Aceptada · 2026-09-29

**Contexto.** El proyecto se publica abierto para que cualquiera lo use. La alternativa era AGPL-3.0, que obliga a publicar los cambios a quien lo ofrezca como servicio.

**Decisión.** Licencia **MIT**.

**Consecuencias.** Máxima libertad de uso y adopción, incluso comercial o dentro de productos cerrados. A cambio, alguien podría ofrecer un servicio basado en el código sin devolver sus mejoras. Hay que incluir el archivo `LICENSE` en la raíz del repositorio y mencionarla en el `README`.

---

## ADR-010 · Dos personas, ingreso con Google y un MCP local por cabeza

**Estado:** Aceptada · 2026-09-29

**Contexto.** El taller pasa a tener dos personas y cada una quiere que su agente de IA consulte el sistema.

**Decisión.** Ingreso con Google mediante Supabase Auth; ambas personas como miembros del mismo taller; cada una instala el MCP local, que usa su propia sesión y queda sujeto a RLS. Por ahora no se aloja ningún MCP remoto.

**Consecuencias.** Sin costo adicional ni servidor que mantener, y queda registrado quién hizo cada cosa. Un MCP remoto (para consultar desde el celular, por ejemplo) queda pendiente de que Supabase habilite autenticación para MCP en Edge Functions.

---

## ADR-011 · Cada taller despliega su propia copia

**Estado:** Aceptada · 2026-09-29

**Contexto.** El proyecto se publica abierto, pero alojar una instancia para terceros implicaría costos y responsabilidad sobre datos ajenos.

**Decisión.** Modelo "despliega el tuyo": fork, proyecto propio de Supabase, migraciones y hosting estático gratuito. El esquema conserva `workspace_id` por si algún día se aloja una instancia compartida.

**Consecuencias.** Nadie más consume tu cuota y cada taller es dueño de sus datos. A cambio, instalarlo exige algo de técnica, así que el `README` del repositorio debe traer una guía paso a paso.

---

## ADR-012 · pnpm workspaces como monorepo

**Estado:** Aceptada · 2026-09-29

**Contexto.** El repositorio tendrá varios paquetes: web, MCP, dominio y lector de archivos.

**Decisión.** pnpm workspaces, sin Nx por ahora. Las fronteras entre módulos se cuidan con reglas de ESLint.

**Consecuencias.** Menos herramientas que aprender y configuración mínima. Si el repositorio crece, migrar a Nx sigue siendo posible: es una decisión fácil de revertir.

---

## ADR-013 · La app web se publica en GitHub Pages

**Estado:** Aceptada · 2026-09-30

**Contexto.** El frontend es una SPA estática y hace falta un hosting gratuito. El dueño ya tiene una cuenta con GitHub Pages en uso y agotó el plan gratuito de Vercel.

**Decisión.** Publicar en GitHub Pages, como página de proyecto del repositorio (`/pickypop/`), con un workflow de GitHub Actions que compile y publique en cada push a `main`.

**Consecuencias.** Costo cero y un solo lugar para el código y el sitio. A cambio, hay que compilar con la ruta base correcta y resolver las rutas de la SPA (copiando `index.html` a `404.html` o usando rutas con `#`). El repositorio debe ser público, cosa que ya es por la licencia MIT. Si algún día se quiere un dominio propio o cabeceras personalizadas, Cloudflare Pages es la salida natural.

---

## ADR-014 · El dinero se lleva como un libro, igual que el stock

**Estado:** Aceptada · 2026-10-04

**Contexto.** Hacía falta el módulo de finanzas: cuentas, movimientos, cobros y reportes. Un saldo guardado en una columna se desincroniza en cuanto alguien corrige un movimiento, y una transferencia escrita como dos filas se parte en cuanto una de las dos falla o se edita sola.

**Decisión.** Cuatro reglas:

1. **El saldo no se guarda, se deriva.** Una cuenta tiene un saldo de apertura con su fecha; lo demás sale de sumar sus movimientos. Es lo mismo que ya se hacía con el filamento.
2. **Una transferencia es una sola fila con dos cuentas** (`account_id` y `counter_account_id`), no dos filas. Una vista la desdobla en sus dos patas para los saldos. Así es imposible que queden descuadradas, y la suma de todos los saldos del taller no cambia al transferir.
3. **Nada se borra, se anula**, con motivo obligatorio. Un movimiento anulado desaparece de los saldos y los reportes, y queda en el registro.
4. **El estado de cobro de un pedido es una proyección**, recalculada por disparador desde los movimientos. Existe para poder filtrar la lista de pedidos sin recorrer el libro; los importes de verdad están en la vista.

Además, las reglas que no se pueden romper se declaran en el esquema y no en la aplicación: un movimiento no puede apuntar a la cuenta de otro taller, un ingreso no puede caer en una categoría de egreso, y una transferencia no puede pagar un pedido.

**Consecuencias.** Los reportes nunca mienten por un saldo olvidado, y una corrección se arregla sola en todas partes. A cambio, cada consulta de saldo recorre los movimientos de esa cuenta; con el volumen de un taller de dos personas eso no se nota, y si algún día se notara, la salida es una vista materializada, no una columna editable.

---

## ADR-015 · Dos tuberías: la comercial y la del taller

**Estado:** Aceptada · 2026-10-06

**Contexto.** El dueño pidió "pedidos como un CRM". Pero lo que describió no era un pedido: *un mismo trato con un cliente puede implicar varias cotizaciones, y al final concretarse una o más, con fechas de entrega distintas*. Eso no cabe en `orders`, donde cada pedido cuelga de una cotización y nada los agrupa. Y mezclar las dos cosas en un solo tablero es exactamente lo que vuelve confusos a los sistemas de este tamaño: la columna "en producción" convive con "negociando" y ninguna de las dos se puede leer de un vistazo.

**Decisión.** Son dos tuberías paralelas, cada una con su tablero:

- **Comercial:** cliente → **oportunidad** → cotización → pedido. La oportunidad es una capa nueva por encima; las cotizaciones y los pedidos la referencian **de forma opcional**, porque una venta de mostrador no pasa por ningún trato.
- **Taller:** `order_status`, que ya existía y **es** el tablero de producción.

Y una regla que las une sin fundirlas: **las dos últimas etapas comerciales se derivan del taller, no se arrastran a mano.** Una oportunidad llega sola a *Cerrado* cuando todos sus pedidos están entregados y cobrados. Es el mismo principio de ADR-014: lo que se puede calcular no se guarda.

"Esperando adelanto" se evaluó como columna y se descartó: las compras grandes llevan adelanto y las chicas no, así que la columna estaría vacía la mayor parte del tiempo. Va como **marca con motivo** en la tarjeta, visible en cualquier etapa.

**Consecuencias.** El vendedor ve su embudo y el taller su cola, sin estorbarse. A cambio hay dos sitios donde mirar en vez de uno, y la oportunidad puede quedar huérfana si alguien cotiza sin crearla: se aceptó a propósito, porque obligar a abrir un trato para vender una botella en la puerta sería peor.

---

## ADR-016 · Una pieza impresa es inventario, y cuesta lo que costó imprimirla

**Estado:** Aceptada · 2026-10-06

**Contexto.** Casi todo lo que vende el taller son tres o cuatro piezas impresas más dulces. Hasta ahora, cerrar una impresión descontaba gramos y no producía nada contable: la botella y las tapas no existían como inventario. Con una sola impresora se imprime por placas —nueve tapas de una vez— y se vende de a una, así que esa venta cargaba la placa entera.

**Decisión.** Tres piezas encajadas:

1. **La pieza es un `inventory_item` de tipo `part`**, no una tabla nueva. Así la receta, el kardex y la valorización que ya existen le sirven sin duplicarse, y `recipe_items` cubre piezas, insumos, empaque y dulces con la misma forma.
2. **Una placa declara qué pieza produce** (`recipe_plates.produces_item_id`). Al cerrar la impresión, las unidades entran al estante con el costo de la corrida repartido entre ellas.
3. **Armar es una operación de todo o nada**: consume la receta completa o no mueve nada, y el mensaje dice qué falta y cuánto.

Lo que apareció al usarlo y hay que recordar: **el costo de una pieza no puede salir de `inventory_item_costs`**, que deriva de las compras, porque una pieza **no se compra nunca**. Sale del promedio ponderado de los movimientos de producción. Es la excepción a la regla de "un insumo cuesta lo que dice la vista", y está donde es fácil tropezarse.

**Consecuencias.** Imprimir y vender se independizan: un pedido se atiende desde el estante sin encender la impresora, y la placa se reparte entre las nueve ventas que respalda. Es aditivo —los pedidos viejos siguen siendo válidos y no se migran hacia atrás— y es lo que hace posibles el *disponible para prometer* (M5) y los packs anidados (M7).

---

## ADR-017 · La apariencia es de la pantalla, no de la persona

**Estado:** Aceptada · 2026-10-06

**Contexto.** El dueño pidió poder cambiar cómo se ve la aplicación. Lo natural sería guardar esa preferencia en la base, junto al usuario.

**Decisión.** Se guarda en `localStorage`, con la clave `pickypop.appearance`. Dos razones: la apariencia depende del aparato desde el que miras —el teléfono en el taller y la laptop no quieren lo mismo— y, sobre todo, **tiene que poder aplicarse antes de que cargue nada**. Por eso hay un script de seis líneas en `index.html` que la lee antes de que arranque Angular; sin él la página pinta en claro y luego salta, que se lee como un error.

Y una regla de interacción: **el tema y la densidad no se aplican hasta Guardar**, porque cambiarlos bajo los pies de quien los está comparando hace imposible compararlos. Lo del menú contraído sí se aplica al instante, porque es la misma acción que el botón de la barra lateral.

**Consecuencias.** La preferencia no viaja entre aparatos, y eso está bien. El costo real es que **dos archivos tienen que ir a la par**: `core/appearance.ts` y el script de `index.html`. Está dicho en un comentario en los dos sitios y aun así es lo más fácil de romper.

---

## ADR-018 · Armar produce stock, y producir no es comprar

**Estado:** Aceptada · 2026-10-06

**Contexto.** `assemble_product` consumía las piezas, los dulces y la bolsa de una receta, y ahí terminaba. El producto terminado no entraba a ningún inventario: el taller armaba diez botellas, el sistema descontaba todo lo que costaron, y las diez botellas no existían en ningún saldo. Nadie podía notarlo desde la pantalla, porque la pantalla de armado tampoco mostraba el resultado.

La causa de fondo era una columna que la documentación daba por existente y nunca se creó: `inventory_items` tenía el tipo `finished_good` desde el principio y **ninguna forma de saber a qué variante correspondía**.

**Decisión.** Tres cosas:

1. **`inventory_items.product_variant_id`**, con un índice único parcial: una variante tiene un solo artículo terminado, o el stock se parte en dos sitios y ninguno dice la verdad. Lo crea `app.finished_good_for` la primera vez que hace falta: es contabilidad interna, no una decisión del dueño.
2. **Armar hace las dos mitades en una sola orden**, con `insert` que leen lo que devolvió el anterior: lo que sale y lo que entra. El producto entra valorizado en lo que costó armarlo repartido entre las unidades, que es la misma regla con la que una impresión valoriza las piezas que produce (ADR-016).
3. **Un tipo de movimiento `production`.** Las piezas impresas entraban al estante como `purchase`, porque era el único tipo que sumaba stock. En el kardex eso se lee como "compramos nueve tapas", que es falso justo para quien está intentando entender por qué el stock dice lo que dice.

**Consecuencias.** El inventario de terminados existe, y con él la pregunta que el taller hace todos los días —cuántas hay armadas— tiene respuesta. Los movimientos viejos de piezas siguen con tipo `purchase`: no se migran hacia atrás, por la misma razón de siempre. Queda abierto si `complete_print_job` debe pasar a `production` para las piezas nuevas; mientras no se haga, el kardex mezcla dos criterios.


## ADR-019 · El dinero de una compra y el costo de lo vendido

**Estado:** Aceptada · 2026-10-06 · publicada en `main` el mismo día

**Contexto.** El barrido del 2026-10-06 (`docs/barrido/`) encontró tres errores que ya estaban publicados y ensuciaban las cuentas reales:

1. **Registrar una compra no registraba su pago,** y Caja no tenía forma de ligar un egreso a una compra. O la cuenta quedaba con más plata de la que tenía, o el pago se anotaba a mano como gasto de operación y la utilidad salía más baja de lo real, porque Resultados deja las compras aparte.
2. **El costo de ventas se reemplazaba por el de una sola impresión.** En cuanto un pedido tenía una impresión ligada, Resultados contaba solo filamento, luz y máquina: los dulces, el frasco, el empaque y la mano de obra desaparecían. Una venta de S/ 85 figuraba con S/ 2.70 de costo.
3. **El cotizador ignoraba la escalera de precios.** La cargaba y no la usaba, así que la misma poción salía a un precio en la cotización y a otro en el pedido.

**Decisión.**

1. **Una compra se paga como se cobra un pedido.** `record_purchase_payment` es el gemelo de `record_payment`: bloquea la fila, rechaza pagar de más con un mensaje para una persona, y deja el egreso ligado con `purchase_id`. Lo pagado y lo pendiente se derivan de esos egresos (`purchase_payment_status`), nunca se guardan. Al registrar la compra se pregunta "¿Cómo pagaste?", sin nada elegido de antemano, con la opción "Todavía no la pagué". El pago se escribe al final, cuando el stock ya entró, y el monto lo da la base y no el formulario, que redondea por línea.
2. **El costo de ventas es lo que la receta dice que cuesta cada línea**, congelado al tomar el pedido. El costo de las impresiones solo se usa para una línea sin estimado. **Es provisional:** el costo real de lo vendido llega con `deliver_order`, cuando entregar saque las cosas del estante y las valorice con el promedio de lo que había. Ese día esta regla se reemplaza, y los dos cambios (no atar los trabajos de catálogo a un pedido, y sacar el costo de la entrega) tienen que publicarse juntos.
3. **Una línea de catálogo se cotiza a su precio de lista** para esa cantidad, con la misma regla que `price_for_quantity`. El descuento, el recargo y la comisión del canal quedan para lo hecho a medida. `breakdownForPrice` desglosa un precio decidido en otra parte, y vive en el dominio.

**Consecuencias.** Las compras anteriores aparecen "por pagar": hay que registrar su pago desde la compra, y anular el egreso suelto si se había anotado a mano en Caja. La utilidad de los meses pasados baja, y es la real. Las cotizaciones ya enviadas conservan su precio congelado.

---

## ADR-020 · El estante dice la verdad: lo que sale de la placa y lo que sale del taller

**Estado:** Aceptada · 2026-10-06 · en la rama `etapa1-estante`, sin publicar

**Contexto.** El barrido del 2026-10-06 eligió el camino «la verdad primero, después la fluidez», y la etapa 1 es que el estante diga lo que de verdad hay. Hasta hoy:

1. **Una impresión de 9 tapas metía 9 tapas,** aunque salieran 7. El formulario de cierre preguntaba cuántas salieron, pero el dato no llegaba al stock.
2. **Una placa solo podía producir una pieza** (`recipe_plates.produces_item_id`). El archivo real del dueño (`Skull_-_AMS.gcode.3mf`) lo desmintió: su placa 6 lleva 7 tapas y 7 cuerpos.
3. **Armar aceptaba una receta vacía** y no bloqueaba lo que consumía, así que dos armados a la vez podían gastar la misma pieza.
4. **Una impresora podía tener dos trabajos imprimiendo a la vez.**
5. **Entregar era solo un estado.** El pedido cambiaba de columna y el estante seguía igual: armar producía stock (ADR-018) y nada lo consumía. La vista de lo que falta producir descontaba pociones que ya se habían llevado: decía que faltaban 31 cuando faltaban 41.
6. **Una pieza que se vende suelta,** como un llavero, tenía que pasar por «Armar» para poder entregarse.

**Decisión.**

1. **Una placa produce una lista de piezas** (`recipe_plate_outputs`): cada fila es una pieza y cuántas da una corrida. `produces_item_id` desaparece y sus datos pasan a la lista. `units_per_run` de la placa sigue siendo «productos por corrida» para el costeo, que es otra pregunta.
2. **Cerrar una impresión registra lo que salió de verdad, en una sola llamada:** las piezas de cada tipo, el porcentaje al que llegó y una nota. Solo una impresión exitosa pone piezas en el estante. Una pieza que la placa no da, o más de las que da, se rechaza: es un error de tipeo, y aquí un error de tipeo se convierte en stock que no existe.
3. **El costo de la placa se reparte por igual entre todas las unidades que salieron,** sean de la pieza que sean. El archivo laminado no dice cuántos gramos pesa cada objeto. Para un producto hecho de una pieza de cada tipo, el reparto no cambia lo que cuesta el producto; solo el costo por separado de una tapa y de un cuerpo es aproximado.
4. **Una impresora imprime un trabajo a la vez.** Un disparador bloquea la fila de la impresora y rechaza el segundo trabajo, con un mensaje que nombra el que está corriendo.
5. **Armar rechaza una receta vacía y lo que no se arma, y bloquea lo que va a consumir** en un orden fijo, para que dos armados a la vez no choquen ni se crucen.
6. **La receta dice si el producto se arma** (`recipes.assembled`, decisión del dueño). Lo que no se arma no aparece en «Armar» y se entrega descontando directo sus piezas y su empaque. Lo que vale una unidad entregada así es lo mismo que si se hubiera armado: se comprobó en la base con la poción, S/ 2.402025 por los dos caminos.
7. **Entregar saca las cosas del estante** (`deliver_order`), también por partes: 6 de 10 hoy y 4 el viernes. Cada entrega guarda qué salió y lo que costó cada unidad, al promedio de lo que había en el estante. Todo o nada: si falta algo, no mueve nada y dice qué falta.
8. **«Entregado» lo pone la entrega, no una persona.** Un disparador rechaza pasar un pedido a «Entregado» o «Cerrado» a mano mientras quede algo por entregar. Un pedido que ya estaba entregado antes de esta regla cuenta como entregado entero.
9. **Lo que falta producir se mide contra lo que falta entregar** (`production_needs`), en todo pedido abierto que no esté en espera, incluidos los listos.
10. **El estante se puede contar** (`count_shelf`, pantalla «Contar el estante», decisión del dueño). Es para el arranque: lo que el taller ya tenía hecho antes de que la aplicación lo supiera. Y sirve después para corregir lo que se rompe o se regala. Solo se mueve la diferencia con lo que la aplicación creía, con origen `shelf_count`. Lo que sobra entra como `production` (se hizo, solo que nadie lo anotó), así lo valoriza la misma regla que a lo armado y a lo impreso. Lo que falta sale como `adjustment` al costo promedio. Lo que entra necesita costo: el que la base ya conoce (el promedio de lo producido o lo que costaría armarlo hoy, `assembly_unit_cost`) o, si no conoce ninguno, uno aproximado que escribe la persona.

**Lo que esta decisión todavía no hace.** Resultados sigue sacando el costo de ventas de la receta (ADR-019). El dato con que se va a reemplazar ya existe: `order_delivery_lines.unit_cost`. El cambio se hace en una etapa siguiente, y tiene que publicarse junto con dejar de atar los trabajos de catálogo a un pedido, como pide el ADR-019.

**Consecuencias.**

- Los pedidos que hoy están «listos» o «en producción» tienen que entregarse con el botón «Entregar» para llegar a «Entregado». **Antes de empezar a entregar hay que contar el estante una vez**, o los pedidos se traban por falta de lo que el taller sí tiene.
- Una placa sin piezas en su lista no pone nada en el estante al cerrarse. Hay que cargar la lista en el editor de la receta o desde el archivo laminado.
- El costo por separado de las piezas de una placa mixta es aproximado (el punto 3).

---

## Pendientes

| Tema | Opciones | Comentario |
|---|---|---|
| **Canal del bot** | Telegram / WhatsApp / chat web | La API de bots de Telegram no tiene costo; WhatsApp Business puede cobrar por conversación. Evaluar en la fase 4 |
