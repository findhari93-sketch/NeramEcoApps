import { describe, expect, it } from 'vitest';
import type { NexusQBQuestionSource, QBQuestionSection } from '@neram/database';
import {
  displayNumbers,
  matchingSource,
  paperNumberOf,
  practiceScopeOf,
  sortForPaper,
  sourceLabel,
  type PaperContext,
} from './qb-paper-number';

const JEE_2014: PaperContext = { exam: 'JEE_PAPER_2', year: 2014, session: null, shift: null };

function src(over: Partial<NexusQBQuestionSource>): NexusQBQuestionSource {
  return {
    id: `s-${Math.random()}`,
    question_id: 'q',
    exam_type: 'JEE_PAPER_2',
    year: 2014,
    session: null,
    shift: null,
    question_number: null,
    created_at: '2026-01-01',
    ...over,
  } as NexusQBQuestionSource;
}

function item(
  id: string,
  over: { sources?: NexusQBQuestionSource[]; display_order?: number | null; section_order?: number | null; section?: QBQuestionSection | null } = {},
) {
  return {
    id,
    sources: over.sources ?? [],
    display_order: over.display_order ?? null,
    section_order: over.section_order ?? null,
    section: over.section ?? null,
  };
}

describe('practiceScopeOf', () => {
  it('is a paper only with an exam and a year', () => {
    expect(practiceScopeOf(JEE_2014)).toBe('paper');
    expect(practiceScopeOf({ ...JEE_2014, year: null })).toBe('exam');
    expect(practiceScopeOf({ exam: null, year: null, session: null, shift: null })).toBe('bank');
  });
});

describe('matchingSource', () => {
  it('picks the source for the paper on screen, not the first one', () => {
    const sources = [src({ year: 2019, question_number: 41 }), src({ year: 2014, question_number: 18 })];
    expect(matchingSource(sources, JEE_2014)?.question_number).toBe(18);
  });

  it('narrows by session and shift when the paper names them', () => {
    const sources = [
      src({ session: '1', shift: 'forenoon', question_number: 5 }),
      src({ session: '1', shift: 'afternoon', question_number: 9 }),
    ];
    expect(matchingSource(sources, { ...JEE_2014, session: '1', shift: 'afternoon' })?.question_number).toBe(9);
  });

  it('prefers a matching source that carries a number', () => {
    const sources = [src({ question_number: null }), src({ question_number: 7 })];
    expect(matchingSource(sources, JEE_2014)?.question_number).toBe(7);
  });

  it('is null with no sources', () => {
    expect(matchingSource([], JEE_2014)).toBeNull();
    expect(matchingSource(undefined, JEE_2014)).toBeNull();
  });
});

describe('paperNumberOf', () => {
  it('reads the source number first', () => {
    expect(paperNumberOf(item('a', { sources: [src({ question_number: 18 })], display_order: 3 }), JEE_2014)).toBe(18);
  });

  it('falls back to display_order when the source has no number', () => {
    expect(paperNumberOf(item('a', { sources: [src({})], display_order: 12 }), JEE_2014)).toBe(12);
  });

  it('has no number outside a paper', () => {
    const q = item('a', { sources: [src({ question_number: 18 })], display_order: 18 });
    expect(paperNumberOf(q, { ...JEE_2014, year: null })).toBeNull();
  });
});

describe('displayNumbers', () => {
  it('uses the paper number, or the position when there is none', () => {
    const items = [item('a', { display_order: 18 }), item('b')];
    const numbers = displayNumbers(items, JEE_2014);
    expect(numbers.get('a')).toBe(18);
    expect(numbers.get('b')).toBe(2);
  });

  it('numbers by position when sittings repeat the same numbers', () => {
    // NATA 2025: three sittings in one year, each starting at 1.
    const items = [
      item('a', { display_order: 1, section: 'aptitude' }),
      item('b', { display_order: 2, section: 'aptitude' }),
      item('c', { display_order: 2, section: 'aptitude' }),
    ];
    expect([...displayNumbers(items, JEE_2014).values()]).toEqual([1, 2, 3]);
  });

  it('keeps paper numbers that restart per section', () => {
    const items = [
      item('m1', { display_order: 1, section: 'math_mcq' }),
      item('a1', { display_order: 1, section: 'aptitude' }),
      item('a2', { display_order: 2, section: 'aptitude' }),
    ];
    expect([...displayNumbers(items, JEE_2014).values()]).toEqual([1, 1, 2]);
  });

  it('numbers by position across a whole exam', () => {
    const items = [item('a', { display_order: 18 }), item('b', { display_order: 4 })];
    const numbers = displayNumbers(items, { ...JEE_2014, year: null });
    expect([numbers.get('a'), numbers.get('b')]).toEqual([1, 2]);
  });
});

describe('sortForPaper', () => {
  it('orders by section, then number', () => {
    const items = [
      item('apt-1', { display_order: 1, section_order: 2 }),
      item('math-2', { display_order: 2, section_order: 1 }),
      item('math-1', { display_order: 1, section_order: 1 }),
    ];
    expect(sortForPaper(items, JEE_2014).map((i) => i.id)).toEqual(['math-1', 'math-2', 'apt-1']);
  });

  it('keeps the server order for questions with neither key', () => {
    const items = [item('x'), item('y'), item('z')];
    expect(sortForPaper(items, JEE_2014).map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('sourceLabel', () => {
  it('names the exam, year, session and number', () => {
    expect(sourceLabel(item('a', { sources: [src({ session: '2', question_number: 18 })] }))).toBe('JEE 2014 S2 Q18');
    expect(sourceLabel(item('a', { sources: [src({ exam_type: 'NATA', year: 2023 })] }))).toBe('NATA 2023');
    expect(sourceLabel(item('a'))).toBeNull();
  });
});
