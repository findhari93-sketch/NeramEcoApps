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

export function featuredMessage(teacherFirstName: string, classroomName: string): { subject: string; plain: string } {
  return {
    subject: `Your sketch was featured in ${classroomName}`,
    plain: `${teacherFirstName} featured one of your sketches for the whole class to see. Open your sketchbook to find it.`,
  };
}
