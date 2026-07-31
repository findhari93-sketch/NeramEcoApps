import { describe, it, expect } from 'vitest';
import {
  pickCountdownTarget,
  type CountdownPlanRow,
  type CountdownExamRow,
  type CountdownAttemptRow,
} from './exam-countdown';

const TODAY = '2026-07-30';
const STUDENT = 'student-1';

function examRow(overrides: Partial<CountdownExamRow> = {}): CountdownExamRow {
  return {
    id: 'exam-jee-2027-s1',
    exam_type: 'jee',
    year: 2027,
    phase: 'session_1',
    exam_date: '2027-01-20',
    label: 'JEE Main 2027 Session 1, Paper 2A (B.Arch)',
    is_active: true,
    date_confidence: 'expected',
    date_note: 'NTA has not announced Session 1 yet.',
    ...overrides,
  };
}

function plan(overrides: Partial<CountdownPlanRow> = {}): CountdownPlanRow {
  return {
    id: 'plan-1',
    title: 'JEE 2027 Batch',
    exam_type: 'jee',
    status: 'active',
    start_date: '2026-07-01',
    expected_end_date: '2027-01-10',
    exam_date: null,
    target_exam_date_id: 'exam-jee-2027-s1',
    created_at: '2026-06-01T00:00:00Z',
    target: examRow(),
    ...overrides,
  };
}

function attempt(overrides: Partial<CountdownAttemptRow> = {}): CountdownAttemptRow {
  return {
    student_id: STUDENT,
    exam_type: 'jee',
    phase: 'session_1',
    exam_date: '2027-01-22',
    exam_date_id: null,
    deleted_at: null,
    ...overrides,
  };
}

function resolve(
  plans: CountdownPlanRow[],
  attempts: CountdownAttemptRow[] = [],
  viewerStudentId: string | null = null,
) {
  return pickCountdownTarget({ plans, attempts }, { viewerStudentId, today: TODAY });
}

describe('picking the plan', () => {
  it('ignores plans whose season is over', () => {
    expect(resolve([plan({ status: 'completed' })])).toBeNull();
    expect(resolve([plan({ status: 'archived' })])).toBeNull();
  });

  // The bug this test was written for: production's only teaching plan is a
  // draft, so requiring 'active' hid the countdown from the whole cohort.
  // plan-shape-query.ts already draws the timetable from draft plans.
  it('counts down from a draft plan when nothing is published yet', () => {
    const t = resolve([plan({ status: 'draft' })])!;
    expect(t.exam_date).toBe('2027-01-20');
    expect(t.source).toBe('exam_registry');
  });

  it('prefers a published plan over a draft even when the draft looks current', () => {
    const draft = plan({ id: 'draft', status: 'draft' }); // window contains today
    const live = plan({
      id: 'live',
      status: 'active',
      start_date: '2020-01-01',
      expected_end_date: '2020-06-01',
    });
    expect(resolve([draft, live])!.plan!.id).toBe('live');
    expect(resolve([live, draft])!.plan!.id).toBe('live');
  });

  it('returns null when there is no plan at all', () => {
    expect(resolve([])).toBeNull();
  });

  it('prefers the active plan whose window contains today', () => {
    const stale = plan({
      id: 'stale',
      title: 'Old season',
      start_date: '2025-07-01',
      expected_end_date: '2026-01-10',
    });
    const current = plan({ id: 'current', title: 'Current season' });
    expect(resolve([stale, current])!.plan!.id).toBe('current');
    expect(resolve([current, stale])!.plan!.id).toBe('current');
  });

  it('falls back to the latest start date when no window contains today', () => {
    const older = plan({ id: 'older', start_date: '2025-01-01', expected_end_date: '2025-06-01' });
    const newer = plan({ id: 'newer', start_date: '2025-03-01', expected_end_date: '2025-08-01' });
    expect(resolve([older, newer])!.plan!.id).toBe('newer');
  });

  it('breaks a start-date tie on the most recently created', () => {
    const a = plan({
      id: 'a',
      start_date: '2025-01-01',
      expected_end_date: '2025-06-01',
      created_at: '2025-01-01T00:00:00Z',
    });
    const b = plan({
      id: 'b',
      start_date: '2025-01-01',
      expected_end_date: '2025-06-01',
      created_at: '2025-02-01T00:00:00Z',
    });
    expect(resolve([a, b])!.plan!.id).toBe('b');
  });

  it('carries the plan title so a two-plan classroom is unambiguous', () => {
    expect(resolve([plan()])!.plan).toEqual({ id: 'plan-1', title: 'JEE 2027 Batch' });
  });
});

describe('the registry rung', () => {
  it('resolves through the linked exam date row', () => {
    const t = resolve([plan()])!;
    expect(t.source).toBe('exam_registry');
    expect(t.exam_date).toBe('2027-01-20');
    expect(t.confidence).toBe('expected');
    expect(t.exam_year).toBe(2027);
    expect(t.phase).toBe('session_1');
    expect(t.note).toBe('NTA has not announced Session 1 yet.');
    expect(t.is_personal).toBe(false);
  });

  it('reads confidence confirmed off the row', () => {
    const t = resolve([plan({ target: examRow({ date_confidence: 'confirmed' }) })])!;
    expect(t.confidence).toBe('confirmed');
  });

  it('treats a missing or unknown confidence as confirmed, matching the DB default', () => {
    expect(resolve([plan({ target: examRow({ date_confidence: null }) })])!.confidence).toBe(
      'confirmed',
    );
    expect(resolve([plan({ target: examRow({ date_confidence: 'garbage' }) })])!.confidence).toBe(
      'confirmed',
    );
  });

  // A soft delete sets is_active = false and leaves the plan's pointer intact,
  // which is exactly why the resolver has to check the row's own flag.
  it('falls through when the linked row was soft deleted', () => {
    const t = resolve([
      plan({ exam_date: '2027-01-25', target: examRow({ is_active: false }) }),
    ])!;
    expect(t.source).toBe('plan_manual');
    expect(t.exam_date).toBe('2027-01-25');
    expect(t.confidence).toBe('expected');
  });

  it('falls through when the embed came back empty', () => {
    expect(resolve([plan({ target: null, exam_date: null })])).toBeNull();
  });
});

describe('the personal rung', () => {
  it('lets the student own slot override the cohort date', () => {
    const t = resolve([plan()], [attempt()], STUDENT)!;
    expect(t.source).toBe('student_attempt');
    expect(t.exam_date).toBe('2027-01-22');
    expect(t.confidence).toBe('confirmed');
    expect(t.is_personal).toBe(true);
  });

  it('matches on exam_date_id even when the phase differs', () => {
    const t = resolve(
      [plan()],
      [attempt({ exam_date_id: 'exam-jee-2027-s1', phase: 'session_2' })],
      STUDENT,
    )!;
    expect(t.source).toBe('student_attempt');
  });

  // The year guard. nexus_student_exam_attempts has no `year` column, so without
  // it a leftover 2026 attempt would hijack a 2027 countdown.
  it('ignores an attempt from a different exam year', () => {
    const t = resolve([plan()], [attempt({ exam_date: '2026-04-12' })], STUDENT)!;
    expect(t.source).toBe('exam_registry');
  });

  it('ignores a stale NATA attempt against a JEE target', () => {
    const t = resolve(
      [plan()],
      [attempt({ exam_type: 'nata', phase: 'phase_1', exam_date: '2027-04-12' })],
      STUDENT,
    )!;
    expect(t.source).toBe('exam_registry');
  });

  it('ignores an attempt for the wrong phase', () => {
    const t = resolve([plan()], [attempt({ phase: 'session_2' })], STUDENT)!;
    expect(t.source).toBe('exam_registry');
  });

  it('ignores a soft deleted attempt', () => {
    const t = resolve([plan()], [attempt({ deleted_at: '2026-07-01T00:00:00Z' })], STUDENT)!;
    expect(t.source).toBe('exam_registry');
  });

  it('ignores an attempt with no date yet', () => {
    const t = resolve([plan()], [attempt({ exam_date: null })], STUDENT)!;
    expect(t.source).toBe('exam_registry');
  });

  it('ignores another student attempt', () => {
    const t = resolve([plan()], [attempt({ student_id: 'someone-else' })], STUDENT)!;
    expect(t.source).toBe('exam_registry');
  });

  // The point of a personal clock: it is the student's truth even when it has
  // already happened and the cohort has not sat yet.
  it('keeps a personal past date over a future cohort date', () => {
    const t = resolve(
      [plan({ target: examRow({ exam_date: '2027-01-20' }) })],
      [attempt({ exam_date: '2027-01-05', exam_date_id: 'exam-jee-2027-s1' })],
      STUDENT,
    )!;
    expect(t.exam_date).toBe('2027-01-05');
    expect(t.is_personal).toBe(true);
  });

  it('is skipped entirely for a teacher viewer', () => {
    const t = resolve([plan()], [attempt()], null)!;
    expect(t.source).toBe('exam_registry');
    expect(t.is_personal).toBe(false);
  });

  it('matches on the plan exam type when the plan has no registry row', () => {
    const t = resolve(
      [plan({ target: null, target_exam_date_id: null, exam_date: '2027-01-20' })],
      [attempt()],
      STUDENT,
    )!;
    expect(t.source).toBe('student_attempt');
  });
});

/**
 * The literal row PostgREST returned for the JEE Main 2027 Session 1 seed on
 * staging, captured from the FK embed the server loader uses:
 *
 *   target:nexus_exam_dates!nexus_teaching_plans_target_exam_date_id_fkey(...)
 *
 * Kept verbatim so a change to the select string, the embed alias or the FK name
 * is caught here rather than as a silent null countdown in production. Pinning
 * `today` keeps it deterministic.
 */
describe('the real PostgREST payload', () => {
  const wirePlan = {
    id: '7fde4c66-715f-456b-8a3f-0c952db2b839',
    title: 'JEE B.Arch Session 1 season',
    exam_type: 'jee',
    status: 'active',
    start_date: '2026-07-01',
    expected_end_date: '2027-01-10',
    exam_date: null,
    target_exam_date_id: 'f4d6834b-f9e3-41d3-a968-3631392b0a5f',
    created_at: '2026-07-30T11:18:56.457881+00:00',
    target: {
      id: 'f4d6834b-f9e3-41d3-a968-3631392b0a5f',
      year: 2027,
      label: 'JEE Main 2027 Session 1, Paper 2A (B.Arch)',
      phase: 'session_1',
      date_note:
        'NTA has not announced Session 1 yet. For the last three years Paper 2A has fallen in the third week of January.',
      exam_date: '2027-01-20',
      exam_type: 'jee',
      is_active: true,
      date_confidence: 'expected',
    },
  };

  it('resolves to the expected JEE 2027 target', () => {
    const t = pickCountdownTarget(
      { plans: [wirePlan], attempts: [] },
      { viewerStudentId: null, today: TODAY },
    )!;
    expect(t).toBeTruthy();
    expect(t.source).toBe('exam_registry');
    expect(t.exam_date).toBe('2027-01-20');
    expect(t.confidence).toBe('expected');
    expect(t.exam_year).toBe(2027);
    expect(t.label).toBe('JEE Main 2027 Session 1, Paper 2A (B.Arch)');
  });
});

describe('the plan fallback rung', () => {
  it('uses the plan own date for a foundation plan and forces it unconfirmed', () => {
    const t = resolve([
      plan({
        exam_type: 'foundation',
        target: null,
        target_exam_date_id: null,
        exam_date: '2027-03-15',
      }),
    ])!;
    expect(t.source).toBe('plan_manual');
    expect(t.confidence).toBe('expected');
    expect(t.phase).toBeNull();
    expect(t.label).toBeNull();
    expect(t.note).toBeNull();
    expect(t.exam_year).toBe(2027);
  });

  it('returns null when the plan has neither a target nor its own date', () => {
    expect(resolve([plan({ target: null, target_exam_date_id: null, exam_date: null })])).toBeNull();
  });
});
