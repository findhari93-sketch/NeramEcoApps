/**
 * Near-duplicate check for location pages. Builds the main text a city page
 * shows (from the same copy builders the page uses), cuts it into 5-word
 * shingles and compares pages with Jaccard similarity. Two pages above
 * MAX_SIMILARITY read as one page with the city name swapped, which is what
 * Google treats as doorway pages.
 */
import { cityAnswer, cityDescription, cityFaqs, cityTitle } from './location-copy';
import type { CityFacts } from './location-facts';

export const SHINGLE_WORDS = 5;
export const MAX_SIMILARITY = 0.6;

/** The visible main content of a city page, minus navigation and boilerplate links. */
export function cityPageText(facts: CityFacts): string {
  const c = facts.content;
  return [
    cityTitle(facts),
    cityDescription(facts),
    ...cityAnswer(facts),
    ...(c ? [c.intro, c.localContext, ...(c.highlights ?? []), (c.servedAreas ?? []).join(', ')] : []),
    ...facts.colleges.map((col) => `${col.name} ${col.city ?? ''}`),
    ...facts.testCities.map((t) => t.label),
    ...cityFaqs(facts).flatMap((f) => [f.question, f.answer]),
  ]
    .filter(Boolean)
    .join(' ');
}

export function shingles(text: string, n = SHINGLE_WORDS): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const s of small) if (large.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface SimilarityRow {
  slug: string;
  closest: string | null;
  similarity: number;
}

/** For each page, its most similar other page. O(n^2) over a few hundred pages: fine in a test. */
export function closestPages(pages: Array<{ slug: string; text: string }>): SimilarityRow[] {
  const sets = pages.map((p) => ({ slug: p.slug, set: shingles(p.text) }));
  return sets.map((p, i) => {
    let best = { slug: null as string | null, sim: 0 };
    sets.forEach((q, j) => {
      if (i === j) return;
      const sim = jaccard(p.set, q.set);
      if (sim > best.sim) best = { slug: q.slug, sim };
    });
    return { slug: p.slug, closest: best.slug, similarity: Math.round(best.sim * 1000) / 1000 };
  });
}
