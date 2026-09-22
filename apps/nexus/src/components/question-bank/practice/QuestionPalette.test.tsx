import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NexusQBQuestionListItem, QBAttemptSummary } from '@neram/database';
import QuestionPalette from './QuestionPalette';

function q(id: string, summary: Partial<QBAttemptSummary> | null): NexusQBQuestionListItem {
  return {
    id,
    section: null,
    attempt_summary: summary
      ? { total_attempts: 1, last_attempt_at: null, last_was_correct: true, best_result: true, ...summary }
      : null,
  } as unknown as NexusQBQuestionListItem;
}

const questions = [q('a', { last_was_correct: true }), q('b', { last_was_correct: false }), q('c', null)];
const numbers = new Map([
  ['a', 17],
  ['b', 18],
  ['c', 19],
]);

describe('QuestionPalette', () => {
  it('names each cell with its number and where the student stands', () => {
    render(<QuestionPalette questions={questions} numbers={numbers} currentId="b" onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Question 17, answered right' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Question 18, answered wrong' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Question 19, not answered yet' })).not.toBeNull();
  });

  it('is one tab stop, on the current question', () => {
    render(<QuestionPalette questions={questions} numbers={numbers} currentId="b" onOpen={vi.fn()} />);
    const stops = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('aria-label')).toBe('Question 18, answered wrong');
  });

  it('moves focus with the arrow keys and opens with a tap', () => {
    const onOpen = vi.fn();
    render(<QuestionPalette questions={questions} numbers={numbers} currentId="a" onOpen={onOpen} />);
    const first = screen.getByRole('button', { name: 'Question 17, answered right' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Question 18, answered wrong');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Question 19, not answered yet');
    fireEvent.click(document.activeElement!);
    expect(onOpen).toHaveBeenCalledWith('c');
  });

  it('toggles instead of opening while building a test', () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <QuestionPalette
        questions={questions}
        numbers={numbers}
        currentId="a"
        onOpen={onOpen}
        selecting
        selectedIds={new Set(['a'])}
        onToggleSelect={onToggleSelect}
      />,
    );
    const cell = screen.getByRole('button', { name: 'Question 17, selected for the test' });
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Question 18' }));
    expect(onToggleSelect).toHaveBeenCalledWith('b');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('counts each status in the legend', () => {
    render(<QuestionPalette questions={questions} numbers={numbers} currentId={null} onOpen={vi.fn()} />);
    expect(screen.getByText('Right 1')).not.toBeNull();
    expect(screen.getByText('Wrong 1')).not.toBeNull();
    expect(screen.getByText('Not answered 1')).not.toBeNull();
  });
});
