import { describe, expect, it } from 'vitest';
import { buildPracticeQuery, type PracticeUrlState } from './qb-practice-url';

const state = (over: Partial<PracticeUrlState> = {}): PracticeUrlState => ({
  filters: {},
  exam: 'JEE_PAPER_2',
  year: 2014,
  session: null,
  qid: null,
  ...over,
});

describe('buildPracticeQuery', () => {
  it('keeps the sitting, section and classroom a paper link carried', () => {
    const current = 'exam=JEE_PAPER_2&year=2014&shift=AN&classroom_id=c1&section=aptitude';
    expect(buildPracticeQuery(current, state())).toBe(
      'exam=JEE_PAPER_2&year=2014&shift=AN&classroom_id=c1&section=aptitude',
    );
  });

  it('keeps paper_source for a recalled paper', () => {
    const current = 'exam=NATA&session=April&paper_source=recalled';
    expect(buildPracticeQuery(current, state({ exam: 'NATA', year: null, session: 'April' }))).toBe(
      'exam=NATA&session=April&paper_source=recalled',
    );
  });

  it('writes the open question as qid, leaving q to the search', () => {
    const qs = buildPracticeQuery('exam=JEE_PAPER_2&year=2014', state({ qid: 'abc', filters: { search_text: 'limit' } }));
    const params = new URLSearchParams(qs);
    expect(params.get('qid')).toBe('abc');
    expect(params.get('q')).toBe('limit');
  });

  it('clears qid when no question is open', () => {
    expect(buildPracticeQuery('exam=JEE_PAPER_2&year=2014&qid=abc', state())).toBe('exam=JEE_PAPER_2&year=2014');
  });

  it('replaces filters rather than keeping stale ones', () => {
    const qs = buildPracticeQuery('exam=JEE_PAPER_2&year=2014&diff=EASY&video=1', state({ filters: { difficulty: ['HARD'] } }));
    const params = new URLSearchParams(qs);
    expect(params.get('diff')).toBe('HARD');
    expect(params.get('video')).toBeNull();
  });

  it('drops a preset once it has been applied', () => {
    expect(buildPracticeQuery('preset=p1', state({ exam: null, year: null }), ['preset'])).toBe('');
  });

  it('gives the same string for the same state, so a sync effect settles', () => {
    const once = buildPracticeQuery('exam=JEE_PAPER_2&year=2014&shift=AN', state({ qid: 'x', filters: { difficulty: ['EASY'] } }));
    expect(buildPracticeQuery(once, state({ qid: 'x', filters: { difficulty: ['EASY'] } }))).toBe(once);
  });
});
