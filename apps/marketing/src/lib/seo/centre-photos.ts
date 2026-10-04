/**
 * Centre photos as staff upload them in Admin > Centres.
 *
 * offline_centers.photos is jsonb. Old rows hold bare URL strings; the Admin
 * editor writes objects with alt text, a kind, a 1200x630 OG rendition and a
 * hero flag. This normalises both into one shape. Pure, so client components
 * and tests can use it.
 */

export type CentrePhotoKind = 'exterior' | 'classroom' | 'students' | 'results' | 'faculty';

export interface CentrePhoto {
  url: string;
  /** 1200x630 JPEG for og:image, when the upload made one. */
  og: string | null;
  alt: string;
  kind: CentrePhotoKind;
  width: number | null;
  height: number | null;
  hero: boolean;
}

const KINDS: CentrePhotoKind[] = ['exterior', 'classroom', 'students', 'results', 'faculty'];

/** Only hosts next.config allows for next/image (the Supabase proxy and projects). */
export const PHOTO_HOST = /^https:\/\/(db\.neramclasses\.com|db-staging\.neramclasses\.com|[a-z]+\.supabase\.co)\//;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** One stored entry (string or object) to a CentrePhoto, or null when unusable. */
export function toCentrePhoto(raw: unknown, fallbackAlt: string): CentrePhoto | null {
  if (typeof raw === 'string') {
    return PHOTO_HOST.test(raw) ? { url: raw, og: null, alt: fallbackAlt, kind: 'classroom', width: null, height: null, hero: false } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  if (!PHOTO_HOST.test(url)) return null;
  const og = typeof r.og === 'string' && PHOTO_HOST.test(r.og) ? r.og : null;
  const alt = typeof r.alt === 'string' && r.alt.trim() ? r.alt.trim() : fallbackAlt;
  const kind = KINDS.includes(r.kind as CentrePhotoKind) ? (r.kind as CentrePhotoKind) : 'classroom';
  return { url, og, alt, kind, width: num(r.w), height: num(r.h), hero: r.hero === true };
}

/**
 * All usable photos, hero first. When no photo is marked hero, the first
 * exterior or classroom photo leads (a signboard or a room reads as "a real
 * centre" in a search thumbnail).
 */
export function normaliseCentrePhotos(raw: unknown, fallbackAlt: string): CentrePhoto[] {
  const list = (Array.isArray(raw) ? raw : []).map((p) => toCentrePhoto(p, fallbackAlt)).filter((p): p is CentrePhoto => p !== null);
  const seen = new Set<string>();
  const unique = list.filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)));
  const heroIdx = unique.findIndex((p) => p.hero);
  const leadIdx = heroIdx >= 0 ? heroIdx : unique.findIndex((p) => p.kind === 'exterior' || p.kind === 'classroom');
  if (leadIdx > 0) unique.unshift(unique.splice(leadIdx, 1)[0]);
  return unique.map((p, i) => ({ ...p, hero: i === 0 }));
}

/** The URL of a stored entry, whatever its shape (for older listings). */
export function photoUrl(raw: unknown): string | null {
  if (typeof raw === 'string') return raw || null;
  if (raw && typeof raw === 'object' && typeof (raw as { url?: unknown }).url === 'string') return (raw as { url: string }).url;
  return null;
}
