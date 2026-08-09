import { describe, it, expect } from 'vitest';
import { originForParsedQuestion, buildPaperBreakdowns } from './question-bank';
import type { PaperBreakdownRow } from './question-bank';
import type { NexusQBOriginalPaper } from '../../types';

/**
 * `origin` is how a teacher tells a real past paper question apart from one
 * written for a chapter test or a recap. The column has existed since
 * 20260713180000 and was populated by a one-time backfill; the upload path never
 * set it, so it fell to the DEFAULT 'authored'.
 *
 * Nothing had been uploaded since the backfill, so production looked coherent
 * (2002 pyq, all with a paper) purely by luck. The moment a paper was uploaded,
 * every question in it would have been labelled "written in-house" while sitting
 * under a year heading, and no error would have said so.
 */
describe('originForParsedQuestion', () => {
  it('marks a parsed paper question as a past paper question', () => {
    expect(originForParsedQuestion('MCQ')).toBe('pyq');
    expect(originForParsedQuestion('NUMERICAL')).toBe('pyq');
    expect(originForParsedQuestion('IMAGE_BASED')).toBe('pyq');
  });

  it('leaves a drawing prompt authored, matching the 20260713180000 backfill', () => {
    // Drawing questions carry a year source but are teacher-curated practice
    // rather than a reproduced exam question. Production has 145 of these, all
    // deliberately 'authored', and this rule is what keeps that true.
    expect(originForParsedQuestion('DRAWING_PROMPT')).toBe('authored');
  });
});

const paper = (id: string): NexusQBOriginalPaper =>
  ({ id, exam_type: 'JEE_PAPER_2', year: 2019 }) as NexusQBOriginalPaper;

const row = (over: Partial<PaperBreakdownRow> = {}): PaperBreakdownRow => ({
  original_paper_id: 'p1',
  categories: null,
  question_format: 'MCQ',
  is_active: true,
  status: 'active',
  question_text_hi: null,
  ...over,
});

describe('buildPaperBreakdowns', () => {
  it('counts a question once per category it carries', () => {
    const [p] = buildPaperBreakdowns([paper('p1')], [row({ categories: ['algebra', 'calculus'] })]);
    expect(p.section_breakdown).toEqual({ algebra: 1, calculus: 1 });
  });

  it('falls back to the format when a question has no categories', () => {
    const [p] = buildPaperBreakdowns([paper('p1')], [row({ question_format: 'DRAWING_PROMPT' })]);
    expect(p.section_breakdown).toEqual({ DRAWING_PROMPT: 1 });
  });

  it('requires both the flag and the status before calling a question active', () => {
    // `is_active` alone is not enough: a draft can be flagged active while its
    // status still says draft, and counting it would make the paper look ready
    // to publish when students would see nothing.
    const [p] = buildPaperBreakdowns([paper('p1')], [
      row({ is_active: true, status: 'active' }),
      row({ is_active: true, status: 'draft' }),
      row({ is_active: false, status: 'active' }),
    ]);
    expect(p.active_count).toBe(1);
  });

  it('counts Hindi translations separately', () => {
    const [p] = buildPaperBreakdowns([paper('p1')], [
      row({ question_text_hi: 'प्रश्न' }),
      row({ question_text_hi: null }),
    ]);
    expect(p.hindi_count).toBe(1);
  });

  it('returns every paper, including one with no questions at all', () => {
    // The 14 production papers with neither questions nor a PDF still have to
    // appear in the list, showing zero, or they look deleted rather than empty.
    const out = buildPaperBreakdowns([paper('p1'), paper('p2')], [row({ original_paper_id: 'p1' })]);
    expect(out.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(out[1].active_count).toBe(0);
    expect(out[1].section_breakdown).toEqual({});
  });

  it('ignores a question pointing at a paper that is not in the list', () => {
    const out = buildPaperBreakdowns([paper('p1')], [row({ original_paper_id: 'gone' })]);
    expect(out[0].section_breakdown).toEqual({});
  });
});
