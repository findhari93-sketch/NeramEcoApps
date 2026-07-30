import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_STATUS,
  describeMinutes,
  workStatus,
  testStatus,
  catchupStatus,
  recordingStatus,
  resourceStatus,
  headlineStatus,
} from './parent-status';
import type { ParentClass } from './parent-view-types';

function cls(over: Partial<ParentClass> = {}): ParentClass {
  return {
    id: 'c1',
    title: 'Coordinate Geometry',
    description: null,
    scheduled_date: '2026-07-20',
    start_time: '19:00:00',
    end_time: '20:30:00',
    status: 'completed',
    phase: 'past',
    teacher: null,
    topicTitle: null,
    classroom: null,
    recording: { available: false, watchedByChild: null, watchedAt: null, proof: null },
    resources: { count: 0 },
    attendance: null,
    assignmentBadge: null,
    testBadge: null,
    catchupBadge: null,
    ...over,
  };
}

function attendance(over: Record<string, unknown> = {}) {
  return {
    classId: 'c1',
    title: 'Coordinate Geometry',
    date: '2026-07-20',
    startTime: '19:00:00',
    endTime: '20:30:00',
    scheduledMinutes: 90,
    measurement: 'measured',
    label: 'attended',
    attended: true,
    joinedAt: null,
    leftAt: null,
    durationMinutes: 73,
    late: false,
    leftEarly: false,
    droppedMidClass: false,
    segments: [],
    reasonCode: null,
    reasonNote: null,
    reasonSource: null,
    ...over,
  } as ParentClass['attendance'];
}

describe('attendance wording', () => {
  it('never colours an unrecorded class as an error', () => {
    // 'not_recorded' means our sync did not run, not that the child did
    // anything. Red here would accuse a child of an administrator's omission.
    expect(ATTENDANCE_STATUS.not_recorded.tone).toBe('neutral');
    expect(ATTENDANCE_STATUS.not_recorded.detail).toMatch(/never recorded/i);
  });

  it('reserves error for a genuine unexplained absence', () => {
    expect(ATTENDANCE_STATUS.missed.tone).toBe('error');
    // A reason given softens it: somebody told us, so it is information.
    expect(ATTENDANCE_STATUS.missed_with_reason.tone).toBe('primary');
  });

  it('gives every label a word, so colour is never the only signal', () => {
    for (const [key, v] of Object.entries(ATTENDANCE_STATUS)) {
      expect(v.label.length, `${key} has no label`).toBeGreaterThan(2);
    }
  });
});

describe('describeMinutes', () => {
  it('answers the question a parent actually asked', () => {
    expect(describeMinutes(cls({ attendance: attendance() }))).toBe(
      'Present 73 of 90 minutes'
    );
  });

  it('says nothing when the class was never measured', () => {
    // Rendering "0 of 90 minutes" for an unsynced class would be a lie.
    expect(
      describeMinutes(
        cls({ attendance: attendance({ measurement: 'not_measured', durationMinutes: null }) })
      )
    ).toBeNull();
  });

  it('says nothing when there is no attendance at all', () => {
    expect(describeMinutes(cls())).toBeNull();
  });

  it('drops the denominator when the class length is unknown', () => {
    expect(
      describeMinutes(cls({ attendance: attendance({ scheduledMinutes: null }) }))
    ).toBe('Present 73 minutes');
  });
});

describe('workStatus', () => {
  it('is null when the class set no work, rather than a reassuring green pill', () => {
    // A row of "nothing to do" pills would drown the one class that needs
    // attention.
    expect(workStatus(cls())).toBeNull();
    expect(workStatus(cls({ assignmentBadge: { total: 0, doneByChild: 0 } }))).toBeNull();
  });

  it('is success when everything is done', () => {
    expect(workStatus(cls({ assignmentBadge: { total: 2, doneByChild: 2 } }))?.tone).toBe(
      'success'
    );
  });

  it('is a warning when some is outstanding', () => {
    const s = workStatus(cls({ assignmentBadge: { total: 3, doneByChild: 1 } }));
    expect(s?.tone).toBe('warning');
    expect(s?.label).toBe('1 of 3 done');
  });
});

describe('testStatus', () => {
  it('never shows a percentage for a test that was not taken', () => {
    const s = testStatus(cls({ testBadge: { attempted: false, bestPct: null, passed: null } }));
    expect(s?.label).toBe('Test not taken');
    expect(s?.label).not.toMatch(/\d/);
  });

  it('shows the score when passed', () => {
    expect(
      testStatus(cls({ testBadge: { attempted: true, bestPct: 88, passed: true } }))?.label
    ).toBe('Test passed, 88%');
  });
});

describe('recordingStatus', () => {
  it('says nothing when there is no recording', () => {
    expect(recordingStatus(cls())).toBeNull();
  });

  it('does not accuse a child who was in the class', () => {
    // watchedByChild null means they attended live, so the recording is not
    // their problem. "Not watched" here would be a criticism of nothing.
    const s = recordingStatus(
      cls({ recording: { available: true, watchedByChild: null, watchedAt: null, proof: null } })
    );
    expect(s?.label).toBe('Recording available');
    expect(s?.tone).toBe('neutral');
  });

  it('flags an unwatched recording for a child who missed the class', () => {
    const s = recordingStatus(
      cls({ recording: { available: true, watchedByChild: false, watchedAt: null, proof: null } })
    );
    expect(s?.tone).toBe('warning');
    expect(s?.label).toBe('Recording not watched');
  });

  it('offers no link, ever', () => {
    const s = recordingStatus(
      cls({
        recording: {
          available: true,
          watchedByChild: true,
          watchedAt: '2026-07-22T10:00:00Z',
          proof: 'recap_completed',
        },
      })
    );
    expect(JSON.stringify(s)).not.toMatch(/http|url|\.mp4/i);
  });
});

describe('resourceStatus', () => {
  it('counts without naming', () => {
    expect(resourceStatus(cls({ resources: { count: 3 } }))).toBe(
      'The teacher shared 3 reference materials for this class.'
    );
    expect(resourceStatus(cls({ resources: { count: 1 } }))).toMatch(/1 reference material\b/);
  });

  it('says nothing when none were shared', () => {
    expect(resourceStatus(cls())).toBeNull();
  });
});

describe('headlineStatus surfaces what to act on', () => {
  it('puts an open catch-up above a good attendance record', () => {
    const s = headlineStatus(
      cls({
        attendance: attendance(),
        catchupBadge: { open: true, caughtUpAt: null },
      })
    );
    expect(s?.label).toBe('Catch-up open');
  });

  it('puts outstanding work above attendance', () => {
    const s = headlineStatus(
      cls({ attendance: attendance(), assignmentBadge: { total: 2, doneByChild: 0 } })
    );
    expect(s?.tone).toBe('warning');
  });

  it('falls back to attendance when nothing needs doing', () => {
    expect(headlineStatus(cls({ attendance: attendance() }))?.label).toBe('Attended');
  });

  it('says nothing about a class that has not happened', () => {
    expect(headlineStatus(cls({ phase: 'upcoming' }))).toBeNull();
  });

  it('marks a cancelled class neutrally', () => {
    expect(headlineStatus(cls({ phase: 'cancelled' }))).toEqual({
      label: 'Cancelled',
      tone: 'neutral',
    });
  });
});

describe('content rules', () => {
  const BANNED = /[—–]|--|&mdash;/;

  it('uses no em dashes in any attendance label or detail', () => {
    for (const v of Object.values(ATTENDANCE_STATUS)) {
      expect(v.label).not.toMatch(BANNED);
      if (v.detail) expect(v.detail).not.toMatch(BANNED);
    }
  });

  it('uses no em dashes in the recording or resource copy', () => {
    const samples = [
      recordingStatus(
        cls({ recording: { available: true, watchedByChild: false, watchedAt: null, proof: null } })
      ),
      recordingStatus(
        cls({ recording: { available: true, watchedByChild: null, watchedAt: null, proof: null } })
      ),
      recordingStatus(
        cls({
          recording: {
            available: true,
            watchedByChild: true,
            watchedAt: null,
            proof: 'recap_completed',
          },
        })
      ),
    ];
    for (const s of samples) {
      expect(s!.label).not.toMatch(BANNED);
      if (s!.detail) expect(s!.detail).not.toMatch(BANNED);
    }
    expect(resourceStatus(cls({ resources: { count: 4 } }))!).not.toMatch(BANNED);
  });
});
