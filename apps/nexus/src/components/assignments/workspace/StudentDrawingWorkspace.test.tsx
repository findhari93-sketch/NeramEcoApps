import type { ComponentProps } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

let search = '';
const replace = vi.fn((href: string) => {
  const q = href.indexOf('?');
  search = q >= 0 ? href.slice(q + 1) : '';
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/student/assignments/a1',
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/components/video/NeramVideoPlayer', () => ({ default: () => null }));
vi.mock('@/components/drawings/DrawingSubmissionSheet', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Hand in your drawing" /> : null),
}));

import StudentDrawingWorkspace from './StudentDrawingWorkspace';
import { validateTimeline } from '@/lib/sketch-timeline';
import type { StudentDrawingAttempt } from './types';

const DETAIL = {
  id: 'a1',
  title: 'Cube composition',
  class_date: '2026-09-10',
  instructions: 'Draw three cubes in two point perspective.',
  assignment_type: 'drawing' as const,
  submission_format: 'image' as const,
  evaluation_type: 'stars' as const,
  max_marks: 5,
  due_at: null,
  catchup_window_days: 7,
  content_image_url: null,
  reference_images: ['https://x/ref.jpg'],
  content_video_url: null,
  links: [],
  attachments: [],
};

const ORIGINAL_1 = 'https://x/attempt-1.jpg';
const ORIGINAL_2 = 'https://x/attempt-2.jpg';

function attempt(o: Partial<StudentDrawingAttempt>): StudentDrawingAttempt {
  return {
    id: 's1',
    assignment_id: 'a1',
    original_image_url: ORIGINAL_1,
    thumbnail_url: null,
    self_note: null,
    status: 'submitted',
    attempt_number: 1,
    submitted_at: '2026-09-11T10:00:00Z',
    reviewed_at: null,
    tutor_rating: null,
    tutor_marks: null,
    tutor_feedback: null,
    tutor_resources: [],
    reaction: null,
    reviewed_image_url: null,
    corrected_image_url: null,
    ai_overlay_annotations: null,
    released: false,
    review_updating: false,
    ...o,
  };
}

const SKETCH = { v: 1, w: 800, h: 600, ops: [] };

const redoAttempt = attempt({
  status: 'redo',
  released: true,
  reviewed_at: '2026-09-12T10:00:00Z',
  tutor_rating: 3,
  tutor_feedback: 'Keep one eye level for all three cubes.',
  ai_overlay_annotations: [{ id: 'r1', x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: 'Vanishing lines drift' }],
});

const VOICE = {
  id: 'v1',
  submission_id: 's1',
  audio_mime: 'audio/webm',
  duration_ms: 42000,
  base_image_url: ORIGINAL_1,
  sketch: SKETCH,
  sent_at: '2026-09-12T10:00:00Z',
  first_played_at: null,
  heard_fully_at: null,
  max_position_ms: 0,
  play_count: 0,
  created_at: '2026-09-12T10:00:00Z',
  url: 'https://x/voice.webm',
};

function renderWorkspace(props: Partial<ComponentProps<typeof StudentDrawingWorkspace>> = {}) {
  return render(
    <StudentDrawingWorkspace
      detail={DETAIL}
      attempts={[]}
      voiceBySubmission={{}}
      rubric={null}
      submitMode="first"
      lockedReason={null}
      clock={null}
      recording={{ url: null, source: null }}
      getToken={async () => 'token'}
      onChanged={vi.fn()}
      onOpenAttachment={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />,
  );
}

const imagesWithSrc = (src: string) =>
  Array.from(document.querySelectorAll('img')).filter((img) => img.getAttribute('src') === src);

const realCanPlayType = HTMLMediaElement.prototype.canPlayType;
beforeEach(() => {
  search = '';
  replace.mockClear();
  // jsdom answers "" for every format, which would show the can't-play notice.
  HTMLMediaElement.prototype.canPlayType = () => 'probably';
});
afterEach(() => {
  HTMLMediaElement.prototype.canPlayType = realCanPlayType;
});

describe('StudentDrawingWorkspace', () => {
  it('shows the teacher reference and an open brief before anything is handed in', () => {
    renderWorkspace();
    expect(screen.getByText('Not handed in yet')).toBeDefined();
    expect(screen.getByRole('img', { name: 'Reference from your teacher' })).toBeDefined();
    expect(screen.getByText('Draw three cubes in two point perspective.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Submit your drawing' }));
    expect(screen.getByRole('dialog', { name: 'Hand in your drawing' })).toBeDefined();
  });

  it('puts the drawing on screen once, even with a walkthrough voice note', () => {
    expect(validateTimeline(SKETCH)).not.toBeNull();
    renderWorkspace({ attempts: [redoAttempt], voiceBySubmission: { s1: VOICE }, submitMode: 'redo' });

    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeDefined();
    expect(imagesWithSrc(ORIGINAL_1)).toHaveLength(1);
    expect(screen.getByText('Your teacher asked for a redo')).toBeDefined();
    expect(screen.getByText('Keep one eye level for all three cubes.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Redo your drawing' })).toBeDefined();
  });

  it('orders the panel: verdict, listen, what to fix, note, scores, brief', () => {
    renderWorkspace({
      attempts: [redoAttempt],
      voiceBySubmission: { s1: VOICE },
      submitMode: 'redo',
      rubric: {
        criteria: [{ key: 'composition', title: 'Composition', hint: 'How it sits' }],
        by_submission: { s1: { bands: { composition: 3 }, overall: 3 } },
      },
    });
    const rail = screen.getByRole('complementary', { name: 'Feedback and brief' });
    const text = rail.textContent ?? '';
    const order = ['Redo requested', 'Listen first', 'What to fix', "Your teacher's note", 'How you scored', 'The brief'].map(
      (label) => text.indexOf(label),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shows no teacher words while the review has not been handed back', () => {
    renderWorkspace({ attempts: [attempt({})], submitMode: 'replace' });
    expect(screen.getByText('Your teacher has not reviewed this yet')).toBeDefined();
    expect(screen.queryByText('What to fix')).toBeNull();
    expect(screen.queryByText("Your teacher's note")).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace your drawing' })).toBeDefined();
  });

  it('switches attempts in place and says which one is showing', () => {
    const second = attempt({ id: 's2', original_image_url: ORIGINAL_2, submitted_at: '2026-09-13T10:00:00Z' });
    const { rerender } = renderWorkspace({ attempts: [redoAttempt, second], submitMode: 'replace' });

    expect(imagesWithSrc(ORIGINAL_2)).toHaveLength(1);
    expect(imagesWithSrc(ORIGINAL_1)).toHaveLength(0);

    // Phone layout in jsdom: the compact switcher.
    fireEvent.click(screen.getByRole('button', { name: /Showing attempt 2 of 2/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Attempt 1'));
    expect(replace).toHaveBeenLastCalledWith('/student/assignments/a1?attempt=1', { scroll: false });

    rerender(
      <StudentDrawingWorkspace
        detail={DETAIL}
        attempts={[redoAttempt, second]}
        voiceBySubmission={{}}
        rubric={null}
        submitMode="replace"
        lockedReason={null}
        clock={null}
        recording={{ url: null, source: null }}
        getToken={async () => 'token'}
        onChanged={vi.fn()}
        onOpenAttachment={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(imagesWithSrc(ORIGINAL_1)).toHaveLength(1);
    expect(imagesWithSrc(ORIGINAL_2)).toHaveLength(0);
    expect(screen.getByText('This is attempt 1. You have a newer one.')).toBeDefined();
    expect(screen.getByRole('status').textContent).toMatch(/Showing attempt 1 of 2/);
  });

  it('points a link to a missing attempt at the newest', () => {
    search = 'attempt=9';
    renderWorkspace({ attempts: [redoAttempt] });
    expect(replace).toHaveBeenCalledWith('/student/assignments/a1', { scroll: false });
  });
});
