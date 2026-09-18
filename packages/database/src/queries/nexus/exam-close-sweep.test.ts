import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { listExamAttemptsDueForClose } from './exam-close-sweep';

/**
 * The close sweep shuts each student's OWN door, not the exam's.
 *
 * It used to force-submit every in-progress attempt on the exam's door once the
 * exam's main window had closed. A student the teacher reopened the exam for,
 * sitting it inside their own window, would have their paper submitted from
 * under them at the next hourly run. And a reopened student who walked away
 * after their window closed was never swept at all if the exam itself had
 * closed more than a week earlier.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const EXAM_PLACEMENT = 'placement-exam';
const STUDY_PLACEMENT = 'placement-study';
const EXAM_ID = 'exam-1';

function seed(opts: {
  examClosesAt: number;
  attempts: Array<{ id: string; student: string; placement?: string }>;
  makeups?: Array<{ student: string; opens: number; closes: number; revoked?: boolean }>;
  grants?: Array<{ student: string; opens: number | null; closes: number | null; status?: string }>;
}) {
  return createFakeDb({
    nexus_exams: [
      {
        id: EXAM_ID,
        test_id: 'test-1',
        scheduled_class_id: 'class-1',
        opens_at: iso(opts.examClosesAt - 8 * HOUR),
        closes_at: iso(opts.examClosesAt),
      },
    ],
    nexus_test_placements: [
      {
        id: EXAM_PLACEMENT,
        test_id: 'test-1',
        context_type: 'exam',
        context_id: 'class-1',
        is_active: true,
        available_until: iso(opts.examClosesAt),
        gating: { exam_id: EXAM_ID, attempt_limit: 1 },
      },
      { id: STUDY_PLACEMENT, test_id: 'test-1', context_type: 'study_file', context_id: 'file-1', is_active: true, gating: {} },
    ],
    nexus_test_attempts: opts.attempts.map((a) => ({
      id: a.id,
      test_id: 'test-1',
      student_id: a.student,
      placement_id: a.placement ?? EXAM_PLACEMENT,
      status: 'in_progress',
    })),
    nexus_exam_makeups: (opts.makeups ?? []).map((m, i) => ({
      id: `makeup-${i}`,
      exam_id: EXAM_ID,
      student_id: m.student,
      opens_at: iso(m.opens),
      closes_at: iso(m.closes),
      revoked_at: m.revoked ? iso(NOW - DAY) : null,
    })),
    nexus_test_access_requests: (opts.grants ?? []).map((g, i) => ({
      id: `grant-${i}`,
      placement_id: EXAM_PLACEMENT,
      student_id: g.student,
      source: 'teacher_grant',
      status: g.status ?? 'granted',
      opens_at: g.opens == null ? null : iso(g.opens),
      closes_at: g.closes == null ? null : iso(g.closes),
    })),
  });
}

const dueIds = async (db: ReturnType<typeof seed>) =>
  (await listExamAttemptsDueForClose(db.client, NOW)).map((d) => d.attemptId).sort();

describe('listExamAttemptsDueForClose', () => {
  it('sweeps a student sitting in the main window once the exam has closed', async () => {
    const db = seed({ examClosesAt: NOW - 2 * HOUR, attempts: [{ id: 'a1', student: 's1' }] });
    expect(await dueIds(db)).toEqual(['a1']);
  });

  it('leaves a reopened student alone while their own window is open', async () => {
    const db = seed({
      examClosesAt: NOW - 2 * HOUR,
      attempts: [{ id: 'a1', student: 's1' }],
      grants: [{ student: 's1', opens: NOW - DAY, closes: NOW + 2 * DAY }],
    });
    expect(await dueIds(db)).toEqual([]);
  });

  it('leaves a make-up student alone while their make-up is open', async () => {
    const db = seed({
      examClosesAt: NOW - 3 * DAY,
      attempts: [{ id: 'a1', student: 's1' }],
      makeups: [{ student: 's1', opens: NOW - HOUR, closes: NOW + HOUR }],
    });
    expect(await dueIds(db)).toEqual([]);
  });

  it('sweeps a reopened student whose window has shut, even when the exam closed a month ago', async () => {
    const db = seed({
      examClosesAt: NOW - 30 * DAY,
      attempts: [{ id: 'a1', student: 's1' }],
      grants: [{ student: 's1', opens: NOW - 8 * DAY, closes: NOW - 2 * HOUR }],
    });
    expect(await dueIds(db)).toEqual(['a1']);
  });

  it('does not reach back past a week for a door that shut long ago', async () => {
    const db = seed({ examClosesAt: NOW - 10 * DAY, attempts: [{ id: 'a1', student: 's1' }] });
    expect(await dueIds(db)).toEqual([]);
  });

  it('never keeps a door open forever for a grant with no end', async () => {
    const db = seed({
      examClosesAt: NOW - 2 * HOUR,
      attempts: [{ id: 'a1', student: 's1' }],
      grants: [{ student: 's1', opens: NOW - DAY, closes: null }],
    });
    expect(await dueIds(db)).toEqual([]);
  });

  it('ignores a pending request and a revoked make-up', async () => {
    const db = seed({
      examClosesAt: NOW - 2 * HOUR,
      attempts: [
        { id: 'a1', student: 's1' },
        { id: 'a2', student: 's2' },
      ],
      grants: [{ student: 's1', opens: NOW - DAY, closes: NOW + DAY, status: 'pending' }],
      makeups: [{ student: 's2', opens: NOW - HOUR, closes: NOW + HOUR, revoked: true }],
    });
    expect(await dueIds(db)).toEqual(['a1', 'a2']);
  });

  it('only ever touches the exam door, never a practice attempt on the same paper', async () => {
    const db = seed({
      examClosesAt: NOW - 2 * HOUR,
      attempts: [
        { id: 'a1', student: 's1' },
        { id: 'p1', student: 's2', placement: STUDY_PLACEMENT },
      ],
    });
    expect(await dueIds(db)).toEqual(['a1']);
  });

  it('waits out the submit grace so an in-flight submit is not beaten to the row', async () => {
    const db = seed({ examClosesAt: NOW - 20 * 1000, attempts: [{ id: 'a1', student: 's1' }] });
    expect(await dueIds(db)).toEqual([]);
  });
});
