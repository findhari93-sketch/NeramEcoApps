import { describe, it, expect } from 'vitest';
import {
  confirmedDuplicatePairs,
  coverageGap,
  draftHealthCounts,
  draftIssues,
  duplicatePairs,
  fingerprint,
  syllabusCoverage,
  toCheckable,
  unattachedImages,
  warningsByKey,
} from './test-draft-health';
import { REUSE_THRESHOLD, REVIEW_THRESHOLD, dedupeVerdict } from './qb-dedupe-bands';
import { structuralIssues } from './test-health';
import { emptyDraft, type DraftQuestion, type TestDraft } from './test-wizard-draft';

function draft(questions: DraftQuestion[], patch: Partial<TestDraft> = {}): TestDraft {
  return { ...emptyDraft('d1', '2026-08-08T10:00:00.000Z'), questions, ...patch };
}

function question(key: string, text: string, patch: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    key,
    bank_question_id: null,
    question_text: text,
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
    ],
    correct_answer: 'a',
    explanation: null,
    source_quote: null,
    image_ref: null,
    difficulty: 'MEDIUM',
    exam_relevance: 'BOTH',
    tag_ids: [],
    tag_slugs: [],
    new_tag_slugs: [],
    marks: 1,
    negative_marks: 0,
    action: 'create',
    existing_question_id: null,
    candidates: [],
    ...patch,
  };
}

describe('fingerprint matches the import parser, so one rule judges both', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(fingerprint('How MANY vanishing points?')).toBe(fingerprint('how many vanishing  points'));
  });
});

describe('duplicate detection', () => {
  it('catches an exact restatement dressed in different punctuation', () => {
    const pairs = duplicatePairs([
      question('a', 'How many vanishing points are there in two-point perspective?'),
      question('b', 'How many vanishing points are there in two point perspective'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].exact).toBe(true);
    expect(pairs[0].similarity).toBe(1);
    expect(pairs[0].verdict).toBe('likely_duplicate');
  });

  it('a reordered restatement is confident enough to call a duplicate', () => {
    const pairs = duplicatePairs([
      question('a', 'How many vanishing points are there in two-point perspective?'),
      question('b', 'In two-point perspective, how many vanishing points are there?'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].verdict).toBe('likely_duplicate');
  });

  /**
   * The pair of cases that decided the whole design. Measured on the real
   * implementation, the reworded duplicate scores 0.78 and the genuinely
   * distinct two-point/three-point pair scores 0.80, so the DISTINCT pair
   * outranks the DUPLICATE. Any single cutoff gets one of them wrong.
   */
  describe('the band below confident is never called a duplicate', () => {
    it('a one-word rewording is flagged for a look, not asserted as a duplicate', () => {
      const pairs = duplicatePairs([
        question('a', 'In two-point perspective, all vertical edges of a building remain parallel'),
        question('b', 'In two-point perspective, all vertical edges of a building stay parallel'),
      ]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].verdict).toBe('near_identical');
    });

    it('two-point versus three-point is NOT reported as a duplicate', () => {
      const qs = [
        question('a', 'In two-point perspective, how many vanishing points are used?'),
        question('b', 'In three-point perspective, how many vanishing points are used?'),
      ];
      expect(confirmedDuplicatePairs(qs)).toHaveLength(0);
      expect(duplicatePairs(qs)[0]?.verdict).toBe('near_identical');
    });

    it('so the rail counts neither of them', () => {
      const d = draft([
        question('a', 'In two-point perspective, how many vanishing points are used?'),
        question('b', 'In three-point perspective, how many vanishing points are used?'),
      ]);
      expect(draftHealthCounts(d).duplicates).toBe(0);
    });
  });

  it('leaves genuinely different questions alone', () => {
    expect(
      duplicatePairs([
        question('a', 'How many vanishing points are there in two-point perspective?'),
        question('b', 'A 12 m column at 1:50 scale measures how many cm on paper?'),
      ]),
    ).toHaveLength(0);
  });

  it('does not flag a question against itself', () => {
    expect(duplicatePairs([question('a', 'How many vanishing points?')])).toHaveLength(0);
  });

  it('ignores empty stems rather than calling them all duplicates of each other', () => {
    expect(duplicatePairs([question('a', ''), question('b', '')])).toHaveLength(0);
  });

  it('stays fast on a full-size paste', () => {
    const many = Array.from({ length: 200 }, (_, i) => question(`q${i}`, `Question number ${i} about perspective and scale`));
    const started = performance.now();
    duplicatePairs(many);
    expect(performance.now() - started).toBeLessThan(400);
  });
});

describe('the structural half is the shared checker, not a second copy', () => {
  it('agrees with structuralIssues on the same input', () => {
    const qs = [question('a', 'Fine'), question('b', 'No answer', { correct_answer: '' })];
    const viaShared = structuralIssues({
      question_count: qs.length,
      questions: qs.map(toCheckable),
      title: '',
    });
    const viaDraft = draftIssues(draft(qs));
    expect(viaDraft.some((i) => i.title === viaShared[0].title)).toBe(true);
  });

  it('reports an empty draft as unsittable', () => {
    const issues = draftIssues(draft([]));
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toMatch(/no questions/i);
  });

  it('a skipped row is not counted against the paper', () => {
    const issues = draftIssues(draft([question('a', 'Fine'), question('b', '', { action: 'skip', correct_answer: '' })]));
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('an image reference does not satisfy the has-text-or-image check', () => {
    const issues = draftIssues(draft([question('a', '', { image_ref: 'fig-7.png' })]));
    expect(issues.some((i) => /neither text nor an image/i.test(i.title))).toBe(true);
  });

  it('sorts errors above warnings', () => {
    const issues = draftIssues(
      draft([
        question('a', 'How many vanishing points are there?'),
        question('b', 'How many vanishing points are there'),
        question('c', 'Ungradeable', { correct_answer: '' }),
      ]),
    );
    expect(issues[0].severity).toBe('error');
  });
});

describe('the three fixed rail rows', () => {
  it('reports zeroes rather than omitting a check that passed', () => {
    expect(draftHealthCounts(draft([question('a', 'Fine')]))).toEqual({
      duplicates: 0,
      missingAnswer: 0,
      missingImage: 0,
    });
  });

  it('counts questions involved in a duplicate, not pairs', () => {
    const counts = draftHealthCounts(
      draft([
        question('a', 'How many vanishing points are there?'),
        question('b', 'How many vanishing points are there'),
      ]),
    );
    expect(counts.duplicates).toBe(2);
  });

  it('uses the same bands as the server dedupe, so one screen cannot disagree with itself', () => {
    expect(dedupeVerdict(REUSE_THRESHOLD)).toBe('likely_duplicate');
    expect(dedupeVerdict(REVIEW_THRESHOLD)).toBe('near_identical');
    expect(dedupeVerdict(REVIEW_THRESHOLD - 0.01)).toBe('similar');
  });

  it('counts missing answers and unattached images', () => {
    const counts = draftHealthCounts(
      draft([question('a', 'One', { correct_answer: '' }), question('b', 'Two', { image_ref: 'fig.png' })]),
    );
    expect(counts.missingAnswer).toBe(1);
    expect(counts.missingImage).toBe(1);
    expect(unattachedImages([question('b', 'Two', { image_ref: 'fig.png' })])).toHaveLength(1);
  });
});

describe('per-row warnings name the other question by its position on screen', () => {
  it('points each half of a duplicate pair at the other', () => {
    const w = warningsByKey(
      draft([
        question('a', 'How many vanishing points are there?'),
        question('b', 'Unrelated question about scale and proportion'),
        question('c', 'How many vanishing points are there'),
      ]),
    );
    expect(w.a[0].message).toBe('Duplicate of Q3, keep one');
    expect(w.c[0].message).toBe('Duplicate of Q1, keep one');
    expect(w.b).toBeUndefined();
  });

  it('softens the wording when the check is not confident, "keep one" has to be earned', () => {
    const w = warningsByKey(
      draft([
        question('a', 'In two-point perspective, how many vanishing points are used?'),
        question('b', 'In three-point perspective, how many vanishing points are used?'),
      ]),
    );
    expect(w.a[0].kind).toBe('near_identical');
    expect(w.a[0].message).toBe('Worded very like Q2, check they differ');
  });

  it('flags an unmarkable question and a choice with no choices', () => {
    const w = warningsByKey(draft([question('a', 'Broken', { correct_answer: '', options: null })]));
    expect(w.a.map((x) => x.kind).sort()).toEqual(['no_answer', 'no_options']);
  });
});

describe('syllabus coverage', () => {
  it('counts a question toward every tag it carries', () => {
    const buckets = syllabusCoverage(
      draft([
        question('a', 'One', { tag_slugs: ['perspective', 'scale'] }),
        question('b', 'Two', { tag_slugs: ['perspective'] }),
      ]),
    );
    expect(buckets.find((b) => b.slug === 'perspective')?.count).toBe(2);
    expect(buckets.find((b) => b.slug === 'scale')?.count).toBe(1);
  });

  it('titles the slug for display', () => {
    const [top] = syllabusCoverage(draft([question('a', 'One', { tag_slugs: ['vanishing_points'] })]));
    expect(top.label).toBe('Vanishing Points');
  });

  it('surfaces untagged questions instead of hiding them', () => {
    const buckets = syllabusCoverage(draft([question('a', 'One', { tag_slugs: ['perspective'] }), question('b', 'Two')]));
    expect(buckets.at(-1)?.label).toBe('Untagged');
  });

  it('is empty for an empty draft rather than throwing', () => {
    expect(syllabusCoverage(draft([]))).toEqual([]);
  });

  it('orders deterministically when counts tie', () => {
    const qs = [question('a', 'One', { tag_slugs: ['zebra'] }), question('b', 'Two', { tag_slugs: ['alpha'] })];
    expect(syllabusCoverage(draft(qs)).map((b) => b.slug)).toEqual(['alpha', 'zebra']);
  });
});

describe('coverageGap, what "+ Ask AI for 3 more" offers to top up', () => {
  it('names the thinnest real topic', () => {
    const qs = [
      ...Array.from({ length: 9 }, (_, i) => question(`p${i}`, `Perspective ${i}`, { tag_slugs: ['perspective'] })),
      question('s', 'Scale', { tag_slugs: ['scale'] }),
    ];
    expect(coverageGap(draft(qs))?.slug).toBe('scale');
  });

  it('offers nothing when the batch is evenly covered', () => {
    const qs = [
      question('a', 'One', { tag_slugs: ['perspective'] }),
      question('b', 'Two', { tag_slugs: ['scale'] }),
    ];
    expect(coverageGap(draft(qs))).toBeNull();
  });

  it('never offers to top up Untagged, more questions will not fix missing tags', () => {
    const qs = [
      ...Array.from({ length: 9 }, (_, i) => question(`p${i}`, `Perspective ${i}`, { tag_slugs: ['perspective'] })),
      question('u', 'Untagged one'),
    ];
    expect(coverageGap(draft(qs))).toBeNull();
  });

  it('offers nothing when there is only one topic', () => {
    expect(coverageGap(draft([question('a', 'One', { tag_slugs: ['perspective'] })]))).toBeNull();
  });
});
