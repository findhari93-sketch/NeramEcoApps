import { describe, it, expect, beforeEach } from 'vitest';
import { copySharedSectionsFromPaper2A, Paper2BError } from './qb-paper-2b';
import { fakeSupabase, type Row } from './qb-paper-test-fake';

const SITTING = { year: 2021, session: 'Session 1', shift: 'afternoon' };

let tables: Record<string, Row[]>;

function question(id: string, section: string, n: number, extra: Row = {}): Row {
  return {
    id,
    original_paper_id: 'p2a',
    section,
    section_order: 1,
    display_order: n,
    question_format: section === 'math_numerical' ? 'NUMERICAL' : 'MCQ',
    question_text: `Q ${id}`,
    status: 'active',
    is_active: true,
    exam_relevance: 'JEE',
    repeat_group_id: null,
    question_text_norm: 'generated',
    created_at: 'then',
    ...extra,
  };
}

beforeEach(() => {
  tables = {
    nexus_qb_original_papers: [
      { id: 'p2a', exam_type: 'JEE_PAPER_2', ...SITTING },
      { id: 'p2b', exam_type: 'JEE_PAPER_2B', ...SITTING },
      { id: 'other', exam_type: 'JEE_PAPER_2', year: 2021, session: 'Session 2', shift: null },
    ],
    nexus_qb_questions: [
      question('m1', 'math_mcq', 1),
      question('n1', 'math_numerical', 21, { correct_answer: '2√3' }),
      question('a1', 'aptitude', 1, { repeat_group_id: 'grp-existing' }),
      question('d1', 'drawing', 1, { question_format: 'DRAWING_PROMPT' }),
      question('pl1', 'drawing', 1),
      question('pl2', 'drawing', 2),
    ],
    nexus_qb_question_sources: [
      { id: 's-pl1', question_id: 'pl1', exam_type: 'JEE_PAPER_2', ...SITTING },
      { id: 's-pl2', question_id: 'pl2', exam_type: 'JEE_PAPER_2', ...SITTING },
    ],
    nexus_qb_question_tags: [
      { question_id: 'm1', tag_id: 'tag-algebra' },
      { question_id: 'a1', tag_id: 'tag-analogy' },
    ],
  };
});

const onPaper = (paperId: string) => tables.nexus_qb_questions.filter((q) => q.original_paper_id === paperId);

describe('copySharedSectionsFromPaper2A', () => {
  it('copies Maths and Aptitude only, never Drawing', async () => {
    const res = await copySharedSectionsFromPaper2A('p2b', 'teacher-1', fakeSupabase(tables));
    expect(res.copied).toBe(3);
    const copies = onPaper('p2b');
    expect(copies.map((q) => q.section).sort()).toEqual(['aptitude', 'math_mcq', 'math_numerical']);
  });

  it('keeps answers and numbering, and drops generated columns', async () => {
    await copySharedSectionsFromPaper2A('p2b', 'teacher-1', fakeSupabase(tables));
    const n = onPaper('p2b').find((q) => q.section === 'math_numerical')!;
    expect(n.correct_answer).toBe('2√3');
    expect(n.display_order).toBe(21);
    expect(n.question_text_norm).toBeUndefined();
    expect(n.created_at).toBeUndefined();
    expect(n.created_by).toBe('teacher-1');
    expect(n.id).not.toBe('n1');
  });

  it('links each copy to its original as a repeat', async () => {
    await copySharedSectionsFromPaper2A('p2b', null, fakeSupabase(tables));
    const original = tables.nexus_qb_questions.find((q) => q.id === 'm1')!;
    const copy = onPaper('p2b').find((q) => q.section === 'math_mcq')!;
    expect(original.repeat_group_id).toBeTruthy();
    expect(copy.repeat_group_id).toBe(original.repeat_group_id);
    // An existing group is reused, not replaced.
    expect(onPaper('p2b').find((q) => q.section === 'aptitude')!.repeat_group_id).toBe('grp-existing');
  });

  it('writes a JEE_PAPER_2B source row and copies tags', async () => {
    await copySharedSectionsFromPaper2A('p2b', null, fakeSupabase(tables));
    const copyIds = onPaper('p2b').map((q) => q.id);
    const sources = tables.nexus_qb_question_sources.filter((s) => copyIds.includes(s.question_id));
    expect(sources).toHaveLength(3);
    expect(sources.every((s) => s.exam_type === 'JEE_PAPER_2B' && s.year === 2021)).toBe(true);
    const mathCopy = onPaper('p2b').find((q) => q.section === 'math_mcq')!;
    expect(tables.nexus_qb_question_tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ question_id: mathCopy.id, tag_id: 'tag-algebra' })]),
    );
  });

  it('is idempotent: a second run copies nothing', async () => {
    const db = fakeSupabase(tables);
    await copySharedSectionsFromPaper2A('p2b', null, db);
    const again = await copySharedSectionsFromPaper2A('p2b', null, db);
    expect(again.copied).toBe(0);
    expect(again.skipped_sections.sort()).toEqual(['aptitude', 'math_mcq', 'math_numerical']);
    expect(onPaper('p2b')).toHaveLength(3);
  });

  it('refuses a paper that is not 2B', async () => {
    await expect(copySharedSectionsFromPaper2A('p2a', null, fakeSupabase(tables))).rejects.toBeInstanceOf(Paper2BError);
  });

  it('says which sitting is missing when there is no 2A paper', async () => {
    tables.nexus_qb_original_papers[0].session = 'Session 2';
    tables.nexus_qb_original_papers.splice(2, 1);
    await expect(copySharedSectionsFromPaper2A('p2b', null, fakeSupabase(tables))).rejects.toThrow(
      /2021 Session 1 \(AN\)/,
    );
  });
});
