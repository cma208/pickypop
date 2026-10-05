import { previewMachineRate } from './printer-rate';

describe('previewMachineRate', () => {
  it('reproduces the workshop A1 mini: S/ 0.42 an hour', () => {
    // 1500 / 5000 h of life = 0.30, plus 240 / 2000 h per year = 0.12.
    const preview = previewMachineRate({
      assetCost: 1500,
      usefulLifeHours: 5000,
      maintenanceBudgetPerYear: 240,
      expectedHoursPerYear: 2000,
    });

    expect(preview.ratePerHour).toBe(0.42);
    expect(preview.gaps).toEqual([]);
  });

  it('flags a missing useful life instead of silently dropping depreciation', () => {
    const preview = previewMachineRate({
      assetCost: 1500,
      usefulLifeHours: 0,
      maintenanceBudgetPerYear: 240,
      expectedHoursPerYear: 2000,
    });

    expect(preview.ratePerHour).toBe(0.12);
    expect(preview.gaps).toHaveLength(1);
    expect(preview.gaps[0]).toContain('vida útil');
  });

  it('flags a zero cost and a maintenance budget with no hours behind it', () => {
    const preview = previewMachineRate({
      assetCost: 0,
      usefulLifeHours: 5000,
      maintenanceBudgetPerYear: 240,
      expectedHoursPerYear: 0,
    });

    expect(preview.ratePerHour).toBe(0);
    expect(preview.gaps).toHaveLength(2);
  });
});
