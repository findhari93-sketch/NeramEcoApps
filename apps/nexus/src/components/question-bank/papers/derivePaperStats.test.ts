import { describe, it, expect } from 'vitest';
import { derivePaperStats, paperBucket } from './derivePaperStats';
import { countBuckets, queryPapers, toRows } from './paperFilters';
import type { PaperWithBreakdown } from './paperTypes';

function makePaper(overrides: Partial<PaperWithBreakdown> = {}): PaperWithBreakdown {
  return {
    id: 'p1',
    exam_type: 'JEE_PAPER_2',
    year: 2024,
    session: null,
    shift: null,
    pdf_url: null,
    total_questions: null,
    total_marks: null,
    duration_minutes: null,
    uploaded_by: null,
    upload_status: 'parsed',
    questions_parsed: 0,
    questions_answer_keyed: 0,
    questions_complete: 0,
    created_at: '2026-03-25T07:00:00.000Z',
    study_file_id: null,
    is_student_visible: false,
    paper_source: 'official',
    exam_date: null,
    contributor_summary: [],
    ...overrides,
  } as PaperWithBreakdown;
}

describe('derivePaperStats', () => {
  it('splits a part-finished paper into progress-bar segments', () => {
    const stats = derivePaperStats(
      makePaper({ questions_parsed: 92, questions_answer_keyed: 88, questions_complete: 60, active_count: 40 }),
    );

    expect(stats.total).toBe(92);
    expect(stats.draft).toBe(4); // parsed but no answer yet
    expect(stats.answerKeyedOnly).toBe(28); // keyed but not complete
    expect(stats.activatable).toBe(48); // keyed minus already active
    expect(stats.readiness).toBeCloseTo(88 / 92);
  });

  it('never reports a negative count when the roll-up disagrees with itself', () => {
    // active_count can exceed answer_keyed briefly: they come from two queries,
    // and a bare subtraction would render "Activate -5".
    const stats = derivePaperStats(
      makePaper({ questions_parsed: 10, questions_answer_keyed: 4, questions_complete: 8, active_count: 9 }),
    );

    expect(stats.draft).toBe(6);
    expect(stats.answerKeyedOnly).toBe(0);
    expect(stats.activatable).toBe(0);
  });

  it('builds the label from exam, year, session and shift', () => {
    const stats = derivePaperStats(makePaper({ session: 'Session 1', shift: 'forenoon' }));
    expect(stats.paperLabel).toBe('JEE Paper 2 2024 Session 1 (Forenoon)');
  });

  it('omits the variant parts a paper does not have', () => {
    expect(derivePaperStats(makePaper()).paperLabel).toBe('JEE Paper 2 2024');
  });

  it('treats an empty paper as zero readiness rather than dividing by zero', () => {
    const stats = derivePaperStats(makePaper({ questions_parsed: 0 }));
    expect(stats.readiness).toBe(0);
    expect(stats.readyForStudents).toBe(false);
  });

  it('counts a linked PDF alone as something students can be given', () => {
    const stats = derivePaperStats(makePaper({ questions_parsed: 0, study_file_id: 'file-1' }));
    expect(stats.readyForStudents).toBe(true);
    expect(stats.hasPdf).toBe(true);
  });
});

describe('paperBucket', () => {
  const bucketOf = (p: PaperWithBreakdown) => paperBucket(p, derivePaperStats(p));

  it('calls a published paper live regardless of its contents', () => {
    expect(bucketOf(makePaper({ is_student_visible: true, questions_parsed: 0 }))).toBe('live');
  });

  it('calls an unpublished paper with active questions ready', () => {
    expect(bucketOf(makePaper({ questions_parsed: 10, questions_answer_keyed: 10, active_count: 10 }))).toBe('ready');
  });

  it('calls a paper with questions but nothing active needs work', () => {
    expect(bucketOf(makePaper({ questions_parsed: 82 }))).toBe('needsWork');
  });

  it('calls a paper with no questions and no PDF empty', () => {
    expect(bucketOf(makePaper())).toBe('empty');
  });

  it('puts every paper in exactly one bucket', () => {
    const papers = [
      makePaper({ id: 'a', is_student_visible: true }),
      makePaper({ id: 'b', questions_parsed: 10, questions_answer_keyed: 10, active_count: 10 }),
      makePaper({ id: 'c', questions_parsed: 82 }),
      makePaper({ id: 'd' }),
    ];
    const counts = countBuckets(toRows(papers));

    expect(counts.all).toBe(4);
    expect(counts.live + counts.ready + counts.needsWork + counts.empty).toBe(counts.all);
  });
});

describe('queryPapers', () => {
  const papers = [
    makePaper({ id: 'jee26', year: 2026, questions_parsed: 77, questions_answer_keyed: 74, active_count: 74 }),
    makePaper({ id: 'nata25', exam_type: 'NATA', year: 2025, created_at: '2026-04-15T00:00:00.000Z' }),
    makePaper({ id: 'jee24', year: 2024, session: 'Session 1', questions_parsed: 82, created_at: '2026-04-17T00:00:00.000Z' }),
  ];
  const rows = toRows(papers);
  const ids = (list: ReturnType<typeof toRows>) => list.map((r) => r.paper.id);

  it('matches on exam name, year and session', () => {
    expect(ids(queryPapers(rows, { search: 'nata', status: 'all', sort: 'recent' }))).toEqual(['nata25']);
    expect(ids(queryPapers(rows, { search: '2024', status: 'all', sort: 'recent' }))).toEqual(['jee24']);
    expect(ids(queryPapers(rows, { search: 'session 1', status: 'all', sort: 'recent' }))).toEqual(['jee24']);
  });

  it('requires every word to match, so a second word narrows', () => {
    expect(ids(queryPapers(rows, { search: 'jee 2026', status: 'all', sort: 'recent' }))).toEqual(['jee26']);
    expect(queryPapers(rows, { search: 'nata 2026', status: 'all', sort: 'recent' })).toHaveLength(0);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(ids(queryPapers(rows, { search: '  NaTa  ', status: 'all', sort: 'recent' }))).toEqual(['nata25']);
  });

  it('filters by status bucket', () => {
    expect(ids(queryPapers(rows, { search: '', status: 'ready', sort: 'recent' }))).toEqual(['jee26']);
    expect(ids(queryPapers(rows, { search: '', status: 'empty', sort: 'recent' }))).toEqual(['nata25']);
  });

  it('sorts newest upload first by default', () => {
    expect(ids(queryPapers(rows, { search: '', status: 'all', sort: 'recent' }))).toEqual(['jee24', 'nata25', 'jee26']);
  });

  it('sorts by exam year, most questions and least ready', () => {
    expect(ids(queryPapers(rows, { search: '', status: 'all', sort: 'year' }))).toEqual(['jee26', 'nata25', 'jee24']);
    expect(ids(queryPapers(rows, { search: '', status: 'all', sort: 'questions' }))).toEqual(['jee24', 'jee26', 'nata25']);
    // nata25 and jee24 are both at zero readiness, so the bigger backlog leads.
    expect(ids(queryPapers(rows, { search: '', status: 'all', sort: 'leastReady' }))).toEqual(['jee24', 'nata25', 'jee26']);
  });

  it('does not reorder the array it was given', () => {
    queryPapers(rows, { search: '', status: 'all', sort: 'year' });
    expect(ids(rows)).toEqual(['jee26', 'nata25', 'jee24']);
  });
});
