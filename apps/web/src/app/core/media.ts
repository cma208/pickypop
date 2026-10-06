import { inject, Injectable } from '@angular/core';
import { SUPABASE } from './supabase';
import { CurrentWorkspace } from './workspace';
import { UserFacingError } from './friendly-error';

/** Where a picture belongs. It is also the folder it lands in. */
export type MediaFolder = 'productos' | 'variantes' | 'articulos' | 'impresiones';

const BUCKET = 'media';

/**
 * A phone photo is four megabytes and nobody in a workshop wants to wait for
 * that. The long side is capped here, in the browser, before anything travels.
 */
const MAX_SIDE_PX = 1024;
const QUALITY = 0.82;

/** How long a signed link lasts, and how long we keep it. The second is
 *  shorter so a link never expires while it is still on screen. */
const SIGNED_SECONDS = 3600;
const CACHE_MS = 50 * 60 * 1000;

interface Cached {
  url: string;
  until: number;
}

/**
 * Pictures of what the workshop sells and uses.
 *
 * The bucket is private, so every image needs a signed link. Asking for one
 * link per row would mean forty round trips to draw a list of forty supplies,
 * so the requests that land in the same tick are **signed in one call**: the
 * component asks for a path and never finds out that it waited for its
 * neighbours.
 */
@Injectable({ providedIn: 'root' })
export class Media {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  private readonly cache = new Map<string, Cached>();
  private readonly waiting = new Map<string, ((url: string | null) => void)[]>();
  private flushing = false;

  /** A link to show the image, or null when there is nothing to show. */
  url(path: string | null | undefined): Promise<string | null> {
    if (!path) return Promise.resolve(null);

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

  /**
   * Shrinks the picture, uploads it and returns the path to store. The path
   * starts with the workshop id because that is what the storage policy reads:
   * there is no `workspace_id` column to look at up there.
   */
  async upload(file: File, folder: MediaFolder): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new UserFacingError('Eso no es una imagen.');
    }

    const workspaceId = await this.workspace.requireId();
    const shrunk = await shrink(file);
    const path = `${workspaceId}/${folder}/${crypto.randomUUID()}.webp`;

    const { error } = await this.supabase.storage.from(BUCKET).upload(path, shrunk, {
      contentType: 'image/webp',
      cacheControl: '3600',
    });
    if (error) throw error;

    return path;
  }

  /** Removes the file. Forgetting to call this only leaves a file behind, so
   *  it never blocks the change the person actually asked for. */
  async remove(path: string | null | undefined): Promise<void> {
    if (!path) return;
    this.cache.delete(path);
    await this.supabase.storage.from(BUCKET).remove([path]);
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

/** Draws the picture smaller on a canvas and hands back a WebP blob. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new UserFacingError('Este navegador no pudo procesar la imagen.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  if (!blob) throw new UserFacingError('No pudimos procesar la imagen.');
  return blob;
}
