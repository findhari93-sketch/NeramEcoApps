import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { attemptInsideWindow, loadRunSittings, pickRunSittings, type SittingAttempt } from './run-sittings';

/**
 * "Did this student sit the exam", answered once, with the real 18 Aug shapes.
 *
 * The exam door was open 18 Aug 2:00 PM to 10:45 PM IST (08:30Z to 17:15Z). The
 * paper's other door is a Study Materials chapter that is always open.
 */

const EXAM = 'run-exam';
const STUDY = 'study-door';
const WINDOW = { opens_at: '2026-08-18T08:30:00Z', closes_at: '2026-08-18T17:15:00Z' };

let seq = 0;
function att(
  student: string,
  placement: string,
  status: string,
  started: string | null,
  submitted: string | null,
  extra: Partial<SittingAttempt> & { pct?: number } = {},
): SittingAttempt & { pct?: number } {
  seq += 1;
  return {
    id: `a${seq}`,
    student_id: student,
    placement_id: placement,
    status,
    mode: 'official',
    started_at: started,
    submitted_at: submitted,
    attempt_number: seq,
    ...extra,
  };
}

describe('pickRunSittings', () => {
  it('counts Samruddhi, who sat it through Study Materials inside the exam window, first attempt 26%', () => {
    const attempts = [
      att('samruddhi', STUDY, 'abandoned', '2026-08-18T13:54:00Z', '2026-08-18T13:59:00Z'),
      att('samruddhi', STUDY, 'submitted', '2026-08-18T14:07:00Z', '2026-08-18T14:12:00Z', { pct: 26 }),
      att('samruddhi', STUDY, 'submitted', '2026-08-18T14:15:00Z', '2026-08-18T14:28:00Z', { pct: 80 }),
      att('samruddhi', STUDY, 'submitted', '2026-08-18T14:30:00Z', '2026-08-18T14:51:00Z', { pct: 92 }),
    ];

    const sitting = pickRunSittings({ runPlacementId: EXAM, window: WINDOW, attempts }).get('samruddhi');

    expect(sitting?.source).toBe('window');
    // The abandoned try is not an attempt.
    expect(sitting?.attempts).toHaveLength(3);
    expect((sitting?.first as any).pct).toBe(26);
  });

  it('does not count Bavishiya, whose practice attempt was submitted by the sweep after the door shut', () => {
    const attempts = [
      att('bavishiya', STUDY, 'submitted', '2026-08-13T06:50:00Z', '2026-08-13T07:47:00Z', { pct: 82 }),
      att('bavishiya', STUDY, 'submitted', '2026-08-18T11:12:00Z', '2026-08-18T18:05:00Z', { pct: 0 }),
    ];

    const sittings = pickRunSittings({ runPlacementId: EXAM, window: WINDOW, attempts });

    expect(sittings.has('bavishiya')).toBe(false);
  });

  it('keeps the exam door as the record when a student used both doors', () => {
    const attempts = [
      att('john', STUDY, 'submitted', '2026-08-18T09:00:00Z', '2026-08-18T09:20:00Z', { pct: 100 }),
      att('john', EXAM, 'submitted', '2026-08-18T13:53:00Z', '2026-08-18T14:30:00Z', { pct: 64 }),
    ];

    const sitting = pickRunSittings({ runPlacementId: EXAM, window: WINDOW, attempts }).get('john');

    expect(sitting?.source).toBe('run');
    expect(sitting?.attempts).toHaveLength(1);
    expect((sitting?.first as any).pct).toBe(64);
  });

  it('shows a sitting still open on the exam door, with no score yet', () => {
    const attempts = [att('divya', EXAM, 'in_progress', '2026-08-18T15:00:00Z', null)];

    const sitting = pickRunSittings({ runPlacementId: EXAM, window: WINDOW, attempts }).get('divya');

    expect(sitting?.source).toBe('run');
    expect(sitting?.first).toBeNull();
  });

  it('counts an attempt inside the window a reopen gave the student', () => {
    const attempts = [
      att('iswarya', STUDY, 'submitted', '2026-08-28T06:26:00Z', '2026-08-28T06:37:00Z', { pct: 86 }),
    ];
    const grantWindows = new Map([
      ['iswarya', { opens_at: '2026-08-28T00:00:00Z', closes_at: '2026-08-30T00:00:00Z' }],
    ]);

    const sitting = pickRunSittings({ runPlacementId: EXAM, window: WINDOW, grantWindows, attempts }).get('iswarya');

    expect(sitting?.source).toBe('window');
  });

  it('counts the attempt a teacher chose for a student with no sitting', () => {
    const attempts = [
      att('hari', STUDY, 'submitted', '2026-08-07T11:31:00Z', '2026-08-07T12:03:00Z', { id: 'hari-76', pct: 76 }),
    ];

    const sitting = pickRunSittings({
      runPlacementId: EXAM,
      window: WINDOW,
      credits: new Map([['hari', 'hari-76']]),
      attempts,
    }).get('hari');

    expect(sitting?.source).toBe('teacher');
    expect(sitting?.first?.id).toBe('hari-76');
  });

  it('ignores a teacher credit for a student who already sat the exam door', () => {
    const attempts = [
      att('karthik', STUDY, 'submitted', '2026-08-07T11:31:00Z', '2026-08-07T12:03:00Z', { id: 'k-practice' }),
      att('karthik', EXAM, 'submitted', '2026-08-18T09:20:00Z', '2026-08-18T09:50:00Z', { id: 'k-exam' }),
    ];

    const sitting = pickRunSittings({
      runPlacementId: EXAM,
      window: WINDOW,
      credits: new Map([['karthik', 'k-practice']]),
      attempts,
    }).get('karthik');

    expect(sitting?.source).toBe('run');
    expect(sitting?.first?.id).toBe('k-exam');
  });

  it('ignores a credit that points at an attempt the student never finished', () => {
    const attempts = [att('salai', STUDY, 'in_progress', '2026-09-11T12:39:00Z', null, { id: 'salai-open' })];

    const sittings = pickRunSittings({
      runPlacementId: EXAM,
      window: WINDOW,
      credits: new Map([['salai', 'salai-open']]),
      attempts,
    });

    expect(sittings.has('salai')).toBe(false);
  });

  it('never counts revision, which is practice after completion', () => {
    const attempts = [
      att('inaya', STUDY, 'submitted', '2026-08-18T15:21:00Z', '2026-08-18T15:34:00Z', { mode: 'revision' }),
    ];

    expect(pickRunSittings({ runPlacementId: EXAM, window: WINDOW, attempts }).has('inaya')).toBe(false);
  });
});

describe('attemptInsideWindow', () => {
  it('needs both ends of the window, so a soft deadline never pulls practice in', () => {
    const a = att('x', STUDY, 'submitted', '2026-08-18T09:00:00Z', '2026-08-18T09:30:00Z');
    expect(attemptInsideWindow(a, { opens_at: null, closes_at: '2026-08-19T00:00:00Z' })).toBe(false);
    expect(attemptInsideWindow(a, WINDOW)).toBe(true);
  });
});

describe('loadRunSittings', () => {
  it('reads attempts, reopen windows and credits once, and applies the rule per run', async () => {
    const db = createFakeDb({
      nexus_test_attempts: [
        { ...att('samruddhi', STUDY, 'submitted', '2026-08-18T14:07:00Z', '2026-08-18T14:12:00Z'), test_id: 't1' },
        { ...att('iswarya', STUDY, 'submitted', '2026-08-28T06:26:00Z', '2026-08-28T06:37:00Z'), test_id: 't1' },
        { ...att('hari', STUDY, 'submitted', '2026-08-07T11:31:00Z', '2026-08-07T12:03:00Z', { id: 'hari-76' }), test_id: 't1' },
        // Another paper entirely, which must not leak into this run.
        { ...att('samruddhi', 'other-paper-door', 'submitted', '2026-08-18T10:00:00Z', '2026-08-18T10:10:00Z'), test_id: 't2' },
      ],
      nexus_test_access_requests: [
        {
          placement_id: EXAM,
          student_id: 'iswarya',
          status: 'granted',
          opens_at: '2026-08-28T00:00:00Z',
          closes_at: '2026-08-30T00:00:00Z',
        },
      ],
      nexus_test_run_credits: [
        { placement_id: EXAM, student_id: 'hari', attempt_id: 'hari-76', note: null, credited_by: null, credited_at: '2026-09-11T00:00:00Z' },
      ],
    });

    const sittings = await loadRunSittings(
      [{ id: EXAM, test_id: 't1', available_from: WINDOW.opens_at, available_until: WINDOW.closes_at }],
      { studentIds: ['samruddhi', 'iswarya', 'hari'] },
      db.client,
    );

    const run = sittings.get(EXAM)!;
    expect(run.get('samruddhi')?.source).toBe('window');
    expect(run.get('samruddhi')?.attempts).toHaveLength(1);
    expect(run.get('iswarya')?.source).toBe('window');
    expect(run.get('hari')?.source).toBe('teacher');
  });

  it('asks nothing for an empty roster', async () => {
    const db = createFakeDb({});
    const sittings = await loadRunSittings([{ id: EXAM, test_id: 't1' }], { studentIds: [] }, db.client);
    expect(sittings.get(EXAM)?.size).toBe(0);
  });
});
