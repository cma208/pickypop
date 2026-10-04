import { lacksRecordedCost, toCostSource, type SupplyCostSource } from './supply-costs';

const option = (id: string, costSource: SupplyCostSource) => ({ id, costSource });
const options = [option('sweets', 'standard'), option('bag', 'purchase'), option('nozzle', 'unknown')];

describe('toCostSource', () => {
  it('keeps the sources the view can report', () => {
    expect(toCostSource('purchase')).toBe('purchase');
    expect(toCostSource('standard')).toBe('standard');
  });

  it('reads anything else as unknown', () => {
    expect(toCostSource('unknown')).toBe('unknown');
    expect(toCostSource(null)).toBe('unknown');
    expect(toCostSource('guess')).toBe('unknown');
  });
});

describe('lacksRecordedCost', () => {
  it('flags a stock item with no cost on record', () => {
    expect(lacksRecordedCost({ inventoryItemId: 'nozzle', unitCost: 0 }, options)).toBe(true);
  });

  it('does not flag items that have a purchase or a standard cost', () => {
    expect(lacksRecordedCost({ inventoryItemId: 'sweets', unitCost: 0.015 }, options)).toBe(false);
    expect(lacksRecordedCost({ inventoryItemId: 'bag', unitCost: 0.5 }, options)).toBe(false);
  });

  it('stops flagging once the person types a price', () => {
    expect(lacksRecordedCost({ inventoryItemId: 'nozzle', unitCost: 3 }, options)).toBe(false);
  });

  it('never flags a free-text supply', () => {
    expect(lacksRecordedCost({ inventoryItemId: null, unitCost: 0 }, options)).toBe(false);
  });

  it('flags an item the picker does not know, since it cannot be priced', () => {
    expect(lacksRecordedCost({ inventoryItemId: 'gone', unitCost: 0 }, options)).toBe(true);
  });
});
