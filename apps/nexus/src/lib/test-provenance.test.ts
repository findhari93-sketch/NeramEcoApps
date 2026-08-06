import { describe, expect, it } from 'vitest';
import {
  describeDifficulty,
  describePapers,
  describeTestContent,
  examLabel,
  isGeneratedTitle,
  meaningfulCategories,
  suggestedTitle,
} from './test-provenance';
import type { NexusTestContentSummary } from '@neram/database';

const summary = (over: Partial<NexusTestContentSummary> = {}): NexusTestContentSummary => ({
  v: 1,
  question_count: 10,
  generated: 'backfill',
  ...over,
});

const LABELS = {
  aptitude: 'Aptitude',
  puzzle: 'Puzzles',
  spatial_visualization: 'Spatial visualisation',
  architecture_gk: 'Architecture GK',
};

describe('examLabel', () => {
  it('expands the stored enum codes', () => {
    expect(examLabel('JEE_PAPER_2')).toBe('JEE Paper 2');
  });

  it('falls back to a de-underscored code rather than a blank', () => {
    expect(examLabel('SOME_NEW_EXAM')).toBe('SOME NEW EXAM');
    expect(examLabel(null)).toBe('');
  });
});

describe('meaningfulCategories', () => {
  /**
   * The production case this rule exists for. YahulKishore's 544-question paper
   * tags every single question `aptitude`, so "mostly Aptitude" is true of the
   * entire question bank and tells a teacher strictly nothing.
   */
  it('drops a category that covers the whole paper', () => {
    const cats = meaningfulCategories(
      summary({
        question_count: 544,
        categories: [
          { slug: 'aptitude', n: 544 },
          { slug: 'architecture_gk', n: 113 },
        ],
      }),
    );
    expect(cats.map((c) => c.slug)).toEqual(['architecture_gk']);
  });

  // Dropping the umbrella must not leave the row with nothing to say.
  it('keeps the umbrella when it is the only category there is', () => {
    const cats = meaningfulCategories(
      summary({ question_count: 85, categories: [{ slug: 'aptitude', n: 85 }] }),
    );
    expect(cats.map((c) => c.slug)).toEqual(['aptitude']);
  });

  it('keeps everything when nothing covers the whole paper', () => {
    const cats = meaningfulCategories(
      summary({ question_count: 10, categories: [{ slug: 'puzzle', n: 8 }, { slug: 'analogy', n: 3 }] }),
    );
    expect(cats).toHaveLength(2);
  });

  it('returns an empty list rather than throwing on a summary with no categories', () => {
    expect(meaningfulCategories(summary())).toEqual([]);
  });
});

describe('describePapers', () => {
  it('names a single paper with its year', () => {
    expect(describePapers(summary({ papers: [{ exam_type: 'JEE_PAPER_2', year: 2009, session: null, n: 50 }] })))
      .toBe('JEE Paper 2 2009');
  });

  it('includes the session when a year has more than one sitting', () => {
    expect(
      describePapers(summary({ papers: [{ exam_type: 'NATA', year: 2025, session: 'Session 1', n: 2 }] })),
    ).toBe('NATA 2025 Session 1');
  });

  // Eleven comma-separated years is not something anyone reads.
  it('collapses many years of one exam into a range', () => {
    const papers = [2005, 2008, 2009, 2011, 2014].map((year) => ({
      exam_type: 'JEE_PAPER_2',
      year,
      session: null,
      n: 10,
    }));
    expect(describePapers(summary({ papers }))).toBe('JEE Paper 2, 2005 to 2014');
  });

  it('lists exams when there is more than one', () => {
    expect(
      describePapers(
        summary({
          papers: [
            { exam_type: 'JEE_PAPER_2', year: 2009, session: null, n: 5 },
            { exam_type: 'NATA', year: 2025, session: null, n: 5 },
          ],
        }),
      ),
    ).toBe('JEE Paper 2, NATA');
  });

  it('is blank when nothing is known', () => {
    expect(describePapers(summary())).toBe('');
  });
});

describe('describeDifficulty', () => {
  it('names the dominant level', () => {
    expect(describeDifficulty(summary({ difficulty: { MEDIUM: 9, HARD: 1 } }))).toBe('medium');
  });

  it('says mixed when no level holds a clear majority', () => {
    expect(describeDifficulty(summary({ difficulty: { MEDIUM: 5, HARD: 5 } }))).toBe('mixed difficulty');
  });

  it('is blank when nothing is known', () => {
    expect(describeDifficulty(summary())).toBe('');
  });
});

describe('describeTestContent', () => {
  it('builds the full line', () => {
    const line = describeTestContent(
      summary({
        question_count: 50,
        papers: [{ exam_type: 'JEE_PAPER_2', year: 2009, session: null, n: 50 }],
        categories: [{ slug: 'spatial_visualization', n: 15 }, { slug: 'architecture_gk', n: 9 }],
        difficulty: { MEDIUM: 50 },
      }),
      LABELS,
    );
    expect(line).toBe('JEE Paper 2 2009 · 50 questions · mostly Spatial visualisation and Architecture GK · medium');
  });

  // The point of the whole feature: even a summary with nothing but a count
  // beats the stored title "Practice - 0 questions" on a 544-question paper.
  it('still says something useful when only the count is known', () => {
    expect(describeTestContent(summary({ question_count: 27 }))).toBe('27 questions');
  });

  it('humanises a slug that has no label', () => {
    const line = describeTestContent(
      summary({ question_count: 10, categories: [{ slug: 'odd_one_out', n: 4 }] }),
      {},
    );
    expect(line).toContain('mostly Odd one out');
  });

  it('is blank for a summary that does not exist yet', () => {
    expect(describeTestContent(null)).toBe('');
    expect(describeTestContent(undefined)).toBe('');
  });

  it('says question, not questions, for one', () => {
    expect(describeTestContent(summary({ question_count: 1 }))).toBe('1 question');
  });
});

describe('isGeneratedTitle', () => {
  it.each([
    'Practice - 10 questions',
    'JEE Paper 2 2009 Practice - 50 questions',
    'Practice - 0 questions',
    'Practice - 1 questions',
    'My practice test (12)',
  ])('treats %s as generated', (title) => {
    expect(isGeneratedTitle(title)).toBe(true);
  });

  // A name the student typed is the most informative thing on the row.
  it.each(['Puzzle Test', 'Weak topics revision', 'Fix my mistakes (20)'])(
    'treats %s as chosen',
    (title) => {
      expect(isGeneratedTitle(title)).toBe(false);
    },
  );

  it('treats an absent title as generated so the row falls back to the derived line', () => {
    expect(isGeneratedTitle(null)).toBe(true);
    expect(isGeneratedTitle('')).toBe(true);
  });
});

describe('suggestedTitle', () => {
  it('offers a name built from the paper and its leading topic', () => {
    expect(
      suggestedTitle(
        summary({
          question_count: 50,
          papers: [{ exam_type: 'JEE_PAPER_2', year: 2009, session: null, n: 50 }],
          categories: [{ slug: 'spatial_visualization', n: 15 }],
        }),
        LABELS,
      ),
    ).toBe('JEE Paper 2 2009, Spatial visualisation (50 Q)');
  });

  it('returns null when there is nothing to build a name from', () => {
    expect(suggestedTitle(summary({ question_count: 10 }))).toBeNull();
    expect(suggestedTitle(summary({ question_count: 0 }))).toBeNull();
    expect(suggestedTitle(null)).toBeNull();
  });
});
