import { describe, it, expect, beforeEach } from 'vitest';
import { changePaperExam, moveQuestionsToPaper, moveQuestionsToPaper2B, PaperMoveError } from './qb-paper-move';
import { Paper2BError } from './qb-paper-2b';
import { fakeSupabase, type Row } from './qb-paper-test-fake';

const SITTING = { year: 2021, session: 'Session 1', shift: 'afternoon' };

let tables: Record<string, Row[]>;

function question(id: string, paper: string, section: string, n: number, extra: Row = {}): Row {
  return {
    id,
    original_paper_id: paper,
    section,
    section_order: { math_mcq: 1, math_numerical: 2, aptitude: 3, drawing: 4, planning: 5 }[section] ?? null,
    display_order: n,
    question_format: section === 'math_numerical' ? 'NUMERICAL' : 'MCQ',
    question_text: `Q ${id}`,
    status: 'active',
    is_active: true,
    exam_relevance: 'JEE',
    repeat_group_id: null,
    ...extra,
  };
}

const source = (question_id: string, exam_type: string, extra: Row = {}) => ({
  id: `s-${question_id}-${exam_type}`,
  question_id,
  exam_type,
  ...SITTING,
  ...extra,
});

beforeEach(() => {
  tables = {
    nexus_qb_original_papers: [
      { id: 'p2a', exam_type: 'JEE_PAPER_2', ...SITTING },
      { id: 'p2b', exam_type: 'JEE_PAPER_2B', ...SITTING },
      { id: 'nata', exam_type: 'NATA', year: 2021, session: 'Test 1', shift: null },
    ],
    nexus_qb_questions: [
      question('m1', 'p2a', 'math_mcq', 1),
      question('a1', 'p2a', 'aptitude', 1),
      question('d1', 'p2a', 'drawing', 1, { question_format: 'DRAWING_PROMPT' }),
      question('pl1', 'p2a', 'drawing', 1),
      question('pl2', 'p2a', 'drawing', 2, { exam_relevance: 'BOTH' }),
      question('b-pl1', 'p2b', 'planning', 1),
    ],
    nexus_qb_question_sources: [
      source('pl1', 'JEE_PAPER_2'),
      source('pl2', 'JEE_PAPER_2'),
      source('a1', 'JEE_PAPER_2'),
      source('b-pl1', 'JEE_PAPER_2B'),
    ],
    nexus_qb_question_tags: [],
  };
});

const q = (id: string) => tables.nexus_qb_questions.find((r) => r.id === id)!;
const sourcesOf = (id: string) => tables.nexus_qb_question_sources.filter((s) => s.question_id === id);

describe('moveQuestionsToPaper', () => {
  it('moves into the 2B paper of the same sitting, into the chosen section, appending on a number clash', async () => {
    const res = await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['pl1', 'pl2'], target: { examType: 'JEE_PAPER_2B' }, section: 'planning', callerId: 't' },
      fakeSupabase(tables),
    );
    expect(res).toMatchObject({ paper_id: 'p2b', created_paper: false, moved: 2 });
    expect(q('pl1')).toMatchObject({ original_paper_id: 'p2b', section: 'planning', section_order: 5, display_order: 2 });
    expect(q('pl2')).toMatchObject({ display_order: 3, exam_relevance: 'BOTH' });
    expect(sourcesOf('pl1')).toEqual([expect.objectContaining({ exam_type: 'JEE_PAPER_2B', question_number: 2 })]);
  });

  it('passes one section and its order to the database function', async () => {
    const db = fakeSupabase(tables);
    await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['pl1'], target: { paperId: 'p2b' }, section: 'planning', callerId: 't' },
      db,
    );
    expect(db.rpcCalls).toEqual([
      {
        fn: 'nexus_qb_move_questions',
        args: { p_source_paper_id: 'p2a', p_question_ids: ['pl1'], p_target_paper_id: 'p2b', p_section: 'planning', p_section_order: 5 },
      },
    ]);
  });

  it('creates the other JEE paper when the sitting has none', async () => {
    tables.nexus_qb_original_papers = tables.nexus_qb_original_papers.filter((p) => p.id !== 'p2b');
    tables.nexus_qb_questions = tables.nexus_qb_questions.filter((r) => r.id !== 'b-pl1');
    const res = await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['pl1'], target: { examType: 'JEE_PAPER_2B' }, section: 'planning', callerId: 't' },
      fakeSupabase(tables),
    );
    expect(res.created_paper).toBe(true);
    expect(tables.nexus_qb_original_papers.find((p) => p.id === res.paper_id)).toMatchObject({ exam_type: 'JEE_PAPER_2B', ...SITTING });
  });

  it('fills a 2B target with Maths and Aptitude from 2A', async () => {
    const res = await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['pl1'], target: { paperId: 'p2b' }, section: 'planning', callerId: 't' },
      fakeSupabase(tables),
    );
    expect(res.copied).toBe(2);
  });

  it('moves back from 2B to 2A, keeping each question in its own section', async () => {
    await moveQuestionsToPaper(
      { sourcePaperId: 'p2b', questionIds: ['b-pl1'], target: { examType: 'JEE_PAPER_2' }, section: 'aptitude', callerId: 't' },
      fakeSupabase(tables),
    );
    expect(q('b-pl1')).toMatchObject({ original_paper_id: 'p2a', section: 'aptitude', display_order: 2 });
    expect(sourcesOf('b-pl1')[0]).toMatchObject({ exam_type: 'JEE_PAPER_2' });
  });

  it('moves a JEE question to a picked NATA paper and recomputes relevance', async () => {
    await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['a1'], target: { paperId: 'nata' }, section: null, callerId: 't' },
      fakeSupabase(tables),
    );
    expect(q('a1')).toMatchObject({ original_paper_id: 'nata', section: 'aptitude', exam_relevance: 'NATA' });
    expect(sourcesOf('a1')[0]).toMatchObject({ exam_type: 'NATA', session: 'Test 1', shift: null });
  });

  it('keeps a single source row for a question that already appears on the target (a repeat)', async () => {
    tables.nexus_qb_question_sources.push(source('a1', 'JEE_PAPER_2B', { question_number: 9 }));
    await moveQuestionsToPaper(
      { sourcePaperId: 'p2a', questionIds: ['a1'], target: { paperId: 'p2b' }, section: null, callerId: 't' },
      fakeSupabase(tables),
    );
    expect(sourcesOf('a1')).toEqual([expect.objectContaining({ exam_type: 'JEE_PAPER_2B', question_number: 1 })]);
  });

  describe('refuses, before anything changes', () => {
    const refused = async (input: Partial<Parameters<typeof moveQuestionsToPaper>[0]>, message: RegExp) => {
      const db = fakeSupabase(tables);
      const run = moveQuestionsToPaper(
        { sourcePaperId: 'p2a', questionIds: ['pl1'], target: { paperId: 'p2b' }, section: 'planning', callerId: 't', ...input },
        db,
      );
      await expect(run).rejects.toBeInstanceOf(PaperMoveError);
      await expect(run).rejects.toThrow(message);
      expect(db.rpcCalls).toHaveLength(0);
      expect(q('pl1').original_paper_id).toBe('p2a');
    };

    it('an empty selection', () => refused({ questionIds: [] }, /at least one/));
    it('a drawing prompt going to 2B', () => refused({ questionIds: ['pl1', 'd1'] }, /Drawing questions/));
    it('a question from another paper', () => refused({ questionIds: ['pl1', 'b-pl1'] }, /not on this paper/));
    it('a section the target exam does not have', () => refused({ section: 'drawing' }, /has no Drawing section/));
    it('keeping a section the target does not have', () =>
      refused({ section: null }, /in Drawing, which JEE Paper 2B \(B\.Planning\) does not have/));
    it('the same paper', () => refused({ target: { paperId: 'p2a' } }, /already on that paper/));
    it('the same exam by type', () => refused({ target: { examType: 'JEE_PAPER_2' } }, /already in JEE Paper 2A/));
    it('NATA by type, since its sittings differ', () => refused({ target: { examType: 'NATA' } }, /Pick the paper/));
    it('a missing target paper', async () => {
      await expect(
        moveQuestionsToPaper(
          { sourcePaperId: 'p2a', questionIds: ['pl1'], target: { paperId: 'nope' }, section: 'planning', callerId: 't' },
          fakeSupabase(tables),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it('is caught as a Paper2BError, so the older 2B route maps it too', async () => {
    await expect(
      moveQuestionsToPaper(
        { sourcePaperId: 'p2a', questionIds: [], target: { paperId: 'p2b' }, section: 'planning', callerId: 't' },
        fakeSupabase(tables),
      ),
    ).rejects.toBeInstanceOf(Paper2BError);
  });
});

describe('moveQuestionsToPaper2B', () => {
  it('moves into Planning on the 2B paper of the same sitting', async () => {
    const res = await moveQuestionsToPaper2B('p2a', ['pl1', 'pl2'], 't', fakeSupabase(tables));
    expect(res.paper_id).toBe('p2b');
    expect([q('pl1').section, q('pl2').section]).toEqual(['planning', 'planning']);
  });
});

describe('changePaperExam', () => {
  const input = (extra: Partial<Parameters<typeof changePaperExam>[0]> = {}) => ({
    paperId: 'p2a',
    examType: 'JEE_PAPER_2B' as const,
    year: 2022,
    session: 'Session 2',
    shift: null,
    sectionMap: { drawing: 'planning' as const },
    ...extra,
  });

  it('renames the paper into the new exam and hands the section map to the database function', async () => {
    tables.nexus_qb_original_papers = tables.nexus_qb_original_papers.filter((p) => p.id !== 'p2b');
    const db = fakeSupabase(tables);
    const res = await changePaperExam(input(), db);
    expect(res.paper).toMatchObject({ id: 'p2a', exam_type: 'JEE_PAPER_2B', year: 2022, session: 'Session 2', shift: null });
    expect(db.rpcCalls).toEqual([
      {
        fn: 'nexus_qb_change_paper_exam',
        args: {
          p_paper_id: 'p2a',
          p_exam_type: 'JEE_PAPER_2B',
          p_year: 2022,
          p_session: 'Session 2',
          p_shift: null,
          p_section_map: { drawing: 'planning' },
        },
      },
    ]);
  });

  it('needs a section for questions in one the new exam lacks', async () => {
    await expect(changePaperExam(input({ sectionMap: {} }), fakeSupabase(tables))).rejects.toThrow(
      'JEE Paper 2B (B.Planning) has no Drawing section. Pick where those questions go.',
    );
  });

  it('does not ask about a Drawing section of drawing prompts only, which stay behind', async () => {
    tables.nexus_qb_questions = tables.nexus_qb_questions.filter((r) => !['pl1', 'pl2'].includes(r.id as string));
    const db = fakeSupabase(tables);
    await changePaperExam(input({ sectionMap: {} }), db);
    expect(db.rpcCalls).toHaveLength(1);
  });

  it('refuses a section the new exam does not have', async () => {
    await expect(
      changePaperExam(input({ sectionMap: { drawing: 'drawing' } }), fakeSupabase(tables)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses the exam the paper is already in', async () => {
    await expect(
      changePaperExam(input({ examType: 'JEE_PAPER_2', sectionMap: {} }), fakeSupabase(tables)),
    ).rejects.toThrow('This paper is already in JEE Paper 2A (B.Arch)');
  });

  it('says which paper is in the way when the new name is taken', async () => {
    const db = fakeSupabase(tables);
    db.rpc = () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
    await expect(changePaperExam(input(), db)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('already has a paper for this year, session and shift'),
    });
  });
});
