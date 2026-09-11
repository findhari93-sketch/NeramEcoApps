import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TestQuestionsView, { type PoolQuestion, type QuestionAnalysisRow } from './TestQuestionsView';
import { DEFAULT_QUESTION_FILTERS, type QuestionFilters } from '@/lib/question-filters';

/**
 * The Questions tab: every question with how students did on it, in one list.
 *
 * Asked for in a founder's words: filter to the 0% questions and any range,
 * filter to what an AI has not checked yet, select everything that is left,
 * check it with AI, and afterwards see plainly what the AI fixed and what the
 * question looked like before.
 */

const options = (texts: string[]) => texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

const pool: PoolQuestion[] = [
  {
    test_question_id: 'tq1',
    question_id: 'q1',
    question_text: 'The Indus Valley Civilization is also known as which of the following?',
    question_image_url: null,
    question_format: 'MCQ',
    options: options(['Iron Age civilization', 'Bronze Age civilization', 'Stone Age civilization', 'Copper Age civilization']),
    marks: 1,
    sort_order: 0,
    correct_answer: 'b',
    explanation_brief: 'It flourished during the Bronze Age.',
  },
  {
    test_question_id: 'tq2',
    question_id: 'q2',
    question_text: 'The city of Mohenjo-Daro is located in which region?',
    question_image_url: null,
    question_format: 'MCQ',
    options: options(['Punjab', 'Gujarat', 'Sindh', 'Rajasthan']),
    marks: 1,
    sort_order: 1,
    correct_answer: 'c',
  },
  {
    test_question_id: 'tq3',
    question_id: 'q3',
    question_text: 'The Lingaraja temple was built by which king?',
    question_image_url: null,
    question_format: 'MCQ',
    options: options(['Dhanga', 'Jajati Kesari', 'Krishna', 'Narasimhavarman']),
    marks: 1,
    sort_order: 2,
    correct_answer: 'b',
  },
];

const analysis: QuestionAnalysisRow[] = [
  {
    question_id: 'q1',
    question_text: pool[0].question_text,
    sort_order: 0,
    answered: 9,
    correct: 0,
    correct_pct: 0,
    top_wrong_option: { key: 'd', text: 'Copper Age civilization', count: 4 },
    option_counts: { a: 1, c: 4, d: 4 },
    needs_review: true,
    ai: null,
  },
  {
    question_id: 'q2',
    question_text: pool[1].question_text,
    sort_order: 1,
    answered: 5,
    correct: 4,
    correct_pct: 80,
    top_wrong_option: { key: 'b', text: 'Gujarat', count: 1 },
    option_counts: { b: 1, c: 4 },
    needs_review: false,
    ai: { checks: 2, last_checked_at: '2026-09-11T06:13:00Z', last_verdict: 'hard_but_fair', last_note: null, fixed: null },
  },
  {
    question_id: 'q3',
    question_text: pool[2].question_text,
    sort_order: 2,
    answered: 6,
    correct: 3,
    correct_pct: 50,
    top_wrong_option: { key: 'a', text: 'Dhanga', count: 3 },
    option_counts: { a: 3, b: 3 },
    needs_review: false,
    ai: {
      checks: 1,
      last_checked_at: '2026-09-11T06:14:00Z',
      last_verdict: 'wrong_key',
      last_note: 'The book credits Jajati Kesari.',
      fixed: {
        at: '2026-09-11T06:14:00Z',
        fields: ['correct_answer'],
        before: { correct_answer: 'a' },
        after: { correct_answer: 'b' },
        verdict: 'wrong_key',
        pct_before: 17,
      },
    },
  },
];

function Harness({ onReview = vi.fn(), onEdit = vi.fn() }: { onReview?: any; onEdit?: any }) {
  const [filters, setFilters] = useState<QuestionFilters>({ ...DEFAULT_QUESTION_FILTERS, pct: [0, 100] });
  return (
    <TestQuestionsView
      pool={pool}
      analysis={analysis}
      statsLoading={false}
      filters={filters}
      onFiltersChange={setFilters}
      onReview={onReview}
      onEdit={onEdit}
    />
  );
}

const rowShown = (n: number) => screen.queryByTestId(`question-row-${n}`) !== null;

describe('the list', () => {
  it('shows every question once, numbered, with how many got it right', () => {
    render(<Harness />);
    expect(rowShown(1) && rowShown(2) && rowShown(3)).toBe(true);
    expect(screen.getByText('3 questions')).not.toBeNull();
    expect(within(screen.getByTestId('question-row-2')).getByText(/4 of 5 right/)).not.toBeNull();
  });

  it('marks what an AI has done with each question, and what still needs a look', () => {
    render(<Harness />);
    expect(within(screen.getByTestId('question-row-1')).getByText('Needs a look')).not.toBeNull();
    expect(within(screen.getByTestId('question-row-2')).getByText('AI checked 2×')).not.toBeNull();
    expect(within(screen.getByTestId('question-row-3')).getByText('Key fixed by AI')).not.toBeNull();
  });

  it('shows the rate before a fix struck through beside the rate now', () => {
    render(<Harness />);
    const pill = screen.getByTestId('pct-3');
    expect(pill.textContent).toContain('17%');
    expect(pill.textContent).toContain('50%');
    expect(pill.querySelector('s')?.textContent).toBe('17%');
  });
});

describe('filters', () => {
  it('narrows to the 0% questions in one press', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('quick-zero'));
    await waitFor(() => expect(rowShown(2)).toBe(false));
    expect(rowShown(1)).toBe(true);
    expect(screen.getByText('1 of 3 questions')).not.toBeNull();
  });

  it('narrows to the questions no AI has checked yet', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('quick-unchecked'));
    await waitFor(() => expect(rowShown(3)).toBe(false));
    expect(rowShown(1)).toBe(true);
    expect(rowShown(2)).toBe(false);
  });

  it('narrows to what the AI fixed', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('quick-fixed'));
    await waitFor(() => expect(rowShown(1)).toBe(false));
    expect(rowShown(3)).toBe(true);
  });

  it('finds a question by its number', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Search questions'), { target: { value: '2' } });
    await waitFor(() => expect(rowShown(1)).toBe(false));
    expect(rowShown(2)).toBe(true);
  });

  it('never dead-ends: an empty result offers to clear the filters', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Search questions'), { target: { value: 'nothing like this' } });
    await waitFor(() => expect(screen.getByText('No question matches these filters.')).not.toBeNull());

    fireEvent.click(screen.getAllByText('Clear filters')[0]);
    await waitFor(() => expect(rowShown(1)).toBe(true));
  });
});

describe('selecting and checking with AI', () => {
  it('selects only what the filters left, and sends exactly those', async () => {
    const onReview = vi.fn();
    render(<Harness onReview={onReview} />);

    fireEvent.click(screen.getByTestId('quick-zero'));
    await waitFor(() => expect(screen.getByLabelText('Select all 1 shown')).not.toBeNull());
    fireEvent.click(screen.getByLabelText('Select all 1 shown'));

    expect(screen.getByText('1 selected')).not.toBeNull();
    fireEvent.click(screen.getByText('Check 1 with AI'));
    expect(onReview).toHaveBeenCalledWith(['q1']);
  });

  it('offers no group action before anything is selected', () => {
    render(<Harness />);
    expect(screen.queryByText(/^Check \d+ with AI/)).toBeNull();
  });

  it('says how many are already checked, and skips them in one press', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Select all 3 shown'));

    expect(screen.getByText('3 selected')).not.toBeNull();
    expect(screen.getByText('2 already checked by AI')).not.toBeNull();

    fireEvent.click(screen.getByText('Skip them'));
    expect(screen.getByText('1 selected')).not.toBeNull();
  });

  it('sends one question from its own row', async () => {
    const onReview = vi.fn();
    render(<Harness onReview={onReview} />);

    fireEvent.click(within(screen.getByTestId('question-row-2')).getByRole('button', { name: /^Question 2,/ }));
    await waitFor(() => expect(screen.getByText('Check with AI')).not.toBeNull());
    fireEvent.click(screen.getByText('Check with AI'));
    expect(onReview).toHaveBeenCalledWith(['q2']);
  });

  it('opens the editor for one question from its own row', async () => {
    const onEdit = vi.fn();
    render(<Harness onEdit={onEdit} />);

    fireEvent.click(within(screen.getByTestId('question-row-1')).getByRole('button', { name: /^Question 1,/ }));
    await waitFor(() => expect(screen.getByText('Edit question')).not.toBeNull());
    fireEvent.click(screen.getByText('Edit question'));
    expect(onEdit).toHaveBeenCalledWith('q1');
  });
});

describe('an opened question', () => {
  it('shows each option with how many picked it, and which is right', async () => {
    render(<Harness />);
    fireEvent.click(within(screen.getByTestId('question-row-1')).getByRole('button', { name: /^Question 1,/ }));

    await waitFor(() => expect(screen.getByTestId('correct-option')).not.toBeNull());
    const correct = screen.getByTestId('correct-option');
    expect(correct.textContent).toContain('Bronze Age civilization');
    expect(correct.textContent).toContain('Correct');
    // Stone Age and Copper Age: 4 of the 9 who answered each. Iron Age: 1.
    expect(screen.getAllByText('4 · 44%')).toHaveLength(2);
    expect(screen.getByText('1 · 11%')).not.toBeNull();
    expect(
      screen.getByText('Check this question. At this rate it is more likely unclear than hard.'),
    ).not.toBeNull();
  });

  it('shows what the AI changed, the old answer struck through above the new', async () => {
    render(<Harness />);
    fireEvent.click(within(screen.getByTestId('question-row-3')).getByRole('button', { name: /^Question 3,/ }));

    await waitFor(() => expect(screen.getByText(/What changed/)).not.toBeNull());
    expect(screen.getByText(/when 17% were getting it right/)).not.toBeNull();
    expect(screen.getByText('A. Dhanga')).not.toBeNull();
    expect(screen.getByText('B. Jajati Kesari')).not.toBeNull();
    expect(screen.getByText('The book credits Jajati Kesari.')).not.toBeNull();
  });
});
