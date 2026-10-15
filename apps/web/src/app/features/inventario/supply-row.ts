import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, FORMAT_PIPES, Item } from '../../ui';
import type { InventoryItemSummary } from './inventario.data';
import { POSITION_STYLES } from './inventario.styles';
import { costSourceLabel, lacksCost, noCostTitle } from './item-cost';
import { amount, type PositionCells } from './stock-position';

/** An article with what the plan says of it. `cells` is null while the plan is not there. */
export interface SupplyRowView {
  item: InventoryItemSummary;
  /** "Repuesto · Perecible": the kind only where a screen mixes kinds. */
  sub: string;
  cells: PositionCells | null;
}

/**
 * One article of Insumos or Empaque: its photo, what there is, who it is for,
 * what it costs and what can be done with it.
 *
 * The cost is in the row because an article without one counts as S/ 0 in
 * every assembly, delivery and quote, and nobody noticed: the list is where
 * it is seen, and «Comprar» or «Editar» is where it is fixed.
 */
@Component({
  selector: 'tr[app-supply-row]',
  imports: [Badge, Item, RouterLink, FORMAT_PIPES],
  host: { '[class.inactive]': '!row().item.active' },
  template: `
    @let item = row().item;
    @let cells = row().cells;
    <td>
      <pp-item [kind]="item.kind" [path]="item.imagePath" [name]="item.name">
        <span sub>
          {{ row().sub }}
          @if (!item.imagePath) {
            {{ row().sub ? '· ' : '' }}Sin foto
            @if (canOperate()) { · <button type="button" class="inline-link" (click)="edit.emit()">Agregar</button> }
          }
        </span>
        @if (!item.active) { <pp-badge>Inactivo</pp-badge> }
      </pp-item>
      <!-- Where the cost column folds away, what it says goes under the name. -->
      @if (cells?.missing || item.costPerUnit !== null || noCost()) {
        <div class="badge-line narrow-only">
          @if (cells?.missing; as missing) { <pp-badge tone="warn">{{ missing }}</pp-badge> }
          @if (item.costPerUnit !== null) {
            <small class="sub">{{ item.costPerUnit | unitPrice }} por {{ item.unit }} · {{ sourceLabel() }}</small>
          } @else if (noCost()) {
            <pp-badge tone="warn" [attr.title]="noCostHint()">Sin costo</pp-badge>
          }
        </div>
      }
    </td>
    <td class="num">
      <span class="nowrap">{{ cells?.onHand ?? amount(item.onHand, item.unit) }}</span>
      @if (cells; as position) {
        <small class="sub narrow-only" [attr.title]="position.who || null">{{ position.compact }}</small>
      }
      <small class="sub hide-small nowrap">Mínimo {{ amount(item.minStock, item.unit) }}</small>
      @if (item.belowMinimum && !cells?.missing) {
        <small class="sub badge-line"><pp-badge tone="warn">Bajo mínimo</pp-badge></small>
      }
    </td>
    <td class="wide-only separated" [attr.title]="cells?.who || null">{{ cells?.separated ?? '—' }}</td>
    <td class="num wide-only">{{ cells?.free ?? '—' }}</td>
    <td class="wide-only">
      @if (cells?.missing; as missing) {
        <pp-badge tone="warn">{{ missing }}</pp-badge>
      } @else {
        <span class="muted">—</span>
      }
    </td>
    <td class="num wide-only">
      @if (item.costPerUnit !== null) {
        <span class="nowrap">{{ item.costPerUnit | unitPrice }}</span>
        <small class="sub">por {{ item.unit }} · {{ sourceLabel() }}</small>
      } @else if (noCost()) {
        <pp-badge tone="warn" [attr.title]="noCostHint()">Sin costo</pp-badge>
      } @else {
        <span class="muted">—</span>
      }
    </td>
    <td class="actions-cell">
      @if (canOperate()) {
        <button type="button" class="secondary" (click)="move.emit()">Movimiento</button>
        <!-- A switched-off article is not offered when buying: the form would open without it. -->
        @if (item.active) {
          <a class="button secondary" routerLink="/inventario/compras" [queryParams]="{ articulo: item.id }">Comprar</a>
        }
        <button type="button" class="ghost" (click)="edit.emit()">Editar</button>
      }
    </td>
  `,
  styles: [
    POSITION_STYLES,
    `
      :host(.inactive) { opacity: 0.6; }
    `,
  ],
})
export class SupplyRow {
  readonly row = input.required<SupplyRowView>();
  /** Owner and operator keep the inventory; a viewer only reads it (ADR-025). */
  readonly canOperate = input(false);
  readonly move = output<void>();
  readonly edit = output<void>();

  /** Grams the way the plan's columns say them: "520 g", "1 kg". */
  protected readonly amount = amount;
  /** The same rule as the filter «Solo sin costo» and its count: a switched-off article is not flagged. */
  protected readonly noCost = computed(() => lacksCost(this.row().item));
  protected readonly noCostHint = computed(() => noCostTitle(this.canOperate()));
  protected readonly sourceLabel = computed(() => costSourceLabel(this.row().item.costSource));
}
