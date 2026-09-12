import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Who the exam results rank.
 *
 * getExamResults used to take any submitted attempt on the paper, from any door,
 * at any time. So a chapter practised a week before the exam could rank as the
 * exam, while the Students tab called the same student "Not started". It now
 * reads the sitting from run-sittings.ts, like every other screen.
 */

vi.mock('./test-repository', async () => {
  const actual = await vi.importActual<typeof import('./test-repository')>('./test-repository');
  return {
    ...actual,
    getComposedTestQuestions: vi.fn(async () => [
      {
        question_id: 'q1',
        question_format: 'MCQ',
        options: [{ id: 'a' }, { id: 'b' }],
        marks: 4,
        negative_marks: 0,
        section: null,
        section_order: 0,
        correct_answer: 'a',
      },
    ]),
  };
});

vi.mock('./exams', async () => {
  const actual = await vi.importActual<typeof import('./exams')>('./exams');
  return {
    ...actual,
    getExam: vi.fn(async () => ({
      id: 'exam-1',
      test_id: 't1',
      scheduled_class_id: 'sc1',
      opens_at: '2026-08-18T08:30:00Z',
      closes_at: '2026-08-18T17:15:00Z',
      passing_pct: 80,
    })),
  };
});

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { getExamResults } from './exam-results';

const EXAM_DOOR = 'p-exam';
const STUDY = 'study-door';

function attempt(id: string, student: string, placement: string, started: string, submitted: string, pct: number, n: number) {
  return {
    id,
    test_id: 't1',
    student_id: student,
    placement_id: placement,
    status: 'submitted',
    mode: 'official',
    attempt_number: n,
    started_at: started,
    submitted_at: submitted,
    score: (pct / 100) * 4,
    total_marks: 4,
    percentage: pct,
    final_score: null,
    final_total_marks: null,
    final_percentage: null,
    finalised_at: null,
    time_spent_seconds: 300,
    answers: {},
  };
}

const seed = () =>
  createFakeDb({
    nexus_test_placements: [
      {
        id: EXAM_DOOR,
        test_id: 't1',
        context_type: 'exam',
        context_id: 'sc1',
        is_active: true,
        available_from: '2026-08-18T08:30:00Z',
        available_until: '2026-08-18T17:15:00Z',
      },
    ],
    nexus_test_attempts: [
      attempt('s1', 'samruddhi', STUDY, '2026-08-18T14:07:00Z', '2026-08-18T14:12:00Z', 25, 2),
      attempt('s2', 'samruddhi', STUDY, '2026-08-18T14:30:00Z', '2026-08-18T14:51:00Z', 100, 3),
      attempt('h1', 'hari', STUDY, '2026-08-07T11:31:00Z', '2026-08-07T12:03:00Z', 75, 1),
      attempt('j1', 'john', EXAM_DOOR, '2026-08-18T13:53:00Z', '2026-08-18T14:30:00Z', 50, 1),
    ],
    nexus_test_draws: [],
    nexus_test_access_requests: [],
    nexus_test_run_credits: [],
  });

const ROSTER = [
  { id: 'samruddhi', name: 'Samruddhi wani' },
  { id: 'hari', name: 'Hari Heera' },
  { id: 'john', name: 'John Raja' },
];

describe('getExamResults: who sat the exam', () => {
  it('ranks the first sitting made through Study Materials inside the window', async () => {
    const result = await getExamResults('exam-1', ROSTER, seed().client);
    const row = result.rows.find((r) => r.student_id === 'samruddhi')!;

    expect(row.absent).toBe(false);
    expect(row.attempt_id).toBe('s1');
    expect(row.percentage).toBe(25);
  });

  it('does not rank a chapter practised the week before as the exam', async () => {
    const result = await getExamResults('exam-1', ROSTER, seed().client);
    const row = result.rows.find((r) => r.student_id === 'hari')!;

    expect(row.absent).toBe(true);
    expect(row.attempt_id).toBeNull();
  });

  it('counts only the students who sat it', async () => {
    const result = await getExamResults('exam-1', ROSTER, seed().client);

    expect(result.stats.sat).toBe(2);
    expect(result.stats.absent).toBe(1);
  });
});

/**
 * The load-bearing path: whether a student with no submitted paper is
 * still_to_sit or absent. 28 real students on the History of Architecture
 * exam hold live windows, and getting this wrong tells each of them,
 * privately, that they were marked absent.
 */
describe('getExamResults: still_to_sit, absent and the podium', () => {
  const FUTURE = '2099-01-01T00:00:00.000Z';

  const seedWindows = () =>
    createFakeDb({
      nexus_test_placements: [
        {
          id: EXAM_DOOR,
          test_id: 't1',
          context_type: 'exam',
          context_id: 'sc1',
          is_active: true,
          available_from: '2026-08-18T08:30:00Z',
          available_until: '2026-08-18T17:15:00Z',
        },
      ],
      nexus_test_attempts: [
        // Sat through the exam's own door, but started well after the shared
        // close: a second sitting, ranked 1 in its own list of one.
        attempt('k1', 'kavya', EXAM_DOOR, '2026-08-19T09:00:00Z', '2026-08-19T09:30:00Z', 95, 1),
      ],
      nexus_test_draws: [],
      nexus_test_access_requests: [
        // Granted: an actual door.
        {
          placement_id: EXAM_DOOR,
          student_id: 'priya',
          status: 'granted',
          source: 'teacher_grant',
          opens_at: '2026-09-01T00:00:00.000Z',
          closes_at: FUTURE,
          created_at: '2026-09-01T00:00:00.000Z',
        },
        // Pending: a question, not a door.
        {
          placement_id: EXAM_DOOR,
          student_id: 'raj',
          status: 'pending',
          source: 'student_request',
          opens_at: null,
          closes_at: null,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      nexus_exam_makeups: [
        {
          id: 'mk-1',
          exam_id: 'exam-1',
          student_id: 'meera',
          opens_at: '2026-09-01T00:00:00.000Z',
          closes_at: FUTURE,
          reason: 'Missed class',
          granted_by: 'teacher-1',
          granted_at: '2026-09-01T00:00:00.000Z',
          revoked_at: null,
          source: 'teacher_grant',
        },
      ],
      nexus_test_run_credits: [],
    });

  const WINDOW_ROSTER = [
    { id: 'priya', name: 'Priya Iyer' },
    { id: 'raj', name: 'Raj Kannan' },
    { id: 'meera', name: 'Meera Pillai' },
    { id: 'kavya', name: 'Kavya Suresh' },
  ];

  it('a granted access request keeps the student still_to_sit, with that window', async () => {
    const result = await getExamResults('exam-1', WINDOW_ROSTER, seedWindows().client);
    const row = result.rows.find((r) => r.student_id === 'priya')!;

    expect(row.bucket).toBe('still_to_sit');
    expect(row.absent).toBe(false);
    expect(row.window_closes_at).toBe(FUTURE);
  });

  it('a pending access request is not a door: absent, not still_to_sit', async () => {
    const result = await getExamResults('exam-1', WINDOW_ROSTER, seedWindows().client);
    const row = result.rows.find((r) => r.student_id === 'raj')!;

    expect(row.bucket).toBe('absent');
    expect(row.absent).toBe(true);
    expect(row.window_closes_at).toBeNull();
  });

  it('a live make-up keeps the student still_to_sit, with the make-up window', async () => {
    const result = await getExamResults('exam-1', WINDOW_ROSTER, seedWindows().client);
    const row = result.rows.find((r) => r.student_id === 'meera')!;

    expect(row.bucket).toBe('still_to_sit');
    expect(row.absent).toBe(false);
    expect(row.window_closes_at).toBe(FUTURE);
  });

  it('never lets a second-sitting finisher onto the podium, even ranked 1 in their own sitting', async () => {
    const result = await getExamResults('exam-1', WINDOW_ROSTER, seedWindows().client);
    const kavya = result.rows.find((r) => r.student_id === 'kavya')!;

    expect(kavya.sitting).toBe('second');
    expect(kavya.rank).toBe(1);
    expect(result.podium.some((r) => r.student_id === 'kavya')).toBe(false);
  });
});
