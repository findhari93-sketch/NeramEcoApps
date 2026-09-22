import { describe, expect, it } from 'vitest';
import { listPapersForStudent } from './qb-papers';
import { getQBQuestions, getStudentQBStats, getTeacherQBQuestions } from './question-bank';
import { createFakeDb, type FakeTables } from './testing/fake-supabase';

/**
 * No student Question Bank read may put more than 200 ids in one request.
 *
 * PostgREST carries `.in()` values in the URL and echoes the query string back
 * in a response header. Measured 2026-09-21 through db.neramclasses.com and
 * directly against supabase.co alike: 300 uuids passed, 400 uuids (a 15.7 KB
 * URL) pushed the response headers past Node's 16 KB limit, and fetch threw
 * UND_ERR_HEADERS_OVERFLOW. supabase-js reports that as the bare string
 * "TypeError: fetch failed", which is what a student saw on the exam page:
 *
 *   /stats           sent all 853 active JEE ids at once
 *   /student-papers  sent the 794 published-paper ids in chunks of 400
 *
 * NATA has 96 source ids, which is why the bug stayed hidden while only the
 * NATA demo classroom had the bank open.
 */
const MAX_IDS_PER_REQUEST = 200;

const STUDENT = 'student-1';

/** Record the size of every .in() list the code under test sends. */
function withInListSpy(seed: FakeTables) {
  const db = createFakeDb(seed);
  const sent: Array<{ table: string; column: string; size: number }> = [];
  const from = db.client.from;
  db.client.from = (table: string) => {
    const builder = from(table);
    const realIn = builder.in;
    builder.in = (column: string, values: unknown[]) => {
      sent.push({ table, column, size: values.length });
      return realIn(column, values);
    };
    return builder;
  };
  return { db, sent };
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

describe('listPapersForStudent: a big published paper still loads', () => {
  const questionIds = ids('q', 450);
  const seed = (): FakeTables => ({
    nexus_qb_original_papers: [
      {
        id: 'paper-1',
        exam_type: 'JEE_PAPER_2',
        year: 2025,
        session: 'january',
        shift: null,
        study_file_id: null,
        is_student_visible: true,
      },
    ],
    nexus_qb_question_sources: questionIds.map((id, i) => ({
      question_id: id,
      exam_type: 'JEE_PAPER_2',
      year: 2025,
      session: 'january',
      shift: null,
      question_number: i + 1,
    })),
    nexus_qb_questions: questionIds.map((id) => ({ id, is_active: true, status: 'active' })),
    nexus_test_placements: [],
    nexus_qb_student_attempts: [
      { question_id: 'q-0', student_id: STUDENT },
      { question_id: 'q-1', student_id: STUDENT },
    ],
  });

  it('never sends more than 200 ids in one request', async () => {
    const { db, sent } = withInListSpy(seed());
    await listPapersForStudent(STUDENT, db.client);
    const oversized = sent.filter((s) => s.size > MAX_IDS_PER_REQUEST);
    expect(oversized).toEqual([]);
  });

  it('still counts every question on the paper across the smaller requests', async () => {
    const { db } = withInListSpy(seed());
    const groups = await listPapersForStudent(STUDENT, db.client);
    const card = groups[0]?.years[0]?.papers[0];
    expect(card?.question_count).toBe(450);
    expect(card?.attempted_count).toBe(2);
  });
});

describe('getStudentQBStats: a big exam still loads', () => {
  const jee = ids('jee', 853);
  const seed = (): FakeTables => ({
    nexus_qb_questions: [
      ...jee.map((id, i) => ({
        id,
        is_active: true,
        status: 'active',
        exam_relevance: 'JEE',
        categories: [i % 2 ? 'algebra' : 'aptitude'],
        difficulty: 'MEDIUM',
      })),
      { id: 'nata-0', is_active: true, status: 'active', exam_relevance: 'NATA', categories: [], difficulty: 'EASY' },
    ],
    nexus_qb_student_attempts: [
      // Two JEE questions, the second answered wrong then right.
      { question_id: 'jee-0', student_id: STUDENT, is_correct: false, created_at: '2026-09-01T10:00:00Z' },
      { question_id: 'jee-1', student_id: STUDENT, is_correct: false, created_at: '2026-09-01T10:00:00Z' },
      { question_id: 'jee-1', student_id: STUDENT, is_correct: true, created_at: '2026-09-02T10:00:00Z' },
      // Outside this exam: must not count toward the JEE figures.
      { question_id: 'nata-0', student_id: STUDENT, is_correct: true, created_at: '2026-09-01T10:00:00Z' },
      // Someone else's.
      { question_id: 'jee-2', student_id: 'student-2', is_correct: true, created_at: '2026-09-01T10:00:00Z' },
    ],
  });

  it('never sends more than 200 ids in one request', async () => {
    const { db, sent } = withInListSpy(seed());
    await getStudentQBStats(STUDENT, 'JEE', db.client);
    const oversized = sent.filter((s) => s.size > MAX_IDS_PER_REQUEST);
    expect(oversized).toEqual([]);
  });

  it("counts only this student's attempts on this exam's questions", async () => {
    const { db } = withInListSpy(seed());
    const stats = await getStudentQBStats(STUDENT, 'JEE', db.client);
    expect(stats.total_questions).toBe(853);
    expect(stats.attempted_count).toBe(2);
    // Latest attempt wins: jee-0 wrong, jee-1 right.
    expect(stats.correct_count).toBe(1);
    expect(stats.incorrect_count).toBe(1);
    expect(stats.accuracy_percentage).toBe(50);
  });
});

/**
 * "Search every question" always sends the exam, and an exam-only paper filter
 * resolved to every question id that exam's papers hold: 2,115 for JEE Paper 2
 * on production (cut to 1,000 by PostgREST's row cap), all of them in one
 * `.in('id', ...)`. The filter now runs through the sources table inside the
 * query, which keeps the URL short at any size.
 */
describe('question lists filtered to one exam', () => {
  const jee = ids('jee', 1000);
  const seed = (): FakeTables => ({
    nexus_qb_questions: jee.map((id, i) => ({
      id,
      is_active: true,
      status: 'active',
      exam_relevance: 'JEE',
      display_order: i,
    })),
    nexus_qb_question_sources: jee.map((id) => ({
      question_id: id,
      exam_type: 'JEE_PAPER_2',
      year: 2024,
      session: null,
      shift: null,
    })),
    nexus_qb_student_attempts: [],
  });

  it('the student list never sends more than 200 ids in one request', async () => {
    const { db, sent } = withInListSpy(seed());
    await getQBQuestions({ exam_type: 'JEE_PAPER_2' } as any, 1, 20, STUDENT, db.client);
    expect(sent.filter((s) => s.size > MAX_IDS_PER_REQUEST)).toEqual([]);
  });

  it('the teacher list never sends more than 200 ids in one request', async () => {
    const { db, sent } = withInListSpy(seed());
    await getTeacherQBQuestions({ exam_type: 'JEE_PAPER_2' } as any, 1, 20, db.client);
    expect(sent.filter((s) => s.size > MAX_IDS_PER_REQUEST)).toEqual([]);
  });
});
