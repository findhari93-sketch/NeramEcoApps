/**
 * "Drawn from this": the attempts under one Inspiration drawing, as each viewer
 * may see them. The database function already refuses what a student may not
 * see; this module also drops the submission id and the review for a student,
 * so neither can leak through a later change to the function.
 */
import type { InspirationAttemptRow } from '@neram/database/queries/nexus';
import type { ReviewSummary } from './drawing-source';
import { formatInspirationCredit } from './inspiration-credit';
import { examYearOf } from './student-stage';

export interface AttemptCard {
  key: string;
  submissionId: string | null;
  itemId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  credit: string;
  submittedAt: string;
  practisedFrom: boolean;
  review: ReviewSummary | null;
}

export interface AttemptsView {
  students: number;
  shown: number;
  cards: AttemptCard[];
}

function staffReview(r: InspirationAttemptRow): ReviewSummary {
  if (r.status === 'redo') return { state: 'redo', rating: null, marks: null };
  if (r.reviewed_at) return { state: 'reviewed', rating: r.tutor_rating ?? null, marks: r.tutor_marks ?? null };
  const waiting = r.status === 'submitted' || r.status === 'under_review';
  return { state: waiting ? 'waiting' : 'none', rating: null, marks: null };
}

export function presentAttempts(
  result: { students: number; shown: number; rows: InspirationAttemptRow[] },
  staff: boolean,
): AttemptsView {
  return {
    students: result.students,
    shown: result.shown,
    cards: result.rows.map((r, i) => ({
      key: (staff ? r.submission_id : null) ?? r.original_item_id ?? `attempt-${i}`,
      submissionId: staff ? r.submission_id : null,
      itemId: r.original_item_id,
      imageUrl: r.image_url,
      thumbnailUrl: r.thumbnail_url,
      credit: formatInspirationCredit({
        kind: 'submission_original',
        firstName: r.author_first_name,
        lastName: r.author_last_name,
        fullName: r.author_name,
        isAlumni: r.author_is_alumni,
        examYear: examYearOf(r.author_academic_year),
        optedOut: false,
      }),
      submittedAt: r.submitted_at,
      practisedFrom: r.practised_from,
      review: staff ? staffReview(r) : null,
    })),
  };
}

export function attemptCountLine(students: number, shown: number, staff: boolean): string | null {
  if (students <= 0) return null;
  const drew = students === 1 ? '1 student drew this.' : `${students} students drew this.`;
  if (staff) return drew;
  return shown === 0 ? `${drew} None scored 4 stars and above yet.` : `${drew} ${shown} scored 4 stars and above.`;
}
