import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import PaperQuestionList from './PaperQuestionList';

function q(n: number, section: QBQuestionSection): NexusQBQuestion {
  return {
    id: `q${n}`,
    question_text: `Question ${n}`,
    question_format: 'MCQ',
    options: [{ id: 'a', text: 'A' }],
    correct_answer: 'a',
    display_order: n,
    section,
    status: 'active',
    is_active: true,
    categories: [],
  } as unknown as NexusQBQuestion;
}

const MATHS = [1, 2, 3].map((n) => q(n, 'math_mcq'));
const APT = [4, 5, 6].map((n) => q(n, 'aptitude'));
const ALL = [...MATHS, ...APT];

describe('PaperQuestionList', () => {
  let onChangeSections: ReturnType<typeof vi.fn<[string[], QBQuestionSection], Promise<void>>>;

  beforeEach(() => {
    onChangeSections = vi.fn<[string[], QBQuestionSection], Promise<void>>().mockResolvedValue(undefined);
  });

  const renderList = (activeId: string | null = null, onActivate = vi.fn()) =>
    render(
      <PaperQuestionList
        questions={ALL}
        tagCounts={{}}
        activeQuestionId={activeId}
        onActivate={onActivate}
        onChangeSections={onChangeSections}
      />,
    );

  it('groups the paper into its section runs with the question range in the heading', () => {
    renderList();
    expect(screen.getByText('Mathematics (MCQ) (Q1 to Q3)')).not.toBeNull();
    expect(screen.getByText('Aptitude (Q4 to Q6)')).not.toBeNull();
  });

  it('opens a question in the pane without ticking it', () => {
    const onActivate = vi.fn();
    renderList(null, onActivate);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(onActivate).toHaveBeenCalledWith('q2');
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('moves every ticked question in one call', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }));

    fireEvent.mouseDown(screen.getByLabelText('Section to move the selected questions into'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChangeSections).toHaveBeenCalledTimes(1);
    expect(onChangeSections).toHaveBeenCalledWith(['q1', 'q3'], 'aptitude');
  });

  it('shift-click fills in the run between two ticks', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 5' }), { shiftKey: true });
    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('selects a run by question number', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('First question number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Last question number'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select range' }));
    expect(screen.getByText('4 selected')).not.toBeNull();
  });

  it('ticks a whole section group from its heading', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select every question in Aptitude/i }));
    expect(screen.getByText('3 selected')).not.toBeNull();
  });

  /**
   * A real staging drawing paper has all 96 questions with display_order NULL.
   * `display_order ?? 0` named every row "Open question 0", so 96 controls
   * shared one accessible name and no row could be addressed individually.
   */
  it('numbers rows by paper order when the questions carry no display_order', () => {
    const unnumbered = [
      { ...MATHS[0], id: 'd1', display_order: null },
      { ...MATHS[1], id: 'd2', display_order: null },
      { ...MATHS[2], id: 'd3', display_order: null },
    ] as unknown as NexusQBQuestion[];

    render(
      <PaperQuestionList
        questions={unnumbered}
        tagCounts={{}}
        activeQuestionId={null}
        onActivate={vi.fn()}
        onChangeSections={onChangeSections}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open question 1' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Open question 3' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open question 0' })).toBeNull();
  });

  it('clears the selection after a successful move, so the bar does not linger', async () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.mouseDown(screen.getByLabelText('Section to move the selected questions into'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Mathematics (MCQ) (Q1 to Q3)');
    expect(screen.queryByText('1 selected')).toBeNull();
  });
});
