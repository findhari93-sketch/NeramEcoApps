/**
 * How similar is "the same question"?
 *
 * PURE, and deliberately in its own file with no imports. The bands are needed
 * in three places that cannot share a module otherwise: the server dedupe
 * service (which reaches the Supabase admin client), the dedupe route, and the
 * wizard's step 3 rail, which runs in the browser and must not pull server code
 * into the bundle.
 *
 * Why bands and not a threshold. Measured on real stems, trigram similarity
 * cannot separate a reworded duplicate from a genuinely different question:
 *
 *   "…vertical edges remain parallel" vs "…vertical edges stay parallel"   0.78
 *   "in TWO-point perspective, how many VPs"  vs "in THREE-point…"          0.80
 *
 * The distinct pair scores HIGHER than the duplicate, because one negating word
 * in a long shared sentence is noise to a character n-gram. So no single cutoff
 * exists, and pretending one does would either miss duplicates or flag
 * two-point against three-point, which is the false positive that teaches a
 * teacher to ignore the whole rail.
 *
 * Three bands instead: confident, worth a look, and not shown. The middle band
 * says "check these differ", which is a true and actionable thing to say about
 * both examples above.
 */

/** Above this, the two questions are the same question wearing different words. */
export const REUSE_THRESHOLD = 0.9;

/** Between this and REUSE_THRESHOLD, close enough that a human should look. */
export const REVIEW_THRESHOLD = 0.75;

export type DedupeVerdict = 'likely_duplicate' | 'near_identical' | 'similar';

export function dedupeVerdict(similarity: number): DedupeVerdict {
  if (similarity >= REUSE_THRESHOLD) return 'likely_duplicate';
  if (similarity >= REVIEW_THRESHOLD) return 'near_identical';
  return 'similar';
}
