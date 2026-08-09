import { describe, it, expect } from 'vitest';
import { classifyQuestion, isKnownJEEPaper2Layout, parseNTAAnswerSheet } from './nta-parser';

/**
 * This is the guess used where there is nothing to read: an NTA answer sheet
 * gives question IDs and option IDs and no question text at all. When text IS
 * available, inferPaperSections in qb-section-inference.ts reads it instead.
 *
 * The contract these tests pin down changed after a 92-question 2006 B.Arch
 * paper was imported and came out with fifteen aptitude MCQs in the drawing
 * section and fifteen maths questions in aptitude. The old rule applied the
 * 2019 JEE layout (Q1-20 / Q21-25 / Q26-75 / Q76+) to every JEE paper ever
 * printed. Two things fix that: the layout is now chosen by the paper's
 * length, and format vetoes position in both directions.
 */
describe('classifyQuestion', () => {
  describe('format decides what it can, in both directions', () => {
    it('puts a drawing prompt in drawing wherever it sits', () => {
      expect(classifyQuestion(3, 'DRAWING_PROMPT').section).toBe('drawing');
      expect(classifyQuestion(40, 'DRAWING_PROMPT').section).toBe('drawing');
    });

    it('puts a numerical question in maths numerical wherever it sits', () => {
      expect(classifyQuestion(1, 'NUMERICAL').section).toBe('math_numerical');
      expect(classifyQuestion(90, 'NUMERICAL').section).toBe('math_numerical');
    });

    it('never puts a four-option MCQ in drawing, whatever its number', () => {
      // The regression. Under the old rule every one of these was 'drawing',
      // which marks +50/0 and is never auto-graded.
      for (const [q, total] of [[76, 77], [80, 82], [90, 92], [200, 92]] as const) {
        expect(classifyQuestion(q, 'MCQ', 'JEE_PAPER_2', total).section).not.toBe('drawing');
      }
      expect(classifyQuestion(76, 'MCQ').section).not.toBe('drawing');
    });

    it('never puts a four-option MCQ in maths numerical', () => {
      expect(classifyQuestion(22, 'MCQ', 'JEE_PAPER_2', 77).section).not.toBe('math_numerical');
    });
  });

  describe('position, but only against a layout the paper length matches', () => {
    it('reads a 77-question paper as the 2019 layout', () => {
      expect(classifyQuestion(1, 'MCQ', 'JEE_PAPER_2', 77).section).toBe('math_mcq');
      expect(classifyQuestion(25, 'MCQ', 'JEE_PAPER_2', 77).section).toBe('math_mcq');
      expect(classifyQuestion(26, 'MCQ', 'JEE_PAPER_2', 77).section).toBe('aptitude');
      expect(classifyQuestion(75, 'MCQ', 'JEE_PAPER_2', 77).section).toBe('aptitude');
    });

    it('reads an 82-question paper as maths 30, aptitude 50', () => {
      expect(classifyQuestion(30, 'MCQ', 'JEE_PAPER_2', 82).section).toBe('math_mcq');
      expect(classifyQuestion(31, 'MCQ', 'JEE_PAPER_2', 82).section).toBe('aptitude');
    });

    it('reads a 92-question paper as maths 40, aptitude 50, which is the paper that broke', () => {
      expect(classifyQuestion(26, 'MCQ', 'JEE_PAPER_2', 92).section).toBe('math_mcq');
      expect(classifyQuestion(40, 'MCQ', 'JEE_PAPER_2', 92).section).toBe('math_mcq');
      expect(classifyQuestion(41, 'MCQ', 'JEE_PAPER_2', 92).section).toBe('aptitude');
      expect(classifyQuestion(90, 'MCQ', 'JEE_PAPER_2', 92).section).toBe('aptitude');
    });

    it('does not guess maths from position when the length is unrecognised', () => {
      // 60 is not a JEE Paper 2 layout we know. Better a whole paper in one
      // visibly wrong section a teacher re-runs than a confident split at
      // boundaries invented from nothing.
      expect(isKnownJEEPaper2Layout(60)).toBe(false);
      expect(classifyQuestion(1, 'MCQ', 'JEE_PAPER_2', 60).section).toBe('aptitude');
    });

    it('does not guess from position for NATA, whose boundaries move by year', () => {
      expect(classifyQuestion(1, 'MCQ', 'NATA', 77).section).toBe('aptitude');
      expect(classifyQuestion(76, 'MCQ', 'NATA', 77).section).toBe('aptitude');
    });

    it('still honours the format for NATA', () => {
      expect(classifyQuestion(1, 'NUMERICAL', 'NATA').section).toBe('math_numerical');
      expect(classifyQuestion(1, 'DRAWING_PROMPT', 'NATA').section).toBe('drawing');
    });
  });

  it('reports a section_order matching the paper order', () => {
    expect(classifyQuestion(1, 'MCQ', 'JEE_PAPER_2', 77).section_order).toBe(1);
    expect(classifyQuestion(21, 'NUMERICAL').section_order).toBe(2);
    expect(classifyQuestion(30, 'MCQ', 'JEE_PAPER_2', 77).section_order).toBe(3);
    expect(classifyQuestion(76, 'DRAWING_PROMPT').section_order).toBe(4);
  });

  it('carries the broad topic slug into categories', () => {
    expect(classifyQuestion(1, 'MCQ', 'JEE_PAPER_2', 77).categories).toEqual(['mathematics']);
    expect(classifyQuestion(21, 'NUMERICAL').categories).toEqual(['mathematics']);
    expect(classifyQuestion(30, 'MCQ', 'JEE_PAPER_2', 77).categories).toEqual(['aptitude']);
    expect(classifyQuestion(76, 'DRAWING_PROMPT').categories).toEqual(['drawing']);
  });

  it('defaults to JEE Paper 2 so existing callers keep their behaviour', () => {
    expect(classifyQuestion(1, 'MCQ')).toEqual(classifyQuestion(1, 'MCQ', 'JEE_PAPER_2'));
  });
});

describe('parseNTAAnswerSheet', () => {
  const block = (n: number, type: string) =>
    [
      `Question Type : ${type}`,
      `Question ID : 100000000${n}`,
      `Option 1 : 100000000${n}1`,
      `Option 2 : 100000000${n}2`,
      `Option 3 : 100000000${n}3`,
      `Option 4 : 100000000${n}4`,
      'Status : Answered',
      `Chosen Option : 100000000${n}2`,
    ].join('\n');

  /** A paper of `total` questions, the last two of them drawing prompts. */
  const paper = (total: number) =>
    Array.from({ length: total }, (_, i) =>
      block(i + 1, i >= total - 2 ? 'SUBJECTIVE' : 'MCQ'),
    ).join('\n');

  it('assigns a section to every parsed question', () => {
    const parsed = parseNTAAnswerSheet(paper(77));

    expect(parsed.total).toBe(77);
    expect(parsed.questions.every((q) => Boolean(q.section))).toBe(true);
    expect(parsed.questions[0].section).toBe('math_mcq');
  });

  it('sections a 77-question paper at the 2019 boundaries', () => {
    const parsed = parseNTAAnswerSheet(paper(77));
    const sectionOf = (n: number) => parsed.questions[n - 1].section;

    expect(sectionOf(25)).toBe('math_mcq');
    expect(sectionOf(26)).toBe('aptitude');
    expect(sectionOf(75)).toBe('aptitude');
    expect(sectionOf(76)).toBe('drawing');
    expect(sectionOf(77)).toBe('drawing');
  });

  it('sections a 92-question paper at its own boundaries, not the 2019 ones', () => {
    const parsed = parseNTAAnswerSheet(paper(92));
    const sectionOf = (n: number) => parsed.questions[n - 1].section;

    expect(sectionOf(40)).toBe('math_mcq');
    expect(sectionOf(41)).toBe('aptitude');
    // The fifteen that used to come out as drawing.
    for (let n = 76; n <= 90; n++) {
      expect(sectionOf(n), `Q${n}`).toBe('aptitude');
    }
    expect(sectionOf(91)).toBe('drawing');
  });

  it('warns rather than inventing boundaries for a length it does not know', () => {
    const parsed = parseNTAAnswerSheet(paper(40));
    expect(parsed.warnings.some((w) => w.includes('does not match a JEE Paper 2 layout'))).toBe(
      true,
    );
  });

  it('returns section counts in paper order, not insertion order', () => {
    const parsed = parseNTAAnswerSheet(paper(77));
    expect(parsed.sections.map((s) => s.name)).toEqual([
      'Mathematics (MCQ)',
      'Aptitude',
      'Drawing',
    ]);
    expect(parsed.sections[0].count).toBe(25);
    expect(parsed.sections[1].count).toBe(50);
    expect(parsed.sections[2].count).toBe(2);
  });

  it('discards the student chosen option rather than treating it as the answer', () => {
    const parsed = parseNTAAnswerSheet(block(1, 'MCQ'));
    expect(JSON.stringify(parsed.questions[0])).not.toContain('correct_answer');
  });
});
