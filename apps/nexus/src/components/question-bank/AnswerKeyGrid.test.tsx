import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import AnswerKeyGrid from './AnswerKeyGrid';

/**
 * Two defects this covers, both found on a real 2006 B.Arch paper:
 *
 *  1. Fixing a mis-sectioned import meant changing one dropdown per question.
 *     A bad guess misplaces a whole block, so that is twenty or more dropdowns
 *     and a lot of a teacher's evening.
 *  2. The Correct Answer column printed option text raw, so an answer of
 *     "$\frac{1}{12}, \frac{4}{9}$" appeared as backslashes and braces beside a
 *     question that rendered its maths properly.
 */

// jsdom reports desktop width, so the table branch renders. That is the branch
// with the checkbox column and the one worth pinning.
vi.mock('@neram/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@neram/ui');
  return actual;
});

function question(
  n: number,
  section: QBQuestionSection | null,
  overrides: Partial<NexusQBQuestion> = {},
): NexusQBQuestion {
  return {
    id: `q${n}`,
    question_text: `Question ${n}`,
    question_text_hi: null,
    question_image_url: null,
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'First option' },
      { id: 'b', text: 'Second option' },
    ],
    correct_answer: null,
    answer_tolerance: null,
    explanation_brief: null,
    explanation_detailed: null,
    explanation_brief_hi: null,
    explanation_detailed_hi: null,
    solution_image_url: null,
    solution_video_url: null,
    difficulty: 'medium',
    exam_relevance: 'high',
    categories: [],
    status: 'draft',
    is_active: false,
    display_order: n,
    section,
    section_order: null,
    ...overrides,
  } as unknown as NexusQBQuestion;
}

const noop = async () => {};

describe('AnswerKeyGrid section editing', () => {
  let onChangeSections: ReturnType<
    typeof vi.fn<[string[], QBQuestionSection], Promise<void>>
  >;

  beforeEach(() => {
    onChangeSections = vi.fn<[string[], QBQuestionSection], Promise<void>>().mockResolvedValue(
      undefined,
    );
  });

  const renderGrid = (questions: NexusQBQuestion[]) =>
    render(
      <AnswerKeyGrid questions={questions} onSave={noop} onChangeSections={onChangeSections} />,
    );

  it('moves every selected question in one call, not one call per question', () => {
    renderGrid([1, 2, 3, 4].map((n) => question(n, 'drawing')));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }));
    expect(screen.getByText('2 selected')).not.toBeNull();

    fireEvent.mouseDown(
      screen.getByLabelText('Section to move the selected questions into'),
    );
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChangeSections).toHaveBeenCalledTimes(1);
    expect(onChangeSections).toHaveBeenCalledWith(['q1', 'q3'], 'aptitude');
  });

  it('shift-click fills in everything between the two ticks', () => {
    renderGrid([1, 2, 3, 4, 5].map((n) => question(n, 'drawing')));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 5' }), {
      shiftKey: true,
    });

    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('selects a run by question number, which is how a teacher reads a paper', () => {
    renderGrid([1, 2, 3, 4, 5, 6].map((n) => question(n, 'aptitude')));

    fireEvent.change(screen.getByLabelText('First question number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Last question number'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select range' }));

    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('ticks a whole section group from its heading', () => {
    renderGrid([
      question(1, 'math_mcq'),
      question(2, 'aptitude'),
      question(3, 'aptitude'),
      question(4, 'aptitude'),
    ]);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select every question in Aptitude/i }),
    );
    expect(screen.getByText('3 selected')).not.toBeNull();
  });

  it('hides the selection controls entirely when section editing is not offered', () => {
    render(<AnswerKeyGrid questions={[question(1, 'aptitude')]} onSave={noop} />);
    expect(screen.queryByRole('checkbox', { name: 'Select question 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select range' })).toBeNull();
  });
});

describe('AnswerKeyGrid answer options', () => {
  it('renders LaTeX in the answer dropdown instead of printing its delimiters', () => {
    const q = question(1, 'math_mcq', {
      options: [
        { id: 'a', text: '$\\frac{1}{12}, \\frac{4}{9}$' },
        { id: 'b', text: '$c^2 = 17.5$' },
      ],
      correct_answer: 'a',
    } as Partial<NexusQBQuestion>);

    const { container } = render(<AnswerKeyGrid questions={[q]} onSave={noop} />);

    // The closed dropdown shows the chosen answer with its maths typeset.
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(screen.queryByText(/\\frac/)).toBeNull();
  });

  it('does not cut option text mid-formula', () => {
    // The old code did text.substring(0, 40), which on a long formula left an
    // unclosed $ and rendered as garbage.
    const long = `$${'x^2 + '.repeat(12)}1 = 0$`;
    const q = question(1, 'math_mcq', {
      options: [{ id: 'a', text: long }],
      correct_answer: 'a',
    } as Partial<NexusQBQuestion>);

    const { container } = render(<AnswerKeyGrid questions={[q]} onSave={noop} />);
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.textContent).not.toContain('...');
  });
});
