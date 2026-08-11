import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperQuestionRow from './PaperQuestionRow';

function q(overrides: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'q1',
    question_text: 'If the centroid of the triangle with vertices $(3c + 2, 2, 0)$ coincides',
    question_format: 'MCQ',
    options: [{ id: 'a', text: '$c = 1$' }, { id: 'b', text: '$c = 2$' }],
    correct_answer: 'a',
    display_order: 1,
    section: 'math_mcq',
    status: 'active',
    is_active: true,
    categories: [],
    ...overrides,
  } as unknown as NexusQBQuestion;
}

describe('PaperQuestionRow', () => {
  it('typesets the stem instead of printing dollar signs', () => {
    const { container } = render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.textContent).not.toContain('$(3c');
  });

  it('shows the answer letter and the tag count', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={3}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByText('A')).not.toBeNull();
    expect(screen.getByLabelText('3 tags')).not.toBeNull();
  });

  it('marks an untagged question so the gap is visible', () => {
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('No tags')).not.toBeNull();
  });

  it('separates activating the row from ticking its box', () => {
    const onActivate = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open question 1/ }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('passes the shift key through, so a run can be selected', () => {
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }), { shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(true, false);
  });

  it('passes the ctrl key through too, for a toggle that does not open the question', () => {
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }), { ctrlKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(false, true);
  });

  it('shift-clicking the row body extends the selection instead of opening the question', () => {
    const onActivate = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <PaperQuestionRow question={q()} selected={false} active={false} tagCount={1}
        onToggleSelect={onToggleSelect} onActivate={onActivate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open question 1/ }), { shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith(true, false);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('the status is a colour, not a chip, but still has a name a screen reader can announce', () => {
    render(
      <PaperQuestionRow question={q({ status: 'active' })} selected={false} active={false} tagCount={1}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Active')).not.toBeNull();
  });

  it('says a drawing prompt is self-assessed rather than showing a blank answer', () => {
    render(
      <PaperQuestionRow question={q({ question_format: 'DRAWING_PROMPT', correct_answer: null })}
        selected={false} active={false} tagCount={0}
        onToggleSelect={() => {}} onActivate={() => {}} />,
    );
    expect(screen.getByLabelText('Self-assessed')).not.toBeNull();
  });
});
