# Instrucciones para agentes

Este archivo es el contrato de trabajo del repositorio. Lo leen Codex, Claude y sus subagentes. Si vas a tocar código, léelo entero primero: recoge decisiones que costaron trabajo y que es fácil deshacer sin darse cuenta.

El reparto de tareas está en [docs/07-plan-de-trabajo.md](docs/07-plan-de-trabajo.md).

## Qué es esto

**Pickypop** es a la vez un taller de impresión 3D en Surquillo, Lima (dos personas, una Bambu Lab A1 mini con AMS lite, soles peruanos) y la plataforma de **gestión y finanzas** de ese taller, con licencia MIT.

**Nunca controla la impresora.** No lamina, no manda trabajos, no habla con la máquina. El laminado se hace en Bambu Studio, en la computadora del dueño. La aplicación lee el archivo ya laminado **en el navegador**, sin subirlo a ningún sitio.

Está **en producción** desde el 2026-10-05, con datos reales entrando. Las pantallas se usan a diario; no es una demostración.

## Lo que no se negocia

**El dinero se calcula en un solo sitio.** Todas las reglas viven en `packages/domain`. Las pantallas lo consumen a través de `apps/web/src/app/core/pricing.ts`. Si escribes aritmética de centavos en un componente, lo estás haciendo mal. Ya pasó tres veces que tres pantallas respondieran distinto a "cuánto cuesta un insumo"; no vuelva a pasar.

- El margen se toma **sobre el precio**, nunca sobre el costo: `precio = costo / (1 - margen)`.
- Cada componente de dinero se redondea a céntimos **por separado**, para que el desglose sume exactamente el total.
- El redondeo pasa por `roundMoney` y `sumMoney`. Siempre.

**Las reglas de acceso viven en la base de datos.** Cada tabla tiene seguridad por fila (RLS) aplicada con `app.apply_workspace_rls`. El frontend **nunca** filtra por taller: ya lo hace la base. Ocultar un botón no es seguridad: cualquiera puede llamar la API directamente.

**Los saldos no se guardan, se derivan.** El stock sale de sus movimientos; el saldo de una cuenta, de los suyos más el saldo de apertura. No añadas una columna de saldo editable por mucho que parezca más rápido.

**Nada se borra: se anula.** Los movimientos de dinero se anulan con motivo obligatorio y desaparecen de los reportes dejando rastro.

**Las migraciones son de ida.** Una migración ya aplicada **jamás** se edita: se corrige con otra encima. `supabase/seed.sql` corre **solo en local**; el proyecto alojado se arranca con `supabase/bootstrap.sql`.

## Convenciones

- **Código, identificadores y comentarios en inglés. Todo lo que ve el usuario, en español.** La documentación también en español.
- Los comentarios explican **por qué**, no qué. Si el comentario repite la línea, sobra. Mira `packages/domain/src/cost.ts`, que es el mejor ejemplo del repositorio.
- Angular 22: componentes standalone, sin zone.js, signals, `input()`, formularios reactivos. Componentes compartidos en `ui/` (`pp-page`, `pp-card`, `pp-badge`, `pp-async`, `pp-empty`, `pp-field`); no inventes otros si ya hay uno.
- El taller actual se pide a `CurrentWorkspace` (`core/workspace.ts`). Nunca consultes la tabla `workspaces` por tu cuenta.
- Los errores de base se traducen con `friendlyError` (`core/friendly-error.ts`). Cuando la base lanza un mensaje escrito para una persona —como el de sobrepago de `record_payment`— se muestra **tal cual**.
- Las listas largas se paginan con `fetchAll` (`core/fetch-all.ts`): PostgREST corta en 1000 filas y trunca sin avisar.
- **Git siempre.** Rama por trabajo, commits con mensaje que explique el porqué. No se commitea nada sin que lo pida el dueño.

## Cómo se verifica

```bash
pnpm test                                      # dominio y migraciones
pnpm --filter @pickypop/web exec ng test --watch=false
pnpm --filter @pickypop/web exec ng build
```

**Que compile no es que funcione.** Los dos errores más caros de este proyecto —un cálculo que nunca se recalculaba y una estimación multiplicada por el número de placas— pasaban el build y los tests. Solo aparecieron al usar la aplicación.

Así que: levanta el servidor local, entra, y **haz la tarea completa como la haría una persona**. Luego comprueba contra la base lo que creíste que pasó:

```bash
docker exec supabase_db_pickypop psql -U postgres -d postgres -c "..."
```

Si creas datos de prueba, **bórralos al terminar** y di cuáles fueron.

## Límites

- **No corras `supabase db reset`** si hay alguien más trabajando: borra la base local de todos.
- **Nunca** pongas la llave `service_role` ni `sb_secret_` en el código o en el navegador. La llave `anon` sí es pública por diseño: va en el paquete y la protegen las políticas de la base.
- No modifiques archivos de configuración (`package.json`, `angular.json`, `docker-compose.yml`) sin que el dueño lo confirme.
- Si tu tarea necesita un cambio fuera de tu alcance, **no lo hagas**: termina y repórtalo.

## Dónde está todo

| Dónde | Qué |
|---|---|
| `docs/01-investigacion.md` | Sistemas que ya existen, y lo comprobado sobre los archivos `.gcode.3mf` |
| `docs/02-dominio.md` | Modelo de negocio, fórmula de costo y precio, ejemplos con números reales |
| `docs/03-modelo-de-datos.md` | Todas las tablas y vistas |
| `docs/04-arquitectura.md` | Cómo encaja, y por qué el coste de operación es cero |
| `docs/05-decisiones.md` | 14 decisiones de arquitectura, con su porqué |
| `docs/06-frontend.md` | Contrato del frontend: estructura, diseño, pantallas |
| `docs/07-plan-de-trabajo.md` | **El reparto de trabajo vigente** |
| `packages/domain` | Las reglas de dinero |
| `packages/slicer-files` | Lector de `.gcode.3mf` |

## Cosas comprobadas que parecen mentira

- En un archivo laminado de Bambu, **la purga y la torre de limpieza ya vienen incluidas** en los gramos que reporta. No las sumes aparte. Se verificó sobre archivos reales: la purga era el 28.7 % de una placa de tres colores.
- Usa `prediction` como tiempo de impresión, no "model printing time".
- Una columna `date` llega como `"2026-10-04"`, y `new Date("2026-10-04")` la interpreta en UTC, que en Lima es la tarde anterior. Hay que construirla como fecha local.
- Vender **una** unidad suelta es antieconómico: para una tapa se imprime una placa de nueve. Por eso existe la escalera de precios y por eso el hito M4 importa.
