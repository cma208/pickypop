import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { ArticleKind } from '../core/article-photos';
import { Media, type MediaFolder } from '../core/media';
import { friendlyError } from '../core/friendly-error';
import { Thumb } from './thumb';

/**
 * Picks the picture of an article.
 *
 * It uploads on choosing, not on saving the form around it: the person sees
 * the photo they just took before deciding anything else, and a file that
 * ends up unused costs a few kilobytes in a bucket. Waiting for a save would
 * cost a round trip at the worst moment.
 *
 * What happens to the picture it replaces depends on the form. One that saves
 * on every change (a product) lets this field delete the old file at once
 * (`removesPrevious`, the default). One with a Save and a Cancel must not: if
 * the person cancels, the article still points at the old file. Those forms
 * turn it off and delete the loser themselves once they know which one it is.
 */
@Component({
  selector: 'pp-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Thumb],
  template: `
    <div class="box">
      <pp-thumb size="bed" [path]="path()" [name]="name()" [kind]="kind()" />
      @if (!readOnly()) {
        <div class="side">
          <label class="pick button secondary">
            <input type="file" accept="image/*" (change)="choose($event)" [disabled]="busy()" />
            {{ path() ? 'Cambiar foto' : 'Subir foto' }}
          </label>
          @if (path() && !busy()) {
            <button type="button" class="ghost" (click)="clear()">Quitar</button>
          }
          @if (busy()) { <span class="muted">Subiendo…</span> }
          @if (error(); as message) { <span class="error">{{ message }}</span> }
          <span class="muted hint">Se achica sola antes de subir.</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
    .box { display: flex; gap: 0.9rem; align-items: flex-start; }
    .side { display: grid; gap: 0.4rem; justify-items: start; }
    .pick { position: relative; }
    .pick input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    .pick:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
    .hint { font-size: var(--fs-xs); }
    .error { color: var(--danger); font-size: var(--fs-sm); }
  `,
  ],
})
export class ImageField {
  readonly path = input<string | null>(null);
  readonly name = input<string>('');
  readonly folder = input.required<MediaFolder>();
  /** The icon shown while there is no picture. */
  readonly kind = input<ArticleKind | null>(null);
  /** Only the picture, for someone who may not change it (ADR-025). */
  readonly readOnly = input(false, { transform: booleanAttribute });
  /** Off for forms that can still be cancelled; see the class comment. */
  readonly removesPrevious = input(true, { transform: booleanAttribute });

  /** The new path, or null when the picture was removed. */
  readonly changed = output<string | null>();

  private readonly media = inject(Media);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const previous = this.path();
      const path = await this.media.upload(file, this.folder());
      this.changed.emit(path);
      // Only once the new one is in place, so a failed upload leaves the old
      // picture where it was.
      if (this.removesPrevious()) await this.media.remove(previous);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos subir la imagen.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async clear(): Promise<void> {
    const previous = this.path();
    this.changed.emit(null);
    if (this.removesPrevious()) await this.media.remove(previous);
  }
}
