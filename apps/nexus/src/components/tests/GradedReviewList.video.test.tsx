import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GradedReviewItem } from './GradedReviewList';

/**
 * The solution video in a test review, under the written explanation.
 *
 * An 80-question review must not load 80 YouTube frames, so a video mounts only
 * when the student asks for it.
 */

vi.mock('@/components/video/NeramVideoPlayer', () => ({
  default: (props: { source: unknown; title?: string }) => (
    <div data-testid="player" data-source={JSON.stringify(props.source)} title={props.title} />
  ),
}));
vi.mock('@/components/tests/ExplanationPanel', () => ({ default: () => null }));

const { default: GradedReviewList } = await import('./GradedReviewList');

const row = (over: Partial<GradedReviewItem> = {}): GradedReviewItem => ({
  question_id: 'q31',
  question_text: 'Which figure completes the series?',
  options: null,
  correct_answer: 'a',
  selected: 'b',
  is_correct: false,
  is_gradable: true,
  explanation: null,
  ...over,
});

const getToken = async () => 't';

describe('GradedReviewList solution video', () => {
  it('offers the video and plays it only when asked', () => {
    render(
      <GradedReviewList
        review={[row({ solution_videos: [{ label: null, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' }] })]}
        getToken={getToken}
      />,
    );
    expect(screen.queryByTestId('player')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Watch the video solution' }));
    expect(JSON.parse(screen.getByTestId('player').getAttribute('data-source')!)).toEqual({
      kind: 'youtube',
      youtubeId: 'U1X9MmLh-ZQ',
    });
  });

  it('offers one video per part of a split drawing', () => {
    render(
      <GradedReviewList
        review={[
          row({
            solution_videos: [
              { label: 'A', url: 'https://youtu.be/U1X9MmLh-ZQ' },
              { label: 'B', url: 'https://youtu.be/x2fO__sSSzU' },
            ],
          }),
        ]}
        getToken={getToken}
      />,
    );
    expect(screen.getByRole('button', { name: 'Watch the video for part A' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Watch the video for part B' }));
    expect(screen.getByTestId('player').getAttribute('title')).toBe('Solution video for part B');
  });

  it('shows nothing for a question without a video, or a review from before videos', () => {
    render(<GradedReviewList review={[row({ solution_videos: [] }), row({ question_id: 'q32' })]} getToken={getToken} />);
    expect(screen.queryByRole('button', { name: /Watch the video/ })).toBeNull();
  });
});
