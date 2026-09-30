import { Component, inject, signal } from '@angular/core';
import { Workshop, type CatalogProduct, type FilamentStock, type PrinterSummary } from '../../core/workshop';

@Component({
  selector: 'app-panel',
  templateUrl: './panel.html',
  styleUrl: './panel.scss',
})
export class PanelPage {
  private readonly workshop = inject(Workshop);

  protected readonly filaments = signal<FilamentStock[]>([]);
  protected readonly catalog = signal<CatalogProduct[]>([]);
  protected readonly printers = signal<PrinterSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  private readonly grams = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

  constructor() {
    void this.load();
  }

  protected money(amount: number | null, fractionDigits = 2): string {
    if (amount === null) return '—';
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  }

  protected price(amount: number | null): string {
    return amount === null ? '—' : this.soles.format(amount);
  }

  protected weight(value: number): string {
    return `${this.grams.format(value)} g`;
  }

  private async load(): Promise<void> {
    try {
      const [filaments, catalog, printers] = await Promise.all([
        this.workshop.filaments(),
        this.workshop.catalog(),
        this.workshop.printers(),
      ]);

      this.filaments.set(filaments);
      this.catalog.set(catalog);
      this.printers.set(printers);
    } catch {
      this.error.set('No pudimos leer los datos del taller.');
    } finally {
      this.loading.set(false);
    }
  }
}
