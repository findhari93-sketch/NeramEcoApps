import { describe, expect, it } from 'vitest';
import { buildContentSummary, CONTENT_SUMMARY_VERSION } from './test-provenance';
import type { SummarisableQuestion } from './test-provenance';

const q = (over: Partial<SummarisableQuestion> = {}): SummarisableQuestion => ({
  difficulty: 'MEDIUM',
  question_format: 'MCQ',
  categories: ['aptitude'],
  paper: { exam_type: 'JEE_PAPER_2', year: 2009, session: null },
  ...over,
});

describe('buildContentSummary', () => {
  it('stamps the version and the producer so a shape mismatch is diagnosable', () => {
    const s = buildContentSummary([q()]);
    expect(s.v).toBe(CONTENT_SUMMARY_VERSION);
    expect(s.generated).toBe('compose');
    expect(buildContentSummary([q()], 'backfill').generated).toBe('backfill');
  });

  // A test with no questions is a real thing. The UI has to tell it apart from a
  // test nobody has summarised, which is why this returns a summary, not null.
  it('summarises an empty paper as a count of zero rather than throwing', () => {
    const s = buildContentSummary([]);
    expect(s.question_count).toBe(0);
    expect(s.papers).toBeUndefined();
    expect(s.categories).toBeUndefined();
    expect(s.difficulty).toBeUndefined();
  });

  it('counts questions, difficulty and format', () => {
    const s = buildContentSummary([
      q({ difficulty: 'MEDIUM' }),
      q({ difficulty: 'MEDIUM' }),
      q({ difficulty: 'HARD' }),
    ]);
    expect(s.question_count).toBe(3);
    expect(s.difficulty).toEqual({ MEDIUM: 2, HARD: 1 });
    expect(s.formats).toEqual({ MCQ: 3 });
  });

  // Categories are an array per question, so they legitimately over-count. This
  // is asserted rather than left implicit because a reader who assumes the
  // category counts sum to question_count will build a wrong percentage.
  it('lets one question count towards several categories', () => {
    const s = buildContentSummary([q({ categories: ['aptitude', 'puzzle', 'analogy'] })]);
    expect(s.question_count).toBe(1);
    expect(s.categories).toEqual([
      { slug: 'analogy', n: 1 },
      { slug: 'aptitude', n: 1 },
      { slug: 'puzzle', n: 1 },
    ]);
  });

  it('keeps only the top six categories, highest count first', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      q({ categories: Array.from({ length: 9 - i }, () => `cat${i}`) }),
    );
    const s = buildContentSummary(many);
    expect(s.categories).toHaveLength(6);
    expect(s.categories![0]).toEqual({ slug: 'cat0', n: 9 });
    expect(s.categories!.map((c) => c.n)).toEqual([9, 8, 7, 6, 5, 4]);
  });

  // Without a tiebreak, two runs over the same paper could store different
  // arrays and every diff would look like a real change.
  it('breaks count ties on the key so the output is deterministic', () => {
    const a = buildContentSummary([q({ categories: ['zebra'] }), q({ categories: ['alpha'] })]);
    const b = buildContentSummary([q({ categories: ['alpha'] }), q({ categories: ['zebra'] })]);
    expect(a.categories).toEqual(b.categories);
    expect(a.categories![0].slug).toBe('alpha');
  });

  it('groups papers by exam, year and session together', () => {
    const s = buildContentSummary([
      q({ paper: { exam_type: 'JEE_PAPER_2', year: 2009, session: null } }),
      q({ paper: { exam_type: 'JEE_PAPER_2', year: 2009, session: null } }),
      q({ paper: { exam_type: 'JEE_PAPER_2', year: 2011, session: null } }),
    ]);
    expect(s.papers).toEqual([
      { exam_type: 'JEE_PAPER_2', year: 2009, session: null, n: 2 },
      { exam_type: 'JEE_PAPER_2', year: 2011, session: null, n: 1 },
    ]);
  });

  // Same exam and year, two sittings, are two different papers to a student
  // revising, so they must not be merged.
  it('keeps two sessions of the same exam year apart', () => {
    const s = buildContentSummary([
      q({ paper: { exam_type: 'NATA', year: 2025, session: 'Session 1' } }),
      q({ paper: { exam_type: 'NATA', year: 2025, session: 'Session 2' } }),
    ]);
    expect(s.papers).toHaveLength(2);
  });

  it('omits papers entirely when no question has one', () => {
    const s = buildContentSummary([q({ paper: null }), q({ paper: { exam_type: null } as any })]);
    expect(s.papers).toBeUndefined();
    expect(s.question_count).toBe(2);
  });

  it('survives null and missing fields without inventing counts', () => {
    const s = buildContentSummary([
      { difficulty: null, question_format: null, categories: null, paper: null },
      {},
    ]);
    expect(s.question_count).toBe(2);
    expect(s.difficulty).toBeUndefined();
    expect(s.formats).toBeUndefined();
    expect(s.categories).toBeUndefined();
  });

  /**
   * The exact production shape on 2026-08-06: YahulKishore's 544-question paper,
   * every question tagged `aptitude`, spanning eleven JEE Paper 2 years. This is
   * the row that proves the top-N cap matters and that `aptitude` at n = 544 is
   * an umbrella rather than a description.
   */
  it('matches the production 544-question paper', () => {
    const rows: SummarisableQuestion[] = [];
    for (let i = 0; i < 544; i += 1) {
      rows.push(
        q({
          difficulty: i === 0 ? 'HARD' : 'MEDIUM',
          categories: i < 113 ? ['aptitude', 'architecture_gk'] : ['aptitude'],
          paper: { exam_type: 'JEE_PAPER_2', year: 2005 + (i % 11), session: null },
        }),
      );
    }
    const s = buildContentSummary(rows, 'backfill');
    expect(s.question_count).toBe(544);
    expect(s.difficulty).toEqual({ MEDIUM: 543, HARD: 1 });
    expect(s.papers).toHaveLength(6); // capped, not all eleven years
    expect(s.categories![0]).toEqual({ slug: 'aptitude', n: 544 });
    expect(s.categories![1]).toEqual({ slug: 'architecture_gk', n: 113 });
  });
});
