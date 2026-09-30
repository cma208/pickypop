# Pickypop · diseño de la plataforma

> **Proyecto:** Pickypop · **Estado:** diseño cerrado, repositorio iniciado · **Licencia:** MIT · **Última actualización:** 2026-09-29
> **Documentación:** en español · **Código (cuando exista):** en inglés

## Qué es

Una plataforma web open source de **gestión y finanzas** para talleres pequeños de impresión 3D. Cubre cotizaciones, catálogo, pedidos, uso personal y regalos, inventario de filamento, mantenimiento de impresoras y dinero.

**Primer caso real:** un taller en Surquillo (Lima), que trabaja en soles con una Bambu Lab **A1 mini + AMS lite**.

## Qué no es

- **No controla ni monitorea impresoras.** Nunca manda a imprimir.
- **No lamina en el servidor.** El laminado ocurre en la computadora del usuario (Bambu Studio); la plataforma solo lee el archivo resultante, y lo hace en el navegador.
- **No es un sistema contable ni un emisor de comprobantes electrónicos** (por ahora). Deja los datos listos para cuando haya RUC.
- **No es una tienda en línea** (por ahora).

## Actores

| Actor | Qué hace |
|---|---|
| Las dos personas del taller | Usan la app web en el día a día, cada una con su cuenta de Google |
| El agente de IA de cada persona | Opera la plataforma por MCP (registrar compras, cotizar, consultar) con los permisos de esa persona |
| Cliente final | Pide cotizaciones; en el futuro, también a través de un bot |
| Bot de atención | Responde con el catálogo y crea solicitudes. **Nunca ve costos ni márgenes** |

## Principios

1. **El costo no es el precio.** El costo se calcula; el precio es una decisión comercial.
2. **Lo pesado se procesa en la computadora del usuario.** El servidor solo guarda datos.
3. **Costo cero para un taller pequeño:** plan Free de Supabase y hosting estático gratuito. Para dos personas y sus agentes hay holgura de sobra ([estimación](04-arquitectura.md#45-equipo-accesos-y-consumo-del-plan-free)).
4. **Todo parámetro es editable y tiene fecha de vigencia** (tarifa de luz, hora de trabajo, márgenes).
5. **Las cotizaciones enviadas no se modifican:** guardan una copia de los parámetros con que se calcularon.
6. **El stock y el dinero salen de movimientos**, nunca de saldos editados a mano.
7. **Todo tiene valor estimado y valor real** (gramos, tiempo, costo).
8. **Pensada para Perú sin obligar a formalizarse:** soles, IGV, RUC y régimen de SUNAT son configuración.
9. **La IA es un cliente más:** usa las mismas reglas de negocio y los mismos permisos; nunca calcula precios por su cuenta.

## Documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [Investigación](01-investigacion.md) | Sistemas existentes, cómo obtienen gramos y tiempo, MCP 2026-07-28, Supabase Free, SUNAT, tarifa eléctrica |
| 2 | [Dominio](02-dominio.md) | Módulos, parámetros, fórmulas, inventario, catálogo, órdenes, finanzas, comprobantes |
| 3 | [Modelo de datos](03-modelo-de-datos.md) | Tablas, relaciones y convenciones |
| 4 | [Arquitectura](04-arquitectura.md) | Angular + Supabase, monolito modular, MCP, límites y seguridad |
| 5 | [Decisiones](05-decisiones.md) | Registro de decisiones (ADR) |

## Hoja de ruta

| Fase | Nombre | Alcance |
|---|---|---|
| 0 | Fundaciones | Esta documentación, decisiones, modelo de datos y **prueba de concepto del lector de `.gcode.3mf`** con archivos reales |
| 1 | MVP: costear | Ingreso con Google para las dos personas, parámetros, materiales y compras (rollos), cotizador (desde archivo o manual), uso personal y regalos, registro de impresiones |
| 2 | Operar | Pedidos y cobros, catálogo con fichas y botón "Añadir al catálogo", alertas de stock, mantenimiento de la A1 mini |
| 3 | Finanzas + IA privada | Cuentas y movimientos de dinero, reportes, respaldos, MCP del taller (local) |
| 4 | Clientes | MCP público de catálogo, bot, solicitudes de cotización |
| 5 | Formalización | Régimen tributario activo, boletas y facturas mediante un proveedor electrónico, varios talleres |

## Datos pendientes

Están marcados con ⚠️ dentro de los documentos. Al reemplazarlos, quitar la marca.

| Dato | Estado | Dónde se usa |
|---|---|---|
| Tarifa eléctrica de tu recibo | ⚠️ Provisional: S/ 0.7556 por kWh | [Parámetros](02-dominio.md#22-parámetros) |
| Costo de la A1 mini + AMS lite | ✅ S/ 1,500, con 175 h de uso | Activos y tarifa de máquina |
| Valor de la hora de trabajo | ⚠️ Provisional: S/ 15 y S/ 25 | Derivadas de los sueldos (S/ 3,000 y S/ 5,000 ÷ 208 h) |
| Margen objetivo | ✅ 50 % | Fórmula de precio |
| Precio mínimo por orden | ⚠️ Pendiente | Fórmula de precio |
| Costo del dulce | ✅ S/ 0.99 (66 g a S/ 15 el kilo) | Insumo de cada unidad |
| Costo del empaque | ⚠️ Provisional: S/ 0.50 | Insumo de cada unidad |
| Horas al año | ✅ ~2,000 h (175 h en 32 días) | Tarifa de máquina |
| Presupuesto de mantenimiento | ⚠️ Provisional: S/ 240 al año | Tarifa de máquina. Se reemplaza con el gasto real |
| Archivos `.gcode.3mf` de referencia | ✅ Recibidos el 2026-09-29 | [Hallazgos](01-investigacion.md#comprobado-con-archivos-laminados-2026-09-29): la purga ya viene en los gramos |

## Decisiones tomadas

Todas las ADR de [05-decisiones.md](05-decisiones.md) están **Aceptadas** (2026-09-29): gestión sin control de impresoras, laminado en la computadora del usuario, Angular, Supabase, monolito modular, movimientos con vigencias, MCP en dos niveles, preparación para SUNAT, licencia MIT, accesos del equipo con Google, "cada taller despliega su copia" y pnpm workspaces.

El proyecto se llama **Pickypop**, igual que la empresa. Sin definir queda solo el **canal del bot**, que se decide en la fase 4.
