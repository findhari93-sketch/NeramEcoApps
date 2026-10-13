import type { DrawingGrade, SketchbookReaction } from '@neram/database/types';
import { DRAWING_GRADE_LABEL } from '@neram/database/drawing-grade';

/** Copy for every sketchbook message. Pure so it can be tested and reused by the Teams card. */

export const REACTION_LABEL: Record<SketchbookReaction, string> = {
  heart: 'Nice',
  fire: 'Great',
  wow: 'Wow',
};

export function firstName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Your teacher';
  return trimmed.split(/\s+/)[0];
}

export function reactionMessage(teacherFirstName: string, reaction: SketchbookReaction): { subject: string; plain: string } {
  return {
    subject: `${teacherFirstName} reacted to your sketch`,
    plain: `${teacherFirstName} said ${REACTION_LABEL[reaction]} to a sketch in your sketchbook. Keep the rhythm going.`,
  };
}

/** The grade a student sees on a drawing. */
export const GRADE_LABEL = DRAWING_GRADE_LABEL;

/**
 * The one message for one save from Flip through: whatever changed in it (a
 * reaction, a grade, a comment), in that order, as a single chat. Each part is
 * there only when it was given.
 */
export function evaluationMessage(
  teacherFirstName: string,
  given: { reaction?: SketchbookReaction; grade?: DrawingGrade; comment?: string },
): { subject: string; plain: string } {
  const who = teacherFirstName;
  const subject = given.reaction
    ? `${who} reacted to your sketch`
    : given.grade
      ? `${who} graded your sketch`
      : `${who} commented on your sketch`;
  const parts: string[] = [];
  if (given.reaction) parts.push(`${who} said ${REACTION_LABEL[given.reaction]} to a sketch in your sketchbook.`);
  if (given.grade) parts.push(given.reaction ? `Grade: ${GRADE_LABEL[given.grade]}.` : `${who} graded a sketch in your sketchbook: ${GRADE_LABEL[given.grade]}.`);
  if (given.comment) parts.push(parts.length ? `${who} wrote: ${given.comment}` : given.comment);
  else if (given.reaction) parts.push('Keep the rhythm going.');
  return { subject, plain: parts.join(' ') };
}

/**
 * What a student is told when their drawing is featured.
 *
 * This is the only message the app sends a teenager purely to say they did
 * something well, so it says the thing plainly and stops. No "keep it up", which
 * turns praise into an instruction, and no claim we cannot back, such as best of
 * the week, because a student who reads that and then sees four others featured
 * the same day learns the app exaggerates.
 *
 * `onShelf` is false when the student has asked for their drawings to stay out
 * of the shared library. They were still featured to their class, so they are
 * still told, just without a promise of a shelf they will not appear on.
 */
export function featuredMessage(
  teacherFirstName: string,
  classroomName: string,
  onShelf = true,
): { subject: string; plain: string; teamsText: string } {
  const where = onShelf
    ? ' It is on the Inspiration shelf now, where the whole class can look at it.'
    : '';
  return {
    subject: `Your drawing is featured in ${classroomName}`,
    plain: `{firstName}, ${teacherFirstName} chose your drawing to show the class.${where} Well done.`,
    teamsText: 'Your drawing is featured',
  };
}
