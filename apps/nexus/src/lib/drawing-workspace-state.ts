/**
 * What the student drawing workspace shows beside the drawing, decided in one
 * place so the panel, the action bar and the tests cannot disagree.
 */
import type { SubmitMode } from './assignment-submit-window';

export type RailMode = 'not_submitted' | 'awaiting' | 'updating' | 'reviewed' | 'redo';

export function railMode(
  attempt: { status: string; released: boolean; review_updating: boolean } | null,
): RailMode {
  if (!attempt) return 'not_submitted';
  if (attempt.review_updating) return 'updating';
  if (!attempt.released) return 'awaiting';
  return attempt.status === 'redo' ? 'redo' : 'reviewed';
}

/** The brief matters most before anything is handed in; after that, the review does. */
export function briefStartsOpen(mode: RailMode): boolean {
  return mode === 'not_submitted';
}

export interface PrimaryAction {
  label: string;
  variant: 'contained' | 'outlined';
  hint: string | null;
}

/** The one thing the student can do next, or null when there is nothing. */
export function primaryAction(submitMode: SubmitMode): PrimaryAction | null {
  switch (submitMode) {
    case 'first':
      return { label: 'Submit your drawing', variant: 'contained', hint: null };
    case 'redo':
      return { label: 'Redo your drawing', variant: 'contained', hint: null };
    case 'replace':
      return {
        label: 'Replace your drawing',
        variant: 'outlined',
        hint: 'Not happy with it? You can change this until your teacher reviews it.',
      };
    default:
      return null;
  }
}
