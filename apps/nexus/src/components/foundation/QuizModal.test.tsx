import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuizModal from './QuizModal';

/**
 * The checkpoint moment, from the student's side.
 *
 * Playback stops, and then one of three things is true: the questions are on
 * their way, the questions arrived, or the fetch failed. Only the middle one
 * used to be drawn here. The spinner and the failure lived on the page below the
 * player, which is not painted while the player is fullscreen, so a slow network
 * showed a paused video with no explanation and a failed fetch showed one
 * forever, with the retry button somewhere the student could not reach.
 */

const QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What did the tutor draw first?',
    option_a: 'A plan',
    option_b: 'A section',
    option_c: 'An elevation',
    option_d: 'A perspective',
  },
];

const noop = () => {};
const baseProps = {
  sectionTitle: 'Roof geometry',
  questions: QUESTIONS,
  onClose: noop,
  onSubmit: async () => ({
    passed: true,
    score_pct: 100,
    correct_count: 1,
    total_count: 1,
    questions: [],
  }),
  onRetry: noop,
  onContinue: noop,
};

describe('QuizModal: the three states of a checkpoint', () => {
  it('says the questions are coming rather than showing an empty panel', () => {
    render(<QuizModal {...baseProps} open questions={[]} dismissable={false} loadingQuestions />);

    expect(screen.getByText(/getting your checkpoint questions/i)).toBeTruthy();
    // Submitting nothing would pass a checkpoint with no answers in it.
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
  });

  it('shows a failed fetch with a retry, in the panel rather than off screen', () => {
    const onRetryLoad = vi.fn();
    render(
      <QuizModal
        {...baseProps}
        open
        questions={[]}
        dismissable={false}
        loadError="The network dropped"
        onRetryLoad={onRetryLoad}
      />,
    );

    // role="alert" so it is announced, not just coloured. A student who cannot
    // see the panel is exactly who this state is for.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('The network dropped')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it('draws the questions once they arrive', () => {
    render(<QuizModal {...baseProps} open dismissable={false} />);

    expect(screen.getByText('What did the tutor draw first?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy();
    expect(screen.queryByText(/getting your checkpoint questions/i)).toBeNull();
  });
});

describe('QuizModal: a mandatory checkpoint', () => {
  it('names itself a checkpoint, so the pause is explained', () => {
    render(<QuizModal {...baseProps} open dismissable={false} />);
    expect(screen.getByText('Checkpoint')).toBeTruthy();
    expect(screen.getByText('Roof geometry')).toBeTruthy();
  });

  it('offers no way to close', () => {
    render(<QuizModal {...baseProps} open dismissable={false} />);
    expect(screen.queryByRole('button', { name: /close the quiz/i })).toBeNull();
  });

  it('a redo, which is optional, can be closed', () => {
    const onClose = vi.fn();
    render(<QuizModal {...baseProps} open dismissable onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close the quiz/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // "Checkpoint" is the eyebrow for the mandatory case only; a redo is not
    // what stopped the video.
    expect(screen.queryByText('Checkpoint')).toBeNull();
  });
});
