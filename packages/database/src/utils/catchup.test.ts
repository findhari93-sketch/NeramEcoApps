import { describe, it, expect } from 'vitest';
import {
  classifyCatchupCandidate,
  catchupItemStep,
  isCatchupItemComplete,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  type CatchupItemFacts,
} from './catchup';

const cls = (over: Partial<Parameters<typeof classifyCatchupCandidate>[0]> = {}) => ({
  status: 'completed',
  recording_url: null,
  youtube_url: null,
  ...over,
});

/** A class with everything still to do. */
const open = (over: Partial<CatchupItemFacts> = {}): CatchupItemFacts => ({
  watched: false,
  assignmentsOutstanding: 1,
  hasTest: true,
  testPassed: false,
  ...over,
});

/** A class where every gate is cleared. */
const cleared = (over: Partial<CatchupItemFacts> = {}): CatchupItemFacts => ({
  watched: true,
  assignmentsOutstanding: 0,
  hasTest: true,
  testPassed: true,
  ...over,
});

describe('classifyCatchupCandidate', () => {
  it('is eligible when a published recap exists', () => {
    expect(classifyCatchupCandidate(cls(), { id: 'r1', status: 'published' })).toBe('eligible');
  });

  it('is not_ready when a recording exists but the recap is still a draft', () => {
    expect(
      classifyCatchupCandidate(cls({ recording_url: 'https://sp/rec.mp4' }), {
        id: 'r1',
        status: 'draft',
      }),
    ).toBe('not_ready');
  });

  it('is not_ready for a raw recording with no recap at all', () => {
    expect(classifyCatchupCandidate(cls({ youtube_url: 'https://yt/abc' }), null)).toBe('not_ready');
  });

  it('is no_recording when there is nothing to watch', () => {
    expect(classifyCatchupCandidate(cls(), null)).toBe('no_recording');
  });

  it('skips a cancelled class even when it somehow has a published recap', () => {
    expect(
      classifyCatchupCandidate(cls({ status: 'cancelled', recording_url: 'https://sp/x.mp4' }), {
        id: 'r1',
        status: 'published',
      }),
    ).toBe('skip');
  });
});

describe('catchupItemStep', () => {
  it('walks watch, then assignment, then test', () => {
    expect(catchupItemStep(open())).toBe('watch');
    expect(catchupItemStep(open({ watched: true }))).toBe('assignment');
    expect(catchupItemStep(open({ watched: true, assignmentsOutstanding: 0 }))).toBe('test');
    expect(catchupItemStep(cleared())).toBe('done');
  });

  it('finishes at the assignment when no test is placed on the class', () => {
    const noTest = open({ watched: true, assignmentsOutstanding: 0, hasTest: false });
    expect(catchupItemStep(noTest)).toBe('done');
    expect(isCatchupItemComplete(noTest)).toBe(true);
  });

  it('does not let a passed test paper over unwatched video or unsubmitted work', () => {
    expect(isCatchupItemComplete(open({ testPassed: true }))).toBe(false);
    expect(isCatchupItemComplete(open({ watched: true, testPassed: true }))).toBe(false);
  });

  it('treats an excused class as complete and an excluded one as never complete', () => {
    expect(isCatchupItemComplete(open({ excused: true }))).toBe(true);
    expect(isCatchupItemComplete(cleared({ excluded: true }))).toBe(false);
  });
});

describe('resolveCatchupBacklog', () => {
  it('opens exactly one item and locks the rest', () => {
    const r = resolveCatchupBacklog([cleared(), open(), open(), open()]);
    expect(r.map((i) => i.status)).toEqual(['done', 'current', 'locked', 'locked']);
    expect(r.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('has no current item once the whole backlog is cleared', () => {
    const r = resolveCatchupBacklog([cleared(), cleared()]);
    expect(r.every((i) => i.status === 'done')).toBe(true);
  });

  it('steps over a class with no recording instead of stalling behind it', () => {
    const r = resolveCatchupBacklog([open({ excluded: true }), open(), open()]);
    expect(r.map((i) => i.status)).toEqual(['blocked', 'current', 'locked']);
    // Excluded work is not numbered, so the student is never told to do "class 1"
    // when class 1 is the one they cannot do.
    expect(r.map((i) => i.position)).toEqual([null, 1, 2]);
  });

  it('steps over a class the teacher has not prepared yet', () => {
    const r = resolveCatchupBacklog([open({ notReady: true }), open()]);
    expect(r.map((i) => i.status)).toEqual(['pending_teacher', 'current']);
    expect(r[0].countsTowardPace).toBe(false);
  });

  it('steps over an excused class without opening it', () => {
    const r = resolveCatchupBacklog([open({ excused: true }), open()]);
    expect(r.map((i) => i.status)).toEqual(['excused', 'current']);
    expect(r[0].step).toBe('done');
  });

  it('is empty-safe', () => {
    expect(resolveCatchupBacklog([])).toEqual([]);
  });
});

describe('summariseCatchupBacklog', () => {
  it('counts only work the student could actually do', () => {
    const r = resolveCatchupBacklog([
      cleared(),
      cleared(),
      open(),
      open({ excluded: true }),
      open({ notReady: true }),
      open({ excused: true }),
    ]);
    // 2 done + 1 open = 3 countable. The excluded, not-ready and excused rows
    // stay out of the denominator so nobody is marked behind for them.
    expect(summariseCatchupBacklog(r)).toEqual({
      total: 3,
      completed: 2,
      blocked: 1,
      pendingTeacher: 1,
    });
  });
});
