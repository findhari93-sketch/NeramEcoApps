/**
 * Which questions one sitting of a test is served, and under which lettering.
 *
 * The problem this solves: a nexus_tests test is a fixed, ordered list of
 * question ids. Nothing on the read path takes an attempt number, so a student
 * on their seventh go gets a byte-identical paper to their first. On a chapter
 * gate whose whole purpose is to check the chapter was read, that means one
 * screenshot defeats it permanently.
 *
 * Two independent defences, because either alone is weak:
 *
 *   1. A pool larger than the serve count. Hold 40, serve 20, and rotate the
 *      window per attempt so a retry is mostly questions they have not seen.
 *   2. Per-attempt option permutation. Even a repeated question shows its
 *      options in a different order, so "the answer was B" carries no
 *      information into the next attempt.
 *
 * Lifted from apps/nexus/src/lib/recap-draw, which proved the approach on
 * checkpoint quizzes. It lives here rather than there because the study chapter
 * path (getPlacedTestForStudent, gradeTestOneShot) is inside this package and
 * needs the same primitives. Deliberately dependency-free, so it stays testable
 * without a database client.
 *
 * Two differences from the recap original, both because the shapes differ:
 * a bank question's options are a JSONB array of { id, text }, not four flat
 * columns, and the array can hold two, four or six options rather than always
 * four, so the permutation is built over whatever ids the question actually has.
 */

/** Canonical displayed ids, in order. A permuted paper is always relabelled to these. */
const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** An option as the bank stores it. Anything else on the row is carried through untouched. */
export interface DrawableOption {
  id: string;
  [key: string]: unknown;
}

/** FNV-1a. Small, dependency-free, and stable across Node versions. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG. Deterministic for a given seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a seeded PRNG, so the order is stable per seed. */
function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  const next = rng(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable per student and test, so one student's paper is not another's. */
export function testDrawSeed(studentId: string, testId: string): string {
  return `${studentId}:${testId}`;
}

/**
 * Choose the questions for one sitting.
 *
 * The pool is shuffled once per student and test, then each attempt takes a
 * window that starts where the previous one ended. With a pool of 40 serving
 * 20, attempt 2 shares nothing with attempt 1, and attempt 3 comes back round
 * to questions they have by then seen explained.
 *
 * A pool no larger than the serve count degrades to "the same questions,
 * reshuffled", which is today's behaviour plus option permutation. That matters
 * because most existing tests are exactly their own length.
 */
export function pickTestDraw(
  questionIds: string[],
  serve: number,
  attemptNumber: number,
  seed: string,
): string[] {
  const pool = questionIds.filter(Boolean);
  if (pool.length === 0) return [];

  const count = Math.max(1, Math.min(Math.floor(serve) || pool.length, pool.length));
  const ordered = shuffle(pool, seed);

  if (count >= ordered.length) {
    // Whole pool every time, but reordered per attempt so position carries no
    // memory from the last one.
    return shuffle(ordered, `${seed}:${attemptNumber}`);
  }

  const start = ((Math.max(1, attemptNumber) - 1) * count) % ordered.length;
  const window: string[] = [];
  for (let i = 0; i < count; i++) window.push(ordered[(start + i) % ordered.length]);
  return window;
}

/** A question that knows which part of its paper it belongs to. */
export interface SectionedItem {
  id: string;
  section: string | null;
  section_order: number | null;
}

/**
 * The questions for one sitting of a SECTIONED paper.
 *
 * A real exam paper is not one bag of questions. It is Mathematics, then
 * Aptitude, then Drawing, and a candidate works through them in that order. So
 * the shuffle has to happen inside each section and never across them: two
 * students sitting the same paper at adjacent desks see different question
 * orders, but both still sit Mathematics first.
 *
 * Built on pickTestDraw rather than reimplementing Fisher-Yates, with the
 * section folded into the seed so two sections of the same length cannot draw
 * the same permutation.
 *
 * ORDERING OF THE SECTIONS THEMSELVES is by the smallest section_order in each
 * group, with first appearance as the tiebreak, and NEVER by the section name.
 * Ordering by name would mean renaming "Aptitude" to "General Aptitude" in a
 * label map silently reordered a live paper.
 *
 * A group with no section sorts last, so an unclassified question lands at the
 * end where it is visible rather than silently opening the paper.
 *
 * The return value is a flat array in served order, exactly like pickTestDraw.
 * That is what lets nexus_test_draws.question_ids keep its shape and its
 * meaning, and why applyTestDraw, translateDrawnAnswers, buildTestOptionMaps
 * and submitAttempt all need no change at all: the DRAW carries the order, the
 * QUESTION carries its label.
 */
export function pickSectionedDraw(
  items: SectionedItem[],
  serveBySection: Map<string, number> | null,
  attemptNumber: number,
  seed: string,
): string[] {
  const groups = new Map<string, { order: number; firstSeen: number; ids: string[] }>();

  items.forEach((item, i) => {
    if (!item?.id) return;
    const key = item.section ?? '__unsectioned__';
    let group = groups.get(key);
    if (!group) {
      group = {
        // An unsectioned group always sorts last, whatever number it carries.
        order: item.section ? item.section_order ?? 98 : 99,
        firstSeen: i,
        ids: [],
      };
      groups.set(key, group);
    } else if (item.section && item.section_order != null) {
      // The smallest order in the group wins, so one row with a stale
      // section_order cannot drag a whole section out of place.
      group.order = Math.min(group.order, item.section_order);
    }
    group.ids.push(item.id);
  });

  const ordered = Array.from(groups.entries()).sort(
    (a, b) => a[1].order - b[1].order || a[1].firstSeen - b[1].firstSeen,
  );

  const out: string[] = [];
  for (const [key, group] of ordered) {
    const serve = serveBySection?.get(key) ?? group.ids.length;
    out.push(...pickTestDraw(group.ids, serve, attemptNumber, `${seed}:${key}`));
  }
  return out;
}

/**
 * The option order for one question in one attempt, as the original ids in
 * displayed order. `['c','a','d','b']` means the option shown first is the
 * question's own option c.
 */
export function permuteOptionIds(
  optionIds: string[],
  questionId: string,
  attemptNumber: number,
  seed: string,
): string[] {
  return shuffle(optionIds, `${seed}:${questionId}:${attemptNumber}`);
}

/** Every option map for one draw, keyed by question id. Questions with fewer than two options are left out. */
export function buildTestOptionMaps(
  questions: Array<{ question_id: string; options?: unknown }>,
  attemptNumber: number,
  seed: string,
): Record<string, string[]> {
  const maps: Record<string, string[]> = {};
  for (const q of questions) {
    const ids = optionIdsOf(q.options);
    if (ids.length < 2) continue;
    maps[q.question_id] = permuteOptionIds(ids, q.question_id, attemptNumber, seed);
  }
  return maps;
}

/** The option ids on a question, or an empty array for anything not shaped like options. */
function optionIdsOf(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const ids: string[] = [];
  for (const o of options) {
    const id = (o as DrawableOption)?.id;
    if (typeof id !== 'string' || !id) return [];
    ids.push(id);
  }
  return ids;
}

/**
 * Present a question's options under its permutation.
 *
 * The displayed ids are RELABELLED to a, b, c, d in order. Keeping the original
 * ids would make the permutation decorative: the client would send back the
 * original letter and the shuffle would carry no information at all.
 */
export function applyTestOptionMap<T extends { options?: unknown }>(question: T, map: string[] | undefined): T {
  if (!map || map.length < 2 || !Array.isArray(question.options)) return question;
  const byId = new Map<string, DrawableOption>();
  for (const o of question.options as DrawableOption[]) {
    if (o && typeof o.id === 'string') byId.set(o.id, o);
  }
  const permuted: DrawableOption[] = [];
  map.forEach((originalId, i) => {
    const src = byId.get(originalId);
    const displayedId = OPTION_KEYS[i];
    if (src && displayedId) permuted.push({ ...src, id: displayedId });
  });
  // A map that no longer lines up with the question (an option was edited away
  // between the serve and this read) leaves the question alone rather than
  // serving a paper with holes in it.
  if (permuted.length !== map.length) return question;
  return { ...question, options: permuted };
}

/**
 * Translate the id a student clicked back to the question's own lettering.
 * Without this every answer on a permuted paper is graded against the wrong
 * option, which is the single most damaging way this feature could fail.
 */
export function displayedToOriginalId(
  displayed: string | null | undefined,
  map: string[] | undefined,
): string | null {
  if (!displayed) return null;
  const value = String(displayed).trim().toLowerCase();
  if (!map || map.length < 2) return value || null;
  const index = OPTION_KEYS.indexOf(value as (typeof OPTION_KEYS)[number]);
  if (index < 0 || index >= map.length) return value || null;
  return map[index];
}

/** The id the student must click for this question, under the permutation. Used to show a review. */
export function originalToDisplayedId(
  original: string | null | undefined,
  map: string[] | undefined,
): string | null {
  if (!original) return null;
  const value = String(original).trim().toLowerCase();
  if (!map || map.length < 2) return value || null;
  const index = map.indexOf(value);
  return index >= 0 ? OPTION_KEYS[index] ?? value : value;
}

/**
 * Rewrite a whole answer sheet from displayed ids to the question's own ids.
 *
 * Answers for questions outside the draw are DROPPED rather than carried
 * through: they are either stale autosave from a previous attempt or a client
 * answering a question it was never served, and neither should reach the
 * grader.
 */
export function translateDrawnAnswers(
  answers: Record<string, string>,
  questionIds: string[],
  optionMaps: Record<string, string[]>,
): Record<string, string> {
  const drawn = new Set(questionIds);
  const out: Record<string, string> = {};
  for (const [questionId, selected] of Object.entries(answers || {})) {
    if (!drawn.has(questionId)) continue;
    const map = optionMaps?.[questionId];
    // Untouched when there is no permutation to undo. A numerical answer is a
    // number, not a letter, and running it through the letter translator would
    // case-fold and trim a value the grader is about to parse.
    if (!map || map.length < 2) {
      out[questionId] = selected;
      continue;
    }
    const original = displayedToOriginalId(selected, map);
    if (original != null) out[questionId] = original;
  }
  return out;
}
