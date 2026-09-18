/**
 * Where the one drawing review screen was opened from.
 *
 * Every drawing opens at /teacher/drawing-reviews/[id]: from an assignment
 * roster, a student's sketchbook, the flip-through, an exam's results or an
 * Inspiration drawing. The address carries that place, and this module turns it
 * into Back, the breadcrumb trail, the queue J and K walk, and the links that
 * keep the place while moving between drawings.
 *
 * Older links carry only ?assignment=<id>&lane=<band>; they still mean
 * "from this assignment" and keep their shape.
 */
import type { TriageBand } from './drawing-triage';

export type ReviewFrom = 'assignment' | 'sketchbook' | 'flip' | 'exam' | 'inspiration';

export interface ReviewContext {
  from: ReviewFrom | null;
  assignmentId: string | null;
  lane: TriageBand | null;
  studentId: string | null;
  month: string | null;
  classroomId: string | null;
  examId: string | null;
  classId: string | null;
  itemId: string | null;
}

const FROM: ReviewFrom[] = ['assignment', 'sketchbook', 'flip', 'exam', 'inspiration'];
const LANES: TriageBand[] = ['routine', 'needs_look', 'flagged'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A lane from the address bar, or null for the whole queue. */
export function parseLane(value: string | null | undefined): TriageBand | null {
  return value && (LANES as string[]).includes(value) ? (value as TriageBand) : null;
}

export function parseReviewContext(params: { get(name: string): string | null }): ReviewContext {
  const id = (key: string) => {
    const v = params.get(key);
    return v && UUID.test(v) ? v : null;
  };
  const assignmentId = id('assignment');
  const raw = params.get('from');
  const from: ReviewFrom | null = FROM.includes(raw as ReviewFrom) ? (raw as ReviewFrom) : assignmentId ? 'assignment' : null;
  const month = params.get('month');
  return {
    from,
    assignmentId,
    lane: assignmentId ? parseLane(params.get('lane')) : null,
    studentId: id('student'),
    month: month && MONTH.test(month) ? month : null,
    classroomId: id('classroom'),
    examId: id('exam'),
    classId: id('class'),
    itemId: id('item'),
  };
}

export function reviewHref(submissionId: string, ctx: ReviewContext, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  if (ctx.from && ctx.from !== 'assignment') qs.set('from', ctx.from);
  if (ctx.assignmentId) qs.set('assignment', ctx.assignmentId);
  if (ctx.lane) qs.set('lane', ctx.lane);
  if (ctx.studentId) qs.set('student', ctx.studentId);
  if (ctx.month) qs.set('month', ctx.month);
  if (ctx.classroomId) qs.set('classroom', ctx.classroomId);
  if (ctx.examId) qs.set('exam', ctx.examId);
  if (ctx.classId) qs.set('class', ctx.classId);
  if (ctx.itemId) qs.set('item', ctx.itemId);
  for (const [key, value] of Object.entries(extra)) qs.set(key, value);
  const s = qs.toString();
  return `/teacher/drawing-reviews/${submissionId}${s ? `?${s}` : ''}`;
}

export interface ReviewSubjectFacts {
  assignment_id: string | null;
  student_id: string | null;
  source_type: string | null;
  assignment?: { title: string | null } | null;
  student?: { name: string | null } | null;
}

function sketchbookOf(studentId: string | null, month: string | null): string {
  if (!studentId) return '/teacher/sketchbook';
  return `/teacher/sketchbook/${studentId}${month ? `?month=${month}` : ''}`;
}

export function reviewBackHref(ctx: ReviewContext, sub: ReviewSubjectFacts): string {
  switch (ctx.from) {
    case 'assignment': {
      const a = ctx.assignmentId ?? sub.assignment_id;
      return a ? `/teacher/assignments/${a}` : '/teacher/assignments';
    }
    case 'sketchbook':
      return sketchbookOf(ctx.studentId ?? sub.student_id, ctx.month);
    case 'flip':
      return '/teacher/sketchbook';
    case 'exam':
      return ctx.classId ? `/teacher/timetable/${ctx.classId}/exam?results=1` : '/teacher/exams';
    case 'inspiration':
      return ctx.itemId ? `/teacher/inspiration/${ctx.itemId}` : '/teacher/inspiration';
    default:
      if (sub.assignment_id) return `/teacher/assignments/${sub.assignment_id}`;
      if (sub.source_type === 'exam') return '/teacher/exams';
      return sketchbookOf(sub.student_id, null);
  }
}

export interface ReviewCrumb {
  label: string;
  href?: string;
}

export function reviewCrumbs(ctx: ReviewContext, sub: ReviewSubjectFacts): ReviewCrumb[] {
  const back = reviewBackHref(ctx, sub);
  const review: ReviewCrumb = { label: 'Review' };
  if (ctx.from === 'assignment' || (!ctx.from && sub.assignment_id)) {
    const a = ctx.assignmentId ?? sub.assignment_id;
    return [
      { label: 'Assignments', href: '/teacher/assignments' },
      ...(a ? [{ label: sub.assignment?.title || 'Assignment', href: `/teacher/assignments/${a}` }] : []),
      review,
    ];
  }
  if (ctx.from === 'exam' || (!ctx.from && sub.source_type === 'exam')) {
    return [{ label: 'Exams', href: '/teacher/exams' }, ...(ctx.classId ? [{ label: 'Results', href: back }] : []), review];
  }
  if (ctx.from === 'inspiration') {
    return [{ label: 'Inspiration', href: '/teacher/inspiration' }, { label: 'Drawing', href: back }, review];
  }
  const crumbs: ReviewCrumb[] = [{ label: 'Sketchbooks', href: '/teacher/sketchbook' }];
  if (ctx.from !== 'flip' && (ctx.studentId ?? sub.student_id)) {
    const name = sub.student?.name?.trim();
    crumbs.push({ label: name ? `${name}'s sketchbook` : 'Sketchbook', href: back });
  }
  crumbs.push(review);
  return crumbs;
}

export type QueueSource =
  | { kind: 'assignment'; assignmentId: string; lane: TriageBand | null }
  | { kind: 'list'; url: string; pick: 'sketchbook' | 'inbox' | 'exam' }
  | null;

/** Which list J, K and Save and next walk. */
export function queueSourceFor(ctx: ReviewContext, fallbackAssignmentId: string | null): QueueSource {
  if (ctx.from === 'sketchbook' && ctx.studentId) {
    const month = ctx.month ? `?month=${ctx.month}` : '';
    return { kind: 'list', url: `/api/sketchbook/students/${ctx.studentId}${month}`, pick: 'sketchbook' };
  }
  if (ctx.from === 'flip' && ctx.classroomId) {
    return { kind: 'list', url: `/api/sketchbook/inbox?classroom=${ctx.classroomId}`, pick: 'inbox' };
  }
  if (ctx.from === 'exam' && ctx.examId) {
    return { kind: 'list', url: `/api/exams/${ctx.examId}/drawings`, pick: 'exam' };
  }
  const assignmentId = ctx.assignmentId ?? (ctx.from === null || ctx.from === 'assignment' ? fallbackAssignmentId : null);
  return assignmentId ? { kind: 'assignment', assignmentId, lane: ctx.lane } : null;
}

/** The ids of a list response, in the order the teacher sees them. */
export function pickQueueIds(pick: 'sketchbook' | 'inbox' | 'exam', body: any): string[] {
  if (pick === 'exam') {
    return ((body?.drawings ?? []) as Array<{ submission_id: string; status: string | null }>)
      .filter((d) => d.status === 'submitted' || d.status === 'under_review')
      .map((d) => d.submission_id);
  }
  return ((body?.sketches ?? []) as Array<{ id: string }>).map((s) => s.id);
}

/** A tile in a student's sketchbook opens the review screen, and Back returns to that month. */
export function sketchbookReviewHref(submissionId: string, studentId: string, month?: string | null): string {
  const qs = new URLSearchParams({ from: 'sketchbook', student: studentId });
  if (month) qs.set('month', month);
  return reviewHref(submissionId, parseReviewContext(qs));
}

/** The flip-through card's "Open review". */
export function flipReviewHref(submissionId: string, classroomId: string): string {
  return reviewHref(submissionId, parseReviewContext(new URLSearchParams({ from: 'flip', classroom: classroomId })));
}
