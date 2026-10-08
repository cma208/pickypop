import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FinanzasData } from './finanzas.data';
import { ResultadosPage } from './resultados.page';
import type { MonthResult } from './results';

/** A month with a mould, a short shelf count and a roll discarded with filament on it. */
const OCTOBER: MonthResult = {
  month: '2026-10-01',
  sales: 500,
  costOfSales: 200,
  grossProfit: 300,
  operatingExpenses: 20,
  netProfit: 192.28,
  otherIncome: 0,
  inventoryPurchases: 0,
  ownerContributions: 0,
  ownerDraws: 0,
  unsoldProduction: 87.72,
  toolsAndTests: 7.72,
  shelfCountLosses: 15,
  failedPrints: 0,
  uncoveredFailedPrints: 0,
  stockWrittenOff: 65,
  printCost: 0,
  failureReserveRate: 0.1,
};

async function open(months: MonthResult[]): Promise<ComponentFixture<ResultadosPage>> {
  TestBed.configureTestingModule({
    providers: [{ provide: FinanzasData, useValue: { incomeStatement: async () => months } }],
  });
  const fixture = TestBed.createComponent(ResultadosPage);
  for (let round = 0; round < 4; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return fixture;
}

const text = (fixture: ComponentFixture<ResultadosPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('ResultadosPage, what was never sold', () => {
  it('shows every part of it, so the parts add up to the line (ADR-023, point 7)', async () => {
    const fixture = await open([OCTOBER]);

    const page = text(fixture);
    expect(page).toContain('Producción no vendida');
    expect(page).toContain('pruebas e impresiones de pedidos cancelados: S/ 7.72');
    expect(page).toContain('conteo del estante: S/ 15.00');
    expect(page).toContain(
      'lo que salió del inventario sin venderse (rollos agotados o descartados, pesajes, mermas y conteos a mano): S/ 65.00',
    );
    expect(page).toContain('−S/ 87.72');
  });

  it('says when weighings and counts found more than went missing', async () => {
    const fixture = await open([{ ...OCTOBER, unsoldProduction: 20.72, stockWrittenOff: -2, netProfit: 259.28 }]);

    expect(text(fixture)).toContain('conteos a mano): -S/ 2.00 (sobró más de lo que faltó)');
  });

  it('leaves the part out of a month where nothing left the inventory', async () => {
    const fixture = await open([{ ...OCTOBER, unsoldProduction: 22.72, stockWrittenOff: 0, netProfit: 257.28 }]);

    expect(text(fixture)).not.toContain('lo que salió del inventario sin venderse (');
  });
});
