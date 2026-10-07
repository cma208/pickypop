import { inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase';
import { CurrentWorkspace } from './workspace';
import { UserFacingError } from './friendly-error';

/** Where a picture belongs. It is also the folder it lands in. */
export type MediaFolder = 'productos' | 'variantes' | 'articulos' | 'impresiones';

/** Which copy of a picture to show: the small one for lists, the big one for a sheet. */
export type MediaVariant = 'thumb' | 'full';

const BUCKET = 'media';

/**
 * A phone photo is four megabytes and nobody in a workshop wants to wait for
 * that. The long side is capped here, in the browser, before anything travels.
 */
const MAX_SIDE_PX = 1024;
const QUALITY = 0.82;

/**
 * The small copy that lists draw. A list of forty supplies used to download
 * forty 1024 px originals to paint them at 28 px; at 256 px each one weighs
 * about a tenth.
 */
const THUMB_SIDE_PX = 256;
const THUMB_QUALITY = 0.8;

/**
 * Up to this size on screen the small copy is enough. 96 px at twice the
 * pixel density is 192 real pixels, still under 256.
 */
export const THUMB_MAX_DISPLAY_PX = 96;

const FULL_SUFFIX = '.webp';
const THUMB_SUFFIX = '.thumb.webp';

/** How long a signed link lasts, and how long we keep it. The second is
 *  shorter so a link never expires while it is still on screen. */
const SIGNED_SECONDS = 3600;
const CACHE_MS = 50 * 60 * 1000;

interface Cached {
  url: string;
  until: number;
}

/**
 * Where the small copy of a picture lives. It is found by name, next to the
 * original, so no column has to remember it. Null for a path that cannot have
 * one (anything not uploaded as WebP by `upload`).
 */
export function thumbPathOf(path: string): string | null {
  if (!path.endsWith(FULL_SUFFIX) || path.endsWith(THUMB_SUFFIX)) return null;
  return path.slice(0, -FULL_SUFFIX.length) + THUMB_SUFFIX;
}

/** Which copy a picture drawn at `displayPx` CSS pixels needs. */
export function variantForSize(displayPx: number): MediaVariant {
  return displayPx <= THUMB_MAX_DISPLAY_PX ? 'thumb' : 'full';
}

/**
 * Pictures of what the workshop sells and uses.
 *
 * The bucket is private, so every image needs a signed link. Asking for one
 * link per row would mean forty round trips to draw a list of forty supplies,
 * so the requests that land in the same tick are **signed in one call**: the
 * component asks for a path and never finds out that it waited for its
 * neighbours.
 *
 * Every picture is stored twice: the original, capped at 1024 px, and a
 * 256 px copy beside it. Supabase can resize on the fly, but only on the paid
 * plan and never through the batch signing above, so the copy is made here,
 * once, when the picture is uploaded.
 */
@Injectable({ providedIn: 'root' })
export class Media {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  private readonly cache = new Map<string, Cached>();
  private readonly waiting = new Map<string, ((url: string | null) => void)[]>();
  /** Small copies known not to exist: pictures uploaded before they were made. */
  private readonly missingThumbs = new Set<string>();
  private flushing = false;

  /** Goes up every time a picture is added or removed, so lookups can forget. */
  readonly version = signal(0);

  /**
   * A link to show the image, or null when there is nothing to show. Asking
   * for the small copy of a picture that has none (an old upload) falls back
   * to the original, so the caller never has to know which kind it got.
   */
  async url(path: string | null | undefined, variant: MediaVariant = 'full'): Promise<string | null> {
    if (!path) return null;

    if (variant === 'thumb') {
      const small = thumbPathOf(path);
      if (small && !this.missingThumbs.has(small)) {
        const url = await this.sign(small);
        if (url) return url;
        this.missingThumbs.add(small);
      }
    }
    return this.sign(path);
  }

  /**
   * Shrinks the picture, uploads it with its small copy and returns the path
   * to store. The path starts with the workshop id because that is what the
   * storage policy reads: there is no `workspace_id` column to look at up there.
   */
  async upload(file: File, folder: MediaFolder): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new UserFacingError('Eso no es una imagen.');
    }

    const workspaceId = await this.workspace.requireId();
    const { full, thumb } = await shrinkTwice(file);
    const path = `${workspaceId}/${folder}/${crypto.randomUUID()}${FULL_SUFFIX}`;
    const thumbPath = thumbPathOf(path)!;

    const bucket = this.supabase.storage.from(BUCKET);
    const options = { contentType: 'image/webp', cacheControl: '3600' };
    const [original, small] = await Promise.all([
      bucket.upload(path, full, options),
      bucket.upload(thumbPath, thumb, options),
    ]);

    if (original.error) {
      // Without the original the small copy is an orphan nobody will ever ask for.
      if (!small.error) await bucket.remove([thumbPath]);
      throw original.error;
    }
    // A missing small copy is not worth failing the upload: lists fall back to
    // the original, which is what every picture did before copies existed.
    if (small.error) this.missingThumbs.add(thumbPath);

    this.version.update((value) => value + 1);
    return path;
  }

  /** Removes the file and its small copy. Forgetting to call this only leaves
   *  a file behind, so it never blocks the change the person actually asked for. */
  async remove(path: string | null | undefined): Promise<void> {
    if (!path) return;
    const paths = [path, thumbPathOf(path)].filter((item): item is string => item !== null);
    for (const item of paths) this.cache.delete(item);
    await this.supabase.storage.from(BUCKET).remove(paths);
    this.version.update((value) => value + 1);
  }

  /** One signed link, batched with every other request of the same tick. */
  private sign(path: string): Promise<string | null> {
    const cached = this.cache.get(path);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.url);

    return new Promise((resolve) => {
      const queue = this.waiting.get(path);
      if (queue) {
        queue.push(resolve);
        return;
      }
      this.waiting.set(path, [resolve]);
      this.scheduleFlush();
    });
  }

  private scheduleFlush(): void {
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => void this.flush());
  }

  private async flush(): Promise<void> {
    const paths = [...this.waiting.keys()];
    const resolvers = new Map(this.waiting);
    this.waiting.clear();
    this.flushing = false;
    if (paths.length === 0) return;

    const { data, error } = await this.supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);

    // A path that does not exist comes back in the list without a link, not as
    // an error of the whole call: that is how a missing small copy is noticed.
    const byPath = new Map<string, string>();
    if (!error && data) {
      for (const row of data) {
        if (row.signedUrl && row.path) byPath.set(row.path, row.signedUrl);
      }
    }

    const until = Date.now() + CACHE_MS;
    for (const [path, callbacks] of resolvers) {
      const url = byPath.get(path) ?? null;
      // A missing image is not worth an error on screen: the placeholder says
      // enough, and the row still has to be readable.
      if (url) this.cache.set(path, { url, until });
      for (const done of callbacks) done(url);
    }
  }
}

/** Both copies from a single decode: the photo is read once and drawn twice. */
async function shrinkTwice(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file);
  try {
    const [full, thumb] = await Promise.all([
      draw(bitmap, MAX_SIDE_PX, QUALITY),
      draw(bitmap, THUMB_SIDE_PX, THUMB_QUALITY),
    ]);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

/** Draws the picture with its long side capped at `maxSide` and hands back a WebP blob. */
async function draw(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new UserFacingError('Este navegador no pudo procesar la imagen.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new UserFacingError('No pudimos procesar la imagen.');
  return blob;
}
