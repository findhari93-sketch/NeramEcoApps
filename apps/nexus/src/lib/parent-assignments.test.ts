import { describe, it, expect } from 'vitest';
import {
  buildParentAssignmentViews,
  summariseAssignments,
  type ParentAssignmentInput,
} from './parent-assignments';

const TODAY = '2026-07-29';

function item(over: Partial<ParentAssignmentInput> = {}): ParentAssignmentInput {
  return {
    id: 'a1',
    title: 'Site plan sketch',
    class_date: '2026-07-20',
    due_at: '2026-07-21T18:00:00+05:30',
    catchup_window_days: 7,
    max_marks: 10,
    evaluation_type: 'marks',
    enrolled_at: '2026-06-01T00:00:00Z',
    submission: null,
    ...over,
  };
}

describe('bucketing', () => {
  it('puts unsubmitted work in needs_doing', () => {
    const [v] = buildParentAssignmentViews([item()], TODAY);
    expect(v.bucket).toBe('needs_doing');
  });

  it('puts submitted-but-ungraded work in waiting_on_teacher', () => {
    const [v] = buildParentAssignmentViews(
      [item({ submission: { status: 'submitted', attempt_number: 1 } })],
      TODAY
    );
    expect(v.bucket).toBe('waiting_on_teacher');
  });

  it('puts reviewed work in marked', () => {
    const [v] = buildParentAssignmentViews(
      [item({ submission: { status: 'reviewed', marks: 8, feedback: 'Good linework.' } })],
      TODAY
    );
    expect(v.bucket).toBe('marked');
    expect(v.score).toBe(8);
  });

  it('sends a redo back to needs_doing', () => {
    // The teacher handed it back, so the ball is with the child again. Leaving
    // it under "waiting on teacher" would tell a parent to do nothing.
    const [v] = buildParentAssignmentViews(
      [item({ submission: { status: 'redo', attempt_number: 1, feedback: 'Try again.' } })],
      TODAY
    );
    expect(v.bucket).toBe('needs_doing');
  });

  it('treats a graded drawing as marked even when the status never moved', () => {
    const [v] = buildParentAssignmentViews(
      [item({ assignment_type: 'drawing', evaluation_type: 'stars', drawing_rating: 4 })],
      TODAY
    );
    expect(v.bucket).toBe('marked');
    expect(v.score).toBe(4);
    expect(v.maxScore).toBe(5);
  });
});

describe('scores and feedback', () => {
  it('pins the maximum to 5 for star grading, whatever max_marks says', () => {
    const [v] = buildParentAssignmentViews(
      [item({ evaluation_type: 'stars', max_marks: 100, drawing_rating: 3 })],
      TODAY
    );
    expect(v.evaluationType).toBe('stars');
    expect(v.maxScore).toBe(5);
  });

  it('keeps an arbitrary marks maximum', () => {
    const [v] = buildParentAssignmentViews(
      [item({ max_marks: 100, submission: { status: 'reviewed', marks: 72 } })],
      TODAY
    );
    expect(v.maxScore).toBe(100);
    expect(v.score).toBe(72);
  });

  it('passes teacher feedback through completely unchanged', () => {
    const feedback =
      'Proportions are off on the north elevation — redo the 1:100 and check your scale bar. Otherwise strong.';
    const [v] = buildParentAssignmentViews(
      [item({ submission: { status: 'reviewed', marks: 6, feedback } })],
      TODAY
    );
    // Verbatim means verbatim: no truncation, no softening, no summarising.
    expect(v.feedback).toBe(feedback);
  });

  it('prefers submission marks over drawing marks when both exist', () => {
    const [v] = buildParentAssignmentViews(
      [item({ submission: { status: 'reviewed', marks: 9 }, drawing_marks: 3, drawing_rating: 1 })],
      TODAY
    );
    expect(v.score).toBe(9);
  });

  it('reports no score for unmarked work', () => {
    const [v] = buildParentAssignmentViews([item()], TODAY);
    expect(v.score).toBeNull();
    expect(v.feedback).toBeNull();
  });

  it('surfaces the teacher reaction from either source', () => {
    const [a] = buildParentAssignmentViews(
      [item({ submission: { status: 'reviewed', marks: 8, reaction: 'clap' } })],
      TODAY
    );
    expect(a.reaction).toBe('clap');

    const [b] = buildParentAssignmentViews([item({ drawing_reaction: 'fire' })], TODAY);
    expect(b.reaction).toBe('fire');
  });
});

describe('the personal clock', () => {
  it('marks outstanding work past its due date as overdue', () => {
    const [v] = buildParentAssignmentViews([item({ due_at: '2026-07-21T18:00:00+05:30' })], TODAY);
    expect(v.isOverdue).toBe(true);
    expect(v.dueOn).toBe('2026-07-21');
  });

  it('never marks graded work as overdue', () => {
    // Handed in late weeks ago and already marked. Flagging it red now helps
    // nobody and reads as a fresh problem to an anxious parent.
    const [v] = buildParentAssignmentViews(
      [item({ due_at: '2026-07-21T18:00:00+05:30', submission: { status: 'reviewed', marks: 7 } })],
      TODAY
    );
    expect(v.isOverdue).toBe(false);
  });

  it('gives a late joiner their own window instead of the class deadline', () => {
    // Enrolled 2026-07-26, six days after the class. The class deadline has long
    // passed, but their personal 7-day window has not.
    const [v] = buildParentAssignmentViews(
      [item({ enrolled_at: '2026-07-26T00:00:00Z', due_at: '2026-07-21T18:00:00+05:30' })],
      TODAY
    );
    expect(v.isLateJoiner).toBe(true);
    expect(v.dueOn).toBe('2026-08-02');
    expect(v.isOverdue).toBe(false);
  });

  it('has no deadline when the assignment has none', () => {
    const [v] = buildParentAssignmentViews([item({ due_at: null })], TODAY);
    expect(v.dueOn).toBeNull();
    expect(v.isOverdue).toBe(false);
  });
});

describe('summary', () => {
  it('counts each bucket', () => {
    const views = buildParentAssignmentViews(
      [
        item({ id: 'a1' }),
        item({ id: 'a2', submission: { status: 'submitted' } }),
        item({ id: 'a3', submission: { status: 'reviewed', marks: 8 } }),
        item({ id: 'a4', submission: { status: 'redo' } }),
      ],
      TODAY
    );
    const s = summariseAssignments(views);
    expect(s.total).toBe(4);
    expect(s.needsDoing).toBe(2);
    expect(s.waitingOnTeacher).toBe(1);
    expect(s.marked).toBe(1);
    expect(s.overdue).toBe(2);
  });

  it('averages across each item own maximum', () => {
    // 8/10 = 80%, 60/100 = 60%, 4/5 stars = 80%. Mean 73.33 -> 73.
    const views = buildParentAssignmentViews(
      [
        item({ id: 'a1', max_marks: 10, submission: { status: 'reviewed', marks: 8 } }),
        item({ id: 'a2', max_marks: 100, submission: { status: 'reviewed', marks: 60 } }),
        item({ id: 'a3', evaluation_type: 'stars', drawing_rating: 4 }),
      ],
      TODAY
    );
    expect(summariseAssignments(views).averagePercent).toBe(73);
  });

  it('returns a null average when nothing has been marked, never 0', () => {
    // Same principle as attendanceRate: "not graded yet" and "scored zero" are
    // completely different messages to send a parent.
    const views = buildParentAssignmentViews([item(), item({ id: 'a2' })], TODAY);
    const s = summariseAssignments(views);
    expect(s.averagePercent).toBeNull();
    expect(s.averagePercent).not.toBe(0);
  });

  it('ignores marked work with no usable maximum', () => {
    const views = buildParentAssignmentViews(
      [
        item({ id: 'a1', max_marks: null, submission: { status: 'reviewed', marks: 5 } }),
        item({ id: 'a2', max_marks: 10, submission: { status: 'reviewed', marks: 5 } }),
      ],
      TODAY
    );
    expect(summariseAssignments(views).averagePercent).toBe(50);
  });

  it('handles an empty list', () => {
    expect(summariseAssignments([])).toEqual({
      total: 0,
      needsDoing: 0,
      overdue: 0,
      waitingOnTeacher: 0,
      marked: 0,
      averagePercent: null,
    });
  });
});
