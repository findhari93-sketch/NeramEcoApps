import { describe, it, expect } from 'vitest';
import { buildPaperBlueprint, marksForQuestions, sectionLabel } from './paper-blueprint';

describe('sectionLabel', () => {
  it('titles a category slug', () => {
    expect(sectionLabel('aptitude_and_reasoning')).toBe('Aptitude And Reasoning');
  });
});

describe('buildPaperBlueprint', () => {
  const breakdown = { mathematics: 30, aptitude: 50, drawing: 2 };

  it('orders sections largest first', () => {
    const bp = buildPaperBlueprint(breakdown, 'JEE_PAPER_2');
    expect(bp.sections.map((s) => s.name)).toEqual(['Aptitude', 'Mathematics', 'Drawing']);
  });

  it('applies the published JEE marking to objective sections', () => {
    const bp = buildPaperBlueprint(breakdown, 'JEE_PAPER_2');
    const maths = bp.sections.find((s) => s.name === 'Mathematics')!;
    expect(maths.marks).toBe(4);
    expect(maths.negativeMarks).toBe(1);
  });

  it('never negatively marks a drawing section, a human marks those', () => {
    const bp = buildPaperBlueprint(breakdown, 'JEE_PAPER_2');
    const drawing = bp.sections.find((s) => s.name === 'Drawing')!;
    expect(drawing.negativeMarks).toBe(0);
    expect(drawing.marks).toBeGreaterThan(4);
  });

  it('uses the NATA scheme for a NATA paper', () => {
    const bp = buildPaperBlueprint({ aptitude: 10 }, 'NATA');
    expect(bp.sections[0].marks).toBe(3);
    expect(bp.sections[0].negativeMarks).toBe(0);
  });

  it('falls back to unpenalised single marks for an unknown exam', () => {
    const bp = buildPaperBlueprint({ aptitude: 10 }, 'SOMETHING_ELSE');
    expect(bp.sections[0]).toMatchObject({ marks: 1, negativeMarks: 0 });
  });

  it('reports that the marking was assumed, not read off the paper', () => {
    expect(buildPaperBlueprint(breakdown, 'JEE_PAPER_2').marksSource).toBe('scheme');
  });

  it('totals the questions', () => {
    expect(buildPaperBlueprint(breakdown, 'JEE_PAPER_2').totalQuestions).toBe(82);
  });

  it('drops empty sections and survives an empty paper', () => {
    expect(buildPaperBlueprint({ maths: 0 }, 'JEE_PAPER_2').sections).toEqual([]);
    expect(buildPaperBlueprint({}, 'JEE_PAPER_2').totalQuestions).toBe(0);
  });

  it('orders deterministically when counts tie', () => {
    const bp = buildPaperBlueprint({ zebra: 5, alpha: 5 }, 'JEE_PAPER_2');
    expect(bp.sections.map((s) => s.name)).toEqual(['Alpha', 'Zebra']);
  });
});

describe('marksForQuestions', () => {
  const blueprint = buildPaperBlueprint({ mathematics: 2, drawing: 1 }, 'JEE_PAPER_2');

  it('marks each question by its own section, not by position', () => {
    // Interleaved on purpose: a paper ordered by question number mixes the
    // sections, and applying a section's marking to a contiguous block would
    // penalise the wrong questions.
    const questions = [
      { categories: ['mathematics'] },
      { categories: ['drawing'] },
      { categories: ['mathematics'] },
    ];
    const { marks, negativeMarks } = marksForQuestions(questions, blueprint);
    expect(marks).toEqual([4, 50, 4]);
    expect(negativeMarks).toEqual([1, 0, 1]);
  });

  it('falls back to the question format when a question carries no category', () => {
    const bp = buildPaperBlueprint({ DRAWING_PROMPT: 1 }, 'JEE_PAPER_2');
    const { negativeMarks } = marksForQuestions([{ question_format: 'DRAWING_PROMPT' }], bp);
    expect(negativeMarks).toEqual([0]);
  });

  it('gives an unrecognised question a plain unpenalised mark rather than throwing', () => {
    const { marks, negativeMarks } = marksForQuestions([{ categories: ['unheard_of'] }], blueprint);
    expect(marks).toEqual([1]);
    expect(negativeMarks).toEqual([0]);
  });

  it('returns one entry per question', () => {
    const questions = Array.from({ length: 7 }, () => ({ categories: ['mathematics'] }));
    expect(marksForQuestions(questions, blueprint).marks).toHaveLength(7);
  });

  it('reports scheme when no question states its own marking', () => {
    const { marksSource } = marksForQuestions([{ categories: ['mathematics'] }], blueprint);
    expect(marksSource).toBe('scheme');
  });

  it("lets a question's own marks beat the scheme", () => {
    const { marks, negativeMarks, marksSource } = marksForQuestions(
      [{ categories: ['mathematics'], marks_correct: 2, marks_negative: 0.5 }],
      blueprint,
    );
    expect(marks).toEqual([2]);
    expect(negativeMarks).toEqual([0.5]);
    expect(marksSource).toBe('paper');
  });

  it('treats a stated mark with no stated penalty as unpenalised', () => {
    // Not a fallback to the scheme's -1: stating "this is worth 2" and leaving
    // the deduction blank is a real marking scheme, and inheriting a penalty
    // there would deduct marks the paper never did.
    const { marks, negativeMarks } = marksForQuestions(
      [{ categories: ['mathematics'], marks_correct: 2 }],
      blueprint,
    );
    expect(marks).toEqual([2]);
    expect(negativeMarks).toEqual([0]);
  });

  it('reports mixed when only some questions state their marking', () => {
    const { marks, marksSource } = marksForQuestions(
      [{ categories: ['mathematics'], marks_correct: 2 }, { categories: ['mathematics'] }],
      blueprint,
    );
    expect(marks).toEqual([2, 4]);
    expect(marksSource).toBe('mixed');
  });

  it('ignores an unusable stated mark instead of composing a NaN test', () => {
    const { marks, marksSource } = marksForQuestions(
      [{ categories: ['mathematics'], marks_correct: 'four' as unknown as number }],
      blueprint,
    );
    expect(marks).toEqual([4]);
    expect(marksSource).toBe('scheme');
  });

  it('reads a numeric string, which is how PostgREST can hand back a NUMERIC', () => {
    const { marks } = marksForQuestions(
      [{ categories: ['mathematics'], marks_correct: '2.5' as unknown as number }],
      blueprint,
    );
    expect(marks).toEqual([2.5]);
  });
});
