import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
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
 */
@Component({
  selector: 'pp-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Thumb],
  template: `
    <div class="box">
      <pp-thumb size="lg" [path]="path()" [name]="name()"></pp-thumb>
      <div class="side">
        <label class="pick">
          <input type="file" accept="image/*" (change)="choose($event)" [disabled]="busy()" />
          <span class="as-button">{{ path() ? 'Cambiar foto' : 'Subir foto' }}</span>
        </label>
        @if (path() && !busy()) {
          <button type="button" class="ghost" (click)="clear()">Quitar</button>
        }
        @if (busy()) { <span class="muted">Subiendo…</span> }
        @if (error(); as message) { <span class="error">{{ message }}</span> }
        <span class="muted hint">Se achica sola antes de subir.</span>
      </div>
    </div>
  `,
  styles: [
    `
    .box { display: flex; gap: 0.9rem; align-items: flex-start; }
    .side { display: grid; gap: 0.4rem; justify-items: start; }
    .pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .pick { position: relative; display: inline-block; }
    .as-button {
      display: inline-block;
      padding: 0.45rem 0.85rem;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.9rem;
    }
    .pick:hover .as-button { background: var(--accent-soft); }
    .hint { font-size: 0.78rem; }
    .error { color: var(--danger); font-size: 0.85rem; }
  `,
  ],
})
export class ImageField {
  readonly path = input<string | null>(null);
  readonly name = input<string>('');
  readonly folder = input.required<MediaFolder>();

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
      await this.media.remove(previous);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos subir la imagen.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async clear(): Promise<void> {
    const previous = this.path();
    this.changed.emit(null);
    await this.media.remove(previous);
  }
}
