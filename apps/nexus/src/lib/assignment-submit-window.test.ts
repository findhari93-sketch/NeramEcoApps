import { describe, it, expect } from 'vitest';
import {
  resolveSubmitMode,
  canAcceptSubmission,
  lockedReason,
  studentEditedAt,
} from './assignment-submit-window';

/** An assignment handed out on the 1st, due on the 10th, for an on-time student. */
const withDeadline = {
  class_date: '2026-08-01',
  enrolled_at: '2026-07-01T00:00:00Z',
  due_at: '2026-08-10T23:59:59+05:30',
  catchup_window_days: 7,
};

/** The same assignment with no due date at all, which is the common case. */
const noDeadline = { ...withDeadline, due_at: null };

const submitted = { status: 'submitted', reviewed_at: null };
const marked = { status: 'reviewed', reviewed_at: '2026-08-03T10:00:00Z' };
const redo = { status: 'redo', reviewed_at: '2026-08-03T10:00:00Z' };

describe('resolveSubmitMode', () => {
  it("is 'first' when nothing has been submitted", () => {
    expect(resolveSubmitMode(null, withDeadline, '2026-08-02T06:00:00Z')).toBe('first');
    expect(resolveSubmitMode(undefined, noDeadline, '2026-08-02T06:00:00Z')).toBe('first');
  });

  it("is 'redo' whenever the teacher sent it back, even long past the deadline", () => {
    // A redo is the teacher's own decision to reopen, so the deadline does not
    // get to overrule it. This is the one path that survives a closed window.
    expect(resolveSubmitMode(redo, withDeadline, '2026-09-30T06:00:00Z')).toBe('redo');
  });

  describe("'replace': unmarked work, inside the window", () => {
    it('allows a fix before the deadline', () => {
      expect(resolveSubmitMode(submitted, withDeadline, '2026-08-02T06:00:00Z')).toBe('replace');
    });

    it('allows a fix on the due day itself', () => {
      expect(resolveSubmitMode(submitted, withDeadline, '2026-08-10T18:00:00Z')).toBe('replace');
    });

    it('stays open indefinitely when the assignment has no deadline', () => {
      // This is Abhitha's actual case: assignment 85a1dd5d has due_at = null.
      expect(resolveSubmitMode(submitted, noDeadline, '2027-01-01T06:00:00Z')).toBe('replace');
    });

    it("honours a late joiner's personal catch-up window, not the class deadline", () => {
      // Joined on the 20th, ten days after the class deadline passed, so they get
      // their own 7 days and the original due date is irrelevant to them.
      const lateJoiner = { ...withDeadline, enrolled_at: '2026-08-20T00:00:00Z' };
      expect(resolveSubmitMode(submitted, lateJoiner, '2026-08-25T06:00:00Z')).toBe('replace');
      expect(resolveSubmitMode(submitted, lateJoiner, '2026-08-28T06:00:00Z')).toBe('locked');
    });
  });

  describe("'locked'", () => {
    it('shuts once the deadline has passed', () => {
      expect(resolveSubmitMode(submitted, withDeadline, '2026-08-11T06:00:00Z')).toBe('locked');
    });

    it('shuts once the work has been marked', () => {
      expect(resolveSubmitMode(marked, noDeadline, '2026-08-04T06:00:00Z')).toBe('locked');
    });

    it('shuts on a reviewed_at stamp even if the status still reads submitted', () => {
      // The guard that stops a replayed submit call wiping marks. upsertSubmission
      // sets marks to null on every non-replace write, so accepting this would
      // let a student erase their own grade.
      const inconsistent = { status: 'submitted', reviewed_at: '2026-08-03T10:00:00Z' };
      expect(resolveSubmitMode(inconsistent, noDeadline, '2026-08-04T06:00:00Z')).toBe('locked');
    });

    it('shuts for any status this engine does not know', () => {
      expect(resolveSubmitMode({ status: 'completed' }, noDeadline, '2026-08-04T06:00:00Z')).toBe('locked');
    });
  });
});

describe('canAcceptSubmission', () => {
  it('accepts every mode except locked', () => {
    expect(canAcceptSubmission('first')).toBe(true);
    expect(canAcceptSubmission('redo')).toBe(true);
    expect(canAcceptSubmission('replace')).toBe(true);
    expect(canAcceptSubmission('locked')).toBe(false);
  });
});

describe('studentEditedAt', () => {
  const at = (submitted: string, updated: string, extra = {}) => ({
    status: 'submitted',
    reviewed_at: null,
    submitted_at: submitted,
    updated_at: updated,
    ...extra,
  });

  it('reports the time when the file was swapped after submitting', () => {
    expect(studentEditedAt(at('2026-08-01T11:46:00Z', '2026-08-01T11:53:00Z'))).toBe(
      '2026-08-01T11:53:00Z',
    );
  });

  it('stays quiet on a fresh submission', () => {
    expect(studentEditedAt(at('2026-08-01T11:46:00Z', '2026-08-01T11:46:00Z'))).toBeNull();
  });

  it('treats sub-second skew between the app clock and the database clock as noise', () => {
    // submitted_at comes from JS, updated_at from the database default, so a new
    // row can legitimately show a few hundred ms of drift either way.
    expect(studentEditedAt(at('2026-08-01T11:46:00.000Z', '2026-08-01T11:46:00.400Z'))).toBeNull();
  });

  it('stays quiet once the work has been reviewed, since the teacher moved updated_at', () => {
    expect(
      studentEditedAt(
        at('2026-08-01T11:46:00Z', '2026-08-02T09:00:00Z', { reviewed_at: '2026-08-02T09:00:00Z' }),
      ),
    ).toBeNull();
    expect(
      studentEditedAt(
        at('2026-08-01T11:46:00Z', '2026-08-02T09:00:00Z', { status: 'reviewed' }),
      ),
    ).toBeNull();
  });

  it('handles a missing row or missing timestamps', () => {
    expect(studentEditedAt(null)).toBeNull();
    expect(studentEditedAt({ status: 'submitted', reviewed_at: null })).toBeNull();
  });
});

describe('lockedReason', () => {
  it('names marking when the work has been marked', () => {
    expect(lockedReason(marked)).toMatch(/already marked/i);
  });

  it('names the deadline when the work is merely out of time', () => {
    expect(lockedReason(submitted)).toMatch(/deadline/i);
  });

  it('always points at the way forward', () => {
    expect(lockedReason(marked)).toMatch(/reopen/i);
    expect(lockedReason(submitted)).toMatch(/reopen/i);
  });
});
