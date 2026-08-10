import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperWorkspace from './PaperWorkspace';

const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`, question_text: `Question ${n}`, question_format: 'MCQ',
  options: [{ id: 'a', text: 'A' }], correct_answer: 'a', display_order: n,
  section: 'math_mcq', status: 'active', is_active: true, categories: [],
})) as unknown as NexusQBQuestion[];

const base = {
  questions,
  getToken: async () => 'token',
  onSaved: () => {},
  onChangeSections: vi.fn().mockResolvedValue(undefined),
};

describe('PaperWorkspace', () => {
  it('opens with nothing selected, so the teacher sees the whole paper first', () => {
    render(<PaperWorkspace {...base} />);
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });

  it('loads a clicked question into the pane', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(screen.getByText('2 of 3')).not.toBeNull();
  });

  it('walks the paper with j and k', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByText('2 of 3')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('ignores j and k while the teacher is typing in a field', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    const field = screen.getByLabelText('Question text');
    field.focus();
    fireEvent.keyDown(field, { key: 'j' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('closes the pane on Escape', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Select a question to edit it')).not.toBeNull();
  });

  /**
   * Position counts paper order, not display_order. A paper with a gap in its
   * numbering would otherwise claim '5 of 3'.
   */
  it('counts position by paper order, not by the printed question number', () => {
    const gappy = [
      { ...questions[0], display_order: 7 },
      { ...questions[1], display_order: 42 },
    ] as NexusQBQuestion[];
    render(<PaperWorkspace {...base} questions={gappy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 42' }));
    expect(screen.getByText('2 of 2')).not.toBeNull();
  });
});
