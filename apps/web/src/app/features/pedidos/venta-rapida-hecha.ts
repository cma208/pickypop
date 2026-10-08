import { Component, ElementRef, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FORMAT_PIPES } from '../../ui';
import type { SaleDone } from './quick-sale';

/**
 * The answer to «¿se vendió?»: the order it made, what was sold, collected
 * and owed. The screen is ready for the next sale underneath, so this is the
 * only trace of the last one until somebody opens it.
 */
@Component({
  selector: 'app-venta-rapida-hecha',
  imports: [RouterLink, ...FORMAT_PIPES],
  template: `
    <div class="done" role="status" tabindex="-1">
      <p class="title">
        Venta registrada:
        <a [routerLink]="['/pedidos', sale().orderId]">{{ sale().number }}</a>
        · {{ sale().customerName }}
      </p>
      <dl>
        <dt>Vendido</dt><dd class="num">{{ sale().total | money }} <small class="muted">({{ unitsText() }})</small></dd>
        <dt>Cobrado</dt><dd class="num">{{ sale().collected | money }}</dd>
        <dt>Saldo</dt><dd class="num" [class.owed]="sale().owed > 0">{{ sale().owed | money }}</dd>
      </dl>
      @if (sale().owed > 0) {
        <p class="small">Queda en <a routerLink="/finanzas/por-cobrar">Por cobrar</a>.</p>
      }
      <p class="small muted">Salió del estante y quedó entregada. La pantalla está lista para la siguiente venta.</p>
      <button type="button" class="ghost close" (click)="closed.emit()" aria-label="Cerrar el resumen">Cerrar</button>
    </div>
  `,
  styles: `
    .done { position: relative; padding: 0.9rem 1rem; border-radius: var(--radius); background: var(--good-soft); outline: none; }
    .title { margin: 0 4.5rem 0.5rem 0; font-weight: 600; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; margin: 0 0 0.5rem; }
    dt { color: var(--muted); }
    dd { margin: 0; text-align: left; }
    .owed { color: var(--warn); font-weight: 600; }
    .small { margin: 0.25rem 0 0; font-size: var(--fs-sm); }
    .close { position: absolute; top: 0.5rem; right: 0.5rem; min-height: var(--control-h-compact); }
  `,
})
export class VentaRapidaHecha {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly sale = input.required<SaleDone>();
  readonly closed = output<void>();

  protected unitsText(): string {
    const units = this.sale().units;
    return units === 1 ? '1 producto' : `${units} productos`;
  }

  /** Brings the answer into view: on a phone the button that sold is far below it. */
  show(): void {
    const box = this.host.nativeElement.querySelector<HTMLElement>('.done');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.focus({ preventScroll: true });
  }
}
