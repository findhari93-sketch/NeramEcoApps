import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NexusQBQuestionDetail } from '@neram/database';

/**
 * What a student reads when the drawing state call fails.
 *
 * This panel used to put the server's own words on screen whatever they were,
 * so every student who opened a drawing question read "classroom_id is
 * required" above the upload button. The route was asking for a classroom the
 * panel had no way to supply, and because the call failed, the state never
 * loaded and "Show the solutions" could never turn on either.
 *
 * Two rules come out of that. The panel sends no classroom, and a message
 * written for developers never reaches a student.
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

const { default: DrawingPracticePanel } = await import('./DrawingPracticePanel');

const question = () =>
  ({
    id: 'q81',
    question_format: 'DRAWING_PROMPT',
    question_text: 'Draw a busy railway platform',
    solution_image_url: null,
    solution_video_url: null,
    drawing_parts: null,
    drawing_marks: 50,
    display_order: 81,
  }) as unknown as NexusQBQuestionDetail;

function stateFails(status: number, error: string) {
  const fetchMock = vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({ error }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DrawingPracticePanel access failures', () => {
  it('offers no solution switch on a question that has no solution', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { unlocked: false, submission: null, revealed_at: null, drawing_question_id: null } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DrawingPracticePanel question={question()} />);
    await screen.findByRole('button', { name: 'Upload my attempt' });

    // Nearly every drawing question in the bank has no solution. Flipping a
    // switch that opens nothing still marked the student's next attempt as
    // drawn with the answer in front of them.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/Draw it first/)).toBeNull();
  });

  it('asks for the drawing state without naming a classroom', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { unlocked: false, submission: null, revealed_at: null, drawing_question_id: null } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DrawingPracticePanel question={question()} />);
    await screen.findByRole('button', { name: 'Upload my attempt' });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/api/question-bank/questions/q81/drawing-state');
    expect(url).not.toContain('classroom');
  });

  it('asks for the one option the student opened', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { unlocked: false, submission: null, revealed_at: null, drawing_question_id: null } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DrawingPracticePanel question={question()} partKey="b" />);
    await screen.findByRole('button', { name: 'Upload my attempt' });

    // 81A and 81B are two unrelated tasks. Without the option in the call,
    // both read one mirror, one thread and one reveal, so uploading A would
    // refuse B and unlocking B would hand over A.
    expect(fetchMock.mock.calls[0][0]).toContain('part=b');
  });

  it('shows a refusal that was written for a person', async () => {
    stateFails(403, 'You need to be in a classroom to use the Question Bank.');

    render(<DrawingPracticePanel question={question()} />);

    expect(
      await screen.findByText('You need to be in a classroom to use the Question Bank.'),
    ).not.toBeNull();
  });

  it('hides a message that was written for us', async () => {
    stateFails(500, 'relation "nexus_qb_drawing_reveals" does not exist');

    render(<DrawingPracticePanel question={question()} />);

    expect(await screen.findByText('Could not load your progress')).not.toBeNull();
    expect(screen.queryByText(/nexus_qb_drawing_reveals/)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
