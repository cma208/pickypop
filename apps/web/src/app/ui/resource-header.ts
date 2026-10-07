import { afterEveryRender, ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ArticleKind, PhotoRef } from '../core/article-photos';
import { Thumb } from './thumb';

/** The one thing the record asks for next. */
export interface HeaderAction {
  label: string;
  /** Shows the label as work in progress and blocks a second click. */
  busy?: boolean;
  disabled?: boolean;
  tone?: 'danger';
}

/**
 * The head of a record: an order, a quote.
 *
 * The title is what a person calls the thing ("María Pérez · 10 × Botella de
 * poción"), not its code: nobody in the workshop says "PED-0003". The code,
 * the date and the state go underneath. And there is **one** main button, the
 * next real step; everything else waits in "Más". The barrido found a record
 * whose next step sat in its third card, competing with a dozen "Guardar".
 *
 * What the main action is belongs to the page: this only draws it and says
 * when it was pressed. Content marked `status` goes next to the code (a
 * badge); content marked `more` goes in the "Más" menu, which does not show
 * when there is nothing in it. On a phone the main action stays fixed at the
 * bottom of the screen, under the thumb.
 *
 * ```html
 * <pp-resource-header
 *   backLink="/pedidos" backLabel="Pedidos"
 *   [heading]="'Ana Quispe · 10 × Botella de poción'" code="PED-0003" meta="entrega 05 oct."
 *   [photo]="{ kind: 'order', id: order.id }"
 *   [action]="{ label: 'Entregar' }" (acted)="deliver()"
 * >
 *   <pp-badge status tone="info">Imprimiendo</pp-badge>
 *   <button more type="button" (click)="cancel()">Cancelar pedido</button>
 * </pp-resource-header>
 * ```
 */
@Component({
  selector: 'pp-resource-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Thumb],
  host: { '(document:pointerdown)': 'closeMoreOutside($event)' },
  template: `
    @if (backLink(); as link) {
      <a class="back" [routerLink]="link">‹ {{ backLabel() }}</a>
    }
    <div class="head">
      @if (path() || photo()) {
        <pp-thumb size="lead" [path]="path()" [photo]="photo()" [kind]="kind()" />
      }
      <div class="titles">
        <h1>{{ heading() }}</h1>
        <p class="meta">
          @if (code()) { <span class="code">{{ code() }}</span> }
          @if (meta()) { <span>{{ meta() }}</span> }
          <ng-content select="[status]" />
        </p>
      </div>
      <div class="actions">
        <details class="more" #more [hidden]="!hasMore()">
          <summary class="button secondary">Más</summary>
          <div class="panel" #panel (click)="closeMore()"><ng-content select="[more]" /></div>
        </details>
        @if (action(); as main) {
          <div class="primary">
            <button
              type="button"
              [class.danger]="main.tone === 'danger'"
              [disabled]="main.disabled || main.busy"
              [attr.aria-busy]="main.busy || null"
              (click)="acted.emit()"
            >
              {{ main.label }}
            </button>
          </div>
        }
      </div>
    </div>
    <ng-content />
  `,
  styles: [
    `
    :host { display: block; margin-bottom: 1.5rem; }
    .back { display: inline-block; margin-bottom: 0.5rem; font-size: var(--fs-sm); color: var(--muted); text-decoration: none; }
    .back:hover, .back:focus-visible { color: var(--accent); text-decoration: underline; }
    .head { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .titles { flex: 1 1 12rem; min-width: 0; }
    h1 { margin: 0 0 0.3rem; font-size: var(--fs-xl); font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; overflow-wrap: break-word; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.6rem; margin: 0; font-size: var(--fs-sm); color: var(--muted); }
    .code { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
    .actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
    .more { position: relative; }
    .more summary { list-style: none; }
    .more summary::-webkit-details-marker { display: none; }
    .more summary::after { content: '▾'; margin-left: 0.35rem; font-size: 0.8em; color: var(--muted); }
    .panel {
      position: absolute; z-index: 20; right: 0; top: calc(100% + 0.3rem); min-width: 13rem;
      display: grid; gap: 0.15rem; padding: 0.35rem;
      background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow);
    }
    /* What the page puts in the menu are its own buttons; here they line up as a list. */
    :host ::ng-deep .panel > * { justify-content: flex-start; width: 100%; }
    @media (max-width: 40rem) {
      .actions { margin-left: 0; }
      .primary {
        position: fixed; z-index: 15; left: 0; right: 0; bottom: 0;
        padding: 0.6rem 1rem calc(0.6rem + env(safe-area-inset-bottom));
        background: var(--surface); border-top: 1px solid var(--line);
      }
      .primary button { width: 100%; }
      .panel { right: auto; left: 0; }
    }
  `,
  ],
})
export class ResourceHeader {
  readonly heading = input.required<string>();
  /** The number of the record: PED-0003, COT-0001. */
  readonly code = input<string | null | undefined>(null);
  /** One short fact after the code: "entrega 05 oct.". */
  readonly meta = input<string | null | undefined>(null);
  readonly backLink = input<string | readonly unknown[] | null>(null);
  readonly backLabel = input('Volver');
  readonly path = input<string | null | undefined>(null);
  readonly photo = input<PhotoRef | null | undefined>(null);
  readonly kind = input<ArticleKind | null | undefined>('product');
  /** The next step, or null when the record has nothing left to ask for. */
  readonly action = input<HeaderAction | null>(null);

  readonly acted = output<void>();

  private readonly more = viewChild<ElementRef<HTMLDetailsElement>>('more');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Whether the page put anything in "Más". Projected content cannot be asked for, only counted. */
  protected readonly hasMore = signal(false);

  constructor() {
    afterEveryRender({
      read: () => this.hasMore.set((this.panel()?.nativeElement.childElementCount ?? 0) > 0),
    });
  }

  protected closeMore(): void {
    const menu = this.more()?.nativeElement;
    if (menu) menu.open = false;
  }

  /** A press anywhere but the menu closes it, the main button included. */
  protected closeMoreOutside(event: Event): void {
    const menu = this.more()?.nativeElement;
    if (menu?.open && !menu.contains(event.target as Node)) this.closeMore();
  }
}
