/**
 * Has the teacher changed anything on a practice sheet since it opened?
 *
 * The practice bar shows one forward button, and this decides which: Skip when
 * the student would get nothing new, Send & next (or Update & next) when they
 * would. So it compares what the review save would write against what the row
 * held when the sheet opened, field by field, after the same normalising the
 * page does on load, so an untouched sheet never reads as changed.
 *
 * Things saved on their own the moment they happen (a rotation, tags Gemini
 * wrote) move the baseline instead of counting as a change.
 */

export interface PracticeReviewFields {
  rating: number;
  marks: number | null;
  tutorFeedback: string;
  overlayImageUrl: string | null;
  correctedImageUrl: string | null;
  resources: unknown[];
  reaction: string | null;
}

export interface PracticeReviewBaseline {
  fields: PracticeReviewFields;
  tags: string[];
  regionCount: number;
}

export interface PracticeReviewCurrent {
  fields: PracticeReviewFields;
  tags: string[];
  regionCount: number;
  /** A voice note recorded and not yet sent goes out with the next save. */
  unsentVoice: boolean;
}

function norm(f: PracticeReviewFields) {
  return [
    f.rating || 0,
    f.marks ?? null,
    (f.tutorFeedback || '').trim(),
    f.overlayImageUrl || null,
    f.correctedImageUrl || null,
    JSON.stringify(f.resources || []),
    f.reaction || null,
  ];
}

function tagKey(tags: string[]): string {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort().join('\u0000');
}

export function hasPracticeChanges(baseline: PracticeReviewBaseline | null, current: PracticeReviewCurrent): boolean {
  if (current.unsentVoice) return true;
  if (!baseline) return false;
  const a = norm(baseline.fields);
  const b = norm(current.fields);
  if (a.some((v, i) => v !== b[i])) return true;
  if (tagKey(baseline.tags) !== tagKey(current.tags)) return true;
  return baseline.regionCount !== current.regionCount;
}
