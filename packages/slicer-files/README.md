# @pickypop/slicer-files

Lee `Metadata/slice_info.config`, el archivo que Bambu Studio guarda dentro de un `.gcode.3mf` laminado, y devuelve por cada placa el tiempo estimado, los gramos y el detalle de cada filamento.

También lee `Metadata/plate_N.json` y cuenta los objetos de la placa por nombre, sin la torre de limpieza: `Cap ×7, Body1 ×7`. Es lo que propone qué piezas salen de la placa.

Sin dependencias y sin DOM, así que funciona igual en el navegador y en Node.

```ts
import { parseSliceInfo, totalFilamentGrams } from '@pickypop/slicer-files';

const info = parseSliceInfo(xml);
if (!info.isSliced) throw new Error('Este 3MF es un proyecto: falta exportar el archivo laminado');

parsePlateObjects(plateJson); // [{ name: 'Cap', count: 7 }, { name: 'Body1', count: 7 }], o null si no es ese archivo
```

Detalles aprendidos de archivos reales (ver `docs/01-investigacion.md`):

- `prediction` es el tiempo **total** estimado, no solo el de impresión. Es el que se usa para costear.
- `weight` y `used_g` **ya incluyen la purga y la torre de limpieza**.
- `tray_info_idx` identifica el perfil de Bambu (GFA00 es PLA Basic, GFA01 es PLA Matte). Junto al color hex, sirve para sugerir el rollo del inventario.
- Un `.3mf` de proyecto trae el archivo pero **sin placas**: por eso existe `isSliced`.
- `plate_N.json` lista **cada copia** de un objeto con el mismo nombre, e incluye la torre de limpieza (`wipe_tower`) como un objeto más. No trae gramos por objeto.

El paquete recibe el texto ya extraído. La app web abre el `.gcode.3mf` con su propio lector de ZIP (`apps/web/src/app/core/zip.ts`), en el navegador.
