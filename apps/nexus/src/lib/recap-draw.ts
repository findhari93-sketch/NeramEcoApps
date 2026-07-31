/**
 * Which questions a student is served for one checkpoint attempt, and in what
 * disguise.
 *
 * The problem this solves: the checkpoint quiz returned every question for the
 * section, in sort_order, every time. So a student who failed once could
 * screenshot the answers, or simply remember "it was the third option", and pass
 * the retry without rewatching anything. On a gate whose entire purpose is to
 * verify the class was watched, that is the gate not working.
 *
 * Two independent defences, because either alone is weak:
 *
 *   1. A larger pool than is served. Generate 15, serve 10, and rotate the
 *      window per attempt so a retry is mostly questions they have not seen.
 *   2. Per-attempt option permutation. Even a repeated question shows its
 *      options in a different order, so "the answer was B" carries no
 *      information into the next attempt.
 *
 * Everything here is deterministic on (studentId, sectionId, attemptNumber). Two
 * requests for the same attempt must produce the same paper, or a student who
 * reloads mid-quiz would be graded against a paper they never saw. The draw is
 * also persisted, so determinism is a safety net rather than the mechanism.
 */

const LETTERS = ['a', 'b', 'c', 'd'] as const;
export type OptionLetter = (typeof LETTERS)[number];

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

/**
 * Choose the questions for one attempt.
 *
 * The pool is shuffled once per student and section, then each attempt takes a
 * window that starts where the previous one ended. With a pool of 15 serving 10,
 * attempt 2 shares at most 5 questions with attempt 1, and those 5 are the ones
 * they have most recently seen explained.
 *
 * A pool no larger than the serve count degrades gracefully to "the same
 * questions, reshuffled", which is exactly today's behaviour plus option
 * permutation. That matters because existing recaps have 2 to 4 questions per
 * checkpoint, not 15.
 */
export function pickDraw(
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

  const start = (Math.max(1, attemptNumber) - 1) * count % ordered.length;
  const window: string[] = [];
  for (let i = 0; i < count; i++) window.push(ordered[(start + i) % ordered.length]);
  return window;
}

/**
 * The option order for one question in one attempt, as a map from displayed
 * position to original letter. `['c','a','d','b']` means the option shown as A
 * is the question's original option C.
 */
export function permuteOptions(questionId: string, attemptNumber: number, seed: string): OptionLetter[] {
  return shuffle([...LETTERS], `${seed}:${questionId}:${attemptNumber}`) as OptionLetter[];
}

/** Build the whole option map for a draw. */
export function buildOptionMaps(
  questionIds: string[],
  attemptNumber: number,
  seed: string,
): Record<string, OptionLetter[]> {
  const maps: Record<string, OptionLetter[]> = {};
  for (const id of questionIds) maps[id] = permuteOptions(id, attemptNumber, seed);
  return maps;
}

/**
 * Translate the letter a student clicked back to the question's own lettering.
 * Without this every answer would be graded against the wrong option.
 */
export function displayedToOriginal(
  displayed: string | null | undefined,
  map: OptionLetter[] | undefined,
): OptionLetter | null {
  if (!displayed) return null;
  const idx = LETTERS.indexOf(displayed.toLowerCase() as OptionLetter);
  if (idx < 0) return null;
  if (!map || map.length !== 4) return LETTERS[idx];
  return map[idx];
}

/** Present a question under its permuted lettering. */
export function applyOptionMap<
  T extends { option_a: string; option_b: string; option_c: string; option_d: string },
>(question: T, map: OptionLetter[] | undefined): T {
  if (!map || map.length !== 4) return question;
  const source: Record<OptionLetter, string> = {
    a: question.option_a,
    b: question.option_b,
    c: question.option_c,
    d: question.option_d,
  };
  return {
    ...question,
    option_a: source[map[0]],
    option_b: source[map[1]],
    option_c: source[map[2]],
    option_d: source[map[3]],
  };
}

/** The letter the student must click for this question, under the permutation. */
export function originalToDisplayed(
  original: string | null | undefined,
  map: OptionLetter[] | undefined,
): OptionLetter | null {
  if (!original) return null;
  const letter = original.toLowerCase() as OptionLetter;
  if (!map || map.length !== 4) return LETTERS.includes(letter) ? letter : null;
  const idx = map.indexOf(letter);
  return idx >= 0 ? LETTERS[idx] : null;
}

/** Stable per student and checkpoint, so one student's paper is not another's. */
export function drawSeed(studentId: string, sectionId: string): string {
  return `${studentId}:${sectionId}`;
}
