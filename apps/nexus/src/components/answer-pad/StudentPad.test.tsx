import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { StudentPrompt, StudentSnapshot } from '@/lib/pad/client/types';
import StudentPad from './StudentPad';

/**
 * The student pad renders its snapshot and the one answer it is sending, and
 * nothing else. Each state a student can be in (side-panel spec section 12) is
 * a fixture here: the snapshot hook and the network are replaced, so no class
 * has to be run to see a screen.
 */

const mocks = vi.hoisted(() => ({
  snapshot: null as unknown,
  error: null as unknown,
  refresh: vi.fn(async () => undefined),
  padFetch: vi.fn(),
}));

vi.mock('./usePadSnapshot', () => ({
  usePadSnapshot: () => ({ snapshot: mocks.snapshot, error: mocks.error, realtime: 'unavailable', refresh: mocks.refresh }),
  usePadHeartbeat: () => undefined,
}));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

const host: PadHost = {
  kind: 'test',
  meeting: null,
  frame: 'sidePanel',
  theme: 'light',
  getToken: async () => 'token',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
};

const SCORE = { correct: 0, wrong: 0, skipped: 0, absent: 0, total_graded: 0 };

function prompt(overrides: Partial<StudentPrompt> = {}): StudentPrompt {
  return {
    id: 'p1',
    sequence: 1,
    label: null,
    question_text: null,
    image_url: null,
    option_texts: null,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    version: 1,
    ungraded: null,
    correct_keys: null,
    ...overrides,
  };
}

function snap(overrides: Partial<StudentSnapshot> = {}): StudentSnapshot {
  return {
    ok: true,
    role: 'student',
    server_time: '2026-09-10T10:00:00Z',
    session: { id: 's1', status: 'live', hint_topic: 'pad-x', classroom_name: 'NATA Evening Batch' },
    prompt: prompt(),
    my_response: null,
    my_skip: null,
    nudged_at: null,
    score: SCORE,
    ...overrides,
  };
}

const response = (answer: string, is_correct: boolean | null = null) => ({
  answer,
  raw_answer: answer,
  responded_at: '2026-09-10T10:00:05Z',
  is_correct,
});

/** A fresh element every time: rerendering the same element object would skip the render. */
const pad = () => <StudentPad host={host} sessionId="s1" />;
const NO_DASHES = /[–—]|--/;

beforeEach(() => {
  mocks.snapshot = null;
  mocks.error = null;
  mocks.padFetch.mockReset();
});

describe('StudentPad', () => {
  it('shows it is connected and waiting before the first question, with no score yet', () => {
    mocks.snapshot = snap({ prompt: null });
    render(pad());
    expect(screen.getByText("You're connected")).toBeTruthy();
    expect(screen.getByText('No score yet')).toBeTruthy();
  });

  // The first class: the paper said Q.38 and the pad said Question 1.
  it("names the question as the paper on screen does, with the teacher's question text", () => {
    mocks.snapshot = snap({ prompt: prompt({ label: '38', question_text: 'Which statement is correct?' }) });
    const { rerender } = render(pad());
    expect(screen.getByRole('heading', { name: 'Q.38' })).toBeTruthy();
    expect(screen.getByText('Which statement is correct?')).toBeTruthy();
    expect(screen.queryByText('Question 1')).toBeNull();

    // After answering, the card still says which question it is about.
    mocks.snapshot = snap({ prompt: prompt({ label: '38', state: 'closed' }), my_response: response('C') });
    rerender(pad());
    expect(screen.getByText('Q.38')).toBeTruthy();
    expect(screen.getByText('Answer locked: C')).toBeTruthy();
    expect(screen.getByText('Answering has closed. Your teacher will share the answer, now or after class.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it("shows the teacher's picture of the question and the text of each option", () => {
    const picture = 'https://db.neramclasses.com/storage/v1/object/public/uploads/pad/s1/q38.jpg';
    mocks.snapshot = snap({
      prompt: prompt({ label: '38', image_url: picture, option_texts: ['Both correct', null, 'Both wrong', null] }),
    });
    render(pad());

    expect((screen.getByAltText('Picture for Q.38') as HTMLImageElement).src).toBe(picture);
    expect(screen.getByRole('button', { name: 'Show the picture for Q.38 full screen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer A, Both correct' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer B' })).toBeTruthy();
  });

  it("says why they can't answer, and can still answer afterwards", async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockResolvedValue({ status: 'saved', reason: 'cant_see', note: null });
    const { rerender } = render(pad());

    fireEvent.click(screen.getByRole('button', { name: "I can't answer" }));
    const send = screen.getByRole('button', { name: 'Send to my teacher' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: "I can't see the question" }));
    fireEvent.click(send);

    await waitFor(() =>
      expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/skip', {
        method: 'POST',
        body: { promptId: 'p1', reason: 'cant_see', note: null },
      }),
    );

    mocks.snapshot = snap({ my_skip: { reason: 'cant_see', note: null } });
    rerender(pad());
    expect(await screen.findByText("You told your teacher: I can't see the question. You can still answer above.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer B' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() =>
      expect(mocks.padFetch).toHaveBeenLastCalledWith(host, '/api/pad/skip', { method: 'POST', body: { promptId: 'p1', reason: null, note: null } }),
    );
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('sends a short note with Something else', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockResolvedValue({ status: 'saved' });
    render(pad());

    fireEvent.click(screen.getByRole('button', { name: "I can't answer" }));
    fireEvent.click(screen.getByRole('button', { name: 'Something else' }));
    fireEvent.change(screen.getByLabelText('Tell your teacher (optional)'), { target: { value: 'My pen ran out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to my teacher' }));
    await waitFor(() =>
      expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/skip', {
        method: 'POST',
        body: { promptId: 'p1', reason: 'other', note: 'My pen ran out' },
      }),
    );
  });

  it("shows the teacher's nudge politely and buzzes the phone once per nudge", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    try {
      mocks.snapshot = snap({ prompt: prompt({ label: '38' }), nudged_at: '2026-09-10T10:01:00Z' });
      const { rerender } = render(pad());
      expect(screen.getByText("Your teacher is waiting for your answer to Q.38. A guess is fine, or tap I can't answer.")).toBeTruthy();
      expect(vibrate).toHaveBeenCalledTimes(1);

      rerender(pad());
      expect(vibrate).toHaveBeenCalledTimes(1);

      mocks.snapshot = snap({ prompt: prompt({ label: '38' }), nudged_at: '2026-09-10T10:02:30Z' });
      rerender(pad());
      expect(vibrate).toHaveBeenCalledTimes(2);
    } finally {
      delete (navigator as unknown as Record<string, unknown>).vibrate;
    }
  });

  it('locks an answer with one tap and shows Locking while it travels', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockReturnValue(new Promise(() => undefined));
    render(pad());

    fireEvent.click(screen.getByRole('button', { name: 'Answer B' }));

    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/submit', { method: 'POST', body: { promptId: 'p1', answer: 'B' } });
    expect(await screen.findByText('Locking your answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Answer A' })).toBeNull();
  });

  it('keeps trying to lock the answer while the connection is down', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockRejectedValue(new PadClientError(0, 'OFFLINE', 'No connection'));
    const { unmount } = render(pad());

    fireEvent.click(screen.getByRole('button', { name: 'Answer C' }));

    expect(await screen.findByText('Still trying to lock your answer')).toBeTruthy();
    expect(screen.getByText(/Your answer C will lock as soon as you are back online/)).toBeTruthy();
    unmount();
  });

  it("shows the server's locked answer after a reload instead of the answer buttons", () => {
    mocks.snapshot = snap({ my_response: response('B') });
    render(pad());
    expect(screen.getByText('Answer locked: B')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Choose your answer' })).toBeNull();
  });

  it('says so when the question closed before the answer arrived', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockRejectedValue(new PadClientError(409, 'PROMPT_NOT_OPEN', 'PROMPT_NOT_OPEN'));
    const { rerender } = render(pad());

    fireEvent.click(screen.getByRole('button', { name: 'Answer A' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());

    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }) });
    rerender(pad());
    expect(screen.getByText('This question closed before your answer arrived')).toBeTruthy();
  });

  it('tells a student who opened the pad late that the question closed before they joined', () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }) });
    render(pad());
    expect(screen.getByText('This question closed before you joined')).toBeTruthy();
  });

  it('keeps a typed answer the question cannot take, so the student can fix it', async () => {
    mocks.snapshot = snap({ prompt: prompt({ answer_type: 'numeric', option_count: null }) });
    mocks.padFetch.mockRejectedValue(new PadClientError(400, 'INVALID_ANSWER', 'INVALID_ANSWER'));
    render(pad());

    fireEvent.change(screen.getByLabelText('Your number'), { target: { value: '12..5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock answer' }));

    expect(await screen.findByText('That answer does not fit this question. Please check it.')).toBeTruthy();
    expect((screen.getByLabelText('Your number') as HTMLInputElement).value).toBe('12..5');
  });

  it('shows correct, incorrect and poll results only after REVEAL', () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }), my_response: response('B') });
    const { rerender } = render(pad());
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText(/The answer was/)).toBeNull();

    mocks.snapshot = snap({
      prompt: prompt({ state: 'revealed', version: 3, ungraded: false, correct_keys: ['B'] }),
      my_response: response('B', true),
    });
    rerender(pad());
    expect(screen.getByText('Correct')).toBeTruthy();

    mocks.snapshot = snap({
      prompt: prompt({ state: 'revealed', version: 3, ungraded: false, correct_keys: ['A', 'C'] }),
      my_response: response('B', false),
    });
    rerender(pad());
    expect(screen.getByText('You answered B. The answer was A or C.')).toBeTruthy();

    mocks.snapshot = snap({ prompt: prompt({ state: 'revealed', version: 3, ungraded: true, correct_keys: null }), my_response: response('B') });
    rerender(pad());
    expect(screen.getByText('You answered B. This one was a poll, so it is not graded.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('drops the header and the long hint in the pop-up, so the answer buttons fit without scrolling', () => {
    mocks.snapshot = snap();
    render(<StudentPad host={host} sessionId="s1" compact />);
    expect(screen.getByText('Tap an answer to lock it.')).toBeTruthy();
    expect(screen.queryByText('NATA Evening Batch')).toBeNull();
    expect(screen.queryByText('No score yet')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Answer / })).toHaveLength(4);
  });

  it('shows the final score when the class ends', () => {
    mocks.snapshot = snap({
      session: { id: 's1', status: 'ended', hint_topic: 'pad-x', classroom_name: 'NATA Evening Batch' },
      score: { correct: 3, wrong: 1, skipped: 0, absent: 1, total_graded: 4 },
    });
    render(pad());
    expect(screen.getByText('This class has ended')).toBeTruthy();
    expect(screen.getByText('You got 3 of 4 graded questions.')).toBeTruthy();
  });

  it('explains when the student is not on the class list', () => {
    mocks.error = new PadClientError(403, 'NOT_ENROLLED', 'NOT_ENROLLED');
    render(pad());
    expect(screen.getByText(/You are not on the class list for this session/)).toBeTruthy();
  });
});
