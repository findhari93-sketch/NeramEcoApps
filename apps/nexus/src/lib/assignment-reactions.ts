import type { GalleryReactionType } from '@neram/database/types';

/**
 * The single set of "appreciation" reactions a teacher can send while grading an
 * assignment. Reuses the same 5-emoji vocabulary the drawing gallery already uses
 * (`GalleryReactionType`), so a student sees a familiar set app-wide.
 */
export interface AssignmentReaction {
  type: GalleryReactionType;
  emoji: string;
  /** Short verb-first label used in the picker and the student's notification. */
  label: string;
}

export const REACTIONS: AssignmentReaction[] = [
  { type: 'heart', emoji: '❤️', label: 'Loved it' },
  { type: 'clap', emoji: '👏', label: 'Well done' },
  { type: 'fire', emoji: '🔥', label: 'On fire' },
  { type: 'star', emoji: '⭐', label: 'Star work' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
];

const BY_TYPE = new Map(REACTIONS.map((r) => [r.type, r]));

/** The emoji for a reaction, or an empty string when none was sent. */
export function reactionEmoji(type: GalleryReactionType | null | undefined): string {
  return type ? BY_TYPE.get(type)?.emoji ?? '' : '';
}

/** A warm one-line message for the student's notification, keyed by reaction. */
export function praiseFor(type: GalleryReactionType | null | undefined): string {
  switch (type) {
    case 'heart':
      return 'Your teacher loved your work.';
    case 'clap':
      return 'Well done, your teacher is proud of this.';
    case 'fire':
      return 'You are on fire. Keep it going.';
    case 'star':
      return 'Star work. Your teacher was impressed.';
    case 'wow':
      return 'Wow, your teacher was blown away.';
    default:
      return 'Your teacher reviewed your work.';
  }
}
