# @pickypop/slicer-files

Lee `Metadata/slice_info.config`, el archivo que Bambu Studio guarda dentro de un `.gcode.3mf` laminado, y devuelve por cada placa el tiempo estimado, los gramos y el detalle de cada filamento.

Sin dependencias y sin DOM, así que funciona igual en el navegador y en Node.

```ts
import { parseSliceInfo, totalFilamentGrams } from '@pickypop/slicer-files';

const info = parseSliceInfo(xml);
if (!info.isSliced) throw new Error('Este 3MF es un proyecto: falta exportar el archivo laminado');
```

Detalles aprendidos de archivos reales (ver `docs/01-investigacion.md`):

- `prediction` es el tiempo **total** estimado, no solo el de impresión. Es el que se usa para costear.
- `weight` y `used_g` **ya incluyen la purga y la torre de limpieza**.
- `tray_info_idx` identifica el perfil de Bambu (GFA00 es PLA Basic, GFA01 es PLA Matte). Junto al color hex, sirve para sugerir el rollo del inventario.
- Un `.3mf` de proyecto trae el archivo pero **sin placas**: por eso existe `isSliced`.

Pendiente: descomprimir el `.gcode.3mf` (hoy el paquete recibe el XML ya extraído). Se resolverá en la app web con una librería de ZIP.
