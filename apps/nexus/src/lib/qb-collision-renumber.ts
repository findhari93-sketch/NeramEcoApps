import type { QBQuestionSection } from '@neram/database';

export interface CollisionRenumberResolution {
  question_id: string;
  section: QBQuestionSection;
}

export interface CollisionRenumberOutput {
  question_id: string;
  section: QBQuestionSection;
  display_order: number;
}

/**
 * Assign each resolved question a number within its target section's own
 * local sequence, appended after whatever that section's current highest
 * number already is.
 *
 * maxBySection is read but never mutated: a fresh running counter is derived
 * from it so two candidates resolving into the same section in one batch get
 * distinct, increasing numbers (51, 52, ...) instead of both becoming the
 * same "next" number.
 */
export function assignSectionOrders(
  maxBySection: Partial<Record<QBQuestionSection, number>>,
  resolutions: CollisionRenumberResolution[],
): CollisionRenumberOutput[] {
  const running: Partial<Record<QBQuestionSection, number>> = { ...maxBySection };

  return resolutions.map((r) => {
    const next = (running[r.section] ?? 0) + 1;
    running[r.section] = next;
    return { question_id: r.question_id, section: r.section, display_order: next };
  });
}
