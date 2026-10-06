import { effect, inject, Injectable } from '@angular/core';
import type { Database } from './database.types';
import { Media } from './media';
import { SUPABASE } from './supabase';

type ItemKind = Database['public']['Enums']['inventory_item_kind'];

/**
 * What an article is, for the icon drawn when it has no picture. The five kinds
 * of inventory item, plus a catalogue product and a printing plate.
 */
export type ArticleKind = ItemKind | 'product' | 'plate';

/**
 * Something whose picture has to be looked up instead of carried along:
 * - `variant`: its own photo, else its product's;
 * - `item`: an inventory item, else the thumbnail of the plate that prints it;
 * - `job`: what a print job puts on the bed (plate, piece, then product);
 * - `order`: the first line of an order that has a photo.
 */
export interface PhotoRef {
  kind: 'variant' | 'item' | 'job' | 'order';
  /** Null for a line that points at nothing, like a made-to-order line with no variant. */
  id: string | null | undefined;
}

export interface ResolvedPhoto {
  path: string | null;
  /** Decides the icon when there is no path. */
  kind: ArticleKind;
}

/** PostgREST puts ids in the URL; a few hundred uuids is past what proxies accept. */
const IDS_PER_QUERY = 100;
/** Long enough to share one query between the rows of a screen, short enough to never look stale. */
const CACHE_MS = 30_000;

const NONE: Record<PhotoRef['kind'], ArticleKind> = {
  variant: 'product',
  item: 'supply',
  job: 'plate',
  order: 'product',
};

interface VariantRow {
  image_path: string | null;
  catalog_products: { image_path: string | null } | null;
}

interface ItemRow {
  kind: ItemKind;
  image_path: string | null;
}

/** A variant shows its own photo, and its product's when it has none. */
export function variantPhoto(row: VariantRow | null | undefined): ResolvedPhoto {
  return { path: row?.image_path ?? row?.catalog_products?.image_path ?? null, kind: 'product' };
}

/**
 * A real photo of the item wins over the plate it comes from: somebody took
 * it on purpose. The plate thumbnail is the fallback that needs nobody.
 */
export function itemPhoto(row: ItemRow | null | undefined, plateThumbnail: string | null = null): ResolvedPhoto {
  const kind: ArticleKind = row?.kind === 'finished_good' ? 'product' : (row?.kind ?? 'supply');
  return { path: row?.image_path ?? plateThumbnail ?? null, kind };
}

interface JobRow {
  recipe_plates: {
    thumbnail_path: string | null;
    inventory_items: ItemRow | null;
  } | null;
  order_lines: { product_variants: VariantRow | null } | null;
}

/**
 * In the queue the plate rules, because that is what goes on the bed: "nine
 * caps in black", not one cap. Then the piece the plate makes, then the
 * product of the order line it was printed for.
 */
export function jobPhoto(row: JobRow | null | undefined): ResolvedPhoto {
  const plate = row?.recipe_plates;
  const path =
    plate?.thumbnail_path ??
    plate?.inventory_items?.image_path ??
    variantPhoto(row?.order_lines?.product_variants).path ??
    null;
  return { path, kind: 'plate' };
}

/** The first line with a photo stands for the order: it is what the customer asked for. */
export function orderPhoto(lines: readonly { position: number; product_variants: VariantRow | null }[]): ResolvedPhoto {
  const sorted = [...lines].sort((a, b) => a.position - b.position);
  for (const line of sorted) {
    const photo = variantPhoto(line.product_variants);
    if (photo.path) return photo;
  }
  return { path: null, kind: 'product' };
}

interface Pending {
  ref: PhotoRef;
  done: ((photo: ResolvedPhoto) => void)[];
}

/**
 * Finds the picture of something a screen only knows by id.
 *
 * Most lists already carry the image path of what they show. The ones that do
 * not —order lines, print jobs, the "Hoy" queue— would each need their query
 * widened, and each would decide on its own what to show when the variant has
 * no photo or the job has no plate. Here the rule is written once: what falls
 * back to what. Requests of the same tick go out together, one query per
 * kind, the same way `Media` batches the signed links.
 */
@Injectable({ providedIn: 'root' })
export class ArticlePhotos {
  private readonly supabase = inject(SUPABASE);
  private readonly media = inject(Media);

  private readonly cache = new Map<string, { photo: ResolvedPhoto; until: number }>();
  private readonly waiting = new Map<string, Pending>();
  private flushing = false;

  constructor() {
    // A new or removed picture makes every answer suspect; asking again is cheap.
    effect(() => {
      this.media.version();
      this.cache.clear();
    });
  }

  resolve(ref: PhotoRef): Promise<ResolvedPhoto> {
    if (!ref.id) return Promise.resolve({ path: null, kind: NONE[ref.kind] });
    const key = `${ref.kind}:${ref.id}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.photo);

    return new Promise((resolve) => {
      const pending = this.waiting.get(key);
      if (pending) {
        pending.done.push(resolve);
        return;
      }
      this.waiting.set(key, { ref, done: [resolve] });
      if (!this.flushing) {
        this.flushing = true;
        queueMicrotask(() => void this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    const batch = new Map(this.waiting);
    this.waiting.clear();
    this.flushing = false;

    const idsOf = (kind: PhotoRef['kind']) => [
      ...new Set([...batch.values()].filter((item) => item.ref.kind === kind).map((item) => item.ref.id!)),
    ];

    const [variants, items, jobs, orders] = await Promise.all([
      this.variants(idsOf('variant')),
      this.items(idsOf('item')),
      this.jobs(idsOf('job')),
      this.orders(idsOf('order')),
    ]);
    const found: Record<PhotoRef['kind'], Map<string, ResolvedPhoto>> = { variant: variants, item: items, job: jobs, order: orders };

    const until = Date.now() + CACHE_MS;
    for (const [key, { ref, done }] of batch) {
      const photo = found[ref.kind].get(ref.id!) ?? { path: null, kind: NONE[ref.kind] };
      this.cache.set(key, { photo, until });
      for (const callback of done) callback(photo);
    }
  }

  private async variants(ids: string[]): Promise<Map<string, ResolvedPhoto>> {
    const rows = await this.chunked(ids, (chunk) =>
      this.supabase.from('product_variants').select('id, image_path, catalog_products(image_path)').in('id', chunk),
    );
    return new Map(rows.map((row) => [row.id, variantPhoto(row)]));
  }

  private async items(ids: string[]): Promise<Map<string, ResolvedPhoto>> {
    const [rows, plates] = await Promise.all([
      this.chunked(ids, (chunk) => this.supabase.from('inventory_items').select('id, kind, image_path').in('id', chunk)),
      this.chunked(ids, (chunk) =>
        this.supabase
          .from('recipe_plates')
          .select('produces_item_id, thumbnail_path')
          .in('produces_item_id', chunk)
          .not('thumbnail_path', 'is', null),
      ),
    ]);
    const plateOf = new Map(plates.map((plate) => [plate.produces_item_id, plate.thumbnail_path]));
    return new Map(rows.map((row) => [row.id, itemPhoto(row, plateOf.get(row.id) ?? null)]));
  }

  private async jobs(ids: string[]): Promise<Map<string, ResolvedPhoto>> {
    const rows = await this.chunked(ids, (chunk) =>
      this.supabase
        .from('print_jobs')
        .select('id, recipe_plates(thumbnail_path, inventory_items(kind, image_path)), order_lines(product_variants(image_path, catalog_products(image_path)))')
        .in('id', chunk),
    );
    return new Map(rows.map((row) => [row.id, jobPhoto(row)]));
  }

  private async orders(ids: string[]): Promise<Map<string, ResolvedPhoto>> {
    const rows = await this.chunked(ids, (chunk) =>
      this.supabase
        .from('order_lines')
        .select('order_id, position, product_variants(image_path, catalog_products(image_path))')
        .in('order_id', chunk),
    );
    const byOrder = new Map<string, typeof rows>();
    for (const row of rows) byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), row]);
    return new Map([...byOrder].map(([id, lines]) => [id, orderPhoto(lines)]));
  }

  /**
   * Runs one query per hundred ids. A failed lookup only costs pictures: the
   * rows still show their icon, so it is swallowed instead of breaking a list.
   */
  private async chunked<T>(
    ids: string[],
    query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> {
    if (ids.length === 0) return [];
    const chunks: string[][] = [];
    for (let start = 0; start < ids.length; start += IDS_PER_QUERY) chunks.push(ids.slice(start, start + IDS_PER_QUERY));

    const results = await Promise.all(chunks.map((chunk) => query(chunk)));
    return results.flatMap((result) => (result.error || !result.data ? [] : result.data));
  }
}
