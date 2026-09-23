/**
 * What a student had in front of them while they drew a bank question.
 *
 * Practice is not the exam, and the founder's line on this is the whole design:
 * in the exam they get a question they have never seen and have to start from
 * nothing, so drawing blind is the skill. But a student who has never seen what
 * a good answer looks like may not pick up the pencil at all. So the solution
 * and other students' work are both one tap away, and neither is a secret.
 *
 * Phrased in the third person so one sentence serves the student reading their
 * own sketchbook and the teacher reading the review queue. Never phrased as an
 * accusation: "Drawn with the solution open" is a fact about how the drawing
 * was made, not a verdict on the student who made it.
 */

export type QBHelpKind = 'solution' | 'peers';

/** Only the kinds we know about, in a fixed order, deduplicated. */
export function readHelpUsed(raw: unknown): QBHelpKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter((v): v is string => typeof v === 'string'));
  return (['solution', 'peers'] as QBHelpKind[]).filter((k) => seen.has(k));
}

/**
 * One short sentence for a chip.
 *
 * Null, not "Drawn without help", when the drawing did not come from the bank
 * at all: a sketch of a teapot on a Tuesday was not drawn "without help", it
 * simply had nothing to be helped by, and a green tick on it would be noise.
 */
export function helpUsedWords(raw: unknown): string {
  const used = readHelpUsed(raw);
  if (used.length === 0) return 'Drawn without help';
  if (used.length === 2) return 'Drawn after seeing the solution and other students';
  return used[0] === 'solution'
    ? 'Drawn with the solution open'
    : 'Drawn after seeing other students';
}

/** Whether the drawing was made with something open. Decides the chip's tone. */
export function drewWithHelp(raw: unknown): boolean {
  return readHelpUsed(raw).length > 0;
}
