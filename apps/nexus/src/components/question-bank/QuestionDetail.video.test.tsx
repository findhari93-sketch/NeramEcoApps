import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NexusQBQuestionDetail } from '@neram/database';

/**
 * The solution video on a practice question: promised before answering,
 * played after.
 */

vi.mock('@/components/video/NeramVideoPlayer', () => ({
  default: (props: { source: unknown }) => <div data-testid="player" data-source={JSON.stringify(props.source)} />,
}));

const { default: QuestionDetail } = await import('./QuestionDetail');

function question(video: string | null): NexusQBQuestionDetail {
  return {
    id: 'q31',
    question_text: 'Which figure completes the series?',
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
    ],
    correct_answer: 'a',
    solution_video_url: video,
    solution_image_url: null,
    explanation_brief: null,
    explanation_detailed: null,
    categories: [],
    difficulty: 'MEDIUM',
    sources: [],
    repeat_sources: [],
    attempts: [],
    is_studied: false,
    display_order: 31,
    drawing_parts: null,
  } as unknown as NexusQBQuestionDetail;
}

const props = {
  onSubmit: vi.fn(async () => {}),
  onNext: vi.fn(),
  onPrev: vi.fn(),
  hasNext: false,
  hasPrev: false,
  currentIndex: 30,
  totalCount: 80,
  inline: true,
};

describe('QuestionDetail and the solution video', () => {
  it('tells the student a video is waiting before they answer', () => {
    render(<QuestionDetail question={question('https://www.youtube.com/watch?v=U1X9MmLh-ZQ')} {...props} />);
    expect(screen.getByText('A video solution unlocks when you submit')).not.toBeNull();
  });

  it('promises nothing when there is no video', () => {
    render(<QuestionDetail question={question(null)} {...props} />);
    expect(screen.queryByText('A video solution unlocks when you submit')).toBeNull();
  });

  it('plays the video after submitting, including a shared watch link', async () => {
    // `watch?feature=share&v=` is what the YouTube app's Share button copies.
    // The old private regex missed it and handed a YouTube web page to the
    // HTML5 player.
    render(<QuestionDetail question={question('https://www.youtube.com/watch?feature=share&v=U1X9MmLh-ZQ')} {...props} />);
    fireEvent.click(screen.getByText('One'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await waitFor(() => expect(screen.getByTestId('player')).not.toBeNull());
    expect(JSON.parse(screen.getByTestId('player').getAttribute('data-source')!)).toEqual({
      kind: 'youtube',
      youtubeId: 'U1X9MmLh-ZQ',
    });
    expect(screen.queryByText('A video solution unlocks when you submit')).toBeNull();
  });
});
