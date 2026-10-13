/**
 * Pure rules for the /reviews hub as the site's source of truth for reviews.
 * No Supabase, no Next.js: unit tested in hub.test.ts.
 *
 * Three honesty rules live here:
 *  - The hub states Google's own rating for each centre, never an average it
 *    computed from reviews staff chose to publish (BIS IS 19000:2022). Google
 *    shows no stars for a business's reviews of itself anyway.
 *  - The templated testimonials page switches over to /reviews only once enough
 *    verified reviews exist to stand on their own.
 *  - The facts block quotes only counts and names that come from data.
 */

import type { PublicReview } from './json-ld';

/** Verified, published reviews needed before /testimonials redirects to /reviews. */
export const SWITCHOVER_MIN_VERIFIED = 9;

export function shouldSwitchOver(verifiedPublishedCount: number): boolean {
  return Number.isFinite(verifiedPublishedCount) && verifiedPublishedCount >= SWITCHOVER_MIN_VERIFIED;
}

// ── filters ──────────────────────────────────────────────────────────────

export interface ReviewFilters {
  year: number | null;
  city: string | null;
  mode: 'online' | 'hybrid' | 'offline' | null;
  college: string | null;
}

export const EMPTY_FILTERS: ReviewFilters = { year: null, city: null, mode: null, college: null };

const MODES = ['online', 'hybrid', 'offline'] as const;
const clean = (v: unknown, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Filters from a query string (or URLSearchParams-like). Anything odd is dropped. */
export function parseReviewFilters(get: (key: string) => string | null | undefined): ReviewFilters {
  const year = Number(get('year'));
  const mode = get('mode');
  return {
    year: Number.isInteger(year) && year >= 2015 && year <= 2100 ? year : null,
    city: clean(get('city')),
    mode: (MODES as readonly string[]).includes(mode || '') ? (mode as ReviewFilters['mode']) : null,
    college: clean(get('college'), 120),
  };
}

export function hasActiveFilters(f: ReviewFilters): boolean {
  return Boolean(f.year || f.city || f.mode || f.college);
}

/** The query string for a set of filters, stable order, empty values left out. */
export function filtersToQuery(f: ReviewFilters): string {
  const q = new URLSearchParams();
  if (f.year) q.set('year', String(f.year));
  if (f.city) q.set('city', f.city);
  if (f.mode) q.set('mode', f.mode);
  if (f.college) q.set('college', f.college);
  return q.toString();
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function applyReviewFilters<T extends Pick<PublicReview, 'year' | 'city' | 'learningMode' | 'collegeAdmitted'>>(
  reviews: T[],
  f: ReviewFilters,
): T[] {
  return reviews.filter(
    (r) =>
      (!f.year || r.year === f.year) &&
      (!f.city || norm(r.city) === norm(f.city)) &&
      (!f.mode || r.learningMode === f.mode) &&
      (!f.college || norm(r.collegeAdmitted) === norm(f.college)),
  );
}

export interface ReviewFacets {
  years: number[];
  cities: string[];
  modes: Array<'online' | 'hybrid' | 'offline'>;
  colleges: string[];
}

/** The options each filter can offer: only values some published review has. */
export function facetOptions(reviews: Array<Pick<PublicReview, 'year' | 'city' | 'learningMode' | 'collegeAdmitted'>>): ReviewFacets {
  const years = new Set<number>();
  const cities = new Map<string, string>();
  const modes = new Set<'online' | 'hybrid' | 'offline'>();
  const colleges = new Map<string, string>();
  for (const r of reviews) {
    if (r.year) years.add(r.year);
    // First spelling wins, so "Chennai" is not replaced by a later "chennai ".
    if (r.city?.trim() && !cities.has(norm(r.city))) cities.set(norm(r.city), r.city.trim());
    if (r.learningMode) modes.add(r.learningMode);
    if (r.collegeAdmitted?.trim() && !colleges.has(norm(r.collegeAdmitted))) colleges.set(norm(r.collegeAdmitted), r.collegeAdmitted.trim());
  }
  return {
    years: [...years].sort((a, b) => b - a),
    cities: [...cities.values()].sort((a, b) => a.localeCompare(b)),
    modes: MODES.filter((m) => modes.has(m)),
    colleges: [...colleges.values()].sort((a, b) => a.localeCompare(b)),
  };
}

// ── facts block (AEO) ────────────────────────────────────────────────────

export interface CentreGoogleRating {
  name: string;
  city: string;
  rating: number;
  count: number;
  url: string | null;
}

/**
 * Centres whose Google rating can be quoted: a real rating with at least one
 * review, best-reviewed first. A rating with zero reviews is not a rating.
 */
export function quotableGoogleRatings(
  rows: Array<{ name: string; city: string | null; rating: number | string | null; review_count: number | null; google_reviews_url?: string | null; google_business_url?: string | null }>,
): CentreGoogleRating[] {
  return rows
    .map((r) => ({
      name: r.name,
      city: (r.city || '').trim(),
      rating: Number(r.rating),
      count: Number(r.review_count),
      url: r.google_reviews_url?.trim() || r.google_business_url?.trim() || null,
    }))
    .filter((r) => Number.isFinite(r.rating) && r.rating > 0 && r.rating <= 5 && Number.isInteger(r.count) && r.count >= 1)
    .sort((a, b) => b.count - a.count || b.rating - a.rating);
}

/** One weighted rating across the quotable Google profiles, or null. */
export function combinedGoogleRating(ratings: CentreGoogleRating[]): { rating: number; count: number; profiles: number } | null {
  const count = ratings.reduce((s, r) => s + r.count, 0);
  if (!count) return null;
  const weighted = ratings.reduce((s, r) => s + r.rating * r.count, 0) / count;
  return { rating: Math.round(weighted * 10) / 10, count, profiles: ratings.length };
}

/** Colleges named by the most reviews, for "students placed in ..." */
export function topColleges(reviews: Array<Pick<PublicReview, 'collegeAdmitted'>>, limit = 5): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of reviews) {
    const name = r.collegeAdmitted?.trim();
    if (!name) continue;
    const key = norm(name);
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { name, n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, limit).map((c) => c.name);
}

export interface HubFacts {
  verifiedCount: number;
  publishedCount: number;
  google: { rating: number; count: number; profiles: number } | null;
  colleges: string[];
}

/**
 * The short facts answer engines can quote: one plain sentence per fact, built
 * only from what the data says. A fact with nothing behind it is left out,
 * never padded. No em dashes (project writing rule).
 */
export function factsSentence(f: HubFacts): string | null {
  const sentences: string[] = [];
  if (f.publishedCount > 0) {
    const reviews = `${f.publishedCount} published student review${f.publishedCount === 1 ? '' : 's'}`;
    sentences.push(
      f.verifiedCount > 0
        ? `Neram Classes has ${reviews}, ${f.verifiedCount === f.publishedCount ? (f.publishedCount === 1 ? 'from a verified Neram student' : 'all from verified Neram students') : `${f.verifiedCount} of them from verified Neram students`}.`
        : `Neram Classes has ${reviews}.`,
    );
  }
  if (f.google) {
    sentences.push(
      `Its Google rating is ${f.google.rating.toFixed(1)} from ${f.google.count} review${f.google.count === 1 ? '' : 's'}` +
        (f.google.profiles > 1 ? ` across ${f.google.profiles} centres.` : '.'),
    );
  }
  if (f.colleges.length) sentences.push(`Students now study at ${joinList(f.colleges)}.`);
  return sentences.length ? sentences.join(' ') : null;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Profiles for the organization's sameAs, so engines treat the Google profiles
 * and directory listings as one entity with the site. https only, de-duplicated.
 */
export function sameAsUrls(urls: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    const v = (u || '').trim();
    if (/^https:\/\/[^\s]+$/.test(v)) out.add(v);
  }
  return [...out];
}

/** "AIR 142" or "98.5 percentile", the result line on a card. */
export function resultLabel(r: Pick<PublicReview, 'rank' | 'percentile'>): string | null {
  if (r.rank && r.rank > 0) return `AIR ${r.rank}`;
  if (r.percentile != null && Number.isFinite(r.percentile)) return `${r.percentile} percentile`;
  return null;
}
