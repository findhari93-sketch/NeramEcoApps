/**
 * Pure rules for the college photo finder: is this search result the same
 * college, is this licence one we may use, which candidate goes first, and
 * which colleges are due for a look. No network, so all of it is unit-tested.
 */
import type { Candidate, CollegeForPhotos, PhotoStatus } from './types';

/** Words every college name shares; matching on them proves nothing. */
const GENERIC = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'in', 'at', 'on', 'to',
  'college', 'colleges', 'school', 'institute', 'institution', 'institutions', 'university',
  'department', 'faculty', 'centre', 'center', 'academy', 'campus', 'group',
  'architecture', 'architectural', 'planning', 'design', 'engineering', 'technology',
  'technological', 'polytechnic', 'arts', 'science', 'sciences', 'studies', 'research',
  'women', 'womens', 'autonomous', 'national', 'government', 'govt', 'private',
  'sri', 'shri', 'shree', 'sree', 'dr', 'st', 'saint', 'smt',
]);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokens(s: string): string[] {
  return normalizeName(s).split(' ').filter(Boolean);
}

/** The words that tell this college apart from others: "mohamed", "sathak". */
export function distinctiveTokens(name: string): string[] {
  return [...new Set(tokens(name).filter((t) => !GENERIC.has(t) && t.length > 1))];
}

/**
 * Share of the college's distinctive words found in `text`, 0 to 1.
 * A name with no distinctive words (e.g. "Government College of Architecture")
 * scores 0, so the caller falls back to also requiring the city.
 */
export function nameMatchScore(collegeName: string, text: string): number {
  const want = distinctiveTokens(collegeName);
  if (want.length === 0) return 0;
  const have = new Set(tokens(text));
  return want.filter((t) => have.has(t)).length / want.length;
}

/** True when `text` mentions the college's city or state. */
export function mentionsPlace(college: Pick<CollegeForPhotos, 'city' | 'state'>, text: string): boolean {
  const hay = ` ${normalizeName(text)} `;
  return [college.city, college.state]
    .filter((p): p is string => !!p && p.trim().length > 2)
    .some((p) => hay.includes(` ${normalizeName(p)} `));
}

/**
 * Is a Wikipedia article (title plus short description) about this college?
 * Strict on purpose: a wrong match would put another institution's photo and
 * coordinates on the page, which is worse than no photo.
 */
export function isSameCollege(
  college: Pick<CollegeForPhotos, 'name' | 'short_name' | 'city' | 'state'>,
  title: string,
  description = '',
): boolean {
  const both = `${title} ${description}`;
  const score = Math.max(
    nameMatchScore(college.name, title),
    college.short_name ? nameMatchScore(college.short_name, title) : 0,
  );
  if (distinctiveTokens(college.name).length === 0) {
    // Generic names: every word of the name and the place must be in the title.
    const all = tokens(college.name).filter((t) => !['of', 'and', 'the'].includes(t));
    const have = new Set(tokens(title));
    return all.every((t) => have.has(t)) && mentionsPlace(college, both);
  }
  return score >= 0.75 && mentionsPlace(college, both);
}

/** Free licences only. Non-commercial and no-derivatives licences are refused. */
export function isAllowedLicense(short: string | undefined | null): boolean {
  if (!short) return false;
  const s = short.toLowerCase().trim();
  if (/\bnc\b|non-?commercial|\bnd\b|no-?deriv/.test(s)) return false;
  return (
    /^cc0/.test(s) ||
    /public domain|^pd\b|^pd-/.test(s) ||
    /^cc[ -]by(-sa)?([ -]\d(\.\d)?)?/.test(s) ||
    /^attribution/.test(s)
  );
}

/** Commons "Artist" is HTML; keep the name and drop the markup. */
export function plainCredit(html: string | undefined | null, fallback = 'Wikimedia Commons'): string {
  if (!html) return fallback;
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}...` : text;
}

const SOURCE_WEIGHT: Record<Candidate['source'], number> = {
  manifest: 5,
  wikidata: 4,
  wikipedia: 3,
  commons: 2,
  site: 1,
};

/** Best-first order used when the AI judge is unavailable, and to pick what the judge sees. */
export function rankCandidates(cands: Candidate[]): Candidate[] {
  const score = (c: Candidate) => {
    let s = SOURCE_WEIGHT[c.source] * 10;
    if (c.kind === 'cover') {
      if (c.width && c.height) {
        const ratio = c.width / c.height;
        if (ratio >= 1.2 && ratio <= 2.6) s += 5;
        if (ratio < 1) s -= 15;
        if (c.width >= 1600) s += 3;
        else if (c.width < 1000) s -= 20;
      }
    } else if (/logo|emblem|seal|crest/i.test(`${c.url} ${c.title ?? ''}`)) {
      s += 6;
    }
    return s;
  };
  return dedupe(cands).sort((a, b) => score(b) - score(a));
}

export function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = `${c.kind}|${c.url.replace(/[?#].*$/, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Without the AI judge we only trust what a person chose for this college:
 * Wikidata's own image and logo (and the article's lead image). Commons search
 * and category files can be events, sports days or interiors, and images on a
 * college site can be a banner ad or a crowd, so those need the judge.
 */
export function trustedWithoutJudge(c: Candidate): boolean {
  if (c.kind === 'logo') return c.source === 'wikidata' || /logo|emblem/i.test(c.url);
  return c.source === 'wikidata';
}

export function statusFor(hasCover: boolean, hasLogo: boolean): PhotoStatus {
  if (hasCover && hasLogo) return 'found';
  if (hasCover || hasLogo) return 'partial';
  return 'not_found';
}

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_DAYS = 30;

/** Is this college due for the photo cron? Pending now; misses retried monthly, three times. */
export function isDue(
  c: Pick<CollegeForPhotos, 'photo_status' | 'photo_checked_at' | 'photo_attempts'>,
  now: Date = new Date(),
): boolean {
  if (c.photo_status === 'pending') return true;
  if (c.photo_status !== 'not_found' && c.photo_status !== 'partial') return false;
  if (c.photo_attempts >= MAX_ATTEMPTS) return false;
  if (!c.photo_checked_at) return true;
  const age = now.getTime() - new Date(c.photo_checked_at).getTime();
  return age >= RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** Storage path a person (and Google Images) can read: `<id>/<slug>-campus-<ts>.webp`. */
export function photoPath(collegeId: string, slug: string, kind: 'cover' | 'logo', now = Date.now()): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'college';
  return `${collegeId}/${safe}-${kind === 'cover' ? 'campus' : 'logo'}-${now.toString(36)}.webp`;
}

/** Year from a Wikidata time value when it is at least year-precise. */
export function yearFromWikidataTime(v: { time?: string; precision?: number } | undefined): number | undefined {
  if (!v?.time || (v.precision ?? 0) < 9) return undefined;
  const m = /^\+?(\d{4})-/.exec(v.time);
  const y = m ? Number(m[1]) : NaN;
  return y >= 1800 && y <= new Date().getFullYear() ? y : undefined;
}

/** Inside India's bounding box, so a wrong-country match never sets coordinates. */
export function inIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
}

/** Resolve a possibly relative URL found on a page. Returns null for data: and junk. */
export function absoluteUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null;
  const h = href.trim().replace(/&amp;/g, '&');
  if (!h || h.startsWith('data:') || h.startsWith('javascript:')) return null;
  try {
    const u = new URL(h, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeWebsite(site: string | null | undefined): string | null {
  if (!site) return null;
  const s = site.trim();
  if (!s) return null;
  return absoluteUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`, 'https://example.com');
}
