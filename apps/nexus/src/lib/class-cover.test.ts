import { describe, it, expect } from 'vitest';
import { coverThumbSrc, resolveClassCover, sortClassImages, type ClassImageRef } from './class-cover';

function img(overrides: Partial<ClassImageRef> & { id: string }): ClassImageRef {
  return {
    url: `https://cdn.example/${overrides.id}.png`,
    thumb_url: null,
    caption: null,
    sort_order: 0,
    created_at: '2026-07-30T10:00:00Z',
    ...overrides,
  };
}

describe('sortClassImages', () => {
  it('orders by sort_order first', () => {
    const out = sortClassImages([img({ id: 'c', sort_order: 2 }), img({ id: 'a', sort_order: 0 }), img({ id: 'b', sort_order: 1 })]);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a sort_order tie by created_at', () => {
    // Every row defaults to sort_order 0, so this tiebreak is what actually
    // orders anything not written by the upload path.
    const out = sortClassImages([
      img({ id: 'late', created_at: '2026-07-30T12:00:00Z' }),
      img({ id: 'early', created_at: '2026-07-30T09:00:00Z' }),
    ]);
    expect(out.map((i) => i.id)).toEqual(['early', 'late']);
  });

  it('breaks an equal sort_order and created_at by id, so the order is stable', () => {
    const rows = [img({ id: 'zz' }), img({ id: 'aa' })];
    expect(sortClassImages(rows).map((i) => i.id)).toEqual(['aa', 'zz']);
    expect(sortClassImages([...rows].reverse()).map((i) => i.id)).toEqual(['aa', 'zz']);
  });

  it('treats a missing sort_order and created_at as the earliest', () => {
    const out = sortClassImages([
      img({ id: 'has-order', sort_order: 1 }),
      { id: 'bare', url: 'https://cdn.example/bare.png' },
    ]);
    expect(out.map((i) => i.id)).toEqual(['bare', 'has-order']);
  });

  it('does not mutate its input', () => {
    const rows = [img({ id: 'b', sort_order: 1 }), img({ id: 'a', sort_order: 0 })];
    sortClassImages(rows);
    expect(rows.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('resolveClassCover', () => {
  it('returns null when the class has no images', () => {
    expect(resolveClassCover([], 'anything')).toBeNull();
    expect(resolveClassCover(null, null)).toBeNull();
    expect(resolveClassCover(undefined, null)).toBeNull();
  });

  it('returns the only image whether or not it is starred', () => {
    const only = img({ id: 'solo' });
    expect(resolveClassCover([only], null)?.id).toBe('solo');
    expect(resolveClassCover([only], 'solo')?.id).toBe('solo');
  });

  it('returns the starred image even when it is not first', () => {
    const rows = [img({ id: 'first', sort_order: 0 }), img({ id: 'starred', sort_order: 3 })];
    expect(resolveClassCover(rows, 'starred')?.id).toBe('starred');
  });

  it('falls back to the first image when nothing is starred', () => {
    const rows = [img({ id: 'second', sort_order: 1 }), img({ id: 'first', sort_order: 0 })];
    expect(resolveClassCover(rows, null)?.id).toBe('first');
  });

  it('falls back to the first image when the starred one was deleted', () => {
    // The database clears cover_image_id itself, but a payload fetched before
    // the delete still carries the stale id.
    const rows = [img({ id: 'survivor', sort_order: 1 })];
    expect(resolveClassCover(rows, 'deleted-id')?.id).toBe('survivor');
  });

  it('agrees with sortClassImages on which image is first', () => {
    const rows = [img({ id: 'b', created_at: '2026-07-30T11:00:00Z' }), img({ id: 'a', created_at: '2026-07-30T10:00:00Z' })];
    expect(resolveClassCover(rows, null)?.id).toBe(sortClassImages(rows)[0].id);
  });
});

describe('coverThumbSrc', () => {
  it('prefers the small copy', () => {
    expect(coverThumbSrc(img({ id: 'x', thumb_url: 'https://cdn.example/x_thumb.webp' }))).toBe(
      'https://cdn.example/x_thumb.webp',
    );
  });

  it('falls back to the original for rows uploaded before thumbnails existed', () => {
    expect(coverThumbSrc(img({ id: 'old', thumb_url: null }))).toBe('https://cdn.example/old.png');
    expect(coverThumbSrc({ id: 'bare', url: 'https://cdn.example/bare.png' })).toBe('https://cdn.example/bare.png');
  });

  it('ignores an empty thumb_url rather than loading nothing', () => {
    expect(coverThumbSrc(img({ id: 'blank', thumb_url: '' }))).toBe('https://cdn.example/blank.png');
  });
});
