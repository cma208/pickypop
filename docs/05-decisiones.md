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

## Pendientes

| Tema | Opciones | Comentario |
|---|---|---|
| **Canal del bot** | Telegram / WhatsApp / chat web | La API de bots de Telegram no tiene costo; WhatsApp Business puede cobrar por conversación. Evaluar en la fase 4 |
