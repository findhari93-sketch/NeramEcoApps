import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NexusQBQuestionDetail } from '@neram/database';
import type { QuestionAnswerState } from './useQuestionAnswer';

/**
 * QuestionDetail inside the practice reader: the answer, the language and the
 * buttons belong to the reader, and the component must follow them.
 */

vi.mock('@/components/video/NeramVideoPlayer', () => ({ default: () => <div /> }));

const { default: QuestionDetail } = await import('./QuestionDetail');

const question = {
  id: 'q1',
  question_text: 'Pick one',
  question_text_hi: 'एक चुनें',
  question_format: 'MCQ',
  options: [
    { id: 'a', text: 'One', text_hi: 'एक' },
    { id: 'b', text: 'Two', text_hi: 'दो' },
  ],
  correct_answer: 'a',
  solution_video_url: null,
  solution_image_url: null,
  explanation_brief: null,
  explanation_detailed: null,
  categories: [],
  difficulty: 'MEDIUM',
  sources: [],
  repeat_sources: [],
  attempts: [],
  is_studied: false,
  drawing_parts: null,
} as unknown as NexusQBQuestionDetail;

const nav = { onNext: vi.fn(), onPrev: vi.fn(), hasNext: true, hasPrev: false, currentIndex: 0, totalCount: 2 };

function answer(over: Partial<QuestionAnswerState> = {}): QuestionAnswerState {
  return {
    selected: null,
    submitted: false,
    isCorrect: null,
    submitting: false,
    error: null,
    showFeedback: false,
    select: vi.fn(),
    submit: vi.fn(async () => {}),
    reset: vi.fn(),
    ...over,
  };
}

describe('QuestionDetail, controlled', () => {
  it('follows the language it is given and hides its own switch', () => {
    render(<QuestionDetail question={question} onSubmit={vi.fn(async () => {})} {...nav} lang="hi" hideNav hideActions />);
    expect(screen.getByText('एक चुनें')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'हि' })).toBeNull();
  });

  it('keeps its own switch when nobody owns the language', () => {
    render(<QuestionDetail question={question} onSubmit={vi.fn(async () => {})} {...nav} />);
    expect(screen.getByRole('button', { name: 'हि' })).not.toBeNull();
  });

  it('leaves Submit and the nav to the caller', () => {
    render(<QuestionDetail question={question} onSubmit={vi.fn(async () => {})} {...nav} hideNav hideActions />);
    expect(screen.queryByRole('button', { name: 'Submit Answer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next question' })).toBeNull();
  });

  it('shows and changes the answer the caller holds', () => {
    const a = answer({ selected: 'b' });
    render(<QuestionDetail question={question} onSubmit={vi.fn(async () => {})} {...nav} answer={a} hideActions />);
    expect(screen.getByRole('radio', { name: /Two/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('One'));
    expect(a.select).toHaveBeenCalledWith('a');
  });

  it('says when an answer was not saved', () => {
    render(
      <QuestionDetail
        question={question}
        onSubmit={vi.fn(async () => {})}
        {...nav}
        answer={answer({ selected: 'a', error: 'Your answer was not saved. Check your connection and try again.' })}
        hideActions
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('not saved');
  });

  it('shows the verdict the server gave, not its own guess', async () => {
    // The key says a; the server says b was right (a tolerance, an NTA id).
    render(<QuestionDetail question={question} onSubmit={vi.fn(async () => ({ isCorrect: true }))} {...nav} />);
    fireEvent.click(screen.getByText('Two'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await waitFor(() => expect(screen.getByText('Correct!')).not.toBeNull());
  });
});
