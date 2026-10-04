import { describe, it, expect } from 'vitest';
import { normaliseCentrePhotos, photoUrl, toCentrePhoto } from './centre-photos';

const HOST = 'https://db.neramclasses.com/storage/v1/object/public/centre-photos/madurai';

describe('centre photos', () => {
  it('reads old string entries and drops hosts next/image cannot load', () => {
    expect(toCentrePhoto(`${HOST}/a.webp`, 'Madurai classroom')).toMatchObject({ url: `${HOST}/a.webp`, alt: 'Madurai classroom', kind: 'classroom' });
    expect(toCentrePhoto('https://example.com/a.jpg', 'x')).toBeNull();
    expect(toCentrePhoto(null, 'x')).toBeNull();
  });

  it('reads objects, keeps their alt, kind, size and OG rendition', () => {
    const p = toCentrePhoto({ url: `${HOST}/b.webp`, og: `${HOST}/b-og.jpg`, alt: ' Signboard ', kind: 'exterior', w: 1600, h: 1200 }, 'x');
    expect(p).toEqual({ url: `${HOST}/b.webp`, og: `${HOST}/b-og.jpg`, alt: 'Signboard', kind: 'exterior', width: 1600, height: 1200, hero: false });
    expect(toCentrePhoto({ url: `${HOST}/c.webp`, og: 'https://evil.test/c.jpg', kind: 'selfie' }, 'Fallback')).toMatchObject({ og: null, kind: 'classroom', alt: 'Fallback' });
  });

  it('puts the hero first, else the first exterior or classroom photo, and dedupes', () => {
    const list = normaliseCentrePhotos(
      [
        { url: `${HOST}/results.webp`, kind: 'results' },
        { url: `${HOST}/room.webp`, kind: 'classroom' },
        { url: `${HOST}/room.webp`, kind: 'classroom' },
        { url: `${HOST}/team.webp`, kind: 'faculty', hero: true },
      ],
      'x',
    );
    expect(list.map((p) => p.url.split('/').pop())).toEqual(['team.webp', 'results.webp', 'room.webp']);
    expect(list.map((p) => p.hero)).toEqual([true, false, false]);

    const noHero = normaliseCentrePhotos([{ url: `${HOST}/results.webp`, kind: 'results' }, { url: `${HOST}/room.webp`, kind: 'classroom' }], 'x');
    expect(noHero[0].url).toBe(`${HOST}/room.webp`);
  });

  it('handles empty and non-array input', () => {
    expect(normaliseCentrePhotos([], 'x')).toEqual([]);
    expect(normaliseCentrePhotos(null, 'x')).toEqual([]);
    expect(normaliseCentrePhotos({}, 'x')).toEqual([]);
  });

  it('photoUrl reads both shapes', () => {
    expect(photoUrl('u')).toBe('u');
    expect(photoUrl({ url: 'v' })).toBe('v');
    expect(photoUrl(3)).toBeNull();
  });
});
