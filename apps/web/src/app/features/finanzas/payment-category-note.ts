import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentWorkspace } from '../../core/workspace';
import { FinanzasData } from './finanzas.data';

/**
 * Says in which Caja category a collection or a purchase payment will be
 * recorded, before it is. The database fills it in when the form sends none,
 * so without this line the only way to learn where the money went was to look
 * for it afterwards.
 */
@Component({
  selector: 'app-payment-category-note',
  imports: [RouterLink],
  styles: `
    :host { display: block; }
    p { margin: 0 0 0.75rem; font-size: 0.85rem; }
  `,
  template: `
    @if (loaded()) {
      <!-- The categories are configuration (ADR-025): only the owner is sent to change them. -->
      @if (name(); as category) {
        <p class="muted">
          Queda en la categoría «{{ category }}».
          @if (isOwner()) {
            <a routerLink="/configuracion" [queryParams]="{ tab: 'categories' }">Cambiarla</a>
          } @else {
            La elige el dueño del taller.
          }
        </p>
      } @else if (isOwner()) {
        <p class="muted">
          Queda sin categoría. Elige cuál usar en
          <a routerLink="/configuracion" [queryParams]="{ tab: 'categories' }">Configuración › Categorías de dinero</a>.
        </p>
      } @else {
        <p class="muted">Queda sin categoría: cuál usar lo elige el dueño del taller.</p>
      }
    }
  `,
})
export class PaymentCategoryNote implements OnInit {
  private readonly data = inject(FinanzasData);
  protected readonly isOwner = inject(CurrentWorkspace).isOwner;

  /** Whose category: a collection of an order, or the payment of a purchase. */
  readonly kind = input.required<'order' | 'purchase'>();

  protected readonly name = signal<string | null>(null);
  protected readonly loaded = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const categories = await this.data.paymentCategories();
      this.name.set((this.kind() === 'order' ? categories.order : categories.purchase)?.name ?? null);
      this.loaded.set(true);
    } catch {
      // It is a line of information: if it cannot be read, the form works the same without it.
    }
  }
}
