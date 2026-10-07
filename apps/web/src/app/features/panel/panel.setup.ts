/**
 * «Primeros pasos»: what a new workshop still has to load before the rest of
 * the app can answer anything. Without cost parameters nothing can be
 * quoted, without a printer the plan has no dates, without filaments no
 * plate can be costed and without products there is nothing to sell.
 */

/** How much of each thing the workshop has. Only zero matters. */
export interface SetupCounts {
  /** Cost parameters in force today. */
  profiles: number;
  /** Printers that are not retired. */
  printers: number;
  filaments: number;
  /** Products in the catalogue, not archived. */
  products: number;
}

export interface FirstStep {
  key: keyof SetupCounts;
  title: string;
  /** Why it is needed, in one line. */
  why: string;
  route: string;
}

/** In the order they are best done: each one needs the ones before. */
const STEPS: FirstStep[] = [
  {
    key: 'profiles',
    title: 'Parámetros de costo',
    why: 'Luz, mano de obra, merma y margen: sin ellos no se puede cotizar.',
    route: '/configuracion',
  },
  {
    key: 'printers',
    title: 'La impresora',
    why: 'Su costo por hora entra en cada placa, y el plan la necesita para dar fechas.',
    route: '/impresoras',
  },
  {
    key: 'filaments',
    title: 'Los filamentos',
    why: 'Marca, material y color de cada rollo, para costear el material.',
    route: '/inventario/filamentos',
  },
  {
    key: 'products',
    title: 'Los productos',
    why: 'Lo que se vende, con su receta y su precio.',
    route: '/catalogo',
  },
];

/** What is still missing, in order. Empty once the workshop is set up. */
export function firstSteps(counts: SetupCounts): FirstStep[] {
  return STEPS.filter((step) => counts[step.key] === 0);
}
