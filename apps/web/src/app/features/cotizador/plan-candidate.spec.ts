import { candidateLine, candidateQuantity, customWork, sameCandidates } from './plan-candidate';
import type { LineDraft, PlateDraft } from './quote-model';

const labels: Record<string, string> = { rosado: 'PLA Rosado' };
const filamentLabel = (skuId: string): string | null => labels[skuId] ?? null;

const plate = (overrides: Partial<PlateDraft> = {}): PlateDraft => ({
  label: 'Calavera',
  printTimeSeconds: 5400,
  unitsPerRun: 7,
  source: 'file',
  sourceFileName: 'Skull_-_AMS.gcode.3mf',
  filaments: [
    { slot: 1, grams: 12.5, colorHex: '#F5A3C7', type: 'PLA', trayInfoIdx: 'GFA00', filamentSkuId: 'rosado' },
    { slot: 2, grams: 3, colorHex: '#000000', type: 'PLA', trayInfoIdx: null, filamentSkuId: null },
  ],
  ...overrides,
});

const line = (overrides: Partial<LineDraft> = {}): LineDraft => ({
  description: 'Calavera de Halloween',
  variantId: null,
  quantity: 14,
  setupMinutes: 10,
  minutesPerUnit: 2,
  plates: [plate()],
  supplies: [
    { label: 'Bolsa con etiqueta', inventoryItemId: 'bolsa', scope: 'unit', quantity: 1, unitCost: 0.5 },
    { label: 'Caja de envío', inventoryItemId: null, scope: 'batch', quantity: 1, unitCost: 3 },
  ],
  ...overrides,
});

describe('a calculator line, as the plan reads it', () => {
  it('asks for a catalogue line by its variant: its recipe says how it is made', () => {
    expect(candidateLine(line({ variantId: 'v-pocion', description: 'Botella de poción' }), filamentLabel)).toEqual({
      description: 'Botella de poción',
      quantity: 14,
      variantId: 'v-pocion',
      custom: null,
    });
  });

  it('turns made-to-order plates and supplies into the work the plan places', () => {
    expect(candidateLine(line(), filamentLabel)).toEqual({
      description: 'Calavera de Halloween',
      quantity: 14,
      variantId: null,
      custom: {
        plates: [
          {
            label: 'Calavera',
            printSeconds: 5400,
            unitsPerRun: 7,
            filaments: [
              { skuId: 'rosado', label: 'PLA Rosado', grams: 12.5 },
              { skuId: null, label: 'PLA #000000', grams: 3 },
            ],
          },
        ],
        supplies: [
          { itemId: 'bolsa', label: 'Bolsa con etiqueta', scope: 'unit', quantity: 1 },
          { itemId: null, label: 'Caja de envío', scope: 'batch', quantity: 1 },
        ],
        setupMinutes: 10,
        minutesPerUnit: 2,
        printedUnits: 0,
      },
    });
  });

  it('reads less than one unit per run as one, like the database does once the quote is sent', () => {
    const work = customWork(line({ plates: [plate({ unitsPerRun: 0.5 }), plate({ unitsPerRun: Number.NaN })] }), filamentLabel);
    expect(work.plates.map((p) => p.unitsPerRun)).toEqual([1, 1]);
  });

  it('names a filament with no SKU and nothing from the file as the database does', () => {
    const bare = plate({ filaments: [{ slot: 1, grams: 4, colorHex: null, type: null, trayInfoIdx: null, filamentSkuId: '' }] });
    expect(customWork(line({ plates: [bare] }), filamentLabel).plates[0]?.filaments).toEqual([
      { skuId: null, label: 'Filamento', grams: 4 },
    ]);
  });

  it('has nothing to ask without a quantity, or made to order without plates', () => {
    expect(candidateLine(line({ quantity: 0 }), filamentLabel)).toBeNull();
    expect(candidateLine(line({ quantity: Number.NaN }), filamentLabel)).toBeNull();
    expect(candidateLine(line({ plates: [] }), filamentLabel)).toBeNull();
  });

  it('counts whole units, as the quote stores them', () => {
    expect(candidateQuantity(2.6)).toBe(3);
    expect(candidateQuantity(0.4)).toBeNull();
  });

  it('asks again only when the answer could change', () => {
    const a = candidateLine(line(), filamentLabel);
    expect(sameCandidates([a, null], [candidateLine(line(), filamentLabel), null])).toBe(true);
    expect(sameCandidates([a], [candidateLine(line({ quantity: 15 }), filamentLabel)])).toBe(false);
  });
});
