import { describe, it, expect, vi, beforeEach } from 'vitest';

const addQuestionTagPairs = vi.fn(async (pairs: unknown[]) => ({ inserted: pairs.length }));
vi.mock('@neram/database', () => ({ addQuestionTagPairs: (...args: unknown[]) => addQuestionTagPairs(...(args as [unknown[]])) }));

import { planRecapQuestionTags, tagRecapCheckpointQuestions } from './qb-recap-question-tags';
import { buildTagMatchers } from './qb-tag-suggest';
import { mergeTagKeywords } from './qb-tag-keywords';

const themeMatchers = buildTagMatchers(mergeTagKeywords([{ slug: 'islamic_architecture' }, { slug: 'indus_valley_civilization' }]));
const themeIds = new Map([
  ['islamic_architecture', 'T-islamic'],
  ['indus_valley_civilization', 'T-indus'],
]);

describe('planRecapQuestionTags', () => {
  it('puts the class tags on every question and adds high-confidence themes', () => {
    const plan = planRecapQuestionTags(
      [
        { id: 'q1', question_text: 'Why was marble chosen for the Taj Mahal by Shah Jahan?', options: [] },
        { id: 'q2', question_text: 'What pencil does the tutor recommend?', options: [] },
      ],
      ['S-history'],
      themeMatchers,
      themeIds,
    );
    expect(plan).toEqual([
      { question_id: 'q1', tag_ids: ['S-history', 'T-islamic'] },
      { question_id: 'q2', tag_ids: ['S-history'] },
    ]);
  });

  it('never writes a low-confidence theme on its own', () => {
    const plan = planRecapQuestionTags(
      [{ id: 'q1', question_text: 'How should Fatehpur Sikri be understood?', options: [] }],
      [],
      themeMatchers,
      themeIds,
    );
    expect(plan).toEqual([]);
  });

  it('reads the options when judging a theme', () => {
    const plan = planRecapQuestionTags(
      [{ id: 'q1', question_text: 'Which site had this?', options: [{ id: 'a', text: 'The Great Bath at Mohenjo-daro' }] }],
      [],
      themeMatchers,
      themeIds,
    );
    expect(plan).toEqual([{ question_id: 'q1', tag_ids: ['T-indus'] }]);
  });
});

// ─── The database walk, against a small fake ──────────────────────────────────

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>, failOn?: string) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const run = () => {
        if (table === failOn) return { data: null, error: { message: 'fetch failed' } };
        return { data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null };
      };
      const builder: any = {
        select: () => builder,
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r[col]));
          return builder;
        },
        maybeSingle: async () => {
          const res = run();
          return { data: res.data?.[0] ?? null, error: res.error };
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return builder;
    },
  };
}

const TABLES: Record<string, Row[]> = {
  nexus_class_recaps: [
    { id: 'R1', scheduled_class_id: 'C1' },
    { id: 'R2', scheduled_class_id: null },
  ],
  nexus_class_recap_sections: [
    { id: 'S1', recap_id: 'R1' },
    { id: 'S2', recap_id: 'R2' },
  ],
  nexus_test_placements: [
    { test_id: 'X1', context_id: 'S1', context_type: 'class_recap_section', is_active: true },
    { test_id: 'X2', context_id: 'S2', context_type: 'class_recap_section', is_active: true },
  ],
  nexus_test_questions: [
    { test_id: 'X1', qb_question_id: 'Q1' },
    { test_id: 'X1', qb_question_id: 'Q2' },
    { test_id: 'X2', qb_question_id: 'Q3' },
    { test_id: 'X2', qb_question_id: 'Q4' },
  ],
  nexus_qb_tags: [
    { id: 'T-islamic', slug: 'islamic_architecture', group_type: 'theme', aliases: [], is_active: true },
    { id: 'S-history', slug: 'history_of_architecture', group_type: 'subject', aliases: [], is_active: true },
    { id: 'S-old', slug: 'retired', group_type: 'subject', aliases: [], is_active: false },
    { id: 'E-nata', slug: 'nata', group_type: 'exam', aliases: [], is_active: true },
  ],
  nexus_qb_question_tags: [
    { question_id: 'Q2', tag_id: 'S-history' }, // already tagged by a person
    { question_id: 'Q1', tag_id: 'E-nata' }, // an exam tag does not count
  ],
  nexus_class_tags: [
    { scheduled_class_id: 'C1', tag_id: 'S-history' },
    { scheduled_class_id: 'C1', tag_id: 'S-old' },
    { scheduled_class_id: 'C1', tag_id: 'E-nata' },
  ],
  nexus_qb_questions: [
    { id: 'Q1', question_text: 'Who designed the Taj Mahal for Shah Jahan?', options: [] },
    { id: 'Q2', question_text: 'Anything', options: [] },
    { id: 'Q3', question_text: 'The Qutub Minar and the Quwwat-ul-Islam mosque', options: [] },
    { id: 'Q4', question_text: 'Draw a cube', options: [] },
  ],
};

describe('tagRecapCheckpointQuestions', () => {
  beforeEach(() => {
    addQuestionTagPairs.mockClear();
  });

  it('uses the class tags (active subject/theme only) plus strong themes, and skips hand-tagged questions', async () => {
    const result = await tagRecapCheckpointQuestions(fakeDb(TABLES), 'R1', { createdBy: 'U1' });
    expect(result).toEqual({ tagged: 1, source: 'class_tags' });
    expect(addQuestionTagPairs).toHaveBeenCalledWith(
      [{ question_id: 'Q1', tag_ids: ['S-history', 'T-islamic'] }],
      'U1',
      expect.anything(),
    );
  });

  it('falls back to keyword themes when the recap has no class', async () => {
    const result = await tagRecapCheckpointQuestions(fakeDb(TABLES), 'R2');
    expect(result).toEqual({ tagged: 1, source: 'keywords' });
    expect(addQuestionTagPairs).toHaveBeenCalledWith([{ question_id: 'Q3', tag_ids: ['T-islamic'] }], null, expect.anything());
  });

  it('never throws: a failed read is logged and reported as nothing tagged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(tagRecapCheckpointQuestions(fakeDb(TABLES, 'nexus_test_placements'), 'R1')).resolves.toEqual({
      tagged: 0,
      source: 'none',
    });
    expect(addQuestionTagPairs).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never throws when the tag write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    addQuestionTagPairs.mockRejectedValueOnce(new Error('insert failed'));
    await expect(tagRecapCheckpointQuestions(fakeDb(TABLES), 'R1')).resolves.toEqual({ tagged: 0, source: 'none' });
    warn.mockRestore();
  });

  it('does nothing for an unknown recap', async () => {
    await expect(tagRecapCheckpointQuestions(fakeDb(TABLES), 'nope')).resolves.toEqual({ tagged: 0, source: 'none' });
  });
});
