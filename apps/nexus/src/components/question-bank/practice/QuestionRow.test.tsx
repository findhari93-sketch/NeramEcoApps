import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NexusQBQuestionListItem } from '@neram/database';
import QuestionRow from './QuestionRow';

function question(over: Partial<NexusQBQuestionListItem> = {}): NexusQBQuestionListItem {
  return {
    id: 'q18',
    question_text: 'Let N be the set of natural numbers',
    question_text_hi: 'मान लीजिए N प्राकृत संख्याओं का समुच्चय है',
    question_format: 'MCQ',
    difficulty: 'MEDIUM',
    categories: ['mathematics', 'sets_relations'],
    attempt_summary: { total_attempts: 1, last_attempt_at: null, last_was_correct: false, best_result: false },
    has_solution_video: false,
    question_image_url: null,
    ...over,
  } as unknown as NexusQBQuestionListItem;
}

const base = {
  number: 18,
  current: false,
  lang: 'en' as const,
  topic: 'Sets & Relations',
  source: null,
  selecting: false,
  selected: false,
  onOpen: vi.fn(),
  onToggleSelect: vi.fn(),
};

describe('QuestionRow', () => {
  it('reads as the question, its number and its status in one button', () => {
    render(<QuestionRow {...base} question={question()} />);
    const row = screen.getByRole('button');
    expect(row.textContent).toContain('Question 18, answered wrong.');
    expect(row.textContent).toContain('Let N be the set of natural numbers');
    expect(row.textContent).toContain('Medium · Sets & Relations');
  });

  it('marks a question that has a video solution', () => {
    render(<QuestionRow {...base} question={question({ has_solution_video: true })} />);
    expect(screen.getByLabelText('Has a video solution, unlocks after you answer')).not.toBeNull();
    expect(screen.getByText('Video')).not.toBeNull();
  });

  it('shows nothing for a question without one', () => {
    render(<QuestionRow {...base} question={question()} />);
    expect(screen.queryByText('Video')).toBeNull();
  });

  it('prints where it came from only when the list spans papers', () => {
    const { rerender } = render(<QuestionRow {...base} question={question()} />);
    expect(screen.getByRole('button').textContent).not.toContain('JEE 2014');
    rerender(<QuestionRow {...base} question={question()} source="JEE 2014 Q18" />);
    expect(screen.getByRole('button').textContent).toContain('JEE 2014 Q18');
  });

  it('follows the chosen language', () => {
    render(<QuestionRow {...base} question={question()} lang="hi" />);
    expect(screen.getByRole('button').textContent).toContain('प्राकृत');
  });

  it('opens, or toggles while building a test', () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const { rerender } = render(<QuestionRow {...base} question={question()} onOpen={onOpen} onToggleSelect={onToggleSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('q18');
    rerender(<QuestionRow {...base} question={question()} onOpen={onOpen} onToggleSelect={onToggleSelect} selecting selected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button'));
    expect(onToggleSelect).toHaveBeenCalledWith('q18');
  });
});
