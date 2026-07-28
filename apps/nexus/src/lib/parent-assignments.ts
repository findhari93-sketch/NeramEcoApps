/**
 * Turning a student's assignment list into what a parent needs to know.
 *
 * A parent's question is never "show me everything chronologically", it is
 * "what is outstanding, and how is he doing on what has been marked". So this
 * groups into three buckets that map onto actions a parent can actually take:
 *
 *   needs_doing        the child has to do something          (parent can nudge)
 *   waiting_on_teacher submitted, not yet marked              (nobody acts)
 *   marked             graded, with the teacher's own words   (parent can discuss)
 *
 * Pure, so the bucketing and the average are unit-testable. Deadlines come from
 * computeAssignmentClock (@neram/database), the same personal-clock rule the
 * student's own cards and the engagement rollups use, so a late joiner is never
 * shown to their parent as overdue on work they were not yet enrolled for.
 */

import { computeAssignmentClock, istTodayStr } from '@neram/database';

export type AssignmentBucket = 'needs_doing' | 'waiting_on_teacher' | 'marked';

/**
 * The subset of StudentAssignmentItem this module reads. Kept structural rather
 * than importing the full type so the pure logic has no database dependency.
 */
export interface ParentAssignmentInput {
  id: string;
  title: string | null;
  class_date: string;
  due_at?: string | null;
  catchup_window_days?: number | null;
  max_marks?: number | null;
  evaluation_type?: string | null;
  assignment_type?: string | null;
  enrolled_at?: string | null;
  submission?: {
    status?: string | null;
    marks?: number | null;
    feedback?: string | null;
    attempt_number?: number | null;
    submitted_at?: string | null;
    reviewed_at?: string | null;
    reaction?: string | null;
  } | null;
  drawing_rating?: number | null;
  drawing_marks?: number | null;
  drawing_reaction?: string | null;
}

export interface ParentAssignmentView {
  id: string;
  title: string;
  classDate: string;
  bucket: AssignmentBucket;
  /** The child's own deadline, not the class deadline. Null = no deadline. */
  dueOn: string | null;
  isOverdue: boolean;
  isLateJoiner: boolean;
  /** How many times they have submitted. 2+ means a redo was asked for. */
  attempt: number;
  /** 'stars' or 'marks'. Drives how the score should be rendered. */
  evaluationType: 'marks' | 'stars';
  /** The score in its own scale, null until marked. */
  score: number | null;
  maxScore: number | null;
  /** The teacher's feedback, verbatim. Never truncated or reworded here. */
  feedback: string | null;
  reaction: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
}

export interface ParentAssignmentSummary {
  total: number;
  needsDoing: number;
  overdue: number;
  waitingOnTeacher: number;
  marked: number;
  /**
   * Mean score across marked work, as a percentage of each item's own maximum.
   * null when nothing has been marked: an average of no marks is not 0.
   */
  averagePercent: number | null;
}

function normaliseEvaluationType(value: string | null | undefined): 'marks' | 'stars' {
  return value === 'stars' ? 'stars' : 'marks';
}

/** The score a teacher gave, whichever of the three places it was recorded in. */
function resolveScore(item: ParentAssignmentInput): number | null {
  const fromSubmission = item.submission?.marks;
  if (typeof fromSubmission === 'number') return fromSubmission;
  if (typeof item.drawing_marks === 'number') return item.drawing_marks;
  // Star ratings are stored as a 1-5 rating on drawing submissions.
  if (typeof item.drawing_rating === 'number') return item.drawing_rating;
  return null;
}

function resolveBucket(item: ParentAssignmentInput, score: number | null): AssignmentBucket {
  const status = item.submission?.status ?? null;

  // A redo means the teacher handed it back: the ball is with the child again.
  if (status === 'redo') return 'needs_doing';
  if (status === 'reviewed') return 'marked';
  // A drawing assignment can be graded without the document submission status
  // ever moving, so a present score is itself proof of marking.
  if (score !== null) return 'marked';
  if (status === 'submitted') return 'waiting_on_teacher';
  if (!item.submission) return 'needs_doing';
  // Any other stored status: submitted something, not yet graded.
  return 'waiting_on_teacher';
}

export function buildParentAssignmentViews(
  items: ParentAssignmentInput[],
  todayStr: string = istTodayStr()
): ParentAssignmentView[] {
  return (items || []).map((item) => {
    const clock = computeAssignmentClock(
      {
        class_date: item.class_date,
        due_at: item.due_at ?? null,
        catchup_window_days: item.catchup_window_days ?? 0,
        enrolled_at: item.enrolled_at ?? null,
      },
      todayStr
    );

    const evaluationType = normaliseEvaluationType(item.evaluation_type);
    const score = resolveScore(item);
    const bucket = resolveBucket(item, score);

    return {
      id: item.id,
      title: item.title || 'Assignment',
      classDate: item.class_date,
      bucket,
      dueOn: clock.personal_due,
      // Only outstanding work can be overdue. Marked work that was handed in
      // late is history, and flagging it red to a parent weeks later helps
      // nobody.
      isOverdue: bucket === 'needs_doing' && clock.status === 'overdue',
      isLateJoiner: clock.is_late_joiner,
      attempt: item.submission?.attempt_number ?? 0,
      evaluationType,
      score,
      maxScore: evaluationType === 'stars' ? 5 : (item.max_marks ?? null),
      feedback: item.submission?.feedback ?? null,
      reaction: item.submission?.reaction ?? item.drawing_reaction ?? null,
      reviewedAt: item.submission?.reviewed_at ?? null,
      submittedAt: item.submission?.submitted_at ?? null,
    };
  });
}

export function summariseAssignments(views: ParentAssignmentView[]): ParentAssignmentSummary {
  const list = views || [];
  const marked = list.filter((v) => v.bucket === 'marked');

  const percentages = marked
    .filter((v) => typeof v.score === 'number' && typeof v.maxScore === 'number' && v.maxScore > 0)
    .map((v) => ((v.score as number) / (v.maxScore as number)) * 100);

  return {
    total: list.length,
    needsDoing: list.filter((v) => v.bucket === 'needs_doing').length,
    overdue: list.filter((v) => v.isOverdue).length,
    waitingOnTeacher: list.filter((v) => v.bucket === 'waiting_on_teacher').length,
    marked: marked.length,
    averagePercent: percentages.length
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : null,
  };
}
