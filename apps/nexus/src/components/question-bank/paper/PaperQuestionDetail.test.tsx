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
  /**
   * The parent (PaperWorkspace) only ever mounts this component for a
   * question that exists, so question=null is a render race, not a "nothing
   * selected" state: the id changed and the new question has not arrived in
   * props yet. It used to be a permanent empty state occupying half the
   * screen even when a question genuinely was selected elsewhere; now it is
   * one blank frame with nothing in it.
   */
  it('renders an empty frame, not a permanent empty state, while the question prop is still catching up', () => {
    render(<PaperQuestionDetail {...base} question={null} position={null}
      onPrevious={() => {}} onNext={() => {}} />);
    expect(screen.queryByText('Select a question to edit it')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous question' })).toBeNull();
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

  /**
   * A teacher who opened a hidden question looked all over this pane for a way
   * to show it again and found nothing: the pane never said the question was
   * hidden at all.
   */
  describe('a question hidden from students', () => {
    const hidden = { ...question, is_active: false, status: 'draft' } as unknown as NexusQBQuestion;

    it('says so, and activates it from the pane', async () => {
      const onSetActive = vi.fn().mockResolvedValue(undefined);
      render(<PaperQuestionDetail {...base} question={hidden} position={{ index: 76, total: 90 }}
        onSetActive={onSetActive} onPrevious={() => {}} onNext={() => {}} />);

      expect(screen.getByText('Hidden from students')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
      expect(onSetActive).toHaveBeenCalledWith(true);
    });

    it('explains what is missing instead of offering an Activate that would do nothing', () => {
      const keyless = { ...hidden, correct_answer: null } as unknown as NexusQBQuestion;
      render(<PaperQuestionDetail {...base} question={keyless} position={{ index: 76, total: 90 }}
        onSetActive={vi.fn()} onPrevious={() => {}} onNext={() => {}} />);

      expect(screen.getByText(/Set the correct answer and save/)).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Activate' })).toHaveProperty('disabled', true);
    });

    it('shows nothing extra on a live question', () => {
      render(<PaperQuestionDetail {...base} question={question} position={{ index: 4, total: 92 }}
        onSetActive={vi.fn()} onPrevious={() => {}} onNext={() => {}} />);
      expect(screen.queryByText('Hidden from students')).toBeNull();
    });
  });
});
