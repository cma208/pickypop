import { TestBed } from '@angular/core/testing';
import { Media, THUMB_MAX_DISPLAY_PX, thumbPathOf, variantForSize } from './media';
import { SUPABASE } from './supabase';

const PHOTO = 'ws/articulos/0979e83b.webp';
const SMALL = 'ws/articulos/0979e83b.thumb.webp';

/**
 * A storage bucket that only holds `existing`. Like the real one, a path that
 * is not there comes back without a link instead of failing the whole batch.
 */
function bucketWith(existing: string[]) {
  const signed: string[][] = [];
  const removed: string[][] = [];
  const bucket = {
    createSignedUrls: async (paths: string[]) => {
      signed.push(paths);
      return {
        data: paths.map((path) => ({
          path,
          signedUrl: existing.includes(path) ? `https://cdn.test/${path}?token=1` : null,
          error: existing.includes(path) ? null : 'Either the object does not exist',
        })),
        error: null,
      };
    },
    remove: async (paths: string[]) => {
      removed.push(paths);
      return { data: [], error: null };
    },
  };
  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE, useValue: { storage: { from: () => bucket } } }],
  });
  return { media: TestBed.inject(Media), signed, removed };
}

describe('thumbPathOf', () => {
  it('puts the small copy next to the original', () => {
    expect(thumbPathOf(PHOTO)).toBe(SMALL);
  });

  it('has nothing to offer for a small copy or a file that was not uploaded as WebP', () => {
    expect(thumbPathOf(SMALL)).toBeNull();
    expect(thumbPathOf('ws/productos/foto.jpg')).toBeNull();
  });
});

describe('variantForSize', () => {
  it('asks for the small copy up to what is drawn on the printer card', () => {
    expect(variantForSize(24)).toBe('thumb');
    expect(variantForSize(48)).toBe('thumb');
    expect(variantForSize(THUMB_MAX_DISPLAY_PX)).toBe('thumb');
  });

  it('asks for the original for the record of an article', () => {
    expect(variantForSize(THUMB_MAX_DISPLAY_PX + 1)).toBe('full');
    expect(variantForSize(240)).toBe('full');
  });
});

describe('Media.url', () => {
  it('signs the small copy when one exists', async () => {
    const { media } = bucketWith([PHOTO, SMALL]);

    expect(await media.url(PHOTO, 'thumb')).toContain(SMALL);
  });

  it('falls back to the original for a photo uploaded before copies existed', async () => {
    const { media, signed } = bucketWith([PHOTO]);

    expect(await media.url(PHOTO, 'thumb')).toContain(PHOTO);
    // And it remembers: the next time it goes straight to the original.
    await media.url(PHOTO, 'thumb');
    expect(signed.flat().filter((path) => path === SMALL)).toHaveLength(1);
  });

  it('signs the original when the record asks for it', async () => {
    const { media } = bucketWith([PHOTO, SMALL]);

    expect(await media.url(PHOTO, 'full')).toContain(PHOTO);
    expect(await media.url(PHOTO)).not.toContain('.thumb.');
  });

  it('signs everything asked in the same tick in one call', async () => {
    const other = 'ws/articulos/other.webp';
    const { media, signed } = bucketWith([PHOTO, SMALL, other]);

    await Promise.all([media.url(PHOTO, 'thumb'), media.url(other), media.url(PHOTO, 'thumb')]);

    expect(signed).toEqual([[SMALL, other]]);
  });

  it('gives nothing for nothing', async () => {
    const { media, signed } = bucketWith([]);

    expect(await media.url(null, 'thumb')).toBeNull();
    expect(signed).toEqual([]);
  });
});

describe('Media.remove', () => {
  it('takes the small copy with it', async () => {
    const { media, removed } = bucketWith([PHOTO, SMALL]);

    await media.remove(PHOTO);

    expect(removed).toEqual([[PHOTO, SMALL]]);
  });
});
