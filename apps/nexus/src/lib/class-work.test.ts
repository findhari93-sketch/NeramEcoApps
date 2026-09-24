import { describe, expect, it } from 'vitest';
import {
  indexSubmissions,
  studentWork,
  submissionStatus,
  summariseWork,
  type ClassAssignment,
  type WorkSubmission,
} from './class-work';

const HOMEWORK: ClassAssignment = { id: 'hw', title: 'Line practice', timing: 'homework', due_at: '2026-09-18T18:29:59Z' };
const PREWORK: ClassAssignment = { id: 'pw', title: 'Read chapter 2', timing: 'prework', due_at: null };

const sub = (student_id: string, over: Partial<WorkSubmission> = {}): WorkSubmission => ({
  assignment_id: 'hw',
  student_id,
  submitted_at: '2026-09-17T10:00:00Z',
  status: 'submitted',
  ...over,
});

describe('submissionStatus', () => {
  it('reads on time, late, sent back and missing', () => {
    expect(submissionStatus(sub('a'), HOMEWORK.due_at)).toBe('in');
    expect(submissionStatus(sub('a', { submitted_at: '2026-09-20T10:00:00Z' }), HOMEWORK.due_at)).toBe('late');
    expect(submissionStatus(sub('a', { status: 'redo' }), HOMEWORK.due_at)).toBe('redo');
    expect(submissionStatus(null, HOMEWORK.due_at)).toBe('missing');
  });

  it('counts a drawing in any reviewed state as handed in', () => {
    expect(submissionStatus(sub('a', { status: 'under_review' }), null)).toBe('in');
    expect(submissionStatus(sub('a', { status: 'completed' }), null)).toBe('in');
  });
});

describe('studentWork', () => {
  it('takes the best of several rows for one assignment', () => {
    const subs = indexSubmissions([sub('a', { status: 'redo' }), sub('a', { status: 'submitted' })]);
    const w = studentWork('a', [HOMEWORK], subs);
    expect(w.handedIn).toBe(1);
    expect(w.byAssignment.hw).toBe('in');
  });

  it('counts a late hand-in as in, and says it was late', () => {
    const subs = indexSubmissions([sub('a', { submitted_at: '2026-09-25T10:00:00Z' })]);
    const w = studentWork('a', [HOMEWORK], subs);
    expect(w).toMatchObject({ total: 1, handedIn: 1, late: 1, missing: 0 });
  });
});

describe('summariseWork', () => {
  it('splits who has not handed it in by where they stand on the class', () => {
    const assignments = [HOMEWORK];
    const subs = indexSubmissions([sub('came-in')]);
    const w = (id: string) => studentWork(id, assignments, subs);
    const [s] = summariseWork(assignments, [
      { id: 'came-in', audience: 'came', work: w('came-in') },
      { id: 'came-out', audience: 'came', work: w('came-out') },
      { id: 'cu-out', audience: 'caught_up', work: w('cu-out') },
      { id: 'cing-out', audience: 'catching_up', work: w('cing-out') },
      { id: 'excused', audience: 'other', work: w('excused') },
    ]);
    expect(s).toMatchObject({ expected: 4, handedIn: 1, missingCame: 1, missingCaughtUp: 1, missingCatchingUp: 1 });
  });

  it('never expects prework from someone who enrolled after the class', () => {
    const [s] = summariseWork([PREWORK], [
      { id: 'a', audience: 'came', work: null },
      { id: 'late', audience: 'catching_up', work: null, joinedAfterClass: true },
    ]);
    expect(s.expected).toBe(1);
  });

  it('does expect homework from a late joiner', () => {
    const [s] = summariseWork([HOMEWORK], [{ id: 'late', audience: 'catching_up', work: null, joinedAfterClass: true }]);
    expect(s.expected).toBe(1);
    expect(s.missingCatchingUp).toBe(1);
  });
});
