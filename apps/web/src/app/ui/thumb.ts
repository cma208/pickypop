import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ArticlePhotos, type ArticleKind, type PhotoRef } from '../core/article-photos';
import { Media, variantForSize, type MediaVariant } from '../core/media';

/**
 * The one scale of pictures in the app. Each size answers a context, not a
 * taste, so two screens showing the same thing show it the same size:
 *
 * | size     | px  | where                                                  |
 * |----------|-----|--------------------------------------------------------|
 * | `inline` | 24  | inside a sentence or a badge                           |
 * | `option` | 40  | an option of a picker                                  |
 * | `row`    | 48  | a row of articles: fits the two-line row without growing it |
 * | `lead`   | 64  | a row where the picture is what tells it apart         |
 * | `bed`    | 96  | what is on the printer right now                       |
 * | `sheet`  | 240 | the record of one article                              |
 * | `fill`   | —   | the full width of a gallery card                       |
 */
export type ThumbSize = 'inline' | 'option' | 'row' | 'lead' | 'bed' | 'sheet' | 'fill';

export const THUMB_PX: Record<Exclude<ThumbSize, 'fill'>, number> = {
  inline: 24,
  option: 40,
  row: 48,
  lead: 64,
  bed: 96,
  sheet: 240,
};

/** Which copy of the picture a size needs: the small one up to 96 px. */
export function mediaVariantFor(size: ThumbSize): MediaVariant {
  return size === 'fill' ? 'full' : variantForSize(THUMB_PX[size]);
}

/**
 * One stroke drawing per kind of article, on the same 24 × 24 grid and with
 * the same strokes as the menu, so a piece without a photo looks like the
 * menu entry where pieces live. The initial used to stand in, and "Bolsa" and
 * "Botella" both became a "B".
 */
export const ARTICLE_ICONS: Record<ArticleKind, readonly string[]> = {
  part: ['M10 4h4v2.2a1.8 1.8 0 1 0 3.6 0V4H20v16H4v-3.6h2.2a1.8 1.8 0 1 0 0-3.6H4V4h6z'],
  supply: ['M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z', 'M3 7.5l9 4.5 9-4.5M12 12v9'],
  packaging: ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  spare_part: ['M14.7 6.3a4 4 0 0 0-5.4 5.2l-5.8 5.8a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.4-.4-2.4z'],
  finished_good: ['M9.5 3h5', 'M10.5 3v5.2l-4.9 9.4A2.3 2.3 0 0 0 7.6 21h8.8a2.3 2.3 0 0 0 2-3.4l-4.9-9.4V3', 'M7.4 15h9.2'],
  product: ['M9.5 3h5', 'M10.5 3v5.2l-4.9 9.4A2.3 2.3 0 0 0 7.6 21h8.8a2.3 2.3 0 0 0 2-3.4l-4.9-9.4V3', 'M7.4 15h9.2'],
  plate: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
};

type State = 'loading' | 'shown' | 'none';

/**
 * The picture of an article, wherever it is listed.
 *
 * The picture is shown whole (`contain`), never cropped to fill the square:
 * a bottle is told apart from a cap by its silhouette, and cropping a tall
 * photo to a square cuts exactly that. Without a picture it draws the icon of
 * the kind of article, so the row is still readable and does not look like
 * something that failed to load.
 *
 * It takes either the stored `path` or a `photo` reference to look up, for
 * screens that only know the id of what they list.
 */
@Component({
  selector: 'pp-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-size]': 'size()', '[class.cover]': "fit() === 'cover'", '[class.swatch]': '!!color()' },
  template: `
    @if (color(); as hex) {
      <span class="chip" [style.background]="hex" role="img" [attr.aria-label]="name()"></span>
    } @else if (src(); as url) {
      <img [src]="url" [alt]="name()" loading="lazy" decoding="async" (error)="failed()" />
    } @else if (state() === 'none') {
      <svg class="icon" viewBox="0 0 24 24" role="img" [attr.aria-label]="name() || null">
        @for (d of icon(); track $index) { <path [attr.d]="d" /> }
      </svg>
    }
  `,
  styles: [
    `
    :host {
      --thumb: 3rem;
      display: inline-grid;
      place-items: center;
      overflow: hidden;
      flex: none;
      width: var(--thumb);
      height: var(--thumb);
      border-radius: var(--radius-sm);
      border: 1px solid var(--line);
      background: var(--surface);
      vertical-align: middle;
    }
    :host([data-size='inline']) { --thumb: 1.5rem; border-radius: 5px; }
    :host([data-size='option']) { --thumb: 2.5rem; }
    :host([data-size='lead']) { --thumb: 4rem; }
    :host([data-size='bed']) { --thumb: 6rem; border-radius: var(--radius); }
    :host([data-size='sheet']) { --thumb: 15rem; border-radius: var(--radius); }
    :host([data-size='fill']) { width: 100%; height: auto; aspect-ratio: 1; border-radius: var(--radius); }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
    :host(.cover) img { object-fit: cover; }
    .icon {
      width: 55%; max-width: 4rem; height: auto; fill: none;
      stroke: var(--muted); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.8;
    }
    .icon path { vector-effect: non-scaling-stroke; }
    :host(.swatch) { border-radius: 50%; }
    .chip { width: 100%; height: 100%; }
  `,
  ],
})
export class Thumb {
  /** The stored path of the picture, when the screen already has it. */
  readonly path = input<string | null | undefined>(null);
  /** What to look the picture up by, when the screen only has an id. */
  readonly photo = input<PhotoRef | null | undefined>(null);
  /** Which icon stands in without a picture. A looked-up `photo` brings its own. */
  readonly kind = input<ArticleKind | null | undefined>(null);
  /** For things whose picture is a colour, like a spool of filament. */
  readonly color = input<string | null | undefined>(null);
  /** The alt text. */
  readonly name = input<string>('');
  readonly size = input<ThumbSize>('row');
  /** `cover` crops to fill the square; only for gallery cards, and on purpose. */
  readonly fit = input<'contain' | 'cover'>('contain');

  private readonly media = inject(Media);
  private readonly photos = inject(ArticlePhotos);

  protected readonly src = signal<string | null>(null);
  protected readonly state = signal<State>('loading');
  private readonly lookedUpKind = signal<ArticleKind | null>(null);

  protected readonly icon = computed(() => ARTICLE_ICONS[this.kind() ?? this.lookedUpKind() ?? 'product']);

  constructor() {
    effect((onCleanup) => {
      const path = this.path();
      const photo = this.photo();
      const variant = mediaVariantFor(this.size());

      let current = true;
      onCleanup(() => (current = false));
      this.src.set(null);
      this.state.set('loading');

      void this.find(path, photo).then(async (found) => {
        const url = await this.media.url(found, variant);
        // The inputs may have changed while the link was being signed.
        if (!current) return;
        this.src.set(url);
        this.state.set(url ? 'shown' : 'none');
      });
    });
  }

  /** A signed link that stopped working draws the icon instead of a broken image. */
  protected failed(): void {
    this.src.set(null);
    this.state.set('none');
  }

  private async find(path: string | null | undefined, photo: PhotoRef | null | undefined): Promise<string | null> {
    if (path) return path;
    if (!photo) return null;
    const found = await this.photos.resolve(photo);
    this.lookedUpKind.set(found.kind);
    return found.path;
  }
}
