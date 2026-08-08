/**
 * What is wrong with a test that has not been saved yet.
 *
 * PURE. The wizard's step 3 rail ("Duplicates 2 · Missing correct answer 0 ·
 * Images missing 0") has to answer the same question TestHealthPanel answers
 * for a saved test, on data that has no id yet and no rows in any table.
 *
 * So the structural half is not reimplemented: a DraftQuestion is mapped onto
 * the CheckableQuestion shape and handed to structuralIssues() in
 * test-health.ts. One definition of "this paper is malformed", two surfaces.
 *
 * What IS new here is the pair of checks only a draft can make:
 *
 *   duplicates    two questions in the same batch that say the same thing. A
 *                 model asked for more questions than a document supports
 *                 restates one, and both would otherwise be imported before
 *                 anyone notices. Must be computed locally and re-computed
 *                 while the teacher edits a stem, so no round trip.
 *   coverage      which topics the batch actually covers, from the tags the
 *                 questions carry. This is what turns "15 questions" into
 *                 "15 questions, none of them on scale".
 */
import { dedupeVerdict, type DedupeVerdict } from './qb-dedupe-bands';
import { structuralIssues, type CheckableQuestion, type TestIssue } from './test-health';
import type { DraftQuestion, TestDraft } from './test-wizard-draft';
import { activeQuestions } from './test-wizard-draft';

/**
 * Same normalisation qb-import-schema.ts uses to collapse repeats inside one
 * paste, so a duplicate caught at parse time and one caught after an edit are
 * judged by the same rule.
 */
export function fingerprint(text: string): string {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Length ratio outside this cannot reach even the lower band, so the pair is skipped. */
const LENGTH_PRUNE = 0.6;

function trigrams(normalised: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= normalised.length; i += 1) out.add(normalised.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export interface DuplicatePair {
  aKey: string;
  bKey: string;
  similarity: number;
  /** Identical once case and punctuation are stripped. No judgement needed. */
  exact: boolean;
  /**
   * 'likely_duplicate' is confident enough to count in the rail's Duplicates
   * figure. 'near_identical' is only ever "check these two differ", because at
   * that similarity a reworded duplicate and a two-point/three-point pair are
   * indistinguishable. See qb-dedupe-bands.ts for the measurements.
   */
  verdict: Exclude<DedupeVerdict, 'similar'>;
}

/**
 * Every pair of questions in the draft that look like the same question.
 *
 * O(n²) on purpose. The import contract caps a paste at 200 questions, so the
 * worst case is ~20k comparisons of small trigram sets, which is well inside a
 * keystroke budget. A pruning pass on length keeps the common case far cheaper.
 *
 * Character trigrams, matching the pg_trgm similarity the server dedupe already
 * runs, so a duplicate caught here and one caught after saving are scored the
 * same way.
 */
export function duplicatePairs(questions: DraftQuestion[]): DuplicatePair[] {
  const rows = questions.map((q) => {
    const norm = fingerprint(q.question_text);
    return { key: q.key, norm, grams: trigrams(norm) };
  });

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (!a.norm || !b.norm) continue;
      if (a.norm === b.norm) {
        pairs.push({ aKey: a.key, bKey: b.key, similarity: 1, exact: true, verdict: 'likely_duplicate' });
        continue;
      }
      const ratio = Math.min(a.norm.length, b.norm.length) / Math.max(a.norm.length, b.norm.length);
      if (ratio < LENGTH_PRUNE) continue;
      const sim = jaccard(a.grams, b.grams);
      const verdict = dedupeVerdict(sim);
      if (verdict === 'similar') continue;
      pairs.push({ aKey: a.key, bKey: b.key, similarity: sim, exact: false, verdict });
    }
  }
  return pairs;
}

/** The confident subset, the only thing the rail is allowed to call a duplicate. */
export function confirmedDuplicatePairs(questions: DraftQuestion[]): DuplicatePair[] {
  return duplicatePairs(questions).filter((p) => p.verdict === 'likely_duplicate');
}

/** A DraftQuestion in the shape the shared structural checker understands. */
export function toCheckable(q: DraftQuestion): CheckableQuestion {
  return {
    id: q.key,
    is_active: true,
    correct_answer: q.correct_answer,
    question_text: q.question_text,
    // image_ref is a reference the import mentioned, not an attached image, so
    // it deliberately does NOT satisfy the "has text or an image" check.
    question_image_url: null,
    question_format: q.question_format,
    options: q.options,
  };
}

/** Questions whose import named an image that has not been attached yet. */
export function unattachedImages(questions: DraftQuestion[]): DraftQuestion[] {
  return questions.filter((q) => Boolean(q.image_ref));
}

export interface DraftHealthCounts {
  duplicates: number;
  missingAnswer: number;
  missingImage: number;
}

/**
 * The three fixed rows in the step 3 rail.
 *
 * Always all three, including the zeroes. "Missing correct answer 0" is a
 * statement that the check ran; omitting the row when it passes would leave a
 * teacher unable to tell a clean paper from an unchecked one.
 */
export function draftHealthCounts(draft: TestDraft): DraftHealthCounts {
  const questions = activeQuestions(draft);
  const dupeKeys = new Set<string>();
  // Confident pairs only. A near-identical pair is surfaced on the rows as
  // "check these differ", never counted here as a duplicate the teacher has to
  // resolve, because at that similarity the check cannot tell the difference.
  for (const p of confirmedDuplicatePairs(questions)) {
    dupeKeys.add(p.aKey);
    dupeKeys.add(p.bKey);
  }
  return {
    duplicates: dupeKeys.size,
    missingAnswer: questions.filter((q) => !String(q.correct_answer ?? '').trim()).length,
    missingImage: unattachedImages(questions).length,
  };
}

/**
 * Everything wrong with the draft, worst first, in the same TestIssue vocabulary
 * the saved-test panel uses.
 */
export function draftIssues(draft: TestDraft): TestIssue[] {
  const questions = activeQuestions(draft);
  const issues = structuralIssues({
    question_count: questions.length,
    questions: questions.map(toCheckable),
    title: draft.title,
  });

  const dupes = duplicatePairs(questions);
  const confident = dupes.filter((p) => p.verdict === 'likely_duplicate');
  const worthALook = dupes.filter((p) => p.verdict === 'near_identical');
  if (confident.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'warning',
      title: `${confident.length} pair${confident.length === 1 ? '' : 's'} of questions are duplicates of each other`,
      count: confident.length,
    });
  }
  if (worthALook.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'warning',
      title: `${worthALook.length} pair${worthALook.length === 1 ? '' : 's'} of questions are worded very alike, check they ask different things`,
      count: worthALook.length,
    });
  }

  const images = unattachedImages(questions);
  if (images.length > 0) {
    issues.push({
      stream: 'structural',
      severity: 'warning',
      title: `${images.length} question${images.length === 1 ? '' : 's'} reference an image that is not attached yet`,
      count: images.length,
    });
  }

  const rank = (i: TestIssue) => (i.severity === 'error' ? 0 : 1);
  return issues.sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

export interface RowWarning {
  kind: 'duplicate' | 'near_identical' | 'no_answer' | 'no_options' | 'image_missing';
  message: string;
}

/**
 * Per-question warnings, so step 3 can print "Possible duplicate of Q7, keep
 * one" against the row itself rather than only in the rail.
 *
 * Keyed by DraftQuestion.key. Duplicate messages name the OTHER question by its
 * position in the list, because that is how the teacher is reading the screen.
 */
export function warningsByKey(draft: TestDraft): Record<string, RowWarning[]> {
  const questions = activeQuestions(draft);
  const positionOf = new Map(questions.map((q, i) => [q.key, i + 1]));
  const out: Record<string, RowWarning[]> = {};
  const push = (key: string, w: RowWarning) => {
    (out[key] ||= []).push(w);
  };

  for (const pair of duplicatePairs(questions)) {
    // The wording carries the confidence. "Keep one" is an instruction and is
    // only earned by the confident band; below it the honest thing to say is
    // that they look alike and might not be.
    const say = (otherKey: string): RowWarning =>
      pair.verdict === 'likely_duplicate'
        ? { kind: 'duplicate', message: `Duplicate of Q${positionOf.get(otherKey)}, keep one` }
        : { kind: 'near_identical', message: `Worded very like Q${positionOf.get(otherKey)}, check they differ` };
    push(pair.aKey, say(pair.bKey));
    push(pair.bKey, say(pair.aKey));
  }

  for (const q of questions) {
    if (!String(q.correct_answer ?? '').trim()) {
      push(q.key, { kind: 'no_answer', message: 'No correct answer, this question cannot be marked' });
    }
    if (q.question_format === 'MCQ' && (!q.options || q.options.length < 2)) {
      push(q.key, { kind: 'no_options', message: 'A multiple-choice question needs at least two options' });
    }
    if (q.image_ref) {
      push(q.key, { kind: 'image_missing', message: `References an image (${q.image_ref}), attach it here` });
    }
  }

  return out;
}

export interface CoverageBucket {
  slug: string;
  label: string;
  count: number;
  /** Share of the batch, 0 to 1. What the bar renders. */
  share: number;
}

const UNTAGGED = '__untagged__';

/**
 * Which topics the batch covers, from the tags the questions carry.
 *
 * A question with several tags counts toward each of them, so shares do not sum
 * to 1. That is correct: the question being asked is "is scale represented at
 * all", not "how is the paper divided up".
 */
export function syllabusCoverage(draft: TestDraft): CoverageBucket[] {
  const questions = activeQuestions(draft);
  if (questions.length === 0) return [];

  const counts = new Map<string, number>();
  let untagged = 0;
  for (const q of questions) {
    if (q.tag_slugs.length === 0) {
      untagged += 1;
      continue;
    }
    for (const slug of q.tag_slugs) counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  const buckets: CoverageBucket[] = [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
      share: count / questions.length,
    }))
    // Ties break on the slug so two runs over the same batch cannot reorder.
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));

  if (untagged > 0) {
    buckets.push({
      slug: UNTAGGED,
      label: 'Untagged',
      count: untagged,
      share: untagged / questions.length,
    });
  }
  return buckets;
}

/**
 * The thinnest real topic, the one "+ Ask AI for 3 more on scale" offers to
 * top up. Null when there is nothing worth topping up.
 *
 * Untagged is never the answer: more questions will not fix missing tags.
 */
export function coverageGap(draft: TestDraft): CoverageBucket | null {
  const real = syllabusCoverage(draft).filter((b) => b.slug !== UNTAGGED);
  if (real.length < 2) return null;
  const weakest = real[real.length - 1];
  // Only worth offering when it is genuinely thin next to the rest of the batch.
  return weakest.share <= 0.2 ? weakest : null;
}
