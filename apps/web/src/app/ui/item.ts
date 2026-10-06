import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ArticleKind, PhotoRef } from '../core/article-photos';
import { Thumb, type ThumbSize } from './thumb';

/**
 * One article in a list: its picture, its name, a grey second line and a
 * place at the end for the figure or the action.
 *
 * Every list of articles used to build this row on its own, and each one
 * decided differently how big the picture was, how far from the name and
 * what happened on a phone. Now there is one row.
 *
 * ```html
 * <pp-item [path]="item.imagePath" kind="supply" [name]="item.name" [sub]="item.unit">
 *   <span end>12 unidades</span>
 * </pp-item>
 * ```
 *
 * The second line can be the `sub` text or, when it needs markup, content
 * marked `sub`. Content marked `end` goes to the right and keeps its width;
 * when space runs short it is the name that wraps, up to two lines.
 */
@Component({
  selector: 'pp-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Thumb, RouterLink],
  host: { '[attr.data-size]': 'size()' },
  template: `
    <span class="main">
      <pp-thumb
        [size]="size()"
        [path]="path()"
        [photo]="photo()"
        [kind]="kind()"
        [color]="color()"
        [name]="name()"
      />
      <span class="text">
        @if (link(); as target) {
          <a class="name" [routerLink]="target">{{ name() }}</a>
        } @else {
          <span class="name">{{ name() }}</span>
        }
        @if (sub(); as text) { <span class="sub">{{ text }}</span> }
        <span class="sub more"><ng-content select="[sub]" /></span>
        <ng-content />
      </span>
    </span>
    <span class="end"><ng-content select="[end]" /></span>
  `,
  styles: [
    `
    :host { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
    .main { display: flex; align-items: center; gap: 0.75rem; flex: 1 1 auto; min-width: 0; }
    .text { display: grid; justify-items: start; min-width: 0; gap: 0.05rem; }
    .name {
      font-weight: 600; overflow-wrap: break-word;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    a.name { color: inherit; text-decoration: none; }
    a.name:hover, a.name:focus-visible { color: var(--accent); text-decoration: underline; }
    .sub { display: block; font-size: var(--fs-sm); color: var(--muted); font-weight: 400; }
    .more:empty, .end:empty { display: none; }
    .end { margin-left: auto; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
    :host([data-size='inline']) .main { gap: 0.45rem; }
    :host([data-size='inline']) .name { font-weight: 500; }
  `,
  ],
})
export class Item {
  readonly name = input.required<string>();
  /** The grey second line, when plain text is enough. */
  readonly sub = input<string | null | undefined>(null);
  readonly path = input<string | null | undefined>(null);
  readonly photo = input<PhotoRef | null | undefined>(null);
  readonly kind = input<ArticleKind | null | undefined>(null);
  readonly color = input<string | null | undefined>(null);
  readonly size = input<ThumbSize>('row');
  /** Makes the name a link, for lists whose row opens the article. */
  readonly link = input<string | readonly unknown[] | null | undefined>(null);
}
