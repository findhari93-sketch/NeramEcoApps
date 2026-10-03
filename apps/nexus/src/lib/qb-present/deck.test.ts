import { describe, expect, it } from 'vitest';
import { listDeck, paperDeck, paperTitle, type DeckSourceQuestion } from './deck';

const CTX = { exam: 'JEE_PAPER_2', year: 2025, session: null, shift: null };

function q(id: string, over: Partial<DeckSourceQuestion> = {}): DeckSourceQuestion {
  return {
    id,
    question_format: 'MCQ',
    question_text: `Question ${id}`,
    question_image_url: null,
    options: [
      { id: 'a', text: 'One', is_correct: false },
      { id: 'b', text: 'Two', is_correct: true, image_url: 'https://cdn.test/two.png' },
    ],
    correct_answer: 'b',
    display_order: null,
    section: 'math_mcq',
    section_order: 1,
    sources: [],
    ...over,
  };
}

const source = (question_id: string, year: number, question_number: number | null) => ({
  id: `s-${question_id}-${year}`,
  question_id,
  exam_type: 'JEE_PAPER_2' as const,
  year,
  session: null,
  shift: null,
  question_number,
  created_at: '2026-01-01',
});

describe('paperDeck', () => {
  it('orders by section then paper number, and labels with the paper number', () => {
    const items = paperDeck(
      [
        q('apt-1', { section: 'aptitude', section_order: 2, sources: [source('apt-1', 2025, 1)] }),
        q('m-2', { sources: [source('m-2', 2025, 2)] }),
        q('m-1', { sources: [source('m-1', 2025, 1)] }),
      ],
      CTX,
    );
    expect(items.map((i) => [i.id, i.label])).toEqual([
      ['m-1', '1'],
      ['m-2', '2'],
      ['apt-1', '1'],
    ]);
  });

  it('carries no answer: no key, no is_correct, no option ids', () => {
    const [item] = paperDeck([q('m-1', { display_order: 38 })], CTX);
    expect(item.label).toBe('38');
    expect(item.options).toEqual([
      { text: 'One', image_url: null },
      { text: 'Two', image_url: 'https://cdn.test/two.png' },
    ]);
    expect(item.plan).toEqual({ type: 'mcq', optionCount: 2, hasKey: true });
    const json = JSON.stringify(item);
    expect(json).not.toContain('is_correct');
    expect(json).not.toContain('correct_answer');
    expect(json).not.toContain('"b"');
  });

  it('marks a drawing question as show-only, with its parts and without their solutions', () => {
    const [item] = paperDeck(
      [
        q('d-1', {
          question_format: 'DRAWING_PROMPT',
          options: null,
          drawing_parts: { mode: 'all', items: [{ id: 'p1', label: '(a)', text: 'Draw a chair', solution_image_url: 'https://x' }] },
        }),
      ],
      CTX,
    );
    expect(item.plan).toEqual({ type: 'show', optionCount: null, hasKey: false });
    expect(item.parts).toEqual([{ label: '(a)', text: 'Draw a chair', image_url: null }]);
    expect(JSON.stringify(item)).not.toContain('solution');
  });
});

describe('listDeck', () => {
  it('keeps the order given, labels a one-paper question by that paper, else by position', () => {
    const items = listDeck(
      [q('x', { sources: [source('x', 2019, 12)] }), q('y', { sources: [source('y', 2019, 3), source('y', 2021, 7)] })],
      ['y', 'missing', 'x'],
    );
    expect(items.map((i) => [i.id, i.label])).toEqual([
      ['y', '1'],
      ['x', '2019 Q12'],
    ]);
  });
});

describe('paperTitle', () => {
  it('names the exam, year and sitting', () => {
    expect(paperTitle({ exam_type: 'JEE_PAPER_2', year: 2025 })).toBe('JEE Paper 2 2025');
    expect(paperTitle({ exam_type: 'NATA', year: 2025, session: '1' })).toBe('NATA 2025 S1');
    expect(paperTitle({ exam_type: 'JEE_PAPER_2', year: 2024, session: 'January', shift: 'afternoon' })).toBe(
      'JEE Paper 2 2024 January (afternoon)',
    );
  });
});
