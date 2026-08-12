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

const IMAGE_STATS = { total: 0, withImages: 0, solutionTotal: 3, solutionWithImages: 0 };
const SAVE_PROGRESS = { done: 0, total: 0 };

/** Open the selection bar's overflow, where the rarer bulk actions moved. */
function openSelectionOverflow() {
  fireEvent.click(screen.getByLabelText('More actions for the selected questions'));
}

describe('PaperQuestionList', () => {
  let onChangeSections: ReturnType<typeof vi.fn<[string[], QBQuestionSection], Promise<void>>>;
  let onBulkSetNeedsImage: ReturnType<typeof vi.fn<[string[], boolean], Promise<void>>>;
  let onLinkChoiceGroup: ReturnType<typeof vi.fn<[string[]], Promise<void>>>;
  let onSetActiveQuestions: ReturnType<typeof vi.fn<[string[], boolean], Promise<void>>>;
  let onDeleteQuestions: ReturnType<
    typeof vi.fn<[string[]], Promise<{ deleted: number; refused: { question_id: string; blockers: string[] }[] }>>
  >;

  beforeEach(() => {
    onChangeSections = vi.fn<[string[], QBQuestionSection], Promise<void>>().mockResolvedValue(undefined);
    onBulkSetNeedsImage = vi.fn<[string[], boolean], Promise<void>>().mockResolvedValue(undefined);
    onLinkChoiceGroup = vi.fn<[string[]], Promise<void>>().mockResolvedValue(undefined);
    onSetActiveQuestions = vi.fn<[string[], boolean], Promise<void>>().mockResolvedValue(undefined);
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
    needsFilter: 'all',
    onNeedsFilterChange: vi.fn(),
    sectionFilter: null,
    onSectionFilterChange: vi.fn(),
    onBulkSetNeedsImage,
    onLinkChoiceGroup,
    onDeleteQuestions,
    onSetActiveQuestions,
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

  it('narrows to one section when a section filter is set, and the Select says which', () => {
    renderList({ sectionFilter: 'aptitude' });
    expect(screen.queryByText('Mathematics (MCQ) (Q1 to Q3)')).toBeNull();
    expect(screen.getByText('Aptitude (Q4 to Q6)')).not.toBeNull();
    expect(screen.getByLabelText('Filter the list by section').textContent).toContain('Aptitude');
  });

  it('sets the section filter from the Select', () => {
    const onSectionFilterChange = vi.fn();
    renderList({ onSectionFilterChange });
    fireEvent.mouseDown(screen.getByLabelText('Filter the list by section'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Aptitude'));
    expect(onSectionFilterChange).toHaveBeenCalledWith('aptitude');
  });

  it('clears the section filter back to All sections', () => {
    const onSectionFilterChange = vi.fn();
    renderList({ sectionFilter: 'aptitude', onSectionFilterChange });
    fireEvent.mouseDown(screen.getByLabelText('Filter the list by section'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('All sections'));
    expect(onSectionFilterChange).toHaveBeenCalledWith(null);
  });

  /**
   * The filters used to render only in Images mode, so a teacher correcting
   * wording had no way to see just the questions that still needed work.
   */
  it('offers the needs filters in Edit mode, not only in Images mode', () => {
    renderList({ mode: 'edit' });
    expect(screen.getByRole('button', { name: /^Figure missing/ })).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Solution missing/ })).not.toBeNull();
  });

  it('narrows to the maths questions still owing a solution image', () => {
    renderList({ needsFilter: 'missing-solution' });
    // Only the three maths questions are in that queue; the aptitude group
    // disappears entirely rather than showing as an empty heading.
    expect(screen.getByText('Mathematics (MCQ) (Q1 to Q3)')).not.toBeNull();
    expect(screen.queryByText('Aptitude (Q4 to Q6)')).toBeNull();
    expect(screen.getByText('3 of 6 questions')).not.toBeNull();
  });

  it('counts the solution queue within the section in view, not the whole paper', () => {
    renderList({ sectionFilter: 'aptitude' });
    expect(screen.getByRole('button', { name: 'Solution missing 0' })).not.toBeNull();
  });

  it('hides the solution filter on a paper with no maths at all', () => {
    renderList({
      questions: APT,
      imageStats: { total: 0, withImages: 0, solutionTotal: 0, solutionWithImages: 0 },
    });
    expect(screen.queryByRole('button', { name: /^Solution missing/ })).toBeNull();
  });

  /**
   * The paper header used to carry a permanently armed, paper-wide
   * "Deactivate 90". It is scoped to a selection now.
   */
  it('deactivates just the ticked questions, with no confirmation dialog', async () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 3' }));
    // Named by its tooltip: MUI puts the title on aria-label, so the visible
    // "Deactivate" is not the accessible name.
    fireEvent.click(screen.getByRole('button', { name: /Hide the selected questions from students/i }));

    expect(onSetActiveQuestions).toHaveBeenCalledWith(['q1', 'q3'], false);
    // Cleared afterwards, so the bar does not linger over a stale selection.
    await screen.findByText('6 questions');
  });

  it('offers Activate from the selection overflow', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    openSelectionOverflow();
    fireEvent.click(screen.getByRole('menuitem', { name: /Activate/ }));
    expect(onSetActiveQuestions).toHaveBeenCalledWith(['q2'], true);
  });

  it('keeps the needs-image verdicts reachable from the selection overflow', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    openSelectionOverflow();
    fireEvent.click(screen.getByRole('menuitem', { name: 'No figure needed' }));
    expect(onBulkSetNeedsImage).toHaveBeenCalledWith(['q2'], false);
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
