import { describe, expect, it } from 'vitest';
import {
  parseReviewContext,
  pickQueueIds,
  queueSourceFor,
  reviewBackHref,
  reviewCrumbs,
  reviewHref,
} from './review-context';

const A = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const E = '44444444-4444-4444-8444-444444444444';

const params = (qs: string) => new URLSearchParams(qs);
const sketch = { assignment_id: null, student_id: S, source_type: 'sketchbook', student: { name: 'Kathir Raja' } };
const assignmentDrawing = { assignment_id: A, student_id: S, source_type: 'assignment', assignment: { title: 'Line Practice' } };

describe('parseReviewContext', () => {
  it('keeps the old assignment links working', () => {
    const ctx = parseReviewContext(params(`assignment=${A}&lane=routine`));
    expect(ctx.from).toBe('assignment');
    expect(ctx.assignmentId).toBe(A);
    expect(ctx.lane).toBe('routine');
  });

  it('reads a sketchbook link with its student and month', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(ctx).toMatchObject({ from: 'sketchbook', studentId: S, month: '2026-09' });
  });

  it('ignores values that are not ids or months', () => {
    const ctx = parseReviewContext(params('from=nowhere&student=abc&month=Sept'));
    expect(ctx).toMatchObject({ from: null, studentId: null, month: null });
  });

  it('drops a lane outside an assignment', () => {
    expect(parseReviewContext(params(`from=sketchbook&lane=routine`)).lane).toBeNull();
  });
});

describe('reviewBackHref', () => {
  it('returns to the student sketchbook month the teacher came from', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewBackHref(ctx, sketch)).toBe(`/teacher/sketchbook/${S}?month=2026-09`);
  });

  it('returns to the flip-through from the flip-through', () => {
    expect(reviewBackHref(parseReviewContext(params(`from=flip&classroom=${C}`)), sketch)).toBe('/teacher/sketchbook');
  });

  it('returns to the assignment from an assignment link', () => {
    expect(reviewBackHref(parseReviewContext(params(`assignment=${A}`)), assignmentDrawing)).toBe(`/teacher/assignments/${A}`);
  });

  it('returns to the exam results from a test drawing', () => {
    const ctx = parseReviewContext(params(`from=exam&exam=${E}&class=${C}`));
    expect(reviewBackHref(ctx, { assignment_id: null, student_id: S, source_type: 'exam' })).toBe(`/teacher/timetable/${C}/exam?results=1`);
  });

  it('with no context, sends an assignment drawing to its assignment and practice to the student sketchbook', () => {
    const none = parseReviewContext(params(''));
    expect(reviewBackHref(none, assignmentDrawing)).toBe(`/teacher/assignments/${A}`);
    expect(reviewBackHref(none, sketch)).toBe(`/teacher/sketchbook/${S}`);
    expect(reviewBackHref(none, { assignment_id: null, student_id: S, source_type: 'exam' })).toBe('/teacher/exams');
  });
});

describe('reviewCrumbs', () => {
  it('roots practice at Sketchbooks and names the student', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewCrumbs(ctx, sketch)).toEqual([
      { label: 'Sketchbooks', href: '/teacher/sketchbook' },
      { label: "Kathir Raja's sketchbook", href: `/teacher/sketchbook/${S}?month=2026-09` },
      { label: 'Review' },
    ]);
  });

  it('roots an assignment drawing at Assignments with its title', () => {
    expect(reviewCrumbs(parseReviewContext(params(`assignment=${A}`)), assignmentDrawing)).toEqual([
      { label: 'Assignments', href: '/teacher/assignments' },
      { label: 'Line Practice', href: `/teacher/assignments/${A}` },
      { label: 'Review' },
    ]);
  });
});

describe('reviewHref', () => {
  it('carries the context and any extra value', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewHref('d2', ctx, { notice: 'Review sent.' })).toBe(
      `/teacher/drawing-reviews/d2?from=sketchbook&student=${S}&month=2026-09&notice=Review+sent.`,
    );
  });

  it('keeps an assignment link in its old shape', () => {
    expect(reviewHref('d2', parseReviewContext(params(`assignment=${A}&lane=flagged`)))).toBe(
      `/teacher/drawing-reviews/d2?assignment=${A}&lane=flagged`,
    );
  });
});

describe('queueSourceFor and pickQueueIds', () => {
  it('walks the student month from the sketchbook', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/sketchbook/students/${S}?month=2026-09`, pick: 'sketchbook' });
    expect(pickQueueIds('sketchbook', { sketches: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('walks the flip inbox for its classroom', () => {
    const ctx = parseReviewContext(params(`from=flip&classroom=${C}`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/sketchbook/inbox?classroom=${C}`, pick: 'inbox' });
  });

  it('walks the unmarked drawings of an exam', () => {
    const ctx = parseReviewContext(params(`from=exam&exam=${E}&class=${C}`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/exams/${E}/drawings`, pick: 'exam' });
    expect(pickQueueIds('exam', { drawings: [{ submission_id: 'x', status: 'submitted' }, { submission_id: 'y', status: 'completed' }] })).toEqual(['x']);
  });

  it('falls back to the assignment the drawing belongs to', () => {
    expect(queueSourceFor(parseReviewContext(params('')), A)).toEqual({ kind: 'assignment', assignmentId: A, lane: null });
  });

  it('has no queue for practice opened without a context', () => {
    expect(queueSourceFor(parseReviewContext(params('')), null)).toBeNull();
  });
});
