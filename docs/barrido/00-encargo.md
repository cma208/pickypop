# Barrido de Pickypop — encargo común

Este documento lo leen los seis agentes del barrido del 2026-10-06. Es el mapa: léelo entero antes de empezar, y después lee `AGENTS.md` en la raíz del repositorio, que es el contrato de trabajo.

## Para qué es el barrido

El dueño lo dijo así: **"encontrar el punto donde no se tenga que explicar nada para realizar el trabajo; debe entenderse solo."**

La aplicación parece funcionar, pero tiene huecos en el proceso y en la fluidez. Los detalles visuales todavía dejan mucho que desear, y las imágenes no están en todas partes ni tienen un tamaño que sirva. El dueño ha tenido que repetir las mismas quejas varias veces. La causa es que se arreglaba pantalla por pantalla, donde él señalaba, y los huecos están **entre** las pantallas: en el paso de una a la siguiente.

Tu trabajo **no** es pulir una pantalla. Es encontrar dónde la persona tiene que pensar, adivinar, recordar o escribir de nuevo algo que el sistema ya sabía, y proponer cómo quitarlo. Para eso, compara con lo que hacen las mejores aplicaciones del mercado.

## Qué es Pickypop, en corto

Es un taller de impresión 3D de dos personas en Lima (una Bambu Lab A1 mini con AMS lite, precios en soles) y la aplicación con la que lo gestionan. Venden productos de catálogo, como la "botella de poción": varias piezas impresas, un frasco termoformado, dulces y empaque. También hacen piezas a medida, que cotizan a partir del archivo laminado en Bambu Studio. La aplicación **no** controla la impresora: solo lleva el registro.

Está en producción desde el 2026-10-05. Usa Angular 22 y Supabase (Postgres con seguridad por fila). Las reglas de dinero viven en `packages/domain`.

## El flujo esperado (validado con el dueño)

```
Oportunidad → Cotización → Pedido → ¿ya hay producto armado?  (solo si es de catálogo)
                                     ├─ sí → se aparta del estante ───────────────┐
                                     └─ no → ¿hay piezas e insumos? (según receta) │
                                             ├─ sí → Armar ─────────────┐          │
                                             └─ no → Imprimir lo que falta          │
                                                     (y comprar el insumo)          │
                                                     → Piezas impresas → Armar → Entrega (sale del estante) → Cobro
```

Una pieza a medida, que no está en el catálogo, responde "no" a las dos preguntas y va directo a imprimir.

El plazo de entrega **sale de esas dos preguntas**: si hay stock, se entrega ya; si no, depende del tiempo de impresión y de la cola que haya en ese momento. Es una idea del dueño y no es negociable.

## Tres cortes ya comprobados (no los vuelvas a descubrir: profundiza a partir de ellos)

1. **Aceptar una cotización no crea el pedido.** `orders.quote_id` existe, pero nada en `apps/web/src/app/features/pedidos/` lo lee ni lo escribe, así que el pedido se vuelve a escribir a mano.
2. **Nadie mira ni aparta el stock.** Los movimientos `reservation` y `release` existen y las vistas calculan `reserved` y `available` (`supabase/migrations/20260929231000_inventory.sql:200`), pero nada escribe nunca una reserva: "disponible" siempre es igual a "en mano". El botón "Crear trabajo" del pedido (`pedido.page.ts:116`) va línea por línea y no sabe si ya hay stock.
3. **Entregar no descuenta el producto armado.** `set_order_status` (`20261007110000_order_status_history.sql:116`) solo anota el historial. Armar produce stock de producto terminado, pero nada lo consume, así que el estante solo crece.

Y uno más en lo visual: `pp-thumb` (la foto de un artículo) aparece en 5 de las 25 pantallas, y en algunas a 28 px (`size="sm"`), un tamaño que no sirve para distinguir una botella de una tapa. Además carga una imagen de 1024 px para pintar 28.

## Lo que el dueño ya decidió o pidió

- **Una pieza suelta no tiene que pasar por "Armar".** Hoy sí pasa, porque una placa solo puede producir artículos de tipo `part` (`20261008110000_parts_and_assembly.sql:42`). La receta dirá si el producto se arma; si no lleva nada más, la impresión deja el producto listo. **Aprobado.**
- **Decidido (ver la aclaración de abajo): opción B, en producción.** Antes era una pregunta abierta: cuando falta producto, ¿el sistema propone los trabajos de impresión o solo avisa? Hay tres opciones. A: solo avisa "faltan 6". B: lee la receta y la cola y propone las placas; la persona elige impresora y rollos y acepta, y los trabajos entran a la cola ligados al pedido. C: los crea solo, sin preguntar. La recomendación es B. **Trae evidencia de cómo lo resuelven otros.**
- **Referencias:** el dueño no tiene una aplicación concreta en mente. Busca en internet más allá de las que te nombro.
- **Regla permanente: todo artículo se muestra con su foto en cualquier lista donde aparezca** (producto, variante, pieza, insumo, empaque, repuesto), y a un tamaño que sirva para reconocerlo.
- **Catálogo no es stock.** Un producto puede existir en el sistema sin que haya ni una unidad.

## Aclaración del dueño: la venta y la producción van por lados distintos

Llegó con los agentes ya trabajando, y cambia el análisis:

> Alguien puede pedir 10 pociones y solo tengo 4 armadas, pero el sistema debe poder avisar que tenemos material suficiente para imprimir lo que falta, así el vendedor puede decidir si cierra la venta o hace la proforma. Incluso si no tuviera el material, es decisión del vendedor, porque él debe saber si puede conseguir los materiales y las piezas en el tiempo que el sistema le indique que va a demorar.

Lo que significa:

- **Al vender o cotizar, el sistema informa y nunca bloquea.** Dice cuántas hay armadas, cuántas hay que fabricar, si alcanza el material (filamento por color, piezas en el estante, dulces, frascos, empaque) o **qué falta exactamente**, y **en cuánto tiempo** estaría (impresión más la cola actual). El vendedor decide si hace la proforma o cierra la venta. En el mercado esto se llama *capable-to-promise* (capaz de prometer), que va más allá de *available-to-promise* (lo que hay en el estante).
- **La producción tiene su propio lado.** El pedido no empuja trabajos a la cola: la producción ve **la demanda de todos los pedidos cerrados** y decide qué imprimir. **Confirmado por el dueño: opción B, en la pantalla de producción.** El sistema suma lo que falta de todos los pedidos cerrados y propone las placas (cuántas, de qué y con qué filamento). La persona del taller elige impresora, rollos y orden, y acepta.
- **Consecuencia que hay que resolver:** para que "alcanza el material" sea verdad, lo que ya prometió un pedido cerrado tiene que descontarse del cálculo del siguiente. Si no, dos ventas prometen el mismo rollo rojo. Es el segundo corte (nadie aparta el stock).

**Más respuestas del dueño (durante la ronda 2):** se imprime de 6:00 a 23:00 y la placa tiene que terminar antes de medianoche (configurable); un separo dura un plazo corto, después se libera, y se puede acortar a cero a mano; el que confirma primero tiene prioridad, pero se puede elegir otro con un aviso de quién separó antes. El detalle está en `ronda-2/00-encargo-ronda-2.md`.

## Las quejas del dueño en su revisión, resumidas (2026-10-06)

Se arreglaron, pero muestran cómo mira la aplicación:

- La cola de impresión y el historial eran una sola cosa. Pidió que cada trabajo tenga la foto de lo que produce, el avance en porcentaje, a qué pedido pertenece, y **lo que falta imprimir para cumplir los pedidos**.
- El producto tenía un campo "plazo de entrega" que no tenía sentido: el plazo sale del stock y de la cola, no de la ficha del producto.
- Quería clonar una variante en lugar de cargarla desde cero. La pantalla saltaba al cambiar de variante. No sabía qué poner en "SKU". Preguntó por qué tenía que escribir a mano los datos de impresión si el archivo laminado ya los trae.
- Su caso real: dos botellas termoformadas (poción de amor y poción venenosa), hechas de varias piezas, con dulces en tres combinaciones. Primero carga cada pieza; después arma el producto completo.
- "Armar productos" tenía que ser visual: elegir el producto terminado por su foto, decir cuántos, y ver si alcanza el stock.
- Separar insumos de empaque.
- Registrar una compra eligiendo el artículo por su foto y buscando por escrito, porque la lista va a crecer mucho.
- Había cosas que solo se podían cargar por la base de datos.

## Cómo trabajar

- **No toques código, configuración ni migraciones.** Solo lees, usas la aplicación y escribes tu informe.
- **Aplicación local:** http://localhost:4200 (ya está levantada). Las credenciales de prueba están en `supabase/seed.sql`, en el bloque `insert into auth.users`. **No escribas la contraseña en tu informe.**
- **Base local:** `docker exec supabase_db_pickypop psql -U postgres -d postgres -c "..."`. Nunca corras `supabase db reset`.
- **Navegador:** solo lo usan los agentes "Persona nueva" y "Visual". Cada uno abre **su propia pestaña** con `tabs_create` y pasa siempre su `tabId`. Si cambias el tamaño de la ventana, al terminar vuelve a `desktop`.
- **Datos de prueba:** el agente "Persona nueva" crea datos mientras los demás trabajan. Todo lo suyo lleva el nombre de cliente **"María Barrido"**. Si lo ves, no es un error. Al terminar lo borra.
- **Evidencia, no impresiones.** Cada hallazgo lleva `archivo:línea`, una consulta SQL con su resultado, o una descripción exacta de lo que se ve en pantalla. Nada de "probablemente".
- **Referencias externas con enlace.** Nombra la aplicación y enlaza la página o la documentación donde lo viste. Si algo no lo pudiste verificar, dilo.
- **El foco es que lo que ya existe fluya y se entienda solo**, no agregar módulos. Si propones algo nuevo, di qué tarea concreta destraba.
- Escribe en español. Los nombres de archivos, tablas y funciones van tal cual.

## Formato del informe de la ronda 1

Escribe en `docs/barrido/ronda-1/<tu-archivo>.md`:

```markdown
# <Tu mirada> — ronda 1

## En cinco líneas
(lo más importante que encontraste, para alguien que no va a leer más)

## Hallazgos
(ordenados por gravedad, el más grave primero)

### H1. <título corto, en palabras del dueño>
- **Qué pasa:** … (evidencia)
- **Qué tarea traba:** la persona quiere ___ y tiene que ___
- **Cómo lo resuelven otros:** <App> — qué hace — <enlace>
- **Propuesta:** …
- **Tamaño:** S (horas) · M (un día) · L (varios días)
- **Gravedad:** bloquea · confunde · afea

## Referencias revisadas
| Aplicación | Por qué sirve de referencia | Qué tomar | Qué NO tomar | Enlace |

## Lo que no hay que copiar
(lo que hacen otros y que aquí estorbaría: es un taller de dos personas, no una fábrica)

## Preguntas para el dueño
(solo las que cambian lo que se construye, cada una con tu recomendación)
```

## Ronda 2

Cuando los seis terminen, te voy a pasar los otros cinco informes. Ahí vas a escribir con qué estás de acuerdo, con qué no y por qué, y qué cambiarías del tuyo. No es una votación: un argumento con evidencia pesa más que tres opiniones.
