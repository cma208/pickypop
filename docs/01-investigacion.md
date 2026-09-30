# 1. Investigación

> Hecha en septiembre de 2026. Los precios y límites de servicios externos cambian: hay que revisarlos antes de cada decisión importante.

## 1.1 Referentes

| Proyecto | Tipo | Qué tomar como inspiración |
|---|---|---|
| [3DCoster](https://github.com/Waarangel/3dcoster) | Open source (MIT), escritorio | Costo completo (filamento, luz, depreciación, desgaste de boquilla, trabajo, envío, comisiones), **punto de equilibrio** por modelo |
| [3D-Printing-Quote-Engine](https://github.com/Machine-Shop-Suite/3D-Printing-Quote-Engine) | Open source (MIT), web | Desglose de costos, margen por impresora, impuestos. *Lamina en el servidor*, justo lo que queremos evitar |
| [Fórmula de Prusa](https://blog.prusa3d.com/how-to-calculate-printing-costs_38650/) | Referencia | Estructura base: material + trabajo + amortización por hora + luz + margen por fallos |
| [Stimalo](https://stimalo.com/) | Freemium (su base de impresoras y materiales es abierta, CC-BY-4.0) | Importa G-code y 3MF, 4 estrategias de precio, inventario FIFO, estados de cotización, PDF |
| [Spoolman](https://github.com/Donkie/Spoolman) | Open source (MIT) | Inventario **por rollo**, etiquetas QR, base comunitaria de filamentos |
| [Bambuddy](https://github.com/maziggy/bambuddy) | Open source (AGPL-3.0) | Costo por impresión a partir del costo por kg de cada rollo, mantenimiento por horas o días. *Controla impresoras, que no es nuestro alcance* |
| [3DPBOSS](https://3dpboss.com/) | Plantilla de Notion de pago | Etapas del pedido, mantenimiento unido a repuestos, CRM |
| [InvenTree](https://inventree.org/) / ERPNext / Odoo | ERP e inventario open source | Cómo modelan movimientos de stock y órdenes de trabajo |
| [Atlas CMMS](https://atlas-cmms.com/) | Mantenimiento open source (GPL-3.0) | Preventivo por calendario **o por contador**, lo que ocurra primero |

**Hueco que cubrimos:** ninguno une **cotización → orden → producción → stock → mantenimiento → finanzas** para un taller pequeño, en español, adaptado a Perú y sin costo de servidor.

## 1.2 Cómo obtienen otros sistemas los gramos y el tiempo

| Enfoque | Quién lo usa | Dónde se procesa | Costo para la plataforma | Coincide con lo que imprimes |
|---|---|---|---|---|
| **Laminar en el servidor** (CLI de PrusaSlicer o Bambu Studio) | Quote Engine, [Bambuddy (server-side slicing)](https://wiki.bambuddy.cool/features/slicer-api/) | Servidor | CPU pagada por cada cotización | Solo si se usan los mismos perfiles |
| **Importar el archivo ya laminado** (G-code o 3MF) | Stimalo, Bambuddy (metadatos de 3MF), calculadora de Prusa (G-code), [drukstacja](https://github.com/Booorgi/drukstacja/pull/53) | **Navegador o PC del usuario** | **Cero** | **Sí: es el mismo archivo que imprimes** |
| **Laminar en el navegador** (WebAssembly) | Kiri:Moto | Navegador | Cero | No: motor y perfiles distintos a los de Bambu Studio |
| **Entrada manual** | Casi todos | — | Cero | Depende de quien digita |
| **CLI local** de Bambu Studio (`--slice`, `--export-3mf`) | [Uso del CLI](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage), [un servidor MCP comunitario](https://glama.ai/mcp/servers/@hunter-stradley/bambustudio-mcp) | PC del usuario | Cero | Sí, si usa tus perfiles |

**Conclusión:**
1. Lo que ya habías pensado es lo correcto: **tú laminas en Bambu Studio** (lo haces igual para imprimir), exportas el `.gcode.3mf` y **el navegador lo lee**. No se sube nada, así que la plataforma no paga procesamiento.
2. La entrada manual queda siempre como alternativa.
3. **A futuro:** el MCP local del taller podría invocar el CLI de Bambu Studio en tu PC para laminar un STL de forma automática. El procesamiento seguiría siendo tuyo.

### Qué contiene un `.gcode.3mf` de Bambu Studio

Es un ZIP ([estructura según Printago](https://printago.io/blog/3mf-file-format)):

| Archivo | Uso para nosotros |
|---|---|
| `Metadata/slice_info.config` (XML) | **Datos clave, por placa:** `prediction` (tiempo en segundos), `weight` (gramos), `printer_model_id`, `nozzle_diameters`, `support_used`, `outside` (si algo queda fuera del volumen). **Por filamento:** `id` (ranura), `type` (PLA, PETG…), `color` (hex), `used_m`, `used_g` |
| `Metadata/plate_N.png` | Miniatura de la placa (sirve de vista previa) |
| `Metadata/plate_N.gcode` | G-code (no lo necesitamos) |
| `Metadata/project_settings.config` | Todos los ajustes del laminado (altura de capa, relleno), útiles para la ficha técnica |

### Comprobado con archivos reales (2026-09-29)

Revisamos dos proyectos hechos con Bambu Studio 02.08.02.61 (*Thermoformed potion bottle* y *Pumpkin – WFace A1M*):

| Hallazgo | Detalle |
|---|---|
| **Un `.3mf` de proyecto no sirve para costear** | Su `slice_info.config` trae **solo el encabezado del slicer**: ni placas, ni gramos, ni tiempo. Hay que exportar el archivo **laminado** (`.gcode.3mf`) |
| Sí trae contexto aprovechable | `project_settings.config`: impresora (Bambu Lab A1 mini), boquilla 0.4 mm, altura de capa 0.2 mm, relleno (25 % y 15 %), placa texturizada y, por cada filamento, tipo, color, marca y densidad |
| Los costos del slicer no sirven | Traen los precios de los perfiles (19.99 y 22.99, en la moneda del perfil). **El costo real sale de tus rollos, en soles** |
| `plate_N.json` | Nombres de los objetos de cada placa, colores usados y área ocupada: útil para armar la ficha de catálogo |
| Tamaño de los archivos | 2.5 y 2.7 MB cada uno: confirma que **no conviene guardarlos** en Storage |

### Comprobado con archivos laminados (2026-09-29)

Dos placas reales del mismo modelo, laminadas para A1 mini con Bambu Studio 02.08.02.61:

| Dato | *Love potion* (3 colores) | *Wicked potion* (2 colores) |
|---|---|---|
| Placa | 2 | 1 |
| `prediction` | 2,586 s (43 min) | 2,096 s (35 min) |
| `weight` | 11.35 g | 10.43 g |
| Filamentos | PLA #F55A74 5.69 g · #000000 4.63 g · #DE4343 1.02 g | PLA #61C680 5.80 g · #000000 4.63 g |
| `printer_model_id` | N1 (A1 mini) | N1 |
| Tamaño del archivo | 1.3 MB | 1.4 MB |

**1. La purga ya viene incluida en los gramos.** Sumando la extrusión del G-code y descontando las retracciones, el consumo neto coincide con lo declarado por el slicer dentro del 3 %. O sea que `weight` y `used_g` **ya cuentan la torre de limpieza y la purga de los cambios de color**. → Nuestra **merma no debe volver a sumarla**: solo cubre el cebado inicial y los restos del final del rollo.

**2. En piezas pequeñas multicolor la purga es enorme.** En *Love potion*, la torre de limpieza más los bloques `FLUSH` equivalen al **28.7 %** del filamento de la placa; en *Wicked potion*, con un color menos, al 7.1 %. Vale la pena mostrarlo en la ficha del trabajo: es el argumento para reducir colores o agrupar piezas.

**3. Hay dos tiempos y hay que elegir bien.** El G-code declara `model printing time: 37m 6s` y `total estimated time: 43m 6s`; `prediction` es el segundo. **Usamos `prediction`**, porque la máquina está ocupada y consumiendo durante todo ese rato.

**4. `tray_info_idx` identifica el perfil de filamento de Bambu.** En estos archivos, GFA00 corresponde a PLA Basic y GFA01 a PLA Matte. Junto con el color hex, es la mejor pista para **sugerir automáticamente el SKU** de nuestro inventario.

**5. Confirmado que no conviene guardar los archivos:** 1.3 y 1.4 MB cada uno.

## 1.3 MCP: estado a septiembre de 2026

La versión vigente es la **[2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)**. Estos cambios nos afectan:

| Cambio | Implicación para nosotros |
|---|---|
| **Protocolo sin estado:** desaparecen las sesiones, el `Mcp-Session-Id` y el handshake `initialize`; cada petición lleva su versión y capacidades en `_meta` | Encaja con funciones serverless (Supabase Edge Functions) |
| Nuevo `server/discover`, obligatorio | El servidor anuncia versión, capacidades e identidad |
| **Multi Round-Trip Requests (MRTR):** el servidor responde `input_required` y el cliente reintenta la petición con los datos que faltan. Reemplaza las peticiones iniciadas por el servidor, como elicitation | Útil para "te falta el precio unitario de la compra" o "¿qué color?" |
| Tasks pasa a ser una **extensión oficial** (`io.modelcontextprotocol/tasks`) | Para operaciones largas (reportes pesados), si hicieran falta |
| `inputSchema` y `outputSchema` aceptan JSON Schema 2020-12; `structuredContent` admite cualquier JSON | Resultados tipados (cotizaciones, stock) |
| **Obsoletos:** Roots, Sampling, Logging, transporte HTTP+SSE y Dynamic Client Registration (se prefieren los Client ID Metadata Documents) | **No usarlos.** Registrar logs con OpenTelemetry o por stderr |
| Autorización más estricta: validación de `iss` y credenciales ligadas al emisor | Relevante para el MCP remoto con OAuth |

**Supabase y MCP:**
- Tiene una [guía para desplegar servidores MCP en Edge Functions](https://supabase.com/docs/guides/ai-tools/byo-mcp) con el SDK oficial de TypeScript y transporte Streamable HTTP. **Hoy solo cubre servidores sin autenticación**; la autenticación está marcada como "coming soon".
- Supabase Auth ofrece un [servidor OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server) con una [guía de autenticación para MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
- Aparte existe el [MCP oficial de Supabase](https://supabase.com/blog/mcp-server), pensado para que un asistente administre tu proyecto mientras desarrollas. Es otra cosa: no es el MCP de nuestra app.

## 1.4 Supabase: plan Free

Según la [página de precios](https://supabase.com/pricing):

| Límite | Valor | ¿Nos afecta? |
|---|---|---|
| Proyectos activos | 2 | Uno para producción; el desarrollo se hace en local con el CLI |
| Base de datos | 500 MB | Datos financieros en texto: alcanza para años |
| Almacenamiento de archivos | 1 GB | Solo fotos comprimidas; **no guardar los 3MF por defecto** |
| Transferencia (egress) | 5 GB | Suficiente para un usuario |
| Usuarios activos al mes | 50 000 | Sin problema |
| Invocaciones de Edge Functions | 500 000 | Sin problema |
| **Pausa por inactividad** | **Tras 1 semana sin actividad** | Con uso diario no pasa; ver mitigación en [Arquitectura](04-arquitectura.md#45-equipo-accesos-y-consumo-del-plan-free) |
| **Backups automáticos** | **No incluidos** | **Crítico con datos financieros:** necesitamos exportación propia |
| Plan Pro | Desde USD 25 al mes | Solo si algún día se aloja una instancia para varios talleres |

## 1.5 Perú

### Regímenes tributarios (2026, UIT = S/ 5,500)

[Fuente](https://tramitesperu.com/comparadores/regimenes-tributarios/) · [SUNAT Emprender: Nuevo RUS](https://emprender.sunat.gob.pe/ruc/regimenes-tributarios-mype/nuevo-regimen-unico-simplificado-nuevo-rus)

| Régimen | Límite de ingresos | Comprobantes | IGV | Impuesto a la renta |
|---|---|---|---|---|
| **NRUS** | S/ 96,000 al año (S/ 8,000 al mes) | **Solo boletas** | Incluido en la cuota | Cuota fija de S/ 20 (hasta S/ 5,000 al mes) o S/ 50 (hasta S/ 8,000 al mes) |
| **RER** | S/ 525,000 al año | Facturas y boletas | 18 % | 1.5 % mensual |
| **RMT** | 1,700 UIT | Todos | 18 % | 1 % mensual a cuenta; anual 10 % hasta 15 UIT y 29.5 % sobre el exceso |
| **General** | Sin límite | Todos | 18 % | 29.5 % anual |

> ⚠️ Esto es orientación para diseñar el software, no asesoría tributaria. Al sacar el RUC conviene validarlo con un contador.

**Implicación:** el régimen es un parámetro. Sin RUC no hay IGV ni comprobantes; con NRUS hay boletas sin desglose de IGV y alertas al acercarse a S/ 8,000 al mes; con RER, RMT o General se aplica IGV al 18 % y se permiten facturas.

### Tarifa eléctrica en Surquillo

Surquillo está en la concesión de **Luz del Sur, Sistema Lima Sur**. [Pliego tarifario del 04-08-2026](https://cdn.luzdelsur.com.pe/weblds/nuestraempresa/lds_tarifas.pdf), **con IGV incluido**, tarifa **BT5B residencial**:

| Consumo mensual del hogar | Cargo fijo | Energía |
|---|---|---|
| 0–30 kWh | S/ 2.60 | S/ 0.5170 por kWh |
| 31–140 kWh | S/ 2.60 | S/ 15.51 por los primeros 30 kWh; **S/ 0.7386 por kWh adicional** |
| Más de 140 kWh | S/ 2.66 | **S/ 0.7556 por kWh** |

La impresora se suma al consumo que ya tiene la casa, así que su **costo marginal está entre S/ 0.74 y S/ 0.76 por kWh**. Valor por defecto: **S/ 0.7556**, editable. El pliego se reajusta periódicamente.

## 1.6 Bambu Lab A1 mini

| Dato | Valor | Fuente |
|---|---|---|
| Consumo promedio imprimiendo | **57 W** | [Wiki Bambu, FAQ del A1 mini](https://wiki.bambulab.com/en/a1-mini/manual/faq) |
| Consumo en reposo | 6 W | Misma fuente |
| Costo de luz por hora de impresión | 0.057 kW × S/ 0.7556 ≈ **S/ 0.04 por hora** | Cálculo |
| Guía de mantenimiento | [wiki.bambulab.com/en/a1-mini/maintenance](https://wiki.bambulab.com/en/a1-mini/maintenance) | Oficial |

La luz es un costo pequeño, pero conviene registrarlo. Lo ideal es medir el consumo real (con el AMS lite incluido) usando un enchufe medidor.
