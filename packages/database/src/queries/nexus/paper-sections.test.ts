import { describe, it, expect } from 'vitest';
import {
  qbPaperSectionRuns,
  qbSectionLabel,
  isQBQuestionSection,
  QB_SECTION_ORDER,
  QB_SECTIONS,
  type NexusQBPaperSectionRow,
} from '../../types';

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

describe('qbPaperSectionRuns', () => {
  it('collapses a tidy paper into one run per section', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(i + 1, 'math_mcq')),
      ...Array.from({ length: 5 }, (_, i) => row(i + 21, 'math_numerical')),
      ...Array.from({ length: 50 }, (_, i) => row(i + 26, 'aptitude')),
      ...Array.from({ length: 2 }, (_, i) => row(i + 76, 'drawing')),
    ];

    const runs = qbPaperSectionRuns(rows);

    expect(runs).toHaveLength(4);
    expect(runs[0]).toMatchObject({
      section: 'math_mcq',
      label: 'Mathematics (MCQ)',
      count: 20,
      first_question: 1,
      last_question: 20,
    });
    expect(runs[2]).toMatchObject({ section: 'aptitude', count: 50, first_question: 26, last_question: 75 });
    expect(runs[3]).toMatchObject({ section: 'drawing', count: 2, first_question: 76, last_question: 77 });
  });

  it('shows interleaved sections as separate runs rather than one tidy lie', () => {
    // A bad guess, or a genuinely odd paper. Either way the teacher needs to
    // see that aptitude appears twice, not a single 3-question block.
    const runs = qbPaperSectionRuns([
      row(1, 'aptitude'),
      row(2, 'math_mcq'),
      row(3, 'aptitude'),
    ]);

    expect(runs.map((r) => r.section)).toEqual(['aptitude', 'math_mcq', 'aptitude']);
    expect(runs.every((r) => r.count === 1)).toBe(true);
  });

  it('keeps unsectioned questions visible as their own run', () => {
    const runs = qbPaperSectionRuns([row(1, 'math_mcq'), row(2, null), row(3, null)]);

    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ section: null, label: 'Unsectioned', count: 2 });
  });

  it('survives questions with no number', () => {
    const runs = qbPaperSectionRuns([
      { id: 'a', question_number: null, question_format: 'MCQ', section: 'aptitude', section_order: 3 },
      { id: 'b', question_number: null, question_format: 'MCQ', section: 'aptitude', section_order: 3 },
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].count).toBe(2);
    expect(runs[0].first_question).toBeNull();
    expect(runs[0].last_question).toBeNull();
  });

  it('returns nothing for an empty paper', () => {
    expect(qbPaperSectionRuns([])).toEqual([]);
  });
});

describe('section vocabulary', () => {
  it('orders every known section', () => {
    const orders = QB_SECTIONS.map((s) => QB_SECTION_ORDER[s]);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(QB_SECTIONS.length);
  });

  it('rejects anything that is not a section', () => {
    expect(isQBQuestionSection('aptitude')).toBe(true);
    expect(isQBQuestionSection('Aptitude')).toBe(false);
    expect(isQBQuestionSection('mathematics')).toBe(false);
    expect(isQBQuestionSection(null)).toBe(false);
    expect(isQBQuestionSection(undefined)).toBe(false);
  });

  it('labels an unknown value as itself rather than throwing', () => {
    expect(qbSectionLabel('drawing')).toBe('Drawing');
    expect(qbSectionLabel('something_else')).toBe('something_else');
    expect(qbSectionLabel(null)).toBe('Unsectioned');
  });
});
