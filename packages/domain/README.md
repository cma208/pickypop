# @pickypop/domain

Las reglas de negocio de Pickypop, en TypeScript puro y sin dependencias: lo usan la app web, el servidor MCP y las funciones del servidor, para que exista **una sola fórmula** en todo el sistema.

| Módulo | Qué resuelve |
|---|---|
| `cost.ts` | Costo de una placa: material, energía, máquina, margen por fallos, mano de obra e insumos |
| `price.ts` | Precio: margen sobre el precio, ajustes, mínimo, comisión de canal, IGV y redondeo |
| `money.ts` | Redondeo a céntimos y a múltiplos comerciales |
| `profiles.ts` | Perfiles de partida (⚠️ con valores provisionales) |

Reglas que conviene no romper:

1. El costo y el precio se calculan por separado.
2. Cada componente se redondea a céntimos, para que el desglose que ve el cliente **sume exacto**.
3. El margen va **sobre el precio** (`costo / (1 - margen)`), no como recargo sobre el costo.
4. Los gramos del laminador **ya incluyen la purga**, así que la merma solo cubre cebado y restos de rollo.
