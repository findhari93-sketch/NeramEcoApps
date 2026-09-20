import type { SketchbookReaction } from '@neram/database/types';

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
