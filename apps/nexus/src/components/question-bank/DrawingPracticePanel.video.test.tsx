import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NexusQBQuestionDetail } from '@neram/database';

/**
 * A single-task drawing's solution video.
 *
 * It was stored, counted on the teacher's side, and never shown: this panel
 * rendered the solution image and nothing else. It now sits behind the same
 * gate as the image.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// One stable getToken, as the real context memoises it. A fresh function per
// render re-keys the panel's load effect and it fetches for ever.
// featureFlags as the real context supplies it: a FlagMap, always present.
// The peer drawings button reads it, and `student.inspiration` is off by
// default, so these tests see the panel without it.
const auth = vi.hoisted(() => ({ getToken: async () => 't', featureFlags: {} }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('@/components/drawings/DrawingSubmissionSheet', () => ({ default: () => null }));
vi.mock('@/components/video/NeramVideoPlayer', () => ({
  default: (props: { source: unknown }) => <div data-testid="player" data-source={JSON.stringify(props.source)} />,
}));

const { default: DrawingPracticePanel } = await import('./DrawingPracticePanel');

const question = (over: Partial<NexusQBQuestionDetail> = {}) =>
  ({
    id: 'q81',
    question_format: 'DRAWING_PROMPT',
    question_text: 'Draw a busy railway platform',
    solution_image_url: null,
    solution_video_url: 'https://youtu.be/U1X9MmLh-ZQ',
    drawing_parts: null,
    drawing_marks: 50,
    display_order: 81,
    ...over,
  }) as unknown as NexusQBQuestionDetail;

function drawingState(unlocked: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { unlocked, submission: null, revealed_at: null, drawing_question_id: null } }),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DrawingPracticePanel and the solution video', () => {
  it('says the video is behind the gate too', async () => {
    drawingState(false);
    render(<DrawingPracticePanel question={question()} />);
    expect(await screen.findByText(/The solution video opens up once you upload your attempt/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Watch the solution video' })).toBeNull();
  });

  it('names both when the drawing has an image and a video', async () => {
    drawingState(false);
    render(<DrawingPracticePanel question={question({ solution_image_url: 'https://cdn/sol.png' })} />);
    expect(await screen.findByText(/The solution image and video open up once you upload your attempt/)).not.toBeNull();
  });

  it('plays the video once the drawing is unlocked', async () => {
    drawingState(true);
    render(<DrawingPracticePanel question={question()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Watch the solution video' }));
    expect(JSON.parse(screen.getByTestId('player').getAttribute('data-source')!)).toEqual({
      kind: 'youtube',
      youtubeId: 'U1X9MmLh-ZQ',
    });
  });

  it('shows no video button for a drawing without one', async () => {
    drawingState(true);
    render(<DrawingPracticePanel question={question({ solution_video_url: null, solution_image_url: 'https://cdn/sol.png' })} />);
    await screen.findByText('SOLUTION IMAGE');
    expect(screen.queryByRole('button', { name: 'Watch the solution video' })).toBeNull();
  });
});
