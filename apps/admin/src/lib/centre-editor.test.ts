import { describe, it, expect } from 'vitest';
import { completeness, completenessScore, isTemplateHours, photoEntries, photoFileBase, reviewLink, sanitizeCentrePatch, type CentreRow } from './centre-editor';

const HOST = /^https:\/\/(db\.neramclasses\.com|[a-z]+\.supabase\.co)\//;
const P = 'https://db.neramclasses.com/storage/v1/object/public/centre-photos/madurai';

const TEMPLATE = {
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '14:00' },
  sunday: null,
};

const row = (over: Partial<CentreRow> = {}): CentreRow => ({
  id: 'c1',
  name: 'Neram Classes - NATA Coaching Madurai',
  slug: 'madurai',
  city: 'Madurai',
  state: 'Tamil Nadu',
  address: '2/401, IInd Floor, Vasanth Nagar',
  pincode: '625003',
  landmark: null,
  contact_phone: '+919176137043',
  operating_hours: TEMPLATE,
  google_business_url: null,
  google_reviews_url: null,
  google_place_id: null,
  established_year: null,
  description: null,
  description_reviewed: false,
  facilities: [],
  photos: [],
  rating: null,
  review_count: 0,
  rating_checked_at: null,
  is_active: true,
  updated_at: null,
  ...over,
});

describe('centre completeness', () => {
  it('spots the seeded placeholder hours', () => {
    expect(isTemplateHours(TEMPLATE)).toBe(true);
    expect(isTemplateHours({ ...TEMPLATE, saturday: { open: '09:00', close: '17:00' } })).toBe(false);
    expect(isTemplateHours({ ...TEMPLATE, sunday: { open: '10:00', close: '13:00' } })).toBe(false);
    expect(isTemplateHours(null)).toBe(true);
  });

  it('lists what the page still needs', () => {
    const items = Object.fromEntries(completeness(row()).map((i) => [i.key, i.done]));
    expect(items).toMatchObject({ address: true, photos: false, description: false, hours: false, phone: true, gbp: false, 'place-id': false, year: false });
    expect(completeness(row({ address: 'Madurai' })).find((i) => i.key === 'address')?.done).toBe(false);
  });

  it('counts a description only once a reviewer ticked it', () => {
    expect(completeness(row({ description: 'About', description_reviewed: false })).find((i) => i.key === 'description')?.done).toBe(false);
    expect(completeness(row({ description: 'About', description_reviewed: true })).find((i) => i.key === 'description')?.done).toBe(true);
  });

  it('needs four photos including an outside and a classroom shot', () => {
    const photos = ['exterior', 'classroom', 'students', 'results'].map((kind, i) => ({ url: `${P}/${i}.webp`, alt: 'A real photo', kind }));
    const r = row({ photos });
    expect(completeness(r).filter((i) => i.key.startsWith('photo')).every((i) => i.done)).toBe(true);
    expect(completenessScore(r).total).toBe(9);
  });
});

describe('helpers', () => {
  it('reads old string photos and new objects', () => {
    expect(photoEntries([`${P}/a.webp`, { url: `${P}/b.webp`, alt: 'B', kind: 'nope' }, 5], 'X')).toEqual([
      { url: `${P}/a.webp`, alt: 'X', kind: 'classroom' },
      { url: `${P}/b.webp`, alt: 'B', kind: 'classroom' },
    ]);
  });

  it('builds a review link only from a plausible place ID', () => {
    expect(reviewLink('ChIJabc123XYZ_-9')).toBe('https://search.google.com/local/writereview?placeid=ChIJabc123XYZ_-9');
    expect(reviewLink('bad id')).toBeNull();
    expect(reviewLink(null)).toBeNull();
  });

  it('names files for Google', () => {
    expect(photoFileBase('Tiruchirapalli', 'exterior')).toBe('neram-nata-coaching-tiruchirapalli-exterior');
  });
});

describe('sanitizeCentrePatch', () => {
  it('keeps valid fields, trims, and ignores unknown keys', () => {
    const { patch, errors } = sanitizeCentrePatch(
      { landmark: '  Near the signal ', contact_phone: '+91 91761 37043', established_year: '2016', is_active: false, rating: '4.66', review_count: '37' },
      HOST,
    );
    expect(errors).toEqual({});
    expect(patch).toEqual({ landmark: 'Near the signal', contact_phone: '+919176137043', established_year: 2016, rating: 4.7, review_count: 37 });
  });

  it('rejects bad values with a message per field', () => {
    const { errors } = sanitizeCentrePatch(
      { pincode: '62500', google_business_url: 'http://x', established_year: 1800, google_place_id: 'x', rating: 9 },
      HOST,
    );
    expect(Object.keys(errors).sort()).toEqual(['established_year', 'google_business_url', 'google_place_id', 'pincode', 'rating']);
  });

  it('validates hours', () => {
    expect(sanitizeCentrePatch({ operating_hours: { ...TEMPLATE, monday: { open: '18:00', close: '09:00' } } }, HOST).errors.operating_hours).toMatch(/monday/);
    expect(sanitizeCentrePatch({ operating_hours: TEMPLATE }, HOST).patch.operating_hours).toEqual(TEMPLATE);
  });

  it('accepts only uploaded photos with a description, and keeps exactly one hero', () => {
    const ok = sanitizeCentrePatch(
      {
        photos: [
          { url: `${P}/a.webp`, og: `${P}/a-og.jpg`, alt: 'Outside the Madurai centre', kind: 'exterior', w: 1600, h: 1200 },
          { url: `${P}/b.webp`, alt: 'Students drawing in class', kind: 'students', hero: true },
        ],
      },
      HOST,
    );
    expect(ok.errors).toEqual({});
    expect((ok.patch.photos as Array<{ hero: boolean }>).map((p) => p.hero)).toEqual([false, true]);

    expect(sanitizeCentrePatch({ photos: [{ url: 'https://evil.test/a.jpg', alt: 'Some photo here' }] }, HOST).errors.photos).toMatch(/not an uploaded/);
    expect(sanitizeCentrePatch({ photos: [{ url: `${P}/a.webp`, alt: 'short' }] }, HOST).errors.photos).toMatch(/description/);
  });
});

describe('centrePagePath', () => {
  it('matches the marketing city page slugs', async () => {
    const { centrePagePath } = await import('./centre-editor');
    expect(centrePagePath({ slug: 'trichy', city: 'Tiruchirapalli' })).toBe('/coaching/nata-coaching/nata-coaching-centers-in-trichy');
    expect(centrePagePath({ slug: 'tambaram', city: 'Chennai' })).toBe('/coaching/nata-coaching/nata-coaching-centers-in-tambaram');
    expect(centrePagePath({ slug: 'pudukkottai-nata', city: 'Pudukkottai' })).toBe('/coaching/nata-coaching/nata-coaching-centers-in-pudukkottai');
  });
});
