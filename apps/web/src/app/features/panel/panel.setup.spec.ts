import { describe, expect, it } from 'vitest';
import { firstSteps } from './panel.setup';

describe('firstSteps', () => {
  it('lists everything for a workshop that has nothing yet, in the order to do it', () => {
    const steps = firstSteps({ profiles: 0, printers: 0, filaments: 0, products: 0 });

    expect(steps.map((step) => [step.title, step.route])).toEqual([
      ['Parámetros de costo', '/configuracion'],
      ['La impresora', '/impresoras'],
      ['Los filamentos', '/inventario/filamentos'],
      ['Los productos', '/catalogo'],
    ]);
  });

  it('only what is still missing', () => {
    expect(firstSteps({ profiles: 1, printers: 1, filaments: 0, products: 3 }).map((step) => step.key)).toEqual([
      'filaments',
    ]);
  });

  it('nothing once the workshop is set up', () => {
    expect(firstSteps({ profiles: 1, printers: 1, filaments: 3, products: 1 })).toEqual([]);
  });
});
