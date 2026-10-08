import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Card, Item } from '../../ui';
import type { InventoryItemSummary } from './inventario.data';
import { quantity } from './inventario.format';

/** What is left of a switched-off piece: it may still sit on the shelf. */
export function inactivePartLine(part: Pick<InventoryItemSummary, 'onHand' | 'unit'>): string {
  if (part.onHand <= 0) return 'Sin unidades en el estante';
  return `${part.onHand === 1 ? 'Queda' : 'Quedan'} ${quantity(part.onHand, part.unit)} en el estante`;
}

/**
 * The pieces that were switched off. `part_stock` keeps only the active ones,
 * so a piece switched off by mistake vanished from Piezas impresas, from the
 * recipes and from the shelf count, and no screen could bring it back. They
 * wait here, with their photo, one click away from coming back.
 */
@Component({
  selector: 'app-piezas-desactivadas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Item],
  styles: [
    `
      .lead { margin: 0 0 0.75rem; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    `,
  ],
  template: `
    <pp-card heading="Desactivadas">
      <p class="lead muted">
        No se ofrecen en las recetas ni se cuentan en el estante. Si alguna se desactivó por error, vuelve a
        activarla aquí.
      </p>
      <ul>
        @for (part of parts(); track part.id) {
          <li>
            <pp-item
              kind="part"
              [path]="part.imagePath"
              [photo]="{ kind: 'item', id: part.id }"
              [name]="part.name"
              [sub]="line(part)"
            >
              @if (!readOnly()) {
                <button end type="button" class="secondary" [disabled]="busyId() !== null" (click)="reactivate.emit(part)">
                  {{ busyId() === part.id ? 'Activando…' : 'Volver a activar' }}
                </button>
              }
            </pp-item>
          </li>
        }
      </ul>
    </pp-card>
  `,
})
export class PiezasDesactivadas {
  readonly parts = input.required<readonly InventoryItemSummary[]>();
  /** The piece being switched back on, so a second click cannot send it twice. */
  readonly busyId = input<string | null>(null);
  /** Only the list, for someone who may not switch them back on (ADR-025). */
  readonly readOnly = input(false);
  readonly reactivate = output<InventoryItemSummary>();

  protected line(part: InventoryItemSummary): string {
    return inactivePartLine(part);
  }
}
