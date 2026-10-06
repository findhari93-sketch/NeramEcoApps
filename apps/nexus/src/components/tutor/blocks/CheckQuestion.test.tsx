import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TutorBlock } from '@/lib/assistant/tutor/types';
import CheckQuestion from './CheckQuestion';

type CheckBlock = Extract<TutorBlock, { kind: 'check_question' }>;

const block: CheckBlock = {
  id: 'b2',
  kind: 'check_question',
  stepId: 'st1',
  md: 'What is the slope?',
  choices: [
    { id: 'c1', md: '1' },
    { id: 'c2', md: '2' },
    { id: 'c3', md: '3' },
  ],
  tried: ['c2'],
};

describe('CheckQuestion', () => {
  it('letters the choices A, B, C and sends the letter with the text', () => {
    const onChoose = vi.fn();
    render(<CheckQuestion block={block} interactive onChoose={onChoose} />);
    const buttons = screen.getAllByTestId('tutor-choice');
    expect(buttons).toHaveLength(3);
    expect(within(buttons[0]).getByText('A')).toBeTruthy();
    fireEvent.click(buttons[2]);
    expect(onChoose).toHaveBeenCalledWith('c3', 'C. 3');
  });

  it('greys out and disables a tried choice, and says so in words', () => {
    const onChoose = vi.fn();
    render(<CheckQuestion block={block} interactive onChoose={onChoose} />);
    const tried = screen.getByRole('button', { name: 'B, tried already' });
    expect((tried as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Tried')).toBeTruthy();
    fireEvent.click(tried);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('is read-only when it is not the latest open check', () => {
    const onChoose = vi.fn();
    render(<CheckQuestion block={block} interactive={false} onChoose={onChoose} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('What is the slope?')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('disables every choice while a turn is in flight', () => {
    render(<CheckQuestion block={block} interactive disabled onChoose={vi.fn()} />);
    for (const b of screen.getAllByTestId('tutor-choice')) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('points a number check at the answer box', () => {
    render(<CheckQuestion block={{ id: 'b3', kind: 'check_question', stepId: 'st2', md: 'Find $k$.', input: 'number' }} interactive onChoose={vi.fn()} />);
    expect(screen.getByText('Type your answer in the box below.')).toBeTruthy();
    expect(screen.queryAllByTestId('tutor-choice')).toHaveLength(0);
  });
});
