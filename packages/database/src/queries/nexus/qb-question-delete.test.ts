import { describe, it, expect, vi } from 'vitest';
import { preflightQBQuestionDelete, hardDeleteQBQuestions } from './qb-question-delete';
import { createFakeDb } from './testing/fake-supabase';

/**
 * What this is protecting.
 *
 * nexus_test_questions.qb_question_id is ON DELETE CASCADE. Deleting a bank
 * question therefore removes it from every composed test holding it, INCLUDING
 * papers students have already sat and been given a score for. Postgres does
 * that silently, and deletePaperWithQuestions has been doing it with no guard
 * since it was written.
 *
 * So the interesting assertions here are the refusals, not the deletions.
 */

// refreshPaperStats does a real read-modify-write the fake cannot usefully
// model, and it is not what these tests are about.
vi.mock('./question-bank', () => ({
  refreshPaperStats: vi.fn(async () => undefined),
}));

const ACTOR = 'teacher-1';
const PAPER = 'paper-1';

function seed(over: Record<string, any[]> = {}) {
  return createFakeDb({
    nexus_qb_questions: [
      { id: 'q-clean', question_text: 'Untouched', is_active: false, original_paper_id: PAPER },
      { id: 'q-sat', question_text: 'In a sat test', is_active: true, original_paper_id: PAPER },
      { id: 'q-tried', question_text: 'Attempted', is_active: true, original_paper_id: PAPER },
      { id: 'q-drawing', question_text: 'A drawing', is_active: true, original_paper_id: PAPER },
    ],
    nexus_qb_student_attempts: [{ id: 'a1', question_id: 'q-tried' }],
    nexus_qb_study_marks: [],
    nexus_test_questions: [{ id: 'tq1', qb_question_id: 'q-sat' }],
    nexus_qb_question_tags: [
      { id: 't1', question_id: 'q-clean' },
      { id: 't2', question_id: 'q-clean' },
    ],
    nexus_qb_question_sources: [{ id: 's1', question_id: 'q-clean' }],
    drawing_questions: [{ id: 'mirror-1', qb_question_id: 'q-drawing' }],
    drawing_submissions: [],
    ...over,
  });
}

describe('preflightQBQuestionDelete', () => {
  it('clears a question nothing points at', async () => {
    const db = seed();
    const [row] = await preflightQBQuestionDelete(['q-clean'], db.client);

    expect(row.blockers).toEqual([]);
    expect(row.tags).toBe(2);
    expect(row.sources).toBe(1);
  });

  it('blocks a question that is in a test, and says why in words a teacher can read', async () => {
    const db = seed();
    const [row] = await preflightQBQuestionDelete(['q-sat'], db.client);

    expect(row.test_questions).toBe(1);
    expect(row.blockers).toHaveLength(1);
    expect(row.blockers[0]).toContain('already sat');
    // The one blocker no flag may override.
    expect(row.forceable).toBe(false);
  });

  it('blocks a question a student has answered, but allows an override', async () => {
    const db = seed();
    const [row] = await preflightQBQuestionDelete(['q-tried'], db.client);

    expect(row.attempts).toBe(1);
    expect(row.blockers[0]).toContain('student answer');
    expect(row.forceable).toBe(true);
  });

  it('counts drawing submissions reached through the mirror, not just direct ones', async () => {
    const db = seed({
      drawing_submissions: [
        { id: 'ds1', question_id: 'mirror-1', exam_qb_question_id: null },
        { id: 'ds2', question_id: 'mirror-1', exam_qb_question_id: null },
      ],
    });
    const [row] = await preflightQBQuestionDelete(['q-drawing'], db.client);

    // Counting only exam_qb_question_id would report zero here and let a
    // question with two marked sheets against it look unreferenced.
    expect(row.drawing_submissions).toBe(2);
    expect(row.blockers[0]).toContain('drawing submission');
  });

  it('counts a drawing submission linked directly, as exam rows are', async () => {
    const db = seed({
      drawing_submissions: [{ id: 'ds1', question_id: null, exam_qb_question_id: 'q-drawing' }],
    });
    const [row] = await preflightQBQuestionDelete(['q-drawing'], db.client);

    expect(row.drawing_submissions).toBe(1);
  });

  it('does not treat an unused mirror as a reason to refuse', async () => {
    const db = seed();
    const [row] = await preflightQBQuestionDelete(['q-drawing'], db.client);

    expect(row.drawing_mirrors).toBe(1);
    expect(row.blockers).toEqual([]);
  });

  it('never mutates', async () => {
    const db = seed();
    await preflightQBQuestionDelete(['q-clean', 'q-sat', 'q-tried'], db.client);

    expect(db.tables.nexus_qb_questions).toHaveLength(4);
    expect(db.tables.nexus_qb_question_tags).toHaveLength(2);
  });
});

describe('hardDeleteQBQuestions', () => {
  it('deletes a clean question and its junction rows', async () => {
    const db = seed();
    const result = await hardDeleteQBQuestions(['q-clean'], { actorId: ACTOR }, db.client);

    expect(result.deleted).toEqual(['q-clean']);
    expect(result.refused).toEqual([]);
    expect(db.tables.nexus_qb_questions.map((q: any) => q.id)).not.toContain('q-clean');
    expect(db.tables.nexus_qb_question_tags).toHaveLength(0);
    expect(db.tables.nexus_qb_question_sources).toHaveLength(0);
  });

  it('refuses a question that is in a test, and leaves it in place', async () => {
    const db = seed();
    const result = await hardDeleteQBQuestions(['q-sat'], { actorId: ACTOR }, db.client);

    expect(result.deleted).toEqual([]);
    expect(result.refused).toHaveLength(1);
    expect(db.tables.nexus_qb_questions.map((q: any) => q.id)).toContain('q-sat');
  });

  it('still refuses a question that is in a test when force is set', async () => {
    // The assertion the whole module exists for. Rewriting the score of a paper
    // a student has already sat is never the right answer.
    const db = seed();
    const result = await hardDeleteQBQuestions(
      ['q-sat'],
      { actorId: ACTOR, force: true },
      db.client,
    );

    expect(result.deleted).toEqual([]);
    expect(result.refused[0].question_id).toBe('q-sat');
    expect(db.tables.nexus_qb_questions.map((q: any) => q.id)).toContain('q-sat');
  });

  it('lets force past an attempted question, which is a judgement call', async () => {
    const db = seed();
    const result = await hardDeleteQBQuestions(
      ['q-tried'],
      { actorId: ACTOR, force: true },
      db.client,
    );

    expect(result.deleted).toEqual(['q-tried']);
  });

  it('deletes the mirror so the practice bank is not left with an orphan prompt', async () => {
    const db = seed();
    await hardDeleteQBQuestions(['q-drawing'], { actorId: ACTOR }, db.client);

    // drawing_questions.qb_question_id is ON DELETE SET NULL, so without this
    // the mirror survives as a prompt pointing at nothing.
    expect(db.tables.drawing_questions).toHaveLength(0);
  });

  it('deletes the clean ones and refuses the rest in a mixed batch', async () => {
    const db = seed();
    const result = await hardDeleteQBQuestions(
      ['q-clean', 'q-sat', 'q-tried'],
      { actorId: ACTOR },
      db.client,
    );

    expect(result.deleted).toEqual(['q-clean']);
    expect(result.refused.map((r) => r.question_id).sort()).toEqual(['q-sat', 'q-tried']);
    expect(db.tables.nexus_qb_questions.map((q: any) => q.id).sort()).toEqual([
      'q-drawing',
      'q-sat',
      'q-tried',
    ]);
  });

  it('does nothing at all when handed an empty list', async () => {
    const db = seed();
    const result = await hardDeleteQBQuestions([], { actorId: ACTOR }, db.client);

    expect(result).toEqual({ deleted: [], refused: [] });
    expect(db.tables.nexus_qb_questions).toHaveLength(4);
  });
});
