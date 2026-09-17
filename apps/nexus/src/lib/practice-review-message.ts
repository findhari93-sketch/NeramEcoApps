/**
 * What a student hears when a teacher reviews a practice drawing.
 *
 * Practice is optional to mark, so the message is short and never nags. It goes
 * out for a first review, a redo request, a closed redo, or a changed verdict
 * (stars or words), and never for a silent re-save of the same review.
 */

export interface PracticeNoticeInput {
  action: 'complete' | 'redo';
  previouslyReviewed: boolean;
  previousStatus: string;
  previousRating: number | null;
  rating: number | null;
  previousFeedback: string | null;
  feedback: string | null;
}

export function shouldNotifyPractice(input: PracticeNoticeInput): boolean {
  if (input.action === 'redo') return input.previousStatus !== 'redo';
  if (!input.previouslyReviewed || input.previousStatus === 'redo') return true;
  const sameStars = (input.previousRating ?? null) === (input.rating ?? null);
  const sameWords = (input.previousFeedback ?? '').trim() === (input.feedback ?? '').trim();
  return !(sameStars && sameWords);
}

function firstName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'Your teacher';
}

export function buildPracticeReviewMessage(input: {
  action: 'complete' | 'redo';
  teacherName: string | null;
  sourceType: string | null;
  rating: number | null;
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
  return {
    subject: `${who} reviewed your ${noun}`,
    plain: input.rating
      ? `${who} gave your ${noun} ${input.rating} out of 5 stars. Open it to read the feedback.`
      : `${who} left feedback on your ${noun}. Open it to read it.`,
    buttonLabel: 'Open your sketchbook',
  };
}
