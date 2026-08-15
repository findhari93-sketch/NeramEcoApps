import { describe, it, expect } from 'vitest';
import {
  buildExamRoster,
  summariseExamRoster,
  sortExamRoster,
  type ExamRosterAttempt,
  type ExamRosterMakeup,
} from './scheduled-exam-roster';

const OPENS = '2026-08-20T04:30:00.000Z'; // 10:00 IST
const CLOSES = '2026-08-20T07:30:00.000Z'; // 13:00 IST
const DURING = new Date('2026-08-20T05:00:00.000Z').getTime();
const AFTER = new Date('2026-08-20T08:00:00.000Z').getTime();

const students = [
  { id: 's1', name: 'Arun' },
  { id: 's2', name: 'Bhavya' },
  { id: 's3', name: 'Chitra' },
];

const base = {
  students,
  makeups: new Map<string, ExamRosterMakeup>(),
  window: { opens_at: OPENS, closes_at: CLOSES },
  durationMinutes: 180,
};

describe('buildExamRoster', () => {
  it('calls a student with no attempt not_started while the door is open', () => {
    // Never "failed", and never "absent" at 10:01 for an exam that runs to 13:00.
    const rows = buildExamRoster({ ...base, attempts: [], now: DURING });
    expect(rows.every((r) => r.status === 'not_started')).toBe(true);
  });

  it('calls them absent only once the door has closed', () => {
    const rows = buildExamRoster({ ...base, attempts: [], now: AFTER });
    expect(rows.every((r) => r.status === 'absent')).toBe(true);
  });

  it('gives an in-progress student the earlier of their clock and the door', () => {
    // Starting at 12:50 on a 180-minute paper that closes at 13:00 leaves ten
    // minutes, not three hours. Showing the duration would promise time the
    // door will not keep.
    const lateStart = '2026-08-20T07:20:00.000Z'; // 12:50 IST
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'in_progress', started_at: lateStart, submitted_at: null, score: null, percentage: null },
    ];
    const now = new Date('2026-08-20T07:21:00.000Z').getTime();
    const rows = buildExamRoster({ ...base, attempts, now });
    const arun = rows.find((r) => r.student_id === 's1')!;

    expect(arun.status).toBe('in_progress');
    expect(arun.deadline_at).toBe(CLOSES);
    expect(arun.seconds_remaining).toBe(9 * 60);
  });

  it('uses the duration when it expires before the door does', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'in_progress', started_at: OPENS, submitted_at: null, score: null, percentage: null },
    ];
    const rows = buildExamRoster({ ...base, attempts, durationMinutes: 60, now: DURING });
    const arun = rows.find((r) => r.student_id === 's1')!;
    // 10:00 + 60 minutes = 11:00 IST, before the 13:00 close.
    expect(arun.deadline_at).toBe('2026-08-20T05:30:00.000Z');
  });

  it('never returns a negative time remaining', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'in_progress', started_at: OPENS, submitted_at: null, score: null, percentage: null },
    ];
    const rows = buildExamRoster({ ...base, attempts, now: AFTER });
    expect(rows.find((r) => r.student_id === 's1')!.seconds_remaining).toBe(0);
  });

  it('reports a submitted paper with its percentage', () => {
    const attempts: ExamRosterAttempt[] = [
      {
        student_id: 's1',
        status: 'submitted',
        started_at: OPENS,
        submitted_at: CLOSES,
        score: 120,
        percentage: 60,
      },
    ];
    const rows = buildExamRoster({ ...base, attempts, now: AFTER });
    expect(rows.find((r) => r.student_id === 's1')).toMatchObject({
      status: 'submitted',
      percentage: 60,
      provisional: true,
    });
  });

  it('prefers the final percentage once drawings are marked', () => {
    const attempts: ExamRosterAttempt[] = [
      {
        student_id: 's1',
        status: 'submitted',
        started_at: OPENS,
        submitted_at: CLOSES,
        score: 60,
        percentage: 60,
        final_percentage: 72,
        finalised_at: CLOSES,
      },
    ];
    const rows = buildExamRoster({ ...base, attempts, now: AFTER });
    expect(rows.find((r) => r.student_id === 's1')).toMatchObject({
      percentage: 72,
      provisional: false,
    });
  });

  it('lets a submitted attempt win over an abandoned one', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'abandoned', started_at: OPENS, submitted_at: null, score: null, percentage: null },
      { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 10, percentage: 50 },
    ];
    const rows = buildExamRoster({ ...base, attempts, now: AFTER });
    expect(rows.find((r) => r.student_id === 's1')!.status).toBe('submitted');
  });

  describe('makeups', () => {
    const makeups = new Map<string, ExamRosterMakeup>([
      ['s2', { opens_at: '2026-08-22T04:30:00.000Z', closes_at: '2026-08-22T07:30:00.000Z', revoked_at: null }],
    ]);

    it('shows makeup_open once the main door has shut and theirs has not', () => {
      const rows = buildExamRoster({ ...base, makeups, attempts: [], now: AFTER });
      expect(rows.find((r) => r.student_id === 's2')!.status).toBe('makeup_open');
      // Everyone else is simply absent.
      expect(rows.find((r) => r.student_id === 's1')!.status).toBe('absent');
    });

    it('marks them absent once their own window also closes', () => {
      const later = new Date('2026-08-23T00:00:00.000Z').getTime();
      const rows = buildExamRoster({ ...base, makeups, attempts: [], now: later });
      expect(rows.find((r) => r.student_id === 's2')!.status).toBe('absent');
    });

    it('ignores a revoked grant', () => {
      const revoked = new Map<string, ExamRosterMakeup>([
        ['s2', { opens_at: '2026-08-22T04:30:00.000Z', closes_at: '2026-08-22T07:30:00.000Z', revoked_at: AFTER.toString() }],
      ]);
      const rows = buildExamRoster({ ...base, makeups: revoked, attempts: [], now: AFTER });
      expect(rows.find((r) => r.student_id === 's2')!.status).toBe('absent');
    });
  });
});

describe('buildExamRoster: attempts allowed, exhaustion and violations', () => {
  it('defaults to unlimited when no baseAttemptLimit is given -- every pre-existing caller', () => {
    const rows = buildExamRoster({
      ...base,
      attempts: [
        { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 50 },
      ],
      now: AFTER,
    });
    const arun = rows.find((r) => r.student_id === 's1')!;
    expect(arun.attempts_allowed).toBeNull();
    expect(arun.attempts_used).toBe(1);
    expect(arun.exhausted).toBe(false);
    expect(arun.violation_count).toBe(0);
  });

  it('is exhausted once submitted attempts reach the base limit', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 50 },
    ];
    const rows = buildExamRoster({ ...base, attempts, baseAttemptLimit: 1, now: AFTER });
    const arun = rows.find((r) => r.student_id === 's1')!;
    expect(arun.attempts_allowed).toBe(1);
    expect(arun.exhausted).toBe(true);
  });

  it('a teacher-granted override raises attempts_allowed and clears exhausted', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 50 },
    ];
    const rows = buildExamRoster({
      ...base,
      attempts,
      baseAttemptLimit: 1,
      attemptOverrides: new Map([['s1', 2]]),
      now: AFTER,
    });
    const arun = rows.find((r) => r.student_id === 's1')!;
    expect(arun.attempts_allowed).toBe(3);
    expect(arun.exhausted).toBe(false);
  });

  it('counts every submitted attempt toward attempts_used, not just the one shown', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 40 },
      { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 2, percentage: 70 },
    ];
    const rows = buildExamRoster({ ...base, attempts, baseAttemptLimit: 3, now: AFTER });
    expect(rows.find((r) => r.student_id === 's1')!.attempts_used).toBe(2);
  });

  it('is never exhausted while a sitting is currently in progress', () => {
    const attempts: ExamRosterAttempt[] = [
      { student_id: 's1', status: 'in_progress', started_at: OPENS, submitted_at: null, score: null, percentage: null },
    ];
    const rows = buildExamRoster({ ...base, attempts, baseAttemptLimit: 1, now: DURING });
    const arun = rows.find((r) => r.student_id === 's1')!;
    expect(arun.status).toBe('in_progress');
    expect(arun.exhausted).toBe(false);
  });

  it('surfaces the violation count from getViolationCountsForTest', () => {
    const rows = buildExamRoster({
      ...base,
      attempts: [],
      violationCounts: new Map([['s2', 3]]),
      now: DURING,
    });
    expect(rows.find((r) => r.student_id === 's1')!.violation_count).toBe(0);
    expect(rows.find((r) => r.student_id === 's2')!.violation_count).toBe(3);
  });
});

describe('summariseExamRoster', () => {
  it('counts each state once', () => {
    const rows = buildExamRoster({
      ...base,
      attempts: [
        { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 50 },
        { student_id: 's2', status: 'in_progress', started_at: OPENS, submitted_at: null, score: null, percentage: null },
      ],
      now: DURING,
    });

    expect(summariseExamRoster(rows)).toMatchObject({
      submitted: 1,
      in_progress: 1,
      not_started: 1,
      absent: 0,
    });
  });
});

describe('sortExamRoster', () => {
  it('puts who needs attention first and the finished last', () => {
    const rows = buildExamRoster({
      ...base,
      attempts: [
        { student_id: 's1', status: 'submitted', started_at: OPENS, submitted_at: CLOSES, score: 1, percentage: 50 },
        { student_id: 's3', status: 'in_progress', started_at: OPENS, submitted_at: null, score: null, percentage: null },
      ],
      now: DURING,
    });

    expect(sortExamRoster(rows).map((r) => r.status)).toEqual([
      'in_progress',
      'not_started',
      'submitted',
    ]);
  });
});
