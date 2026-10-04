import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnswerKeyPicker, { AnswerBars } from './AnswerKeyPicker';

/**
 * Choosing the key for typed answers on a 300px panel: one answer to a row, so
 * a sentence is never a column one word wide, and only the top answers until
 * the teacher asks for all, with any answer already marked correct always shown.
 */

const LONG = 'distance is scalar, displacement is vector because it has a direction';
const textPrompt = { answer_type: 'text' as const, option_count: null, correct_keys: null, ungraded: false };

describe('AnswerKeyPicker', () => {
  it('lists typed answers one to a row with their counts', () => {
    const onKeys = vi.fn();
    render(
      <AnswerKeyPicker
        prompt={textPrompt}
        groups={[
          { value: 'vector', count: 9 },
          { value: LONG, count: 2 },
        ]}
        busy={null}
        onKeys={onKeys}
        onPoll={vi.fn()}
        onReveal={vi.fn()}
      />,
    );
    const group = screen.getByRole('group', { name: 'Correct answer' });
    expect(getComputedStyle(group).gridTemplateColumns).toBe('minmax(0, 1fr)');
    fireEvent.click(screen.getByRole('button', { name: `${LONG}, 2 answered` }));
    expect(onKeys).toHaveBeenCalledWith([LONG]);
  });

  it('keeps letters in a grid', () => {
    render(
      <AnswerKeyPicker
        prompt={{ answer_type: 'mcq', option_count: 4, correct_keys: null, ungraded: false }}
        groups={[{ value: 'B', count: 3 }]}
        busy={null}
        onKeys={vi.fn()}
        onPoll={vi.fn()}
        onReveal={vi.fn()}
      />,
    );
    expect(getComputedStyle(screen.getByRole('group', { name: 'Correct answer' })).gridTemplateColumns).toContain('repeat');
  });

  it('shows the top answers and any marked correct, and the rest on request', () => {
    const groups = Array.from({ length: 10 }, (_, i) => ({ value: `answer ${i}`, count: 10 - i }));
    render(
      <AnswerKeyPicker
        prompt={{ ...textPrompt, correct_keys: ['answer 9'] }}
        groups={groups}
        busy={null}
        onKeys={vi.fn()}
        onPoll={vi.fn()}
        onReveal={vi.fn()}
      />,
    );
    const choices = () => screen.getAllByRole('button', { name: /^answer \d, \d+ answered/ });
    expect(choices()).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'answer 9, 1 answered, marked correct' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3 other answers' }));
    expect(choices()).toHaveLength(10);
  });
});

describe('AnswerBars', () => {
  it('stacks a long answer above its bar', () => {
    render(<AnswerBars prompt={textPrompt} groups={[{ value: LONG, count: 2 }]} />);
    const item = screen.getByRole('listitem');
    expect(getComputedStyle(item).flexDirection).toBe('column');
    expect(screen.getByText(LONG)).toBeTruthy();
  });
});
