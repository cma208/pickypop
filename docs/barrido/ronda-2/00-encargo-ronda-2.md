# Ronda 2 — encargo

Ya están los seis informes de la ronda 1, en `docs/barrido/ronda-1/`:

1. `1-persona-nueva.md` — hizo siete tareas reales sin leer nada antes
2. `2-pedido-a-entrega.md` — el flujo de la cotización a la entrega
3. `3-inventario-y-compras.md` — stock, compras, kardex y costo
4. `4-produccion.md` — cola, placas, rollos, impresoras
5. `5-venta-y-cobro.md` — trato, cotización, pedido, cobro y finanzas
6. `6-visual.md` — las 26 rutas, las fotos y la consistencia

**Lee los cinco que no son tuyos, enteros.** Después vuelve a leer la sección "Aclaración del dueño" de `docs/barrido/00-encargo.md`: allí está la decisión de la opción B, en producción.

## Lo que ya está comprobado (no lo discutas, constrúyelo)

- Aceptar una cotización no crea el pedido, y una línea a medida no cabe en un pedido (`pedido-linea.ts:21`).
- Nada descuenta lo prometido; entregar no saca nada del estante.
- Cerrar una impresión mete la placa completa: `units_produced` se guarda después de `complete_print_job` (`produccion.data.ts:395` contra `parts_and_assembly.sql:210`).
- Registrar una compra no registra el pago, y desde Caja no se puede ligar uno (esto está publicado).
- El cotizador carga la escalera de precios y no la usa; el pedido sí (esto también está publicado).
- A una pieza impresa no se le puede cargar foto desde ninguna pantalla.

## Respuestas del dueño (llegaron al empezar la ronda 2; mandan sobre cualquier informe)

1. **Horario de impresión:** una placa puede **empezar entre las 6:00 y las 23:00**, siempre que **termine antes de medianoche**. Una placa de 3 horas puede empezar a las 21:00 como tarde; si no cabe, espera a las 6:00 del día siguiente. El horario va a cambiar con el tiempo, así que es **configurable**, no una constante.
2. **El separo, con plazo:** lo comprometido para un cliente que todavía no cierra queda apartado **por un tiempo corto**, como quien separa el filamento. Pasado ese plazo, si no cerró, ese material **vuelve a estar disponible** para otra proforma u otro pedido. Hay que poder **acortar el plazo a cero a mano**. La idea es no frenar el negocio si el cliente no decide. El dueño habla de "proforma o pedido": el separo vale tanto para una proforma como para un pedido en espera. El plazo por defecto todavía no está decidido; propón uno.
3. **Prioridad:** **el que confirma primero tiene más peso**, pero no siempre manda. La persona tiene que poder elegir otro pedido igual, y el sistema le avisa algo como **"María Pérez hizo un separo antes"**. Es decir, el orden de confirmación es lo que propone el sistema, y una persona puede cambiarlo con un aviso a la vista.

**Lo que esto resuelve:** la contradicción 1 queda decidida (orden de confirmación por defecto, con la opción de cambiarlo a mano). La 2 queda acotada: un separo tiene **vencimiento**, y la cuenta tiene que tomarlo en cuenta (lo vencido ya no está comprometido). Discutan si eso se calcula o se escribe, pero con el vencimiento adentro.

## Contradicciones que ya vi entre los informes (resuélvelas con argumentos, y busca otras)

1. **¿A qué pedido le toca primero lo que hay?** "Pedido a entrega" reparte el estante por orden de confirmación; "Producción" calcula el pedido de cada trabajo de catálogo por fecha de entrega, como Katana. Tiene que ser una sola regla, y la cuenta de ventas y la de producción tienen que dar lo mismo.
2. **¿Se escribe la reserva o se calcula?** Tres informes dicen que se calcule a partir de los pedidos abiertos. Los movimientos `reservation` y `release` ya existen en el esquema. ¿Se usan, se quitan o se dejan quietos?
3. **¿De dónde sale la foto de una pieza?** De la miniatura que trae el `.gcode.3mf` (`Metadata/plate_N.png`), o la sube una persona, o ambas cosas.
4. **¿Dónde vive el "¿para cuándo?"?** En el cotizador, en el pedido nuevo, en el panel de aceptar o en todos. Y si sale de una sola cuenta en la base, ¿quién es su dueño?
5. **¿La compra crea su egreso sola, o se liga desde Caja?** ¿Y qué pasa con la compra a crédito o la que se paga después?

## Formato

Escribe en `docs/barrido/ronda-2/<el mismo número y nombre que tu informe de la ronda 1>.md`. **No edites tu informe de la ronda 1**: el cambio de opinión tiene que quedar a la vista.

```markdown
# <Tu mirada> — ronda 2

## De acuerdo
(qué de los otros refuerza o completa lo tuyo; cita el informe y el hallazgo, por ejemplo "3·H2")

## En desacuerdo
(con qué no estás de acuerdo y por qué, con evidencia; un argumento con evidencia pesa más que tres opiniones)

## Las contradicciones
(tu posición sobre cada una de las cinco de arriba, y cualquier otra que hayas encontrado)

## Lo que cambio de mi informe
(qué retiras, qué corriges y qué subes o bajas de gravedad)

## Si solo se pudieran hacer cinco cosas
(en orden; para cada una, qué tarea del dueño destraba y por qué antes que la siguiente)
```

Escribe en español, con el mismo rigor de la ronda 1: `archivo:línea`, consultas o enlaces. No toques código ni la base, salvo consultas de lectura.
