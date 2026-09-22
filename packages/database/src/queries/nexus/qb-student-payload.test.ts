/**
 * The two guarantees the student Question Bank list makes about its payload,
 * and the arithmetic behind the paper breakdown.
 *
 * The payload tests are the important ones. A browse response used to carry the
 * answer key: correct_answer and all four explanation fields travelled to the
 * browser on the practice list, so the answer was readable in the network tab
 * before the student answered. Narrowing the column list fixed most of it, and
 * options.is_correct was the part narrowing could not reach. If either of these
 * regresses the leak comes back silently, which is exactly why they are pinned
 * here rather than left to review.
 */

import { describe, it, expect } from 'vitest';
import {
  QB_LIST_COLUMNS,
  solutionVideosOf,
  stripDrawingPartSolutions,
  stripOptionAnswers,
  stripStudentListSolutions,
  studentSolutionFilter,
} from './question-bank';
import { sectionProgress } from './qb-papers';
import { QB_SECTION_ORDER, type NexusQBPaperSectionRow } from '../../types';

describe('QB_LIST_COLUMNS', () => {
  const columns = QB_LIST_COLUMNS.split(',').map((c) => c.trim());

  it.each([
    'correct_answer',
    'explanation_brief',
    'explanation_detailed',
    'explanation_brief_hi',
    'explanation_detailed_hi',
  ])('does not ship %s to a browse response', (col) => {
    expect(columns).not.toContain(col);
  });

  it.each([
    'search_vector_public',
    'search_vector_full',
    'search_doc_norm',
    'question_text_norm',
  ])('does not ship the search scaffolding column %s', (col) => {
    // Two thirds of a question row by weight, and nothing renders any of it.
    expect(columns).not.toContain(col);
  });

  it.each([
    'id',
    'question_text',
    'question_image_url',
    'question_format',
    'options',
    'categories',
    'difficulty',
    'topic_id',
    'display_order',
    'created_at',
  ])('still ships %s, which the list card reads', (col) => {
    expect(columns).toContain(col);
  });

  it('keeps created_at, because the browse order sorts on it', () => {
    expect(columns).toContain('created_at');
  });
});

describe('stripOptionAnswers', () => {
  it('removes is_correct while leaving everything the card renders', () => {
    const options = [
      { id: 'a', text: '12 m²', image_url: null, is_correct: false },
      { id: 'b', text: '16 m²', image_url: null, is_correct: true },
    ];

    const stripped = stripOptionAnswers(options) as Record<string, unknown>[];

    expect(stripped.every((o) => !('is_correct' in o))).toBe(true);
    expect(stripped.map((o) => o.text)).toEqual(['12 m²', '16 m²']);
    expect(stripped.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const options = [{ id: 'a', text: 'x', is_correct: true }];
    stripOptionAnswers(options);
    expect(options[0]).toHaveProperty('is_correct');
  });

  it('passes through anything that is not an option array', () => {
    expect(stripOptionAnswers(null)).toBeNull();
    expect(stripOptionAnswers(undefined)).toBeUndefined();
    // A drawing question carries no options at all.
    expect(stripOptionAnswers([])).toEqual([]);
  });
});

describe('stripDrawingPartSolutions', () => {
  const parts = {
    mode: 'any_one' as const,
    stem: null,
    stem_hi: null,
    items: [
      { id: 'a', label: 'A', text: 'Draw a balloon seller.', solution_image_url: 'https://cdn/a.png', solution_video_url: 'https://v/a' },
      { id: 'b', label: 'B', text: 'Draw village women.', solution_image_url: 'https://cdn/b.png' },
    ],
  };

  it('keeps what a student may read and drops every part solution', () => {
    const stripped = stripDrawingPartSolutions(parts)!;
    expect(stripped.items.map((p) => p.text)).toEqual(['Draw a balloon seller.', 'Draw village women.']);
    expect(JSON.stringify(stripped)).not.toContain('https://');
  });

  it('reads anything that is not a parts object as null', () => {
    expect(stripDrawingPartSolutions(null)).toBeNull();
    expect(stripDrawingPartSolutions({ mode: 'all' })).toBeNull();
    expect(stripDrawingPartSolutions('parts')).toBeNull();
  });

  it('ships drawing_parts in the list columns, where it is stripped', () => {
    expect(QB_LIST_COLUMNS.split(',').map((c) => c.trim())).toContain('drawing_parts');
  });
});

describe('solutionVideosOf', () => {
  it('returns the question video for an ordinary question', () => {
    expect(solutionVideosOf({ solution_video_url: 'https://youtu.be/xrKukhHIt0A' })).toEqual([
      { label: null, url: 'https://youtu.be/xrKukhHIt0A' },
    ]);
  });

  it('returns nothing for a blank or missing video', () => {
    expect(solutionVideosOf({ solution_video_url: null })).toEqual([]);
    expect(solutionVideosOf({ solution_video_url: '   ' })).toEqual([]);
    expect(solutionVideosOf({})).toEqual([]);
  });

  it('lists a split drawing per part, not the mirrored question column as well', () => {
    // The question column is a copy of part A's video (mirroredPartSolution),
    // so counting both would list the same video twice.
    const videos = solutionVideosOf({
      solution_video_url: 'https://v/a',
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'x', solution_video_url: 'https://v/a' },
          { id: 'b', label: 'B', text: 'y', solution_video_url: '' },
          { id: 'c', label: 'C', text: 'z', solution_video_url: 'https://v/c' },
        ],
      },
    });
    expect(videos).toEqual([
      { label: 'A', url: 'https://v/a' },
      { label: 'C', url: 'https://v/c' },
    ]);
  });

  it('ignores a parts value that is not a parts object', () => {
    expect(solutionVideosOf({ solution_video_url: 'https://v/q', drawing_parts: { mode: 'all' } })).toEqual([
      { label: null, url: 'https://v/q' },
    ]);
  });
});

describe('stripStudentListSolutions', () => {
  const row = {
    id: 'q1',
    question_text: 'Find x',
    solution_video_url: 'https://youtu.be/xrKukhHIt0A',
    options: [{ id: 'a', text: '1', is_correct: true }],
    drawing_parts: null,
  };

  it('says a video exists without shipping its link', () => {
    const item = stripStudentListSolutions(row);
    expect(item.has_solution_video).toBe(true);
    expect('solution_video_url' in item).toBe(false);
    expect(JSON.stringify(item)).not.toContain('youtu');
  });

  it('flags a drawing whose only video is on a part', () => {
    const item = stripStudentListSolutions({
      id: 'q2',
      solution_video_url: null,
      options: null,
      drawing_parts: {
        mode: 'all',
        items: [
          { id: 'a', label: 'A', text: 'x', solution_video_url: 'https://v/a' },
          { id: 'b', label: 'B', text: 'y' },
        ],
      },
    });
    expect(item.has_solution_video).toBe(true);
    expect(JSON.stringify(item)).not.toContain('https://');
  });

  it('still strips the answer key and part solutions', () => {
    const item = stripStudentListSolutions(row);
    expect((item.options as Record<string, unknown>[])[0]).not.toHaveProperty('is_correct');
  });

  it('reports no video honestly', () => {
    expect(stripStudentListSolutions({ ...row, solution_video_url: null }).has_solution_video).toBe(false);
  });

  it('lets a student narrow to questions with a video, and to nothing else', () => {
    expect(studentSolutionFilter('has_video')).toBe('has_video');
    // "Has an explanation" or "no solution" is a teacher's work queue, not a
    // practice lens, so a hand-edited student URL cannot reach it.
    expect(studentSolutionFilter('has_explanation')).toBeUndefined();
    expect(studentSolutionFilter('no_solution')).toBeUndefined();
    expect(studentSolutionFilter(undefined)).toBeUndefined();
  });

  it('selects solution_video_url in the list columns, where it is reduced to a flag', () => {
    expect(QB_LIST_COLUMNS.split(',').map((c) => c.trim())).toContain('solution_video_url');
  });
});

describe('sectionProgress', () => {
  const row = (
    n: number,
    section: NexusQBPaperSectionRow['section'],
  ): NexusQBPaperSectionRow => ({
    id: `q${n}`,
    question_number: n,
    question_format: 'MCQ',
    section,
    section_order: section ? QB_SECTION_ORDER[section] : null,
  });

  const paper = [
    ...Array.from({ length: 12 }, (_, i) => row(i + 1, 'math_mcq')),
    ...Array.from({ length: 30 }, (_, i) => row(i + 13, 'aptitude')),
    ...Array.from({ length: 5 }, (_, i) => row(i + 43, 'drawing')),
  ];

  it('counts attempts into the run each question belongs to', () => {
    // Two maths, one aptitude, no drawing.
    const attempted = new Set(['q1', 'q2', 'q20']);
    const runs = sectionProgress(paper, attempted);

    expect(runs.map((r) => [r.label, r.attempted, r.count])).toEqual([
      ['Mathematics (MCQ)', 2, 12],
      ['Aptitude', 1, 30],
      ['Drawing', 0, 5],
    ]);
  });

  it('reports nothing attempted for a student who has not started', () => {
    const runs = sectionProgress(paper, new Set());
    expect(runs.every((r) => r.attempted === 0)).toBe(true);
    expect(runs.reduce((n, r) => n + r.count, 0)).toBe(47);
  });

  it('never counts a question into more than one run', () => {
    const attempted = new Set(paper.map((r) => r.id));
    const runs = sectionProgress(paper, attempted);
    expect(runs.reduce((n, r) => n + r.attempted, 0)).toBe(paper.length);
  });

  it('keeps interleaved sections as separate runs rather than merging them', () => {
    // A paper classified oddly produces several runs for one section. That is a
    // signal worth showing, not something to tidy away, and the counts still
    // have to land in the right run.
    const odd = [row(1, 'aptitude'), row(2, 'math_mcq'), row(3, 'aptitude')];
    const runs = sectionProgress(odd, new Set(['q3']));

    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.attempted)).toEqual([0, 0, 1]);
  });

  it('returns nothing for a paper whose questions carry no sections yet', () => {
    expect(sectionProgress([], new Set())).toEqual([]);
  });
});
