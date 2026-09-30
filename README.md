# Pickypop

Gestión y finanzas para talleres pequeños de impresión 3D. Open source, licencia MIT.

Cotizaciones, catálogo, pedidos, uso personal y regalos, inventario de filamento, mantenimiento y dinero. **No controla impresoras:** el laminado ocurre en Bambu Studio, en la computadora de cada quien, y la plataforma lee el archivo resultante.

> **Estado:** en construcción. Hoy existen el núcleo de dominio y el lector de archivos laminados. La app web y la base de datos vienen después. El [diseño completo](docs/README.md) ya está cerrado.

## Estructura

```
docs/                    Diseño: visión, dominio, modelo de datos, arquitectura y decisiones
packages/domain/         Reglas de negocio: costos, precios e IGV
packages/slicer-files/   Lector de archivos laminados de Bambu Studio
supabase/migrations/     Esquema de la base de datos
supabase/seed.sql        Datos de desarrollo
supabase/tests/          Validación de las migraciones
```

## Requisitos

- Node 22 o superior
- pnpm 9 o superior
- Docker, para levantar la base de datos local

## Comandos

```bash
pnpm install     # instalar dependencias
pnpm test        # pruebas del dominio, del lector y de las migraciones
pnpm test:watch  # pruebas en modo continuo
pnpm typecheck   # revisar tipos
```

Base de datos local, en contenedores:

```bash
pnpm supabase start      # levanta Postgres, Auth, Storage y Studio
pnpm supabase db reset   # aplica las migraciones y carga los datos de prueba
pnpm supabase stop       # apaga todo
```

## Cómo se calcula un precio

```ts
import {
  calculateCost,
  calculatePrice,
  DRAFT_COST_PROFILE_PE,
  DRAFT_PRINTER_A1_MINI,
} from '@pickypop/domain';

const cost = calculateCost(
  {
    printTimeSeconds: 2586, // el "prediction" del laminador
    filaments: [
      { label: 'PLA #F55A74', grams: 5.69, costPerKg: 75 },
      { label: 'PLA #000000', grams: 4.63, costPerKg: 75 },
      { label: 'PLA #DE4343', grams: 1.02, costPerKg: 75 },
    ],
    prepMinutes: 10,
    postMinutes: 5,
    supplies: [{ label: 'Empaque', cost: 1 }],
  },
  DRAFT_COST_PROFILE_PE,
  DRAFT_PRINTER_A1_MINI,
);

cost.total; // 5.49  -> con el desglose completo en cost.material, cost.energy, cost.machine...
calculatePrice(cost.total, DRAFT_COST_PROFILE_PE).total; // 9.50
```

> ⚠️ Los perfiles `DRAFT_*` traen **valores provisionales** (costo de la impresora, hora de trabajo, margen). Hay que reemplazarlos por los reales antes de cotizar de verdad: ver los datos pendientes en [docs/README.md](docs/README.md).

## Documentación

Todo el diseño vive en [`docs/`](docs/README.md): [investigación](docs/01-investigacion.md), [dominio](docs/02-dominio.md), [modelo de datos](docs/03-modelo-de-datos.md), [arquitectura](docs/04-arquitectura.md) y [decisiones](docs/05-decisiones.md).

## Licencia

MIT. Ver [LICENSE](LICENSE).
