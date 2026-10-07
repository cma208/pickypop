import {
  amountsText,
  buyText,
  compareReady,
  forOrdersText,
  holdText,
  readyLine,
  readyPhrase,
  saleBuyText,
  saleSituation,
  withoutHoldsText,
} from './promise-text';

// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';
// Wednesday 7 October, 18:00 in Lima.
const WEDNESDAY_18 = '2026-10-07T23:00:00.000Z';
// Friday 9 October, 17:36 in Lima.
const FRIDAY = '2026-10-09T22:36:00.000Z';

describe('the words of ¿para cuándo? when selling', () => {
  it('says a day and an hour the customer can be told', () => {
    expect(readyPhrase('2026-10-07T03:52:00.000Z', NOW)).toBe('hoy 22:52');
    expect(readyPhrase('2026-10-07T12:20:00.000Z', NOW)).toBe('mañana 07:20');
    expect(readyPhrase(FRIDAY, NOW)).toBe('el viernes 9 de octubre, 17:36');
    expect(readyLine(FRIDAY, NOW)).toBe('Listo el viernes 9 de octubre, 17:36');
    expect(readyLine(NOW, NOW)).toBe('Listo ya');
  });

  it('says the shelf even when it gives nothing', () => {
    expect(saleSituation({ quantity: 6, onShelf: 0, toAssemble: 0, toMake: 6 })).toBe('0 en el estante · 6 por imprimir');
    expect(saleSituation({ quantity: 6, onShelf: 4, toAssemble: 0, toMake: 2 })).toBe('4 en el estante · 2 por imprimir');
    expect(saleSituation({ quantity: 6, onShelf: 0, toAssemble: 0, toMake: 6 }, true)).toBe('6 por imprimir');
  });

  it('names who holds what, until a day and an hour, and what happens then', () => {
    const amounts = [
      { itemId: 'pocion', label: 'Botella de poción', amount: 4, unit: 'unidad' },
      { itemId: 'dulces', label: 'Dulces surtidos', amount: 264, unit: 'g' },
    ];
    expect(amountsText(amounts)).toBe('4 unidades de Botella de poción y 264 g de Dulces surtidos');
    const hold = { kind: 'quote' as const, number: 'COT-0004', customerName: 'María Pérez', holdUntil: WEDNESDAY_18, filaments: [], printing: false };
    expect(holdText({ ...hold, amounts })).toBe(
      'Separado para María Pérez (COT-0004) hasta el miércoles 7 de octubre, 18:00: 4 unidades de Botella de poción y 264 g de Dulces surtidos. Si no confirma, se libera a esa hora.',
    );
    expect(holdText({ ...hold, kind: 'order', number: 'PED-0008', customerName: null, amounts: amounts.slice(0, 1) })).toBe(
      'Separado para PED-0008 hasta el miércoles 7 de octubre, 18:00: 4 unidades de Botella de poción. Si el pedido sigue en espera, se libera a esa hora.',
    );
    expect(
      holdText({
        ...hold,
        amounts: [],
        filaments: [{ itemId: 'rosado', label: 'PLA Rosado', amount: 550.02, unit: 'g' }],
        printing: true,
      }),
    ).toBe(
      'Separado para María Pérez (COT-0004) hasta el miércoles 7 de octubre, 18:00: 550.02 g de PLA Rosado y su turno en la impresora. Si no confirma, se libera a esa hora.',
    );
    expect(withoutHoldsText({ holds: [{ ...hold, amounts }], readyWithoutHolds: FRIDAY }, NOW)).toBe(
      'Si no confirma, listo el viernes 9 de octubre, 17:36.',
    );
    expect(withoutHoldsText({ holds: [], readyWithoutHolds: null }, NOW)).toBeNull();
    expect(forOrdersText(amounts.slice(1))).toBe('Ya es de pedidos confirmados: 264 g de Dulces surtidos del estante.');
  });

  it('says what to buy without forbidding the sale', () => {
    expect(
      buyText({
        needsPurchase: true,
        shortages: [{ kind: 'filament', id: 'rosado', label: 'PLA Rosado', missing: 120, unit: 'g' }],
      }),
    ).toBe('Antes hay que comprar 120 g de PLA Rosado.');
    expect(buyText({ needsPurchase: false, shortages: [] })).toBeNull();
  });

  it('says one amount per thing to buy for the whole sale, however many lines lack it', () => {
    const lacking = (missing: number) => ({
      plan: {
        lineId: 'l',
        description: 'Botella de poción',
        quantity: 2,
        onShelf: 0,
        toAssemble: 0,
        toMake: 2,
        components: [],
        shortages: [{ kind: 'item' as const, id: 'dulces', label: 'Dulces surtidos', missing, unit: 'g' }],
        readyAt: FRIDAY,
        readyAtIfFailure: FRIDAY,
        needsPurchase: true,
      },
      madeToOrder: false,
      holds: [],
      forOrders: [],
      readyWithoutHolds: null,
    });
    expect(saleBuyText({ lines: [lacking(132), null, lacking(264)] })).toBe('Antes hay que comprar 396 g de Dulces surtidos.');
    expect(saleBuyText({ lines: [null] })).toBeNull();
  });

  it('compares what the customer heard with today, only when it moved', () => {
    expect(compareReady(null, FRIDAY, NOW)).toEqual({ quoted: null, today: 'el viernes 9 de octubre, 17:36', later: false });
    expect(compareReady(FRIDAY, '2026-10-09T22:36:40.000Z', NOW)).toEqual({
      quoted: null,
      today: 'el viernes 9 de octubre, 17:36',
      later: false,
    });
    expect(compareReady(WEDNESDAY_18, FRIDAY, NOW)).toEqual({
      quoted: 'el miércoles 7 de octubre, 18:00',
      today: 'el viernes 9 de octubre, 17:36',
      later: true,
    });
    // What was promised is a moment of the past, said as such even after it went by.
    expect(compareReady('2026-10-05T15:00:00.000Z', NOW, NOW)).toEqual({
      quoted: 'el lunes 5 de octubre, 10:00',
      today: 'ya',
      later: true,
    });
  });
});
