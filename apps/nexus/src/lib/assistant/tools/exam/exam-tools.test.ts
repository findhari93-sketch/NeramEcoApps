// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCachedQBWeightage: vi.fn(), getQBStudyCatalog: vi.fn(), getQBQuestionStudyView: vi.fn(), searchQBQuestionIds: vi.fn() }));
vi.mock('@/lib/qb-weightage-cache', () => ({ getCachedQBWeightage: mocks.getCachedQBWeightage }));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getQBStudyCatalog: mocks.getQBStudyCatalog,
  getQBQuestionStudyView: mocks.getQBQuestionStudyView,
  searchQBQuestionIds: mocks.searchQBQuestionIds,
}));
vi.mock('@neram/database', async (importOriginal) => ({ ...(await importOriginal<typeof import('@neram/database')>()), getSupabaseAdminClient: () => ({}) }));

import { TOOLS } from '@/lib/assistant/registry';
import '@/lib/assistant/tools/exam';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { allowedTools } from '@/lib/assistant/policy';
import type { ToolContext } from '@/lib/assistant/types';

const caller = { id: 's1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ON = { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true };
const ctx = (tables: Record<string, any[]> = {}): ToolContext => ({
  caller, channel: 'nexus', mode: 'exam', supabase: fakeDb(tables), classroomId: 'c1', threadId: 't1', now: new Date('2026-10-03T04:30:00Z'), baseUrl: 'https://nexus.test', features: ON,
});
const tool = (n: string) => TOOLS.find((t) => t.name === n)!;
const Q = '11111111-1111-4111-8111-111111111111';

/** A two-year, one-section payload in the shape qb-weightage.test.ts uses. */
const payload = {
  exam_type: 'NATA',
  papers: [{ year: 2024, papers: 1 }, { year: 2025, papers: 1 }],
  totals: [{ section: 'math', year: 2024, questions: 4 }, { section: 'math', year: 2025, questions: 4 }],
  cells: [
    { section: 'math', year: 2024, chapter: 'definite_integrals', questions: 2 }, { section: 'math', year: 2025, chapter: 'definite_integrals', questions: 2 },
    { section: 'math', year: 2024, chapter: 'vectors', questions: 2 }, { section: 'math', year: 2025, chapter: 'vectors', questions: 2 },
  ],
  chapters: [
    { slug: 'definite_integrals', label: 'Definite integrals', unit: 'calculus', unit_label: 'Calculus', unit_order: 1, chapter_order: 1, has_children: false },
    { slug: 'vectors', label: 'Vectors', unit: 'algebra', unit_label: 'Algebra', unit_order: 2, chapter_order: 1, has_children: false },
  ],
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCachedQBWeightage.mockResolvedValue(payload);
});

describe('exam tools: registration and policy', () => {
  it('are exam-mode read tools behind the question bank switch', () => {
    for (const n of ['qb_chapter_weightage', 'what_to_study', 'qb_search_questions', 'qb_explain_answer', 'ncert_study_refs']) {
      expect(tool(n)).toMatchObject({ audience: 'student', kind: 'read', mode: 'exam', feature: 'questionBank' });
    }
  });

  it('vanish from general mode and when the bank is off', () => {
    const general = allowedTools(TOOLS, caller, 'general', ON).map((t) => t.name);
    expect(general).not.toContain('qb_chapter_weightage');
    const off = allowedTools(TOOLS, caller, 'exam', { ...ON, questionBank: false }).map((t) => t.name);
    expect(off).not.toContain('qb_chapter_weightage');
  });
});

describe('qb_chapter_weightage', () => {
  it('gives the top chapters per section with a reason and the weightage page link', async () => {
    const out = await tool('qb_chapter_weightage').run(ctx(), { exam: 'NATA' });
    expect(out.ok).toBe(true);
    expect(JSON.stringify(out.data)).toMatch(/Definite integrals/);
    expect(out.links).toEqual([{ label: 'Chapter weightage', url: '/student/question-bank/nata/weightage' }]);
  });

  it('asks which exam when the model sends none or a made-up one', async () => {
    expect((await tool('qb_chapter_weightage').run(ctx(), {})).ok).toBe(false);
    expect((await tool('qb_chapter_weightage').run(ctx(), { exam: 'GATE' })).ok).toBe(false);
  });
});

describe('what_to_study', () => {
  it('joins the top maths chapters to their NCERT readings', async () => {
    mocks.getQBStudyCatalog.mockResolvedValue({
      ncert: new Map([['c12.7', { ref: 'c12.7', subject: 'math', class_level: 12, chapter_no: 7, chapter_title: 'Integrals', section_no: null, section_title: null, pdf_file: 'lemh201', edition: '2023', sort_order: 1, is_active: true }]]),
      tagNcert: new Map([['definite_integrals', [{ ref: 'c12.7', beyond_ncert: false }]]]),
      tagLabels: new Map([['definite_integrals', 'Definite integrals']]),
    });
    const out = await tool('what_to_study').run(ctx(), { exam: 'NATA' });
    const first = (out.data as any).chapters[0];
    expect(first).toMatchObject({ chapter: 'Definite integrals' });
    expect(first.ncert[0]).toMatchObject({ book: 'Class 12, chapter 7: Integrals', url: 'https://ncert.nic.in/textbook/pdf/lemh201.pdf' });
  });
});

describe('qb_search_questions', () => {
  it('returns question text, where it was asked, and links; never options or keys', async () => {
    mocks.searchQBQuestionIds.mockResolvedValue({ ids: [Q], total: 1, match_kind: 'text', did_you_mean: null, matched_terms: ['integral'] });
    const out = await tool('qb_search_questions').run(ctx({
      nexus_qb_questions: [{ id: Q, question_text: 'Evaluate the integral of x from 0 to 1.', section: 'math_mcq', difficulty: 'easy', is_active: true, status: 'active', options: [{ id: 'a', text: '1/2', is_correct: true }], correct_answer: 'a' }],
      nexus_qb_question_sources: [{ question_id: Q, exam_type: 'NATA', year: 2024 }],
    }), { query: 'integral', exam: 'NATA' });
    expect(mocks.searchQBQuestionIds.mock.calls[0][1]).toEqual({ exam_relevance: 'NATA' });
    expect(mocks.searchQBQuestionIds.mock.calls[0][2]).toMatchObject({ query: 'integral', role: 'student', onlyActive: true, limit: 5 });
    expect(out.data).toEqual([{ question_id: Q, text: 'Evaluate the integral of x from 0 to 1.', section: 'math_mcq', asked_in: ['NATA 2024'] }]);
    expect(JSON.stringify(out)).not.toMatch(/is_correct|correct_answer/);
    expect(out.links).toEqual([{ label: 'Question 1', url: `/student/question-bank/questions/${Q}` }]);
  });
});

describe('qb_search_questions duplicates', () => {
  it('lists a repeated source once', async () => {
    mocks.searchQBQuestionIds.mockResolvedValue({ ids: [Q], total: 1, match_kind: 'text', did_you_mean: null, matched_terms: [] });
    const out = await tool('qb_search_questions').run(ctx({
      nexus_qb_questions: [{ id: Q, question_text: 'x', section: 'math_mcq', is_active: true, status: 'active' }],
      nexus_qb_question_sources: [{ question_id: Q, exam_type: 'NATA', year: 2024 }, { question_id: Q, exam_type: 'NATA', year: 2024 }],
    }), { query: 'x' });
    expect((out.data as any)[0].asked_in).toEqual(['NATA 2024']);
  });
});

describe('qb_explain_answer (D3, Review Focus 2)', () => {
  const question = { id: Q, question_text: 'Evaluate the integral of x from 0 to 1.', options: [{ id: 'a', text: '1/2', is_correct: true }, { id: 'b', text: '1', is_correct: false }], correct_answer: 'a', explanation_brief: 'x^2/2 from 0 to 1.', explanation_detailed: null, is_active: true, status: 'active' };

  it('gives a hint only for a question the student has not answered', async () => {
    const out = await tool('qb_explain_answer').run(ctx({ nexus_qb_questions: [question] }), { question_id: Q });
    expect(out.data).toEqual({ hint_only: true, question: question.question_text, options: [{ id: 'a', text: '1/2' }, { id: 'b', text: '1' }] });
    expect(JSON.stringify(out)).not.toMatch(/is_correct|correct_answer|x\^2\/2/);
  });

  it('gives the stored key and explanation once the student has answered it', async () => {
    const out = await tool('qb_explain_answer').run(ctx({ nexus_qb_questions: [question], nexus_qb_student_attempts: [{ student_id: 's1', question_id: Q, is_correct: false }] }), { question_id: `${Q}~a` });
    expect(out.data).toMatchObject({ correct_options: ['a'], correct_answer: 'a', explanation: 'x^2/2 from 0 to 1.' });
  });

  it('refuses while a test of theirs is in progress, without saying which', async () => {
    const out = await tool('qb_explain_answer').run(ctx({ nexus_qb_questions: [question], nexus_qb_student_attempts: [{ student_id: 's1', question_id: Q }], nexus_test_attempts: [{ id: 'x', student_id: 's1', status: 'in_progress' }] }), { question_id: Q });
    expect(out.reply).toBe('Finish the test you have open first. I can explain questions after you submit it.');
    expect(out.data).toEqual({ refused: 'test_in_progress' });
  });

  const failing = (table: string, tables: Record<string, any[]>): ToolContext => {
    const real = fakeDb(tables);
    const supabase = { from: (n: string) => (n === table ? { select: () => { const q: any = { eq: () => q, limit: () => q, maybeSingle: () => q, then: (r: any) => r({ data: null, error: { message: 'down' } }) }; return q; } } : real.from(n)) };
    return { ...ctx(), supabase } as ToolContext;
  };

  it('fails closed when the open-test read errors', async () => {
    const out = await tool('qb_explain_answer').run(failing('nexus_test_attempts', { nexus_qb_questions: [question], nexus_qb_student_attempts: [{ student_id: 's1', question_id: Q }] }), { question_id: Q });
    expect(out.data).toEqual({ refused: 'test_in_progress' });
    expect(JSON.stringify(out)).not.toMatch(/is_correct|correct_answer|x\^2\/2/);
  });

  it('treats a failed attempts read as not answered', async () => {
    const out = await tool('qb_explain_answer').run(failing('nexus_qb_student_attempts', { nexus_qb_questions: [question] }), { question_id: Q });
    expect(out.data).toMatchObject({ hint_only: true });
    expect(JSON.stringify(out)).not.toMatch(/is_correct|correct_answer|x\^2\/2/);
  });

  it('fails when the question read errors', async () => {
    const out = await tool('qb_explain_answer').run(failing('nexus_qb_questions', {}), { question_id: Q });
    expect(out).toMatchObject({ ok: false, error: 'I could not find that question.' });
  });

  it("ignores another student's bank attempt", async () => {
    const out = await tool('qb_explain_answer').run(ctx({ nexus_qb_questions: [question], nexus_qb_student_attempts: [{ student_id: 's2', question_id: Q }] }), { question_id: Q });
    expect(out.data).toMatchObject({ hint_only: true });
  });

  it("ignores another student's open test", async () => {
    const out = await tool('qb_explain_answer').run(ctx({ nexus_qb_questions: [question], nexus_qb_student_attempts: [{ student_id: 's1', question_id: Q }], nexus_test_attempts: [{ id: 'y', student_id: 's2', status: 'in_progress' }] }), { question_id: Q });
    expect(out.data).toMatchObject({ correct_answer: 'a' });
  });

  it('refuses a malformed or unknown id plainly', async () => {
    expect((await tool('qb_explain_answer').run(ctx(), { question_id: 'drop table' })).ok).toBe(false);
    expect((await tool('qb_explain_answer').run(ctx({}), { question_id: Q })).ok).toBe(false);
  });
});

describe('ncert_study_refs', () => {
  it('returns the chapter and readings for one question', async () => {
    mocks.getQBQuestionStudyView.mockResolvedValue({ primary: { slug: 'definite_integrals', label: 'Definite integrals', ncert: [{ ref: 'c12.7', class_level: 12, chapter_no: 7, chapter_title: 'Integrals', section_no: null, section_title: null, url: 'https://ncert.nic.in/textbook/pdf/lemh201.pdf' }] }, also_uses: [], concepts: [{ name: 'Area under a line', why: null, ncert: null, foundation: null }], source: 'chapter' });
    const out = await tool('ncert_study_refs').run(ctx({ nexus_qb_questions: [{ id: Q, categories: ['definite_integrals'], is_active: true, status: 'active' }] }), { question_id: Q });
    expect(mocks.getQBQuestionStudyView).toHaveBeenCalledWith(Q, ['definite_integrals']);
    expect(out.data).toMatchObject({ chapter: 'Definite integrals', concepts: ['Area under a line'] });
  });
});
