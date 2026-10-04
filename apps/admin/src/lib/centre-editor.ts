/**
 * Admin > Centres: what a classroom's public page needs, and the checks that
 * keep bad data off it. Marketing reads these offline_centers fields on the
 * centre's own city page (apps/marketing/src/lib/seo/facts.ts). Pure, so it is
 * unit tested.
 */

/** Hosts the marketing site loads photos from (next.config remotePatterns). */
export const CENTRE_PHOTO_HOST = /^https:\/\/(db\.neramclasses\.com|db-staging\.neramclasses\.com|[a-z]+\.supabase\.co)\//;

export type PhotoKind = 'exterior' | 'classroom' | 'students' | 'results' | 'faculty';

export const PHOTO_KINDS: Array<{ value: PhotoKind; label: string }> = [
  { value: 'exterior', label: 'Outside, with the signboard' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'students', label: 'Students drawing or in class' },
  { value: 'results', label: 'Results or toppers board' },
  { value: 'faculty', label: 'Faculty' },
];

export interface CentrePhotoEntry {
  url: string;
  og?: string | null;
  alt: string;
  kind: PhotoKind;
  w?: number | null;
  h?: number | null;
  hero?: boolean;
}

export type DayHours = { open: string; close: string } | null;
export type WeekHours = Partial<Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', DayHours>>;

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export interface CentreRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  address: string | null;
  pincode: string | null;
  landmark: string | null;
  contact_phone: string | null;
  operating_hours: WeekHours | null;
  google_business_url: string | null;
  google_reviews_url: string | null;
  google_place_id: string | null;
  established_year: number | null;
  description: string | null;
  description_reviewed: boolean | null;
  facilities: string[] | null;
  photos: unknown;
  rating: number | string | null;
  review_count: number | null;
  rating_checked_at: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

/** The seeded rows all carry these hours. They are a placeholder, not the centre's real hours. */
const TEMPLATE_DAY = { open: '09:00', close: '18:00' };
const TEMPLATE_SAT = { open: '09:00', close: '14:00' };

export function isTemplateHours(h: WeekHours | null | undefined): boolean {
  if (!h) return true;
  const same = (a: DayHours | undefined, b: DayHours) => (a ?? null) === null ? b === null : !!b && a!.open === b.open && a!.close === b.close;
  return (
    (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const).every((d) => same(h[d], TEMPLATE_DAY)) &&
    same(h.saturday, TEMPLATE_SAT) &&
    same(h.sunday, null)
  );
}

/** offline_centers.photos entries as objects (old rows hold bare URL strings). */
export function photoEntries(raw: unknown, fallbackAlt: string): CentrePhotoEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p): CentrePhotoEntry | null => {
      if (typeof p === 'string') return p ? { url: p, alt: fallbackAlt, kind: 'classroom' } : null;
      if (!p || typeof p !== 'object' || typeof (p as CentrePhotoEntry).url !== 'string') return null;
      const e = p as CentrePhotoEntry;
      return { ...e, kind: PHOTO_KINDS.some((k) => k.value === e.kind) ? e.kind : 'classroom', alt: e.alt ?? fallbackAlt };
    })
    .filter((p): p is CentrePhotoEntry => p !== null);
}

/** A street address is more than the city name. */
export function hasStreet(row: Pick<CentreRow, 'address' | 'city'>): boolean {
  const a = (row.address ?? '').trim().toLowerCase();
  return a.length > 0 && a !== row.city.trim().toLowerCase();
}

export interface CheckItem {
  key: string;
  label: string;
  done: boolean;
  /** Why it matters, shown under the item. */
  hint: string;
}

/** What the centre's page and Google profile still need. Order: most visible first. */
export function completeness(row: CentreRow): CheckItem[] {
  const photos = photoEntries(row.photos, row.name);
  return [
    { key: 'address', label: 'Street address and pincode', done: hasStreet(row) && !!row.pincode, hint: 'Needed for the map pin and the LocalBusiness schema.' },
    { key: 'photos', label: 'At least 4 real photos', done: photos.length >= 4, hint: 'Google shows a photo next to the result. 4 or more also help the page get indexed.' },
    {
      key: 'photo-kinds',
      label: 'An outside photo with the signboard and a classroom photo',
      done: photos.some((p) => p.kind === 'exterior') && photos.some((p) => p.kind === 'classroom'),
      hint: 'Students want to recognise the building when they visit.',
    },
    { key: 'description', label: 'About this centre, checked by a reviewer', done: !!row.description?.trim() && row.description_reviewed === true, hint: 'Shown on the page only after the reviewer tick.' },
    { key: 'hours', label: 'Real opening hours', done: !isTemplateHours(row.operating_hours), hint: 'Every centre still shows the same placeholder hours.' },
    { key: 'phone', label: 'Phone number', done: !!row.contact_phone?.trim(), hint: 'Use the same number as on Google and Justdial.' },
    { key: 'gbp', label: 'Google Business Profile link', done: !!row.google_business_url?.trim(), hint: 'The "Google reviews" button and the schema sameAs.' },
    { key: 'place-id', label: 'Google Place ID', done: !!row.google_place_id?.trim(), hint: 'Makes the "Copy review link" button work.' },
    { key: 'year', label: 'Year the centre opened', done: !!row.established_year, hint: 'Shown as "Teaching here since". Keep it the same as on Google.' },
  ];
}

export function completenessScore(row: CentreRow): { done: number; total: number } {
  const items = completeness(row);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** Google's "write a review" link for a place. */
export function reviewLink(placeId: string | null | undefined): string | null {
  const id = (placeId ?? '').trim();
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? `https://search.google.com/local/writereview?placeid=${id}` : null;
}

/** "madurai-classroom" for file names Google can read. */
export function photoFileBase(city: string, kind: PhotoKind): string {
  const c = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'centre';
  return `neram-nata-coaching-${c}-${kind}`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const text = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error('must be text');
  const t = v.trim();
  if (t.length > max) throw new Error(`must be ${max} characters or fewer`);
  return t || null;
};

/** Fields staff may edit, validated. Unknown keys are ignored. */
export function sanitizeCentrePatch(body: unknown, photoHost: RegExp): { patch: Record<string, unknown>; errors: Record<string, string> } {
  const patch: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const field = (key: string, fn: () => unknown) => {
    if (!(key in b)) return;
    try {
      patch[key] = fn();
    } catch (e) {
      errors[key] = (e as Error).message;
    }
  };

  field('address', () => text(b.address, 300));
  field('pincode', () => {
    const p = text(b.pincode, 6);
    if (p && !/^\d{6}$/.test(p)) throw new Error('must be 6 digits');
    return p;
  });
  field('landmark', () => text(b.landmark, 120));
  field('contact_phone', () => {
    const p = text(b.contact_phone, 20);
    if (p && !/^\+?\d[\d\s-]{8,}$/.test(p)) throw new Error('must be a phone number');
    return p ? p.replace(/[\s-]/g, '') : null;
  });
  for (const key of ['google_business_url', 'google_reviews_url']) {
    field(key, () => {
      const u = text(b[key], 500);
      if (u && !HTTPS.test(u)) throw new Error('must start with https://');
      return u;
    });
  }
  field('google_place_id', () => {
    const p = text(b.google_place_id, 200);
    if (p && !/^[A-Za-z0-9_-]{10,}$/.test(p)) throw new Error('looks wrong: copy it from Google’s Place ID finder');
    return p;
  });
  field('established_year', () => {
    if (b.established_year === null || b.established_year === '') return null;
    const y = Number(b.established_year);
    if (!Number.isInteger(y) || y < 1990 || y > new Date().getFullYear()) throw new Error('must be a year between 1990 and now');
    return y;
  });
  field('description', () => text(b.description, 2000));
  field('description_reviewed', () => b.description_reviewed === true);
  field('facilities', () => {
    if (!Array.isArray(b.facilities)) throw new Error('must be a list');
    return Array.from(new Set(b.facilities.map((f) => text(f, 60)).filter((f): f is string => !!f))).slice(0, 12);
  });
  field('rating', () => {
    if (b.rating === null || b.rating === '') return null;
    const r = Number(b.rating);
    if (!(r >= 1 && r <= 5)) throw new Error('must be between 1 and 5');
    return Math.round(r * 10) / 10;
  });
  field('review_count', () => {
    if (b.review_count === null || b.review_count === '') return 0;
    const n = Number(b.review_count);
    if (!Number.isInteger(n) || n < 0) throw new Error('must be a whole number');
    return n;
  });
  field('rating_checked_at', () => {
    const d = text(b.rating_checked_at, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('must be a date');
    return d;
  });
  field('operating_hours', () => {
    const h = b.operating_hours as Record<string, unknown> | null;
    if (!h || typeof h !== 'object') throw new Error('must be the weekly hours');
    const out: WeekHours = {};
    for (const d of DAYS) {
      const v = h[d] as { open?: unknown; close?: unknown } | null | undefined;
      if (!v) {
        out[d] = null;
        continue;
      }
      if (typeof v.open !== 'string' || typeof v.close !== 'string' || !TIME.test(v.open) || !TIME.test(v.close) || v.open >= v.close) {
        throw new Error(`${d}: opening must be before closing (HH:MM)`);
      }
      out[d] = { open: v.open, close: v.close };
    }
    return out;
  });
  field('photos', () => {
    if (!Array.isArray(b.photos)) throw new Error('must be a list');
    if (b.photos.length > 12) throw new Error('12 photos at most');
    const list = b.photos.map((p, i) => {
      const e = (p ?? {}) as Record<string, unknown>;
      if (typeof e.url !== 'string' || !photoHost.test(e.url)) throw new Error(`photo ${i + 1} is not an uploaded centre photo`);
      const alt = text(e.alt, 160);
      if (!alt || alt.length < 10) throw new Error(`photo ${i + 1} needs a description of at least 10 characters`);
      const kind = PHOTO_KINDS.some((k) => k.value === e.kind) ? (e.kind as PhotoKind) : 'classroom';
      const og = typeof e.og === 'string' && photoHost.test(e.og) ? e.og : null;
      const w = Number.isInteger(e.w) ? (e.w as number) : null;
      const h = Number.isInteger(e.h) ? (e.h as number) : null;
      return { url: e.url, og, alt, kind, w, h, hero: e.hero === true };
    });
    // Exactly one hero: the one marked, else the first.
    const heroAt = Math.max(0, list.findIndex((p) => p.hero));
    return list.map((p, i) => ({ ...p, hero: i === heroAt }));
  });

  return { patch, errors };
}

/**
 * The centre's public page on the marketing site. Mirrors CENTRE_PAGE_SLUGS
 * and centreCitySlug in apps/marketing/src/lib/seo/facts.ts.
 */
const PAGE_SLUG_BY_ROW: Record<string, string> = { tambaram: 'tambaram' };
const PAGE_SLUG_BY_CITY: Record<string, string> = { tiruchirapalli: 'trichy', tiruchirappalli: 'trichy', bengaluru: 'bangalore' };

export function centrePagePath(row: Pick<CentreRow, 'slug' | 'city'>): string {
  const city = row.city.trim().toLowerCase().replace(/\s+/g, '-');
  const slug = PAGE_SLUG_BY_ROW[row.slug] ?? PAGE_SLUG_BY_CITY[city] ?? city;
  return `/coaching/nata-coaching/nata-coaching-centers-in-${slug}`;
}
