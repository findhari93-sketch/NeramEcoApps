import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { NexusQBQuestion, QBQuestionSection } from '@neram/database';
import PaperQuestionList, { type PaperQuestionListProps } from './PaperQuestionList';

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
    needs_image: null,
  } as unknown as NexusQBQuestion;
}

const MATHS = [1, 2, 3].map((n) => q(n, 'math_mcq'));
const APT = [4, 5, 6].map((n) => q(n, 'aptitude'));
const ALL = [...MATHS, ...APT];

const IMAGE_STATS = { total: 0, withImages: 0 };
const SAVE_PROGRESS = { done: 0, total: 0 };

describe('PaperQuestionList', () => {
  let onChangeSections: ReturnType<typeof vi.fn<[string[], QBQuestionSection], Promise<void>>>;
  let onBulkSetNeedsImage: ReturnType<typeof vi.fn<[string[], boolean], Promise<void>>>;
  let onLinkChoiceGroup: ReturnType<typeof vi.fn<[string[]], Promise<void>>>;
  let onDeleteQuestions: ReturnType<
    typeof vi.fn<[string[]], Promise<{ deleted: number; refused: { question_id: string; blockers: string[] }[] }>>
  >;

  beforeEach(() => {
    onChangeSections = vi.fn<[string[], QBQuestionSection], Promise<void>>().mockResolvedValue(undefined);
    onBulkSetNeedsImage = vi.fn<[string[], boolean], Promise<void>>().mockResolvedValue(undefined);
    onLinkChoiceGroup = vi.fn<[string[]], Promise<void>>().mockResolvedValue(undefined);
    onDeleteQuestions = vi
      .fn<[string[]], Promise<{ deleted: number; refused: { question_id: string; blockers: string[] }[] }>>()
      .mockResolvedValue({ deleted: 1, refused: [] });
  });

  const baseProps = (
    over: Partial<PaperQuestionListProps> = {},
  ): PaperQuestionListProps => ({
    questions: ALL,
    tagCounts: {},
    activeQuestionId: null,
    onActivate: vi.fn(),
    onChangeSections,
    mode: 'edit',
    onModeChange: vi.fn(),
    imageFilter: 'missing',
    onImageFilterChange: vi.fn(),
    sectionFilter: null,
    onSectionFilterChange: vi.fn(),
    onBulkSetNeedsImage,
    onLinkChoiceGroup,
    onDeleteQuestions,
    imageStats: IMAGE_STATS,
    pendingImageCount: 0,
    onSaveAllImages: vi.fn(),
    savingImages: false,
    saveImageProgress: SAVE_PROGRESS,
    ...over,
  });

  const renderList = (over: Partial<PaperQuestionListProps> = {}) =>
    render(<PaperQuestionList {...baseProps(over)} />);

  it('groups the paper into its section runs with the question range in the heading', () => {
    renderList();
    expect(screen.getByText('Mathematics (MCQ) (Q1 to Q3)')).not.toBeNull();
    expect(screen.getByText('Aptitude (Q4 to Q6)')).not.toBeNull();
  });

  it('opens a question in the pane without ticking it', () => {
    const onActivate = vi.fn();
    renderList({ onActivate });
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(onActivate).toHaveBeenCalledWith('q2');
    expect(screen.queryByText(/selected/)).toBeNull();
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

  it('a checkbox click is additive: ticking row 1 then row 3 selects both, not just the last one', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }));
    expect(screen.getByText('2 of 6 selected')).not.toBeNull();
  });

  it('shift-click fills in the run between two ticks', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 5' }), { shiftKey: true });
    expect(screen.getByText('4 of 6 selected')).not.toBeNull();
  });

  it('a second shift-click re-derives the range from the same anchor rather than accumulating', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 5' }), { shiftKey: true });
    expect(screen.getByText('4 of 6 selected')).not.toBeNull();
    // Dragging the shift-click back up should shrink the same run, not keep
    // the questions the first shift-click added.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }), { shiftKey: true });
    expect(screen.getByText('2 of 6 selected')).not.toBeNull();
  });

  it('the From/To range inputs are gone', () => {
    renderList();
    expect(screen.queryByLabelText('First question number')).toBeNull();
    expect(screen.queryByLabelText('Last question number')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select range' })).toBeNull();
  });

  it('Ctrl+A selects every question', () => {
    renderList();
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    expect(screen.getByText('6 of 6 selected')).not.toBeNull();
  });

  it('ticks a whole section group from its heading', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select every question in Aptitude/i }));
    expect(screen.getByText('3 of 6 selected')).not.toBeNull();
  });

  /**
   * A real staging drawing paper has all 96 questions with display_order NULL.
   * `display_order ?? 0` named every row "Open question 0", so 96 controls
   * shared one accessible name and no row could be addressed individually.
   * Shift-click has the same failure mode if it keys off display_order, so
   * this also confirms range selection still works when every row is 0.
   */
  it('numbers rows by paper order, and ranges by it too, when display_order is null', () => {
    const unnumbered = [
      { ...MATHS[0], id: 'd1', display_order: null },
      { ...MATHS[1], id: 'd2', display_order: null },
      { ...MATHS[2], id: 'd3', display_order: null },
    ] as unknown as NexusQBQuestion[];

    renderList({ questions: unnumbered });

    expect(screen.getByRole('button', { name: 'Open question 1' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Open question 3' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open question 0' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }), { shiftKey: true });
    expect(screen.getByText('3 of 3 selected')).not.toBeNull();
  });

  it('clears the selection after a successful move, so the bar does not linger', async () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.mouseDown(screen.getByLabelText('Section to move the selected questions into'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Mathematics (MCQ) (Q1 to Q3)');
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('switches to Images mode and back via the toggle', () => {
    const onModeChange = vi.fn();
    renderList({ onModeChange });
    fireEvent.click(screen.getByRole('button', { name: /images/i }));
    expect(onModeChange).toHaveBeenCalledWith('images');
  });

  it('narrows to one section when a section filter is set, and shows a chip to clear it', () => {
    renderList({ sectionFilter: 'aptitude' });
    expect(screen.queryByText('Mathematics (MCQ) (Q1 to Q3)')).toBeNull();
    expect(screen.getByText('Aptitude (Q4 to Q6)')).not.toBeNull();
    expect(screen.getByText(/Filtering: Aptitude/)).not.toBeNull();
  });

  it('clears the section filter from its own chip', () => {
    const onSectionFilterChange = vi.fn();
    renderList({ sectionFilter: 'aptitude', onSectionFilterChange });
    fireEvent.click(screen.getByTestId('CancelIcon'));
    expect(onSectionFilterChange).toHaveBeenCalledWith(null);
  });

  it('deletes the ticked questions and reports what was kept', async () => {
    onDeleteQuestions.mockResolvedValue({
      deleted: 1,
      refused: [{ question_id: 'q3', blockers: ['A student has already answered this question.'] }],
    });
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: /never really belonged on this paper/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(onDeleteQuestions).toHaveBeenCalledWith(expect.arrayContaining(['q1', 'q2', 'q3']));
    await screen.findByText('A student has already answered this question.');
    // The refused row stays selected so the teacher can see which one was kept.
    expect(screen.getByText('1 of 6 selected')).not.toBeNull();
  });
});
