import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperQuestionDetail from './PaperQuestionDetail';

const question = {
  id: 'q4', question_text: 'The mean deviation of an ungrouped data is 10',
  question_format: 'MCQ', options: [{ id: 'a', text: '10.4' }],
  correct_answer: 'a', display_order: 4, section: 'math_mcq',
  status: 'active', is_active: true, categories: [],
} as unknown as NexusQBQuestion;

const base = {
  getToken: async () => 'token',
  onSaved: () => {},
  onClose: () => {},
  onChangeSection: async () => {},
};

describe('PaperQuestionDetail', () => {
  it('invites the teacher to pick a question when none is open', () => {
    render(<PaperQuestionDetail {...base} question={null} position={null}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });

  it('says where you are in the paper', () => {
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByText('4 of 92')).not.toBeNull();
  });

  it('moves with the previous and next buttons', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
      onPrevious={onPrevious} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('stops at the ends rather than wrapping round', () => {
    render(<PaperQuestionDetail {...base} question={question} position={{ index: 1, total: 92 }}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous question' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next question' })).toHaveProperty('disabled', false);
  });

  /**
   * Not in the plan. The pane is the only route to the form now, so if it does
   * not carry the paper down, the Source panel goes back to reading
   * 'Not recorded' for every question on a paper whose source rows are missing.
   */
  it('carries the paper down to the form, so the exam is not lost', () => {
    render(
      <PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
        paper={{ exam_type: 'JEE_PAPER_2', year: 2026, session: null }}
        onPrevious={() => {}} onNext={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Source & Format/i }));
    expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('2026');
  });
});
