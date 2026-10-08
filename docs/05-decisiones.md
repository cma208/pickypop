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

**Estado:** Aceptada · 2026-10-04 · revisada el 2026-10-08 con la tercera pasada: el libro se cuida en la base

**Contexto.** Hacía falta el módulo de finanzas: cuentas, movimientos, cobros y reportes. Un saldo guardado en una columna se desincroniza en cuanto alguien corrige un movimiento, y una transferencia escrita como dos filas se parte en cuanto una de las dos falla o se edita sola.

**Decisión.** Cuatro reglas:

1. **El saldo no se guarda, se deriva.** Una cuenta tiene un saldo de apertura con su fecha; lo demás sale de sumar sus movimientos. Es lo mismo que ya se hacía con el filamento.
2. **Una transferencia es una sola fila con dos cuentas** (`account_id` y `counter_account_id`), no dos filas. Una vista la desdobla en sus dos patas para los saldos. Así es imposible que queden descuadradas, y la suma de todos los saldos del taller no cambia al transferir.
3. **Nada se borra, se anula**, con motivo obligatorio. Un movimiento anulado desaparece de los saldos y los reportes, y queda en el registro.
4. **El estado de cobro de un pedido es una proyección**, recalculada por disparador desde los movimientos. Existe para poder filtrar la lista de pedidos sin recorrer el libro; los importes de verdad están en la vista.

Además, las reglas que no se pueden romper se declaran en el esquema y no en la aplicación: un movimiento no puede apuntar a la cuenta de otro taller, un ingreso no puede caer en una categoría de egreso, y una transferencia no puede pagar un pedido.

**Revisión del 2026-10-08 (tercera pasada, T5-01).** La regla 3 solo la cumplía la pantalla. Un movimiento ya escrito se podía editar, desanular o borrar por la API, y las reglas de un cobro (cuenta activa, sin cobrar de más, pedido no cancelado) vivían dentro de `record_payment`, mientras Caja escribía directo en la tabla. Ahora:

- **Lo escrito no se edita ni se borra, ni por el dueño.** El único cambio es anular: una vez, por el dueño, con motivo, por `void_transaction`. Un error de cuenta se corrige con una transferencia; uno de monto o de fecha, anulando y registrando el correcto.
- **Todo movimiento nuevo cumple las mismas reglas, lo escriba quien lo escriba** (`app.guard_ledger_entry`): cuenta activa (una transferencia sí puede vaciar una desactivada), fecha que ya pasó, categoría del taller, activa y del tipo, un tope de S/ 1,000,000 y, contra un pedido o una compra, las reglas de `record_payment` y `record_purchase_payment`.
- **Una llave por movimiento** (`transactions.entry_key`): el mismo movimiento enviado dos veces se escribe una.

Son disparadores con nombre propio y valen digan lo que digan las políticas de la tabla, que son del área base (ADR-025). Los detalles están en [03-modelo-de-datos.md](03-modelo-de-datos.md).

**Consecuencias.** Los reportes nunca mienten por un saldo olvidado, y una corrección se arregla sola en todas partes. A cambio, cada consulta de saldo recorre los movimientos de esa cuenta; con el volumen de un taller de dos personas eso no se nota, y si algún día se notara, la salida es una vista materializada, no una columna editable. Desde la revisión, corregir un dato mal tipeado de un movimiento cuesta dos pasos (anular y volver a registrar) en vez de uno: es el precio de que el libro no se pueda reescribir.

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
   - **Actualizado el 2026-10-08 (tercera pasada, T1-04, T1-05 y T1-06).** La compra se escribía en cuatro o cinco pedidos sueltos desde el navegador, y cualquiera podía fallar después de los otros: quedaban compras sin líneas, o con líneas y sin rollos, y «Deshacer lo creado» no borraba nada para el operador. Ahora `register_purchase` escribe la compra, sus líneas, los rollos con su etiqueta, sus movimientos y el pago en **una sola transacción**: si el pago se rechaza no queda nada de la compra, y la persona ve por qué. El monto sigue siendo el que dice la base. La compra y cada pago llevan una llave: pedidos dos veces (doble clic, respuesta perdida) se escriben una vez. Y la base suma la compra como el formulario, línea por línea redondeada a céntimos (`purchase_payment_status`, `20261023170000`): antes redondeaba una vez al final, y con dos líneas de fracciones de céntimo se pagaba un céntimo menos de lo que confirmaba la pantalla y valía el stock. Las compras que ya existían conservan el total con que se pagaron (`purchases.total_by_line` falso): sumarlas de nuevo dejaba una compra pagada entera con «Falta S/ 0.01», que solo se cerraba inventando un egreso de un céntimo. Si la respuesta de la base no llega, la pantalla no dice «No se guardó nada»: dice que no sabe y pide confirmar otra vez con la misma llave.
2. **El costo de ventas es lo que la receta dice que cuesta cada línea**, congelado al tomar el pedido. El costo de las impresiones solo se usa para una línea sin estimado. **Es provisional:** el costo real de lo vendido llega con `deliver_order`, cuando entregar saque las cosas del estante y las valorice con el promedio de lo que había. Ese día esta regla se reemplaza, y los dos cambios (no atar los trabajos de catálogo a un pedido, y sacar el costo de la entrega) tienen que publicarse juntos. **Ese día llegó: el ADR-022 la reemplazó el 2026-10-07** por lo que salió del estante, con su mano de obra.
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

**Corregido el 2026-10-08 por la tercera pasada** (`20261024100000_print_jobs_follow_their_flow.sql`, `20261024110000_assemble_whole_units.sql` y, tras sus revisiones, `20261024140000_close_checks_what_the_tab_saw.sql` y `20261024150000_assembly_once_and_old_tabs.sql`). La pasada rompió la aplicación a propósito, y lo que fallaba vivía solo en la pantalla:

11. **Un trabajo solo avanza por su flujo, y lo impone la base.** «Iniciar» desde una pestaña vieja devolvía a la cola un trabajo ya iniciado, o ya cerrado como exitoso, y cerrarlo otra vez habría duplicado su consumo y sus piezas (T3-01). Ahora iniciar es una sola función (`start_print_job`) que exige que el trabajo siga en la cola y guarda sus rollos en la misma transacción, y crear también (`create_print_job`, con una llave para que un doble clic no cree dos). Un disparador deja pasar solo las transiciones del flujo: a imprimir por `start_print_job`, a cerrado por `complete_print_job`, y de imprimir nunca de vuelta a la cola.
12. **Un trabajo cerrado queda como quedó.** No se reabre, no se edita en su tiempo, sus costos, sus piezas ni sus rollos, y no se borra, **tampoco por el dueño** (decisión del dueño del 2026-10-08: nadie edita ni borra lo que ya está en el kardex). Lo que no cuadre se corrige con otro movimiento: pesando el rollo o contando el estante. El nombre y la nota siguen editables.
13. **Las piezas salen enteras.** Cerrar con 6.5 tapas metía media tapa al estante, y «Contar el estante», que solo acepta enteros, quedaba trabado hasta corregirla (T3-04). El cierre y armar rechazan las fracciones, en la pantalla y en la base. Lo que ya entró con fracciones no se toca: el conteo lo muestra vacío para contarlo.
14. **Una impresión cancelada que corrió descuenta el filamento que gastó.** «Cancelar no descuenta rollos» era de cuando cancelada quería decir «nunca empezó». Desde que una cancelada con tiempo cobra máquina y luz (E4-02), el filamento que gastó desaparecía del kardex (T3-08). Ahora quien cierra dice cuánto gastó, la pantalla lo propone en proporción al porcentaje, y entra como merma. Sin tiempo no corrió, y no puede haber gastado nada.
15. **Cerrar exige lo que vio la pestaña, y lo que entra son números.** Si lo cerrado ya no se puede corregir, lo que entra al cerrarlo tiene que estar bien de entrada. La revisión encontró dos huecos. Desde una pestaña vieja, un trabajo que otra pestaña acababa de iniciar se cerraba sin sus rollos, y el filamento que gastó quedaba en el rollo; o se cancelaba mientras seguía imprimiendo. Y un 'NaN' pasaba todas las comparaciones y llegaba al kardex o a Resultados. Ahora `complete_print_job` recibe el estado en que la pantalla vio el trabajo y lo exige. Una impresión que corrió dice los gramos de cada uno de sus rollos, aunque sean cero, y cada rollo una sola vez. Gramos, costos, tiempos, piezas y conteos tienen que ser números de verdad dentro de los topes de la pantalla: 100000 g, 100000 min, S/ 100000 y 100000 unidades, y 10000 por armado. Lo que registra el cierre (tiempo, costos, causa y gramos reales) lo escribe solo el cierre.
16. **Armar va una vez por envío, y el cierre recuerda lo que vio** (`20261024150000_assembly_once_and_old_tabs.sql`). Con el Wi-Fi del taller, «Sí, armar 3» llegaba a la base y la respuesta se perdía; al pulsar otra vez se armaban 6. Ahora la pantalla manda la llave del envío y la reusa mientras no cambien el producto ni la cantidad: la base devuelve lo que ya armó sin mover nada. Y el formulario de cierre trabaja con el trabajo como estaba al abrirlo: en la ficha del pedido la tarjeta sobrevive a la recarga, y si el trabajo se inició en otra parte el formulario lo dice y no cierra, en vez de mandar el estado nuevo y cancelar sin tiempo una impresión en curso. Quien solo tiene acceso de lectura no ve «Iniciar», «Cerrar…», «Nuevo trabajo», «Poner en cola» ni «Armar», y «Contar el estante» le explica por qué no guarda.

**Despliegue de estos arreglos: las migraciones primero, la web enseguida.** La web nueva llama a `create_print_job`, `start_print_job`, `complete_print_job(…, p_expected_status)` y `assemble_product(…, p_request_key)`, que solo existen después de migrar: publicada antes, no se puede crear, iniciar, cerrar ni armar, y la pantalla dice que la aplicación y la base no están en la misma versión. Al revés, la web anterior sobre la base nueva sigue creando, encolando, armando y contando, pero no inicia ni cierra: la base le contesta que la aplicación se actualizó y que recargue la página, sin mover nada. Por eso la web va justo después de las migraciones, y quien tenga la cola abierta recarga una vez.

**Lo que esta decisión todavía no hace.** Resultados sigue sacando el costo de ventas de la receta (ADR-019). El dato con que se va a reemplazar ya existe: `order_delivery_lines.unit_cost`. El cambio se hace en una etapa siguiente, y tiene que publicarse junto con dejar de atar los trabajos de catálogo a un pedido, como pide el ADR-019.

**Consecuencias.**

- Los pedidos que hoy están «listos» o «en producción» tienen que entregarse con el botón «Entregar» para llegar a «Entregado». **Antes de empezar a entregar hay que contar el estante una vez**, o los pedidos se traban por falta de lo que el taller sí tiene.
- Una placa sin piezas en su lista no pone nada en el estante al cerrarse. Hay que cargar la lista en el editor de la receta o desde el archivo laminado.
- El costo por separado de las piezas de una placa mixta es aproximado (el punto 3).
- **Lo hecho a medida se entrega impreso** (tercera pasada, T4-08, `20261026150000_custom_lines_leave_printed.sql`). Una línea a medida no saca nada del estante, y `deliver_order` no miraba sus impresiones: se entregaba con su trabajo «Planificado», el pedido pasaba a «Entregado» y el trabajo seguía primero en la cola. Ahora las últimas unidades de una línea a medida no salen mientras le quede una impresión planificada o en curso. La entrega no decide por la persona qué pasó con ella, porque cada caso se registra distinto y por su propio flujo: si ya se imprimió, se cierra «Exitosa» en Producción (sale el filamento del rollo y el pedido tiene su costo real); si no hace falta, se cancela allí, sin tiempo ni costo. Cancelarla al entregar habría dejado ese filamento sin salir de ningún rollo. Una entrega parcial sí sale con trabajos en la cola, y nada nuevo se imprime para una línea ya entregada entera (`app.no_prints_for_delivered_lines`). La confirmación ya no llama «hecha» a una unidad sin ninguna impresión cerrada. Y una entrega no lleva fecha futura: el stock no se mueve en un día que no llegó. Lo de catálogo sale del estante y no espera a sus impresiones, pero una impresión de catálogo atada a la línea (de antes del ADR-021) ya no queda en la cola de un pedido entregado: cuando la línea sale entera, se suelta del pedido como hace `cancel_order` con las que no cancela, y lo que produzca entra al estante como cualquier otra (`20261026170000_delivery_once.sql`). No se cancela: si está en la impresora ya gastó filamento, y eso se dice al cerrarla.

**Actualización (2026-10-08, tercera pasada).** Lo que la receta dice de las piezas lo vigila la base, no solo la pantalla:

- **Las piezas salen enteras.** Una salida de placa y una pieza por producto en la receta son números enteros; los insumos sí llevan decimales. Lo guardado antes con decimales se queda hasta que alguien lo edite, y la pantalla lo marca.
- **Una placa con una impresión en la cola o imprimiéndose no se quita:** al cerrarla ya no sabría qué piezas salen. Quitar la única placa que imprime una pieza avisa antes, y la receta dice «ninguna placa la imprime» en vez de suponer que la imprime otra receta.
- **Una variante que está en una cotización, un pedido o el inventario no se borra: se desactiva.** Borrarla dejaba las líneas sin producto y la cotización se recotizaba a precio de costo.

---

## ADR-021 · La cuenta única: se guardan las decisiones, se calcula el reparto

**Estado:** Aceptada · 2026-10-06 · en la rama `etapa2-cuenta`, sin publicar

**Contexto.** El barrido encontró que nadie sabía de quién era lo que había en el estante. Los movimientos `reservation` y `release` existían, pero nadie los escribía. Cuatro pantallas le ponían cuatro nombres al mismo número, y producción veía "faltan 41 botellas" cuando la impresora imprime placas de piezas. El dueño decidió cómo tiene que funcionar:

- La venta y la producción van por carriles distintos: al vender se informa y nunca se bloquea.
- Una proforma enviada o un pedido en espera separan por un plazo corto. Ese plazo se puede fijar a mano con día y hora, o soltarse ya.
- Va primero quien confirma o separa antes. Se puede pasar a otro adelante, con un aviso de quién separó antes.
- Una placa empieza entre las 6:00 y las 23:00 y termina antes de medianoche.
- El cambio de placa varía: se mide, no se configura.

**Decisión.**

1. **Se guardan solo las decisiones de una persona.**
   - Quién va primero: `orders.priority_at` y, en una proforma, `quotes.held_at`.
   - Hasta cuándo dura un separo: `quotes.hold_until` y `orders.hold_until`.
   - El horario del taller y el plazo por defecto de un separo: `workshop_settings`.
   - Cada cambio de prioridad hecho a mano: `order_priority_changes`, con motivo.
2. **Todo lo demás se calcula en cada lectura**, y no se escribe ninguna reserva:
   - de quién es cada unidad del estante, de la cola y de lo que falta imprimir;
   - qué hay que imprimir, armar o comprar;
   - para cuándo estaría cada pedido.

   Un separo vencido se libera solo porque el plan deja de contarlo, sin que nadie escriba un `release`. `reservation` y `release` quedan prohibidos con un `check`: si alguien volviera a escribirlos, el "disponible" de las vistas viejas se separaría del plan en silencio.
3. **La cuenta es una función pura en `packages/domain` (`plan`), no una función de la base.** La síntesis del barrido la ponía en la base; la mudé por tres razones.
   - **Se puede probar.** Es un reparto en varios niveles más una simulación de la cola con el horario. Los dos errores más caros del proyecto fueron cálculos que pasaban el build y las pruebas, y aquí cada regla tiene su prueba en vitest, con los ejemplos del diseño como casos.
   - **Sigue siendo una sola cuenta.** Todas las pantallas llaman a la misma función, con la misma instantánea, y no hay cuenta paralela posible.
   - **La base sigue mandando en lo que importa.** La instantánea sale de una sola función (`planning_snapshot`), así que el estante, la cola y los pedidos se leen en el mismo momento. Las decisiones viven en la base con su seguridad por fila. Un bot futuro puede llamar a `plan` desde una función de Supabase, que corre TypeScript.
4. **El reparto:**
   - Recorre pedidos y separos vigentes por prioridad; si empatan, por número.
   - A cada línea le da, en este orden: el producto armado, los componentes del estante, lo que sale de la cola, los sobrantes de corridas ya propuestas y corridas nuevas. Lo que no puede hacerse en el taller se compra.
   - Una placa mixta da todas sus piezas, y lo que no usa uno es para el siguiente.
   - Lo que falta comprar no bloquea: la fecha se calcula como si llegara, y se marca.
5. **La fecha** sale de simular la cola, placa por placa, en el horario del taller:
   - Una placa empieza antes de su último inicio, que es `mínimo(último inicio, fin del día − duración)`, o pasa al día siguiente.
   - El cambio de placa es el percentil 75 de lo medido, desde cinco muestras. Antes de eso, 15 minutos.
   - Los fallos se cuentan aparte: la fecha más probable, y otra "si falla una placa".
6. **Producción no propone placas para un separo.** El separo se lleva el estante y guarda su lugar en la cola, así que mueve las fechas de quienes van detrás. "Por lanzar" dice cuántas corridas solo hacen falta por un separo, y el taller decide si espera.
7. **El separo nace al enviar la proforma o al poner el pedido en espera**, nunca en el borrador, y vence por defecto a las 23:00 del día siguiente. Volver a separar después de que venció, o retomar un pedido con el separo vencido, lo manda al final de la fila.

**Consecuencias.**

- Cambiar el horario mueve al instante todas las fechas estimadas. Las fechas prometidas a un cliente (`due_date`) no se tocan: solo avisan "llega tarde".
- Las columnas `reserved` y `available` de las vistas viejas ya no significan nada. Las pantallas tienen que leer la posición que da el plan.
- Los pedidos que existían se ordenan por su creación, y los que empatan, por número.
- Un pedido que ya estaba en espera recibe el plazo de siempre, contado desde que se publica.

---

## ADR-022 · El costo de ventas es lo que salió del estante, con su mano de obra

**Estado:** Aceptada · 2026-10-06 (lo que muestra el pedido) · 2026-10-07 (el costo de ventas, decisión del dueño: camino b)

**Contexto.** El ADR-019 dejó el costo de ventas en el estimado de la receta, congelado al tomar el pedido, y avisó que era provisional: el costo real llegaría con `deliver_order`, y ese cambio tenía que publicarse junto con dejar de atar los trabajos de catálogo a un pedido.

Las dos cosas ya existen:
- Cada entrega guarda lo que costó cada unidad que salió del estante (ADR-020).
- «Por lanzar» imprime las placas de catálogo en bolsa común (ADR-021).

Al medirlo con la semilla apareció una diferencia que el ADR-019 no previó. Tres pociones estimadas en S/ 12.66 salieron del estante a S/ 7.21. **Lo que sale del estante no incluía la mano de obra** de armar y empacar, porque armar valorizaba solo lo que consume. El estimado de la receta sí la incluye. El arreglo P2 se hizo justamente porque la mano de obra, los dulces y el empaque desaparecían del costo de ventas.

La primera versión de esta decisión mostró lo entregado en cada pedido y dejó el costo de ventas en el estimado, con dos caminos para que eligiera el dueño: **(a)** seguir con el estimado, o **(b)** pasarlo a lo entregado más la mano de obra de la receta. Con la Venta rápida (ADR-024) el estimado se volvió un problema: el taller produce primero y vende después, muchas veces de a una, y el estimado es el costo de **un lote nuevo** de esa cantidad. Una calavera vendida suelta costaba S/ 10.97 en Resultados (lote de uno, placas enteras y preparación) cuando lo que salió del estante costó S/ 5.64. El dueño eligió **(b)**.

**Decisión.**

1. **El pedido muestra lo que costó lo entregado** (`order_production_summary.delivered_cost` y `delivered_units`), al lado del estimado y de las impresiones ligadas. Las impresiones ligadas solo existen para lo hecho a medida.
2. **Armar mete el producto al estante con su mano de obra** (`assemble_product`, `20261020100000_assembly_carries_labor.sql`). Entra a lo que consumió más la mano de obra de la receta: los minutos por unidad por cada unidad, y la preparación (`setup_minutes`) una vez por armado, repartida entre las unidades armadas. La tarifa es la del perfil de costo vigente ese día, en la hora del taller. Así la entrega, el conteo del estante y su listado la llevan sin un cambio propio: todos leen el valor de lo armado (`produced_unit_cost`).
   - La regla es `laborCost` en `packages/domain`, la misma con que el estimado cobra la mano de obra. La base la repite en `app.recipe_labor_cost` (un armado: preparación y minutos) y `app.recipe_unit_labor` (solo los minutos por unidad, la mitad `perUnits`): cada mitad redondeada a céntimos por separado. **Si cambia una, cambia la otra.**
   - **Lo que no se arma** (un llavero que se entrega en piezas) suma al entregarse los **minutos por unidad** de su receta (`deliver_order`, `app.recipe_unit_labor`), **sin la preparación**. Sin esto saldría sin las manos que su estimado cobra. La preparación no, porque una entrega no es un lote: nueve llaveros vendidos a nueve personas pagarían nueve preparaciones, que es justo el «lote de uno» que esta decisión quita. **Y solo si la línea sacó algo del estante:** una receta sin piezas ni insumos no mueve nada, su costo queda nulo y Resultados la deja en su estimado. La mano de obra sola se leería como todo su costo real y el material desaparecería. Esta parte la agregó la implementación, no la decisión del dueño: queda para que la confirme.
   - **Lo que se cuenta y nadie armó** entra a sus componentes más los minutos por unidad (`assembly_unit_cost`), sin la preparación: el conteo no sabe en cuántos armados se hicieron esas unidades, y una preparación entera por unidad la multiplicaría.
   - Sin perfil de costo para ese día, la mano de obra es cero: armar no se detiene por eso.
3. **El costo de ventas de Resultados es lo que salió del estante** (`monthly_income_statement`, `20261020110000_cost_of_sales_from_the_shelf.sql`). Una línea de catálogo de un pedido de venta cuesta, redondeado a céntimos una vez por línea:
   - lo entregado, a su costo real (`order_delivery_lines.unit_cost` × cantidad);
   - más lo que falta entregar, a su estimado: ya está vendido y todavía no salió.

   Lo entregado sin costo registrado (un pedido entregado antes de que existieran las entregas, un producto sin receta) sigue en el estimado. Lo hecho a medida no cambia: su estimado, o si no tiene, el costo de sus impresiones. La línea y sus impresiones deciden con la misma regla si la línea «cuesta sus impresiones».
4. **La Venta rápida guarda como estimado lo que salió del estante**, no lo que costaría un lote nuevo: la ficha del pedido dice lo mismo que Resultados (ADR-024). Para que lo diga al céntimo, «Lo entregado» del pedido (`order_production_summary.delivered_cost`) se redondea por línea antes de sumar, como Resultados; antes se redondeaba una vez por pedido, y dos líneas de 1.334999 daban S/ 2.67 en el pedido y S/ 2.66 en Resultados.
5. **Las impresiones fallidas que ningún estimado paga restan** (`20261020120000_failed_prints_are_unsold_production.sql`, corrige el punto 4 del ADR-023). Una pieza está en el estante a lo que costó su impresión exitosa, y el estimado, que llevaba la reserva por fallos, ya no es el costo de lo vendido. Sin esto, lo que falla no llegaba a ninguna parte y la utilidad subía justo en eso. Esta columna nueva (`uncovered_failed_prints`, al final de la vista) no estaba en la decisión del dueño: es su consecuencia, y queda para que la confirme.

**Consecuencias.**

- La utilidad de Resultados es la de lo que de verdad salió del estante. Vender de a una deja de castigar el costo; armar en tandas grandes lo baja, porque la preparación se reparte entre más unidades.
- **Lo armado antes de este cambio queda como está:** no se revaloriza el estante. Esas unidades, y las entregas que ya se hicieron, no llevan mano de obra, así que su costo de ventas es más bajo que el estimado. Las ventas de los meses pasados se recalculan con lo que salió de verdad.
- El valor de un producto en el estante es el promedio de todo lo producido de ese artículo, no solo de lo que queda. Mientras haya historia sin mano de obra, el promedio la diluye un poco; con la poca historia que hay (producción desde el 2026-10-05) se diluye rápido.
- Un pedido de catálogo con algo pendiente mezcla dos costos: real lo entregado, estimado lo que falta. Se ve en su ficha, «Estimado contra real».
- **Despliegue: primero las migraciones, después la web.** Las seis migraciones `20261020…` (las de este ADR y las del ADR-024) van al proyecto alojado **antes** de mezclar a `main`, porque Pages publica sola en cada push. La web nueva lee lo que solo existe después de migrar: `transaction_categories.sales`, `monthly_income_statement.uncovered_failed_prints`, la vista `finished_good_costs`, `default_channel` y `quick_sale(…, p_channel_id)`. Publicada antes, Caja, Por cobrar, Resultados, la Venta rápida y Configuración dejan de cargar. Al revés sí funciona: la web anterior sobre la base nueva.

---

## ADR-023 · Lo que se imprime y no se vende es gasto del mes

**Estado:** Aceptada · 2026-10-07

**Contexto.** En el recorrido desde cero, tres cosas consumieron inventario y no llegaron a ningún gasto de Resultados:
- el molde de la calavera (S/ 7.72), que es una herramienta y no deja nada en el estante;
- una impresión fallida (S/ 0.28);
- una tapa que faltó al contar el estante.

El mes quedaba igual de rentable con o sin ellas. El costo de ventas era el estimado de la receta (hoy es lo que salió del estante, ADR-022), y las compras de inventario no restan (ADR-019). Lo que se consume fuera de una venta no tenía por dónde salir.

**Decisión.**

1. **Herramientas y pruebas son gasto del mes, al costo real.** Son las impresiones que no son de un pedido y no dejan nada en el estante: moldes, plantillas y pruebas. El costo real es el material, la luz y la máquina de la impresión. No hay un tipo de artículo «herramienta» ni se amortiza: un molde de S/ 8 no justifica llevar una vida útil.
   - Sus intentos fallidos también cuentan aquí: una impresión fallida sin pedido y sin piezas que dejar (sin placa, o con una placa sin piezas). Es parte de lo que costó la herramienta, y ninguna reserva la paga, porque un molde o una prueba no la llevan. Si no restaran aquí, no restarían en ninguna parte. Y contadas como falla de producción, una prueba fallida de S/ 0.40 basta para que Resultados diga «súbela» en un mes cuya producción no pasa de la reserva (`20261018100000_failures_against_production.sql`).
2. **El conteo del estante también es gasto del mes.** Cuenta lo que faltó menos lo que sobró, al valor que tenía cada unidad en el estante.
3. **Las dos suman «Producción no vendida»** y restan de la utilidad neta, en `monthly_income_statement` (`unsold_production`, `tools_and_tests`, `shelf_count_losses`).
4. **Las impresiones fallidas se muestran aparte y no restan.** La receta ya cobra una reserva por fallos en cada unidad que se costea con ella, así que la falla la paga el costo de ventas, y restarla otra vez la contaría dos veces. Resultados muestra la comparación que importa, en costo y no en cantidad de impresiones: lo que falló sobre lo impreso **para producir** en el mes (`failed_prints` / `print_cost`) contra la reserva vigente ese mes (`failure_reserve_rate`). Si la falla supera la reserva, el precio se queda corto.
   - Lo impreso para producir es lo que lleva la reserva, con las fallas dentro. Quedan fuera los moldes, herramientas y pruebas, hayan salido o fallado, que no la llevan y ya son gasto del mes (punto 1), y las impresiones de una línea a medida sin estimado, cuyo costo real, fallas incluidas, ya es su costo de ventas.
   - La primera versión de este punto decía «sobre todo lo impreso del mes». En el recorrido desde cero, un molde de S/ 7.72 hizo ver un 13 % de fallas como 2.84 %, y la pantalla dijo que la reserva del 10 % alcanzaba (E3-02, corregido en `20261018100000_failures_against_production.sql`).
   - **Corregido el 2026-10-07 por el ADR-022.** «La falla la paga el costo de ventas» dejó de ser cierto para lo que se vende del estante: su costo de ventas es lo que salió, y una pieza está en el estante a lo que costó su impresión exitosa. Las fallas que **ningún estimado paga** (la bolsa del estante, una línea de catálogo ya entregada a lo que salió del estante, un regalo, un pedido cancelado) son ahora producción no vendida y restan (`uncovered_failed_prints`, dentro de `unsold_production`). Sigue aparte la falla ligada a una línea de una venta viva que **todavía se cuenta a su estimado**: un trabajo a medida con estimado, o una línea de catálogo sin nada entregado con costo (pendiente, o de un pedido entregado antes de que existieran las entregas). La paga la reserva de ese estimado, y la línea y sus impresiones lo deciden con la misma regla (`line_costs`), así una falla nunca resta mientras el estimado que la paga sea el costo de su línea. La comparación con la reserva (`failed_prints` / `print_cost`) no cambia: sigue diciendo si los precios cubren lo que falla. Las fallas de la bolsa común del estante no son de ninguna línea (ADR-021) y restan siempre: mientras un pedido de catálogo espera entregarse a su estimado, esa reserva y esas fallas se cuentan las dos, hasta la entrega.
5. **Los meses se cortan en la hora del taller.** Antes se cortaban en UTC, y un pago de la noche del 31 caía en el mes siguiente.
6. **Una impresión cancelada que corrió es un intento fallido** (corregido el 2026-10-08, T3-08, `20261024120000_cancelled_prints_reach_results.sql`). Cobra máquina, luz y, desde la tercera pasada, el filamento que gastó, pero `monthly_income_statement` solo leía las exitosas y las fallidas, así que su costo no restaba en ningún renglón: un molde cancelado a los 30 minutos no estaba en «Producción no vendida». Ahora cuenta como una fallida: herramienta o prueba si no es de un pedido ni deja piezas (punto 1), falla de producción que se compara con la reserva y resta si ningún estimado la paga (punto 4), o costo de ventas de la línea que cuesta sus impresiones. Una cancelada sin tiempo nunca corrió y no cuesta nada. La tasa de fallas histórica del tablero (`failure_stats`) la cuenta igual, entre las intentadas y entre las fallidas (`20261024150000_assembly_once_and_old_tabs.sql`): si no, decía 0 % de fallas el mes en que Resultados restaba lo que costó. El recuadro de los últimos 7 días del tablero también la cuenta como fallida (`weekAttempts`, en `panel.prints.ts`), con el rótulo «fallidas (1 cancelada a medias)», y Resultados la nombra en «Impresiones fallidas o canceladas a medias».

**Consecuencias.**
- La utilidad neta baja por lo que de verdad se gastó sin venderse.
- Una impresión ligada a una línea a medida sigue siendo costo de ese pedido, no producción no vendida.
- Una pieza que salió de la impresión pasa su costo al estante y llega a Resultados cuando se vende.

---

## ADR-024 · Venta rápida, y lo que entra sin ser venta

**Estado:** Aceptada · 2026-10-07 · decisión E5-01 del dueño · revisada el 2026-10-07 con cuatro decisiones más del dueño: el costo del estante (ADR-022), «Clientes varios», las categorías de ventas y el canal · revisada el 2026-10-08 con la tercera pasada: «Clientes varios» nunca debe, tampoco anulando el cobro (T5-05), y las categorías de capital (decisión 3c, T5-06)

**Contexto.** El taller está empezando y trabaja así: primero produce stock (canastitas armadas) y después sale a ofrecerlo a mucha gente. Hacer un pedido completo por cada venta es lento —propósito, cliente, líneas, guardar, entregar, cobrar: tres pantallas—, y en el recorrido desde cero la gente terminaba registrando esas ventas en Caja como «Ingreso». Eso descuadra todo a la vez:

- el producto no sale del estante, y el plan lo sigue ofreciendo a otros pedidos;
- su costo no se cuenta;
- Resultados no lo suma a las ventas. Lo dejaba en «Otros ingresos», fuera de la utilidad (E5-01), justamente porque ahí caían ventas sin costo.

**Decisión.**

1. **«Venta rápida»** (`/pedidos/venta-rapida`, con botón en Pedidos y en Hoy) vende lo que está **armado en el estante y libre**, en un solo paso.
   - Lo libre lo dice el plan (ADR-021): la posición del artículo terminado, sin lo que tienen separado los pedidos y los separos. La pantalla no lo calcula por su cuenta, y lo vuelve a leer justo antes de vender, porque en esos segundos alguien pudo vender o separar la última.
   - Cada producto aparece con su foto y con cuántos hay libres. Se agrega tocándolo, sin pasar de lo libre. Lo que no está en el estante no aparece: va por un pedido normal, que lo separa y lo manda a producir.
   - El precio es el de lista con la escalera para esa cantidad (`price_for_quantity`) y se puede cambiar. La venta espera a que la escalera conteste para la cantidad elegida.
   - **El costo de cada línea es lo que de verdad costó lo que salió del estante**, con su mano de obra (ADR-022), no lo que costaría un lote nuevo. La pantalla muestra lo que vale cada unidad en el estante (`finished_good_costs`, con la misma función que usa la entrega) y no manda costo: `quick_sale` escribe en la línea, como estimado, lo que la entrega dice que costó cada unidad. Así la ficha del pedido dice lo mismo que Resultados. La primera versión mandaba el costo del estimador de «Nuevo pedido», que costea un lote nuevo de esa cantidad (placas enteras y preparación): una calavera vendida suelta costaba S/ 10.97 cuando la del estante costó S/ 5.64.
   - **El canal** (`orders.channel_id`) se elige en la venta, entre los canales activos. Viene elegido el canal por defecto del taller, el de las ventas directas (`workshop_settings.default_channel_id`, «Usar por defecto» en Configuración › Canales de venta). La migración eligió «Directo» donde existía, que es el que crea `bootstrap.sql`. Sin uno elegido no se adivina, ni siquiera el único canal activo: «Instagram» solo no es por donde llegan las ventas en la puerta. Entonces la Venta rápida y Configuración avisan que falta, y se puede vender «Sin canal». La comisión del canal no se cobra aquí: solo el cotizador la usa, para lo hecho a medida, y lo del catálogo se vende a su precio de lista.
   - El cliente es opcional. Sin cliente, la venta queda a nombre de **«Clientes varios»** (decisión del dueño: siempre hay un nombre, y a quienes compran al paso se los pone bajo uno genérico), un cliente del taller marcado con `customers.walk_in` (uno por taller): se crea con la primera venta y se reutiliza. Lo marca la columna y no el nombre, así el dueño puede renombrarlo; el que se había creado como «Cliente al paso» se renombró. **Nadie más puede llamarse así** (`app.walk_in_name_is_taken`, sin distinguir mayúsculas, espacios ni tildes): escrito a mano en la Venta rápida es «Clientes varios» y no un cliente nuevo, y en Clientes, en Nuevo pedido y en el Cotizador la base lo rechaza. Cuentan como suyos su nombre de hoy y los genéricos, en singular o plural: «Clientes varios», «Cliente varios», «Cliente al paso» y «Clientes al paso» (`app.is_walk_in_name`, desde la tercera pasada: escribir «cliente al paso», su nombre anterior, creaba un cliente nuevo que quedaba debiendo, T4-05). Una segunda «Clientes varios» sin la marca podría deber. **Y solo compra en la Venta rápida** (`app.walk_in_buys_on_the_spot`): un pedido normal espera a hacerse, entregarse o cobrarse y necesita a la persona que lo pide. Nuevo pedido, el cotizador y los tratos no lo ofrecen, y la base rechaza un pedido suyo que no escriba `quick_sale`. Con nombre y teléfono se crea el cliente; si se parecen a uno que ya existe (el mismo teléfono, o el mismo nombre escrito de otra forma), la pantalla lo ofrece antes de crear una copia.
   - Se cobra en el mismo paso: cuenta, medio y monto, que por defecto es el total. Un monto parcial deja el resto en «Por cobrar», y cero es «me paga después». **Pero lo que queda por cobrar necesita a alguien que lo deba**: con saldo, la venta pide el nombre o un cliente de la lista, y la base rechaza la deuda de «Clientes varios». Tres canastitas fiadas en una feria a nombre de nadie son tres filas iguales en «Por cobrar» que nadie sabe a quién cobrar. La fecha es la del momento de vender, salvo que se elija otra (las ventas de una feria se anotan de noche), con el aviso de la apertura de la cuenta (E5-02).
   - **Solo vende con el botón.** La venta no es un formulario: Enter en un campo, o «Ir» en el teclado del teléfono, la mandaba sin que nadie tocara «Vender», y una venta no se deshace.
2. **Todo en una sola transacción de la base: `quick_sale`.** Recibe el canal (`p_channel_id`; nulo es el canal por defecto del taller, así una pantalla que no lo manda igual registra uno), pide el número con `next_document_number`, crea el pedido de venta con sus líneas, lo entrega entero con `deliver_order` y registra el cobro con `record_payment`. No mueve stock ni dinero por su cuenta: el estante solo se mueve por sus flujos (ADR-020) y el cobro tiene una sola regla. Si algo no alcanza, la base lo rechaza con su mensaje (`P0001`) y no queda pedido, número, cliente ni cobro a medias. El pedido llega a «Entregado» porque se entregó: nace «Confirmado» y `deliver_order` lo pasa cuando ya no queda nada pendiente, por los mismos disparadores que cualquier pedido, y el historial dice «Venta rápida.» en los dos pasos.
   - Solo vende productos **armados**: un kit que no se arma sale en piezas (o en nada, si su receta no tiene), y la base lo rechaza aunque sabría entregarlo.
   - Cantidades y precios llegan como números JSON. Un texto `"NaN"` pasaba todas las comparaciones (en Postgres NaN es mayor que todo), entregaba, cobraba y dejaba el mes de Resultados en NaN.
   - **Una venta, una llave.** La pantalla manda cada venta con una llave (`orders.quick_sale_key`, única por taller) y la conserva mientras la venta no cambie. Pedida otra vez con la misma llave, `quick_sale` devuelve el pedido que ya hizo y no hace nada más; un candado por llave hace esperar a la segunda llamada simultánea. Si la respuesta se pierde, la pantalla pregunta a la base por la llave antes de decir nada. En la prueba con la respuesta cortada a propósito, el navegador reenvió el mismo `POST` tres y cuatro veces por su cuenta: quedó una sola venta cada vez.
3. **«Ingreso» en Caja queda para lo que no es venta, cobro de un pedido ni aporte**: un reembolso, la devolución de un proveedor. Caja lo dice al elegir el tipo, manda las ventas a Pedidos o a la Venta rápida y el cobro de un pedido al pedido o a «Por cobrar»: anotado en Caja, el cobro contaría dos veces, una como venta del pedido y otra como otro ingreso. **No ofrece las categorías de ventas** (`transaction_categories.sales`, decisión del dueño): la de los cobros de pedidos, «Venta de productos» y «Trabajos por encargo» quedaron marcadas, y el dueño marca las demás en Configuración › Categorías de dinero. La regla vive en la base (`app.loose_income_is_not_a_sale`): un ingreso sin pedido no se escribe ni se mueve a una categoría de ventas. Los cobros de pedidos y la Venta rápida las siguen usando. La categoría que se elige para los cobros queda marcada sola, y no se desmarca mientras esté elegida. **Solo el dueño desmarca una** (la base lo exige, no solo la pantalla): desmarcada, una venta podría anotarse en Caja como ingreso suelto. Marcar sigue abierto a todos, porque solo achica lo que un ingreso suelto puede usar. Si al ocultarlas no queda ninguna categoría para un ingreso suelto, Caja dice dónde crear una. La primera versión solo advertía, por las palabras del nombre. **Tampoco ofrece las de capital** (`transaction_categories.capital`, decisión 3c del dueño): «Aporte del dueño» aparecía en la lista, y un ingreso anotado ahí sumaba a la utilidad, porque Resultados clasifica por el tipo y no por la categoría (T5-06). Una categoría de capital es de los aportes y retiros del dueño y solo de ellos: tampoco la ofrece un egreso ni el cobro de un pedido, y la base la rechaza en los tres (`app.guard_ledger_entry`). Y los cobros que nadie clasifica caen solo en una categoría de ventas: con «Venta de productos» desactivada, la única de ingreso que quedaba era «Aporte del dueño», y se llevaba todos los cobros y las ventas rápidas (T5-07).
4. **«Otros ingresos» suma a la utilidad neta**, en su propia línea (`monthly_income_statement.net_profit`, `20261019110000_other_income_in_net_profit.sql`). Con las ventas fuera de Caja, ese dinero es del taller y ya no esconde una venta sin costo.

**Consecuencias.**

- Una venta del estante deja el mismo rastro que un pedido: número, líneas con su costo, entrega con lo que costó lo que salió, cobro en Caja y saldo en «Por cobrar». Se abre, se cobra el resto y se lee en Resultados igual que cualquier otro.
- La utilidad de los meses con ingresos sueltos en Caja sube por lo que esos ingresos traen. Si alguno era en realidad una venta, hay que anularlo en Caja, con su motivo, y registrarla por la Venta rápida con su fecha: así sale del estante y lleva su costo.
- `quick_sale` no sabe qué está separado: eso lo dice el plan, que vive en el dominio. Si alguien llama a la función directamente, la base solo rechaza lo que no está en el estante, no lo que está separado para otro.
- Un producto armado cuyo valor en el estante nadie registró (sin producción con costo) sale sin costo, y la línea queda en cero. La pantalla lo avisa en la línea.
- Lo que no se arma (un kit que se entrega en piezas) no se ofrece en la Venta rápida y la base lo rechaza: va por un pedido normal.
- Lo que se armó antes de que armar sumara la mano de obra está en el estante sin ella, y así sale en una venta rápida (ADR-022).
- Un ingreso suelto que ya estaba en Caja con una categoría de ventas no se toca: se puede anular, pero no cambiarle la categoría a otra de ventas.
- Las ventas rápidas hechas antes de estas decisiones guardan el costo del estimador como estimado de su línea; Resultados ya no lo lee para lo entregado, y no tienen canal.
- **El cobro de una venta a «Clientes varios» no se anula** (T5-05, revisión del 2026-10-08). Anularlo dejaba el pedido debiendo a nombre de nadie, en «Por cobrar», que es justo lo que la regla de la deuda con nombre quería evitar, por otro camino. Se eligió la regla más simple: la base rechaza esa anulación (`app.guard_ledger_change`, el disparador por el que pasa también `void_transaction`) con un mensaje que dice qué hacer en su lugar, y la pantalla de anular lo dice antes de pedir el motivo. Por qué rechazar y no pedir otro cliente: una venta a «Clientes varios» se paga en el acto por definición (`quick_sale` no la deja con saldo), así que su cobro es parte de la venta, no una deuda que alguien deba. Lo que sí pasa en la práctica tiene dos formas, y cada una su registro, sin tocar la venta: el dinero entró en otra cuenta, y se corrige con una transferencia entre cuentas; o nunca llegó (un Yape que no entró, un billete falso), y se registra un egreso en la cuenta donde se anotó, porque la venta sí ocurrió, lo vendido salió del estante y lo que no llegó es una pérdida. La negativa de la base dice las dos, con la cuenta y el monto, y la pantalla de anular ofrece cada una con el formulario de Caja ya lleno. Por la misma regla, una devolución (un egreso contra el pedido) que dejaría debiendo a «Clientes varios» se rechaza: ninguna pantalla escribe devoluciones, pero la API sí podía. Reasignar el pedido a un cliente con nombre necesitaría una pantalla para cambiar el cliente de un pedido entregado, que no existe; si un día existe, anular pasaría a estar permitido una vez reasignado, porque la regla solo mira si el cliente es «Clientes varios».
- Una venta rápida hecha por error no se deshace anulando su cobro: lo vendido ya salió del estante y la venta cuenta en Resultados. No hay todavía un flujo de devolución.
- **Despliegue:** las migraciones antes que la web, por lo que dice el ADR-022.
- La llave cubre la venta repetida sin cambios. Si después de un error se cambia algo y se vende otra vez, es otra venta con otra llave: la pantalla ya preguntó por la anterior al fallar, pero si no pudo saberlo, no puede impedir la segunda.
- **La misma idea de la llave se extendió al resto de ventas** (tercera pasada): «Nuevo pedido» (`create_order`, `orders.create_key`), el Cotizador (`save_quote`, `quotes.save_key`), el cobro de un pedido (`collect_order_payment`, `order_payment_keys`) y la entrega (`deliver_order` con `p_delivery_key`, `order_deliveries.delivery_key`). Un doble clic había guardado dos cobros de S/ 5 y dos pedidos iguales. La pantalla conserva la llave mientras lo que manda no cambie, también cuando la ficha se recarga después de un error: una recarga que cambiara el monto o lo pendiente cambiaba la llave, y un reintento registraba otra vez lo que ya había llegado. Ante un error sin respuesta de la base (la red), la ficha pregunta por la llave si quedó registrado antes de decir que falló, como la Venta rápida.
- Un cliente que ya se llamaba como el genérico antes de que la lista creciera (por ejemplo, un «cliente al paso» creado en una prueba) sigue como está, y se lo puede elegir de la lista con saldo: la regla solo mira el nombre cuando alguien lo escribe o lo cambia. Si aparece, conviene renombrarlo con el nombre de la persona.

---

## ADR-025 · Permisos e inmutabilidad

**Estado:** Aceptada · 2026-10-08 · decisión del dueño sobre qué puede el operador (M9). Que «Solo lectura» solo lea (punto 1) lo pide el nombre que la pantalla de Miembros ya le daba; falta que el dueño lo confirme.

**Contexto.** Los roles eran nombres sin contenido: cualquier miembro escribía en casi todo y el dueño, además, borraba. «Solo el dueño» vivía en unos botones escondidos, y la base dejaba al operador cambiar el horario y los parámetros de costo (T1-13). Por la API, cualquiera del taller podía cambiar el monto de un cobro, desanular un movimiento, reescribir el kardex o reabrir lo cerrado, y el dueño podía borrar movimientos de dinero y de stock (T1-02, T3-03, T5-01). Ocultar un botón no es seguridad, y un libro que se puede reescribir no es un libro (ADR-006, ADR-014).

**Decisión.**

1. **La matriz.**

   | Rol | Puede |
   |---|---|
   | **Dueño** (`owner`) | Todo lo del operador; además la configuración, anular un movimiento de dinero y borrar donde ya se podía |
   | **Operador** (`operator`) | El día a día: producir (trabajos de impresión, iniciarlos, cerrarlos, pesar rollos), armar y contar el estante, comprar (compras y sus pagos), vender (cotizar, pedidos, venta rápida, entregar y cancelar), cobrar, y crear y editar el catálogo |
   | **Solo lectura** (`viewer`) | Ver todo; no registra nada |

   **La configuración** son los parámetros de costo, el horario y los datos del taller, los canales de venta, las cuentas y sus aperturas, las categorías de dinero y de regalo (el tratamiento de un regalo decide dónde cae su costo en Resultados), los miembros, y las impresoras con sus activos, componentes y planes de mantenimiento. El mantenimiento hecho y los incidentes son del día a día.

2. **La regla vive en la base.** Cada tabla tiene una de tres formas, y una tabla nueva usa la que le toca:
   - `app.apply_workspace_rls`, **el día a día**: lee cualquier miembro, escriben dueño y operador (`app.can_operate`), borra el dueño.
   - `app.apply_owner_rls`, **la configuración**: lee cualquier miembro, escribe el dueño.
   - `app.apply_ledger_rls`, **los libros**: se leen y se agregan, nunca se cambian ni se borran.

   Al actualizar, la política ve la fila con ser miembro y exige el rol en la fila que se escribe. Así, quien no puede recibe un error («new row violates row-level security policy») en vez de un cambio de cero filas que la pantalla creería hecho, y el operador puede bloquear una fila que no va a cambiar: iniciar un trabajo bloquea la impresora (`one_print_at_a_time`), que es configuración.

3. **Los libros no se reescriben, ni siquiera el dueño.** `transactions`, `stock_movements`, `order_deliveries` y `order_delivery_lines` no tienen política de actualización ni de borrado, y `anon`, `authenticated` y `service_role` no tienen el privilegio: la API contesta «permission denied» y no hay forma de editarlos desde fuera. Las funciones que escriben esos libros solo insertan (`record_payment`, `deliver_order`, `complete_print_job`, `count_shelf`…), así que siguen funcionando para el operador. Un rollo o un artículo con movimientos ya no se puede borrar: el borrado en cascada se llevaba su kardex, y el disparador `stock_movements_are_permanent` lo impide. La consola SQL, sin usuario de la app, queda fuera de la regla: es la que arregla datos y borra un taller de prueba.

4. **Cómo se anula el dinero.** Un movimiento se anula una sola vez, con motivo, y solo el dueño: lo hace `void_transaction`, una función `security definer` que exige el dueño y escribe solo la anulación. El movimiento desaparece de los saldos y de los reportes y queda en el registro. No se desanula ni se corrige: si se anuló por error, se registra de nuevo.

5. **Cómo se corrige el stock.** Con otro movimiento: un pesaje del rollo (ajuste) o un conteo del estante (`count_shelf`), que deja por escrito qué cambió y por qué. Lo que ya no se usa se desactiva.

6. **La pantalla no ofrece lo que la base va a negar.** El rol se lee de `CurrentWorkspace` (`isOwner`, `canOperate`, y `isOwnerRole` / `canOperateRole` para quien ya lo tiene): lo que el rol no puede, se oculta o se muestra con el porqué («Solo el dueño del taller puede…»). Si aun así la base lo niega (una pestaña vieja, un rol que cambió), `friendlyError` lo dice, y la pantalla vuelve a leer el rol con `CurrentWorkspace.afterRefusal(error)`, que distingue un «no» a quien pide de un «no» a lo que escribió. Cuando ni el dueño puede, el mensaje no dice «solo el dueño»: dice que el dinero se anula y el stock se corrige.

   Una función que niega por el rol lo hace con el código de un permiso negado, no con `P0001`: `raise exception using errcode = 'insufficient_privilege', message = 'Solo el dueño del taller puede…'` (así `save_printer`). La pantalla reconoce el `42501`, vuelve a leer el rol y muestra la frase tal cual. Un borrado que la política no deja ver vuelve con cero filas, igual que uno de algo que ya no está: la pantalla mira si la fila sigue para saber cuál de los dos fue (`deleteCostProfile`).

7. **El taller nunca se queda sin dueño.** La base rechaza quitarle el rol o sacar del taller al último (`workspace_members_keep_an_owner`).

8. **Las versiones de los parámetros de costo** (ADR-006): una programada, que todavía no empezó, se corrige o se quita; la vigente y las anteriores ya costearon cotizaciones y armados y no se tocan; ninguna empieza antes de hoy. «Hoy» es el día del taller (`app.workspace_day`), no el del servidor.

**Consecuencias.**

- La prueba es `supabase/tests/permisos.sql`: crea su propio taller dentro de `begin … rollback`, evalúa la matriz entera para cada tabla, operación y persona, y prueba con filas reales los casos de los recorridos. Una tabla nueva que no sea del día a día va en su lista; si no, la prueba la marca.
- La anulación de Caja no puede seguir siendo un `update` desde la pantalla: pasa a `void_transaction`. Tampoco el deshacer de una compra fallida, que borraba sus movimientos: la compra se guarda en una sola función, y si falla no queda nada que deshacer.
- Marcar una categoría como de ventas ya no está abierto a todos (ADR-024 lo decía): las categorías son configuración.
- Instalar o retirar un componente de la impresora es del dueño, aunque el cambio de boquilla lo haga el operador: lo registra en el mantenimiento.
- La llave de servicio tampoco reescribe un libro. Un arreglo de datos se hace desde la consola SQL, con su motivo, y queda en el historial de Git como migración si hace falta repetirlo.
- Las funciones `security definer` no pasan por estas políticas: cada una exige el rol que corresponde, como `void_transaction` exige el dueño. Las demás funciones del sistema son `security invoker` y heredan la matriz de quien las llama.
- **Queda abierto:** el estante (ADR-020) todavía acepta un `insert` directo en `stock_movements` de una pieza o un producto, y en `order_deliveries`. `complete_print_job`, `assemble_product`, `count_shelf` y `deliver_order` son `security invoker` y escriben por la misma política que un POST a mano, así que la política no puede distinguirlos. Se cierra cuando esas funciones pasen a `security definer` exigiendo `app.can_operate` (producción y ventas): entonces la política de insert de `stock_movements` se limita a rollos, insumos, empaques y repuestos, y la de las entregas se quita. Mirar la pila de llamadas desde un disparador se probó y se descartó: depende de nombres de funciones de otras áreas y no ve una función `sql` integrada en la consulta.

---

## Pendientes

| Tema | Opciones | Comentario |
|---|---|---|
| **Canal del bot** | Telegram / WhatsApp / chat web | La API de bots de Telegram no tiene costo; WhatsApp Business puede cobrar por conversación. Evaluar en la fase 4 |
