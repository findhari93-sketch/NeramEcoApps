/**
 * Deterministic shuffling from a string seed.
 *
 * A catch-up class test reshuffles between attempts so a student who failed
 * cannot simply memorise "the answer to question 3 is B" and grind the same
 * paper. But it must NOT reshuffle within an attempt: refreshing the page,
 * losing signal in a lift, or rotating the phone all re-request the questions,
 * and a student watching the paper rearrange itself under them would reasonably
 * conclude the app is broken.
 *
 * Seeding on (student, test, attempt number) gives both: stable while an
 * attempt is open, different the moment a new one starts.
 */

/** xmur3: string to a well-mixed 32-bit seed. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: small, fast, good enough for shuffling a question paper. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates against a seeded PRNG. Returns a new array; the input is not
 * mutated, and every element comes out exactly once.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  if (out.length < 2) return out;

  const rand = mulberry32(xmur3(seed)());
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The seed for one student's one attempt at one test. Changing any part of it
 * changes the paper order, so attempt number is what makes a retry different.
 */
export function attemptSeed(studentId: string, testId: string, attemptNumber: number): string {
  return `${studentId}:${testId}:${attemptNumber}`;
}
