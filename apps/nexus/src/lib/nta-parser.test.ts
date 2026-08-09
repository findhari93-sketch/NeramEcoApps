import { describe, it, expect } from 'vitest';
import { classifyQuestion, parseNTAAnswerSheet } from './nta-parser';

/**
 * The section guess is reproduced in three places: here, in the backfill of
 * 20260827090000_nexus_qb_question_sections.sql, and server-side behind the
 * "Re-run the guess" button. These tests pin the boundaries so the other two
 * have something to agree with.
 */
describe('classifyQuestion', () => {
  describe('JEE Paper 2 boundaries', () => {
    it('puts Q1 to Q20 in maths MCQ', () => {
      expect(classifyQuestion(1, 'MCQ').section).toBe('math_mcq');
      expect(classifyQuestion(20, 'MCQ').section).toBe('math_mcq');
    });

    it('puts Q21 to Q25 in maths numerical', () => {
      expect(classifyQuestion(21, 'NUMERICAL').section).toBe('math_numerical');
      expect(classifyQuestion(25, 'NUMERICAL').section).toBe('math_numerical');
    });

    it('puts Q26 to Q75 in aptitude', () => {
      expect(classifyQuestion(26, 'MCQ').section).toBe('aptitude');
      expect(classifyQuestion(75, 'MCQ').section).toBe('aptitude');
    });

    it('puts Q76 onward in drawing', () => {
      expect(classifyQuestion(76, 'MCQ').section).toBe('drawing');
      expect(classifyQuestion(77, 'MCQ').section).toBe('drawing');
      expect(classifyQuestion(200, 'MCQ').section).toBe('drawing');
    });
  });

  it('lets the format beat the position for a drawing prompt', () => {
    // A paper that numbers its drawing prompts early must still land right.
    expect(classifyQuestion(3, 'DRAWING_PROMPT').section).toBe('drawing');
    expect(classifyQuestion(40, 'DRAWING_PROMPT').section).toBe('drawing');
  });

  describe('NATA', () => {
    it('does not guess from position, because NATA boundaries move between years', () => {
      // Q1 would be maths MCQ under the JEE rule. Under NATA it is not.
      expect(classifyQuestion(1, 'MCQ', 'NATA').section).toBe('aptitude');
      expect(classifyQuestion(76, 'MCQ', 'NATA').section).toBe('aptitude');
    });

    it('still honours the format', () => {
      expect(classifyQuestion(1, 'NUMERICAL', 'NATA').section).toBe('math_numerical');
      expect(classifyQuestion(1, 'DRAWING_PROMPT', 'NATA').section).toBe('drawing');
    });
  });

  it('reports a section_order matching the paper order', () => {
    expect(classifyQuestion(1, 'MCQ').section_order).toBe(1);
    expect(classifyQuestion(21, 'NUMERICAL').section_order).toBe(2);
    expect(classifyQuestion(30, 'MCQ').section_order).toBe(3);
    expect(classifyQuestion(76, 'MCQ').section_order).toBe(4);
  });

  it('carries the broad topic slug into categories', () => {
    expect(classifyQuestion(1, 'MCQ').categories).toEqual(['mathematics']);
    expect(classifyQuestion(21, 'NUMERICAL').categories).toEqual(['mathematics']);
    expect(classifyQuestion(30, 'MCQ').categories).toEqual(['aptitude']);
    expect(classifyQuestion(76, 'MCQ').categories).toEqual(['drawing']);
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

  it('assigns a section to every parsed question', () => {
    const text = [block(1, 'MCQ'), block(2, 'MCQ'), block(3, 'SA')].join('\n');
    const parsed = parseNTAAnswerSheet(text);

    expect(parsed.total).toBe(3);
    expect(parsed.questions.every((q) => Boolean(q.section))).toBe(true);
    expect(parsed.questions[0].section).toBe('math_mcq');
  });

  it('returns section counts in paper order, not insertion order', () => {
    // 21 MCQ blocks then a subjective. Q21 falls in the 21 to 25 range, so it
    // is maths numerical even though it is typed MCQ: position decides the
    // section for everything except a drawing prompt.
    const blocks = Array.from({ length: 21 }, (_, i) => block(i + 1, 'MCQ'));
    blocks.push(block(22, 'SUBJECTIVE'));
    const parsed = parseNTAAnswerSheet(blocks.join('\n'));

    const names = parsed.sections.map((s) => s.name);
    expect(names).toEqual(['Mathematics (MCQ)', 'Mathematics (Numerical)', 'Drawing']);
    expect(parsed.sections[0].count).toBe(20);
    expect(parsed.sections[1].count).toBe(1);
    expect(parsed.sections[2].count).toBe(1);
  });

  it('discards the student chosen option rather than treating it as the answer', () => {
    const parsed = parseNTAAnswerSheet(block(1, 'MCQ'));
    expect(JSON.stringify(parsed.questions[0])).not.toContain('correct_answer');
  });
});
