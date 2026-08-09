import { describe, it, expect } from 'vitest';
import { partitionForPublish, paperLabel } from './qb-papers';
import type { NexusQBOriginalPaper } from '../../types';

/**
 * Publishing a paper is a separate decision from parsing one.
 *
 * The teacher list shows `upload_status`: "Parsed in full", "Answers added".
 * Those read like completion, so a bank can sit fully parsed and entirely
 * invisible to students, which is exactly what happened in production: 26
 * papers, 0 published. "Publish all ready" exists to close that gap in one
 * press, and this is the gate it applies.
 *
 * The gate must match `paperPublishBlocker`, because a paper published with
 * neither questions nor a PDF draws a card whose Read, Practice and Test faces
 * are all dead, which is a worse answer than not showing it at all.
 */

const paper = (over: Partial<NexusQBOriginalPaper> = {}): NexusQBOriginalPaper =>
  ({
    id: 'p1',
    exam_type: 'JEE_PAPER_2',
    year: 2019,
    session: null,
    shift: null,
    study_file_id: null,
    is_student_visible: false,
    ...over,
  }) as NexusQBOriginalPaper;

const withQuestions = () => true;
const withoutQuestions = () => false;

describe('partitionForPublish', () => {
  it('publishes a paper that has questions', () => {
    const r = partitionForPublish([paper()], withQuestions);
    expect(r.ready).toEqual(['p1']);
    expect(r.skipped).toEqual([]);
  });

  it('publishes a question-less paper once a PDF is linked', () => {
    // The 2015-2024 gap in production: no questions parsed, but linking the PDF
    // is enough to give students the Read face, so it must not be skipped.
    const r = partitionForPublish([paper({ study_file_id: 'file-1' })], withoutQuestions);
    expect(r.ready).toEqual(['p1']);
  });

  it('skips a paper with neither, rather than drawing a dead card', () => {
    const r = partitionForPublish([paper()], withoutQuestions);
    expect(r.ready).toEqual([]);
    expect(r.skipped).toEqual([{ id: 'p1', label: 'JEE_PAPER_2 2019' }]);
  });

  it('counts an already published paper without republishing it', () => {
    const r = partitionForPublish([paper({ is_student_visible: true })], withQuestions);
    expect(r.ready).toEqual([]);
    expect(r.alreadyVisible).toBe(1);
  });

  it('never unpublishes: a live paper with nothing to show is left alone', () => {
    // Taking something away from students who may have started it should never
    // be a side effect of a bulk publish.
    const r = partitionForPublish([paper({ is_student_visible: true })], withoutQuestions);
    expect(r.skipped).toEqual([]);
    expect(r.alreadyVisible).toBe(1);
  });

  it('one unready paper does not sink the batch', () => {
    const r = partitionForPublish(
      [paper({ id: 'good' }), paper({ id: 'bad' })],
      (p) => p.id === 'good',
    );
    expect(r.ready).toEqual(['good']);
    expect(r.skipped.map((s) => s.id)).toEqual(['bad']);
  });
});

describe('paperLabel', () => {
  it('names a plain paper by exam and year', () => {
    expect(paperLabel(paper())).toBe('JEE_PAPER_2 2019');
  });

  it('distinguishes the two shifts of one session, which is the whole point', () => {
    const fn = paperLabel(paper({ session: 'Session 1', shift: 'forenoon' }));
    const an = paperLabel(paper({ session: 'Session 1', shift: 'afternoon' }));
    expect(fn).toBe('JEE_PAPER_2 2019 Session 1 forenoon');
    expect(an).not.toBe(fn);
  });
});
