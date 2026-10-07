import type { PlanLinePlan } from '@pickypop/domain';
import { lineSituation, promiseSentence, readyText, shortageText } from './plan-format';

// Tuesday 6 October 2026, 18:00 in Lima.
const NOW = '2026-10-06T23:00:00.000Z';

const line = (overrides: Partial<PlanLinePlan> = {}): PlanLinePlan => ({
  lineId: 'l1',
  description: 'Botella de poción',
  quantity: 10,
  onShelf: 4,
  toAssemble: 2,
  toMake: 4,
  components: [],
  shortages: [],
  readyAt: '2026-10-07T03:52:00.000Z',
  readyAtIfFailure: '2026-10-07T03:52:00.000Z',
  needsPurchase: false,
  ...overrides,
});

describe('plan vocabulary', () => {
  it('says a sale line in the three words of the shop, leaving out what is zero', () => {
    expect(lineSituation(line())).toBe('4 en el estante · 2 por armar · 4 por fabricar');
    expect(lineSituation(line({ onShelf: 0, toAssemble: 0, toMake: 6 }))).toBe('6 por fabricar');
    expect(lineSituation(line({ onShelf: 0, toAssemble: 0, toMake: 0 }))).toBe('Nada que preparar');
  });

  it('says a moment as a day and an hour, in Lima', () => {
    expect(readyText('2026-10-07T03:52:00.000Z', NOW)).toBe('hoy 22:52');
    expect(readyText('2026-10-07T12:20:00.000Z', NOW)).toBe('mañana 07:20');
    expect(readyText('2026-10-08T15:18:00.000Z', NOW)).toBe('jueves 8 de octubre, 10:18');
    expect(readyText(NOW, NOW)).toBe('ya');
  });

  it('lists what has to be bought', () => {
    expect(
      shortageText([
        { kind: 'item', id: 'd', label: 'Dulces surtidos', missing: 140, unit: 'g' },
        { kind: 'filament', id: 's', label: 'PLA Rosado', missing: 12.76, unit: 'g' },
      ]),
    ).toBe('140 g de Dulces surtidos y 12.76 g de PLA Rosado');
    expect(shortageText([{ kind: 'item', id: 'b', label: 'Bolsa', missing: 1, unit: 'unidad' }])).toBe(
      '1 unidad de Bolsa',
    );
    expect(shortageText([{ kind: 'item', id: 'd', label: 'Dulces surtidos', missing: 2384, unit: 'g' }])).toBe(
      '2.38 kg de Dulces surtidos',
    );
  });

  it('answers "¿para cuándo?" in one sentence that informs and never forbids', () => {
    expect(promiseSentence(line(), NOW)).toBe('4 en el estante · 2 por armar · 4 por fabricar. Estaría hoy 22:52.');
    expect(
      promiseSentence(
        line({
          readyAtIfFailure: '2026-10-07T04:50:00.000Z',
          needsPurchase: true,
          shortages: [{ kind: 'item', id: 'd', label: 'Dulces surtidos', missing: 140, unit: 'g' }],
        }),
        NOW,
      ),
    ).toBe(
      '4 en el estante · 2 por armar · 4 por fabricar. Estaría hoy 22:52. Si falla una placa, hoy 23:50. Antes hay que comprar 140 g de Dulces surtidos.',
    );
  });
});
