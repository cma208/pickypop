import {
  closedBlockers,
  daysIdle,
  DROPPABLE_STAGES,
  isDerived,
  STAGES,
  STAGE_LABEL,
} from './oportunidades.models';

describe('las etapas', () => {
  it('siguen el embudo acordado con el dueño, con Perdido al final', () => {
    expect(STAGES).toEqual(['new', 'quoted', 'negotiating', 'won', 'closed', 'lost']);
  });

  it('tienen todas su nombre en español', () => {
    expect(STAGES.map((stage) => STAGE_LABEL[stage])).toEqual([
      'Nuevo',
      'Cotizado',
      'Negociando',
      'Ganado',
      'Cerrado',
      'Perdido',
    ]);
  });

  it('no deja soltar una tarjeta en Cerrado, porque esa etapa se deriva', () => {
    expect(isDerived('closed')).toBe(true);
    expect(isDerived('won')).toBe(false);
    expect(DROPPABLE_STAGES).not.toContain('closed');
    expect(DROPPABLE_STAGES).toHaveLength(STAGES.length - 1);
  });
});

describe('daysIdle', () => {
  const today = new Date(2026, 9, 6, 9, 0); // 6 de octubre de 2026, 9 de la mañana

  it('cuenta cero el mismo día', () => {
    expect(daysIdle(new Date(2026, 9, 6, 1, 0), today)).toBe(0);
  });

  it('cuenta días de calendario, no periodos de 24 horas', () => {
    // Anoche a las once lleva un día parado, aunque hayan pasado diez horas.
    expect(daysIdle(new Date(2026, 9, 5, 23, 0), today)).toBe(1);
  });

  it('cuenta los días completos de un trato olvidado', () => {
    expect(daysIdle(new Date(2026, 8, 26, 12, 0), today)).toBe(10);
  });

  it('nunca es negativo si algo se movió en el futuro', () => {
    expect(daysIdle(new Date(2026, 9, 9), today)).toBe(0);
  });

  it('cruza el cambio de mes sin equivocarse', () => {
    expect(daysIdle(new Date(2026, 8, 30), new Date(2026, 9, 2))).toBe(2);
  });
});

describe('closedBlockers', () => {
  it('un trato sin pedidos no está cerrado, está empezando', () => {
    expect(closedBlockers({ orders: 0, openOrders: 0, owingOrders: 0 })).toBe(
      'Todavía no hay ningún pedido en este trato.',
    );
  });

  it('no pone pegas cuando todo se entregó y se cobró', () => {
    expect(closedBlockers({ orders: 3, openOrders: 0, owingOrders: 0 })).toBeNull();
  });

  it('dice qué falta entregar', () => {
    expect(closedBlockers({ orders: 2, openOrders: 1, owingOrders: 0 })).toBe('Falta entregar 1 pedido.');
  });

  it('dice qué falta cobrar', () => {
    expect(closedBlockers({ orders: 3, openOrders: 0, owingOrders: 2 })).toBe('Falta cobrar 2 pedidos.');
  });

  it('junta las dos cosas cuando faltan las dos', () => {
    expect(closedBlockers({ orders: 4, openOrders: 2, owingOrders: 3 })).toBe(
      'Falta entregar 2 pedidos y cobrar 3 pedidos.',
    );
  });
});
