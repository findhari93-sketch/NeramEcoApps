import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { getTestResults } from './test-analytics';

/**
 * The Students tab on a run, reading "who sat it" through run-sittings.ts.
 *
 * Shapes from the 18 Aug exam on paper acf8084d: the exam door open 08:30Z to
 * 17:15Z, and an always-open Study Materials chapter as the paper's other door.
 * The screen showed Samruddhi (92% in the window) as "Not started".
 */

const EXAM = 'run-exam';
const STUDY = 'study-door';
const WINDOW = { opensAt: '2026-08-18T08:30:00Z', closesAt: '2026-08-18T17:15:00Z' };

function attempt(
  id: string,
  student: string,
  placement: string,
  started: string,
  submitted: string,
  pct: number,
  n: number,
) {
  return {
    id,
    test_id: 't1',
    student_id: student,
    placement_id: placement,
    status: 'submitted',
    mode: 'official',
    started_at: started,
    submitted_at: submitted,
    attempt_number: n,
    score: pct / 2,
    total_marks: 50,
    percentage: pct,
    final_score: null,
    final_total_marks: null,
    final_percentage: null,
    finalised_at: null,
  };
}

const member = (student_id: string, name: string) => ({
  student_id,
  name,
  avatar_url: null,
  bucket: 'mandatory_attended',
  is_mandatory: true,
});

function seed() {
  return createFakeDb({
    nexus_test_attempts: [
      attempt('s1', 'samruddhi', STUDY, '2026-08-18T14:07:00Z', '2026-08-18T14:12:00Z', 26, 2),
      attempt('s2', 'samruddhi', STUDY, '2026-08-18T14:30:00Z', '2026-08-18T14:51:00Z', 92, 3),
      attempt('j0', 'john', STUDY, '2026-08-18T09:00:00Z', '2026-08-18T09:20:00Z', 100, 1),
      attempt('j1', 'john', EXAM, '2026-08-18T13:53:00Z', '2026-08-18T14:30:00Z', 64, 2),
      attempt('h1', 'hari', STUDY, '2026-08-07T11:31:00Z', '2026-08-07T12:03:00Z', 76, 1),
      // Started inside the window, submitted by the exam-close sweep after it shut.
      attempt('b2', 'bavishiya', STUDY, '2026-08-18T11:12:00Z', '2026-08-18T18:05:00Z', 0, 2),
    ],
    nexus_tests: [{ id: 't1', passing_marks: 40, total_marks: 50 }],
    users: [
      { id: 'samruddhi', name: 'Samruddhi wani', avatar_url: null },
      { id: 'john', name: 'John Raja', avatar_url: null },
      { id: 'hari', name: 'Hari Heera', avatar_url: null },
      { id: 'bavishiya', name: 'Bavishiya Senthilkumar', avatar_url: null },
    ],
    drawing_submissions: [],
    nexus_test_access_requests: [],
    nexus_test_run_credits: [
      {
        placement_id: EXAM,
        student_id: 'hari',
        attempt_id: 'h1',
        note: null,
        credited_by: null,
        credited_at: '2026-09-11T00:00:00Z',
      },
    ],
  });
}

const OPTS = {
  placementId: EXAM,
  passingPct: 80,
  closesAt: WINDOW.closesAt,
  runWindow: WINDOW,
  roster: [
    member('samruddhi', 'Samruddhi wani'),
    member('john', 'John Raja'),
    member('hari', 'Hari Heera'),
    member('bavishiya', 'Bavishiya Senthilkumar'),
  ],
};

describe('getTestResults on a run', () => {
  it('counts Samruddhi as done, with her first sitting in the window as the headline', async () => {
    const { rows } = await getTestResults('t1', OPTS, seed().client);
    const row = rows.find((r) => r.student_id === 'samruddhi')!;

    expect(row.status).toBe('submitted');
    expect(row.sat_via).toBe('window');
    expect(row.sat_via_at).toBe('2026-08-18T14:12:00Z');
    expect(row.attempts).toBe(2);
    expect(row.first_percentage).toBe(26);
    expect(row.best_percentage).toBe(92);
  });

  it('keeps the exam door as the record for a student who also practised that morning', async () => {
    const { rows } = await getTestResults('t1', OPTS, seed().client);
    const row = rows.find((r) => r.student_id === 'john')!;

    expect(row.sat_via).toBe('run');
    expect(row.attempts).toBe(1);
    expect(row.first_percentage).toBe(64);
    expect(row.best_percentage).toBe(64);
  });

  it('uses the attempt a teacher counted', async () => {
    const { rows } = await getTestResults('t1', OPTS, seed().client);
    const row = rows.find((r) => r.student_id === 'hari')!;

    expect(row.status).toBe('submitted');
    expect(row.sat_via).toBe('teacher');
    expect(row.first_percentage).toBe(76);
  });

  it('still reports a student with no sitting as missed', async () => {
    const { rows, stats } = await getTestResults('t1', OPTS, seed().client);
    const row = rows.find((r) => r.student_id === 'bavishiya')!;

    expect(row.status).toBe('missed');
    expect(row.sat_via).toBeNull();
    expect(row.attempts).toBe(0);
    expect(stats.submitted).toBe(3);
    expect(stats.missed).toBe(1);
  });
});
