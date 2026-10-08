/**
 * What a student hears when a teacher reviews a practice drawing.
 *
 * Practice is optional to mark, so the message is short and never nags. It goes
 * out for a first review, a redo request, a closed redo, or a changed verdict
 * (stars, words, reaction, or a new voice note), and never for a silent re-save
 * of the same review.
 *
 * The reaction used to be its own Teams message the moment it was tapped, so a
 * reviewed sketch reached the student as two or three chats. It now rides the
 * review, and this is the one message.
 */

import { REACTION_LABEL } from './sketchbook-messages';

export interface PracticeNoticeInput {
  action: 'complete' | 'redo';
  previouslyReviewed: boolean;
  previousStatus: string;
  previousRating: number | null;
  rating: number | null;
  previousFeedback: string | null;
  feedback: string | null;
  previousReaction?: string | null;
  reaction?: string | null;
  /** A voice note recorded since the last send went out with this save. */
  voiceSentNow?: boolean;
}

export function shouldNotifyPractice(input: PracticeNoticeInput): boolean {
  if (input.action === 'redo') return input.previousStatus !== 'redo';
  if (!input.previouslyReviewed || input.previousStatus === 'redo') return true;
  if (input.voiceSentNow) return true;
  const sameStars = (input.previousRating ?? null) === (input.rating ?? null);
  const sameWords = (input.previousFeedback ?? '').trim() === (input.feedback ?? '').trim();
  // Taking a reaction away is not news; giving or changing one is.
  const newReaction = !!input.reaction && input.reaction !== (input.previousReaction ?? null);
  return !(sameStars && sameWords) || newReaction;
}

function firstName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'Your teacher';
}

function reactionLabel(reaction: string | null | undefined): string | null {
  return reaction && reaction in REACTION_LABEL ? REACTION_LABEL[reaction as keyof typeof REACTION_LABEL] : null;
}

export function buildPracticeReviewMessage(input: {
  action: 'complete' | 'redo';
  teacherName: string | null;
  sourceType: string | null;
  rating: number | null;
  reaction?: string | null;
  hasVoice?: boolean;
  /** The student already had a review of this drawing; this one replaces it. */
  update?: boolean;
}): { subject: string; plain: string; buttonLabel: string } {
  const who = firstName(input.teacherName);
  const noun = input.sourceType === 'sketchbook' ? 'sketch' : 'drawing';
  if (input.action === 'redo') {
    return {
      subject: `${who} asked you to try your ${noun} again`,
      plain: `${who} looked at your ${noun} and asked you to draw it again. Open it to see what to change.`,
      buttonLabel: 'See what to change',
    };
  }
  const said = reactionLabel(input.reaction);
  const verdict = input.rating && said
    ? `${who} said ${said} and gave your ${noun} ${input.rating} out of 5 stars.`
    : input.rating
      ? `${who} gave your ${noun} ${input.rating} out of 5 stars.`
      : said
        ? `${who} said ${said} to your ${noun}.`
        : null;
  const close = input.hasVoice ? 'Open it to hear the voice note.' : 'Open it to read the feedback.';
  return {
    subject: input.update ? `${who} updated the review of your ${noun}` : `${who} reviewed your ${noun}`,
    plain: verdict
      ? `${verdict} ${close}`
      : input.hasVoice
        ? `${who} left a voice note on your ${noun}. Open it to listen.`
        : `${who} left feedback on your ${noun}. Open it to read it.`,
    buttonLabel: 'Open your sketchbook',
  };
}
