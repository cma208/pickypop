import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Media } from '../core/media';

/**
 * The picture of an article, wherever it is listed.
 *
 * When there is no picture it draws the initial instead of a broken frame: a
 * row without a photo still has to be readable, and an empty grey box reads
 * as something failing to load.
 */
@Component({
  selector: 'pp-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as url) {
      <img [src]="url" [alt]="name()" loading="lazy" />
    } @else {
      <span class="letter" aria-hidden="true">{{ initial() }}</span>
    }
  `,
  styles: [
    `
    :host {
      display: inline-grid;
      place-items: center;
      overflow: hidden;
      flex: none;
      width: var(--thumb-size, 2.5rem);
      height: var(--thumb-size, 2.5rem);
      border-radius: var(--radius-sm);
      border: 1px solid var(--line);
      background: var(--accent-soft);
    }
    :host([size='sm']) { --thumb-size: 1.75rem; }
    :host([size='lg']) { --thumb-size: 5rem; }
    :host([size='xl']) { --thumb-size: 9rem; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .letter { font-weight: 600; color: var(--accent); font-size: calc(var(--thumb-size, 2.5rem) * 0.42); line-height: 1; }
  `,
  ],
})
export class Thumb {
  readonly path = input<string | null | undefined>(null);
  /** Used for the alt text and for the letter shown when there is no picture. */
  readonly name = input<string>('');

  private readonly media = inject(Media);
  protected readonly src = signal<string | null>(null);

  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '·');

  constructor() {
    effect(() => {
      const path = this.path();
      this.src.set(null);
      if (!path) return;
      void this.media.url(path).then((url) => {
        // The path may have changed while the link was being signed.
        if (this.path() === path) this.src.set(url);
      });
    });
  }
}
