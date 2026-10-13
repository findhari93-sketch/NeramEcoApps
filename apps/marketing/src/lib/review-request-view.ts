/**
 * What the public review page (/r/<token>) may know.
 *
 * Possession of the link is the only authentication, and links travel by WhatsApp,
 * so whatever this returns may be read by someone other than the student. It
 * returns the facts the student is about to publish under their own name anyway
 * (name, photo, exam, rank, college, centre) so they can confirm them, and nothing
 * else: no phone, no user id, no staff names, no internal ids.
 *
 * Kept away from the route so the exact key set is pinned by a test.
 */
import type { ReviewRequest } from '@neram/database';

export const PUBLIC_REVIEW_VIEW_KEYS = [
  'firstName',
  'studentName',
  'suggestedDisplayName',
  'photoUrl',
  'examType',
  'examYear',
  'airRank',
  'percentile',
  'collegeAdmitted',
  'city',
  'learningMode',
  'centreName',
  'expiresAt',
  'state',
  'review',
  'targets',
  'googleClicked',
  'googlePosted',
  'aiCallsLeft',
] as const;

export type ReviewPageState = 'new' | 'submitted' | 'locked';

export interface PublicReviewView {
  firstName: string;
  studentName: string;
  suggestedDisplayName: string;
  photoUrl: string | null;
  examType: ReviewRequest['exam_type'];
  examYear: number | null;
  airRank: number | null;
  percentile: number | null;
  collegeAdmitted: string | null;
  city: string | null;
  learningMode: ReviewRequest['learning_mode'];
  centreName: string | null;
  expiresAt: string;
  /** new: nothing sent yet. submitted: sent, still editable. locked: staff have moderated it. */
  state: ReviewPageState;
  /** The student's own submitted review, so they can edit it or copy it to Google. */
  review: { text: string; rating: number | null; displayName: string } | null;
  targets: {
    google: { url: string; centreName: string } | null;
    secondary: { platform: 'justdial' | 'sulekha'; url: string } | null;
  };
  googleClicked: boolean;
  googlePosted: boolean;
  aiCallsLeft: number;
}

/** "Priya Sharma" to "Priya S.", the default name next to a public review. */
export function suggestDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function publicReviewView(input: {
  request: ReviewRequest;
  centreName: string | null;
  testimonial: { content: Record<string, string> | null; rating: number | null; consent_display_name: string | null; student_name: string; publication_status: string; original_text: string | null } | null;
  targets: PublicReviewView['targets'];
  maxAiCalls: number;
}): PublicReviewView {
  const { request, testimonial } = input;
  const state: ReviewPageState = !testimonial
    ? 'new'
    : testimonial.publication_status === 'pending_moderation'
      ? 'submitted'
      : 'locked';
  const corrections = (request.student_corrections || {}) as Record<string, string>;
  const num = (v: string | undefined, fallback: number | null) => (v !== undefined && v !== '' ? Number(v) : fallback);

  return {
    firstName: request.student_name.trim().split(/\s+/)[0] || 'there',
    studentName: request.student_name,
    suggestedDisplayName: suggestDisplayName(request.student_name),
    photoUrl: request.photo_url,
    examType: request.exam_type,
    examYear: num(corrections.exam_year, request.exam_year),
    airRank: num(corrections.air_rank, request.air_rank),
    percentile: num(corrections.percentile, request.percentile),
    collegeAdmitted: corrections.college_admitted ?? request.college_admitted,
    city: corrections.city ?? request.city,
    learningMode: request.learning_mode,
    centreName: input.centreName,
    expiresAt: request.expires_at,
    state,
    review: testimonial
      ? {
          // While it waits for staff the student sees their own words. Once it is
          // published they see what went live, which is what they copy to Google
          // only if it is still theirs: staff edits never leave our site.
          text: state === 'submitted' ? testimonial.content?.en ?? '' : testimonial.original_text ?? testimonial.content?.en ?? '',
          rating: testimonial.rating,
          displayName: testimonial.consent_display_name || testimonial.student_name,
        }
      : null,
    targets: input.targets,
    googleClicked: Boolean(request.google_clicked_at),
    googlePosted: Boolean(request.google_posted_self_reported_at),
    aiCallsLeft: Math.max(0, input.maxAiCalls - (request.ai_call_count || 0)),
  };
}
