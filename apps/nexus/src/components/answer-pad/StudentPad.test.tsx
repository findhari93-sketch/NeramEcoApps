import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  /** Snapshots for other rounds, by session id; anything else gets `snapshot`. */
  bySession: {} as Record<string, unknown>,
  sessions: [] as string[],
  error: null as unknown,
  refresh: vi.fn(async () => undefined),
  padFetch: vi.fn(),
}));

vi.mock('./usePadSnapshot', () => ({
  usePadSnapshot: ({ sessionId }: { sessionId: string }) => {
    mocks.sessions.push(sessionId);
    return { snapshot: mocks.bySession[sessionId] ?? mocks.snapshot, error: mocks.error, realtime: 'unavailable', refresh: mocks.refresh };
  },
  usePadHeartbeat: () => undefined,
}));

vi.mock('@/components/students/StudentAvatar', () => ({ default: () => null }));

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
  mocks.bySession = {};
  mocks.sessions = [];
  mocks.error = null;
  mocks.padFetch.mockReset();
  mocks.refresh.mockClear();
});

const LOCK_WORDS = /lock it|can't change it|Lock answer/i;

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
    expect(screen.getByText('Locked: C')).toBeTruthy();
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

  it('saves an answer with one tap, shows it as chosen, and keeps the options live', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockReturnValue(new Promise(() => undefined));
    render(pad());

    expect(screen.getByText('You can change your answer until your teacher closes answers.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Answer B' }));

    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/submit', { method: 'POST', body: { promptId: 'p1', answer: 'B' } });
    expect(await screen.findByText('Your answer: B')).toBeTruthy();
    expect(screen.getByText('Saving')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer B' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Answer A' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.body.textContent).not.toMatch(LOCK_WORDS);
  });

  it('changes the answer with another tap while the question is open', async () => {
    mocks.snapshot = snap({ my_response: response('B') });
    mocks.padFetch.mockResolvedValue({ status: 'changed', answer: 'C' });
    const { rerender } = render(pad());

    expect(screen.getByText('Your answer: B')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();

    // Tapping the chosen answer again sends nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Answer B' }));
    expect(mocks.padFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Answer C' }));
    await waitFor(() =>
      expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/submit', { method: 'POST', body: { promptId: 'p1', answer: 'C' } }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());

    // The server's answer wins once the refresh lands.
    mocks.snapshot = snap({ my_response: { ...response('C'), change_count: 1 } });
    rerender(pad());
    expect(await screen.findByText('Your answer: C')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer C' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps trying to save the answer while the connection is down', async () => {
    mocks.snapshot = snap();
    mocks.padFetch.mockRejectedValue(new PadClientError(0, 'OFFLINE', 'No connection'));
    const { unmount } = render(pad());

    fireEvent.click(screen.getByRole('button', { name: 'Answer C' }));

    expect(await screen.findByText('No connection, still trying')).toBeTruthy();
    expect(screen.getByText('Your answer: C')).toBeTruthy();
    unmount();
  });

  it("shows the server's saved answer after a reload, with the options still live", () => {
    mocks.snapshot = snap({ my_response: response('B') });
    render(pad());
    expect(screen.getByText('Your answer: B')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Choose your answer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Answer B' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('locks the answer when the teacher closes answers', () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }), my_response: response('B') });
    render(pad());
    expect(screen.getByText('Locked: B')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Choose your answer' })).toBeNull();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('shows the answer that stands, not an error, when a change arrives after close', async () => {
    mocks.snapshot = snap({ my_response: response('A') });
    mocks.padFetch.mockRejectedValue(new PadClientError(409, 'PROMPT_NOT_OPEN', 'PROMPT_NOT_OPEN', { code: 'PROMPT_NOT_OPEN', state: 'closed', answer: 'A' }));
    render(pad());

    fireEvent.click(screen.getByRole('button', { name: 'Answer D' }));
    expect(await screen.findByText('Locked: A')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not be sent/)).toBeNull();
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

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '12..5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

    expect(await screen.findByText('That answer does not fit this question. Please check it.')).toBeTruthy();
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('12..5');
  });

  it('gives a numerical question the maths keys, and sends the formula as typed', async () => {
    mocks.snapshot = snap({ prompt: prompt({ answer_type: 'numeric', option_count: null }) });
    mocks.padFetch.mockResolvedValue({ status: 'accepted', answer: '3.46410161514', rawAnswer: '2√(3)', respondedAt: '2026-09-10T10:00:05Z' });
    render(pad());

    const box = screen.getByLabelText('Your answer') as HTMLInputElement;
    expect(screen.getByRole('group', { name: 'Maths keys' })).toBeTruthy();
    fireEvent.change(box, { target: { value: '2' } });
    box.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Square root' }));
    expect(box.value).toBe('2√()');
    fireEvent.change(box, { target: { value: '2√(3)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

    await waitFor(() => expect(mocks.padFetch).toHaveBeenCalled());
    const [, url, init] = mocks.padFetch.mock.calls[0];
    expect(url).toBe('/api/pad/submit');
    expect((init as { body: { answer: string } }).body.answer).toBe('2√(3)');
  });

  it('shows a locked formula answer as the student wrote it, not as its stored value', () => {
    mocks.snapshot = snap({
      prompt: prompt({ answer_type: 'numeric', option_count: null, state: 'closed', version: 2 }),
      my_response: { ...response('3.46410161514'), raw_answer: '2√3' },
    });
    render(pad());
    expect(screen.getByText(/Locked: 2√3/)).toBeTruthy();
    expect(screen.queryByText(/3\.4641016/)).toBeNull();
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
    expect(screen.queryByText('Tap your answer.')).toBeNull();
    expect(screen.getByText('You can change your answer until your teacher closes answers.')).toBeTruthy();
    expect(screen.queryByText('NATA Evening Batch')).toBeNull();
    expect(screen.queryByText('No score yet')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Answer / })).toHaveLength(4);
  });

  it('says the round has ended and results are coming, until the teacher publishes', () => {
    mocks.snapshot = snap({
      session: { id: 's1', status: 'ended', hint_topic: 'pad-x', classroom_name: 'NATA Evening Batch', round_no: 2, results_published_at: null },
      score: { correct: 3, wrong: 1, skipped: 0, absent: 1, total_graded: 4 },
    });
    render(pad());
    expect(screen.getByText('Results coming soon')).toBeTruthy();
    expect(screen.getByText('Round 2 has ended. Your teacher will share the results soon.')).toBeTruthy();
    expect(mocks.padFetch).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('shows the round result card once the teacher publishes', async () => {
    mocks.snapshot = snap({
      session: { id: 's1', status: 'ended', hint_topic: 'pad-x', classroom_name: 'NATA Evening Batch', round_no: 2, results_published_at: '2026-09-10T11:00:00Z' },
    });
    mocks.padFetch.mockResolvedValue({
      published: true,
      status: 'ended',
      round_no: 2,
      me: {
        student_id: 'me',
        name: 'Asha',
        correct: 12,
        wrong: 4,
        no_answer: 2,
        excused: 0,
        away: 0,
        counted: 18,
        attempted: 16,
        answered: 16,
        present_for: 18,
        score_pct: 67,
        accuracy_pct: 75,
        participation_pct: 89,
        label: 'good',
        not_active: false,
        rank: 7,
        ranked_of: 22,
        in_top: false,
      },
      top: [],
      class: { questions: 18, graded: 18, took_part: 22, average_score: 61 },
    });
    render(pad());

    expect(await screen.findByText('12 of 16')).toBeTruthy();
    expect(screen.getByText('7 of 22')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/sessions/s1/my-result');
    expect(screen.getByText('Good')).toBeTruthy();
    expect(screen.getByText('Class average 61%')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('follows the next round on its own when the teacher starts one', () => {
    mocks.snapshot = snap({
      session: { id: 's1', status: 'ended', hint_topic: 'pad-x', classroom_name: 'NATA Evening Batch', round_no: 1, next_session_id: 's2' },
    });
    mocks.bySession.s2 = snap({
      session: { id: 's2', status: 'live', hint_topic: 'pad-y', classroom_name: 'NATA Evening Batch', round_no: 2 },
      prompt: prompt({ id: 'p9', label: '7' }),
    });
    render(pad());

    expect(mocks.sessions).toContain('s2');
    expect(screen.getByRole('heading', { name: 'Q.7' })).toBeTruthy();
    expect(screen.getByText('NATA Evening Batch · Round 2')).toBeTruthy();
    expect(screen.queryByText('Results coming soon')).toBeNull();
  });

  it("tells the student when the teacher accepts their reason, or asks them to try", () => {
    mocks.snapshot = snap({ my_skip: { reason: 'dont_know', note: null, approval: 'approved' } });
    const { rerender } = render(pad());
    expect(screen.getByText("Your teacher accepted your reason. This question won't count against you.")).toBeTruthy();

    mocks.snapshot = snap({ my_skip: { reason: 'dont_know', note: null, approval: 'rejected' } });
    rerender(pad());
    expect(screen.getByText('Your teacher would like you to try this one. A guess is fine.')).toBeTruthy();
    expect(screen.queryByText(/accepted your reason/)).toBeNull();

    // Still there after the question closes, so the student knows it did not count.
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }), my_skip: { reason: 'dont_know', note: null, approval: 'approved' } });
    rerender(pad());
    expect(screen.getByText("Your teacher accepted your reason. This question won't count against you.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  describe('a timed question from Present to class', () => {
    const NOW = Date.parse('2026-09-10T10:00:00Z');
    const at = (seconds: number) => new Date(NOW + seconds * 1_000).toISOString();

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows the time left beside the question, and warns in the last ten seconds once', () => {
      mocks.snapshot = snap({ prompt: prompt({ label: '38', closes_at: at(42), time_limit_s: 60 }) });
      const { rerender } = render(pad());
      expect(screen.getByRole('timer', { name: '0:42 left' })).toBeTruthy();
      expect(screen.queryByText(/seconds left/)).toBeNull();

      mocks.snapshot = snap({ server_time: at(1), prompt: prompt({ label: '38', closes_at: at(9), time_limit_s: 60, version: 2 }) });
      rerender(pad());
      expect(screen.getByRole('timer', { name: /^0:0[89] left$/ })).toBeTruthy();
      expect(screen.getByText(/^[89] seconds left$/)).toBeTruthy();
    });

    it('locks the answer at 0 even before the snapshot says closed, keeping the answer that stands', () => {
      vi.useFakeTimers({ now: NOW });
      mocks.snapshot = snap({ prompt: prompt({ closes_at: at(2), time_limit_s: 30 }), my_response: response('B') });
      render(pad());
      expect(screen.getByRole('group', { name: 'Choose your answer' })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(screen.getByText('Time is up')).toBeTruthy();
      expect(screen.getByText('Your answer B is locked. Your teacher will share the answer, now or after class.')).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'Choose your answer' })).toBeNull();
      expect(document.body.textContent).not.toMatch(NO_DASHES);
    });

    it('says time is up to a student who did not answer in time', () => {
      mocks.snapshot = snap({ prompt: prompt({ closes_at: at(-1), time_limit_s: 30 }) });
      render(pad());
      expect(screen.getByText('Time is up')).toBeTruthy();
      expect(screen.getByText('No answer reached your teacher in time. Wait for the next question.')).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'Choose your answer' })).toBeNull();
    });

    it('keeps sending a tap made before 0, and never cancels it', async () => {
      vi.useFakeTimers({ now: NOW });
      mocks.snapshot = snap({ prompt: prompt({ closes_at: at(2), time_limit_s: 30 }) });
      mocks.padFetch.mockReturnValue(new Promise(() => undefined));
      render(pad());

      fireEvent.click(screen.getByRole('button', { name: 'Answer C' }));
      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(screen.getByText('Sending your answer')).toBeTruthy();
      expect(screen.getByText('Sending C.')).toBeTruthy();
      expect(mocks.padFetch).toHaveBeenCalledTimes(1);
    });

    it('shows the answer that stands when the server says the time was up', async () => {
      mocks.snapshot = snap({ prompt: prompt({ closes_at: at(20), time_limit_s: 30 }), my_response: response('A') });
      mocks.padFetch.mockRejectedValue(
        new PadClientError(409, 'PROMPT_NOT_OPEN', 'PROMPT_NOT_OPEN', { code: 'PROMPT_NOT_OPEN', state: 'closed', time_up: true, answer: 'A' }),
      );
      render(pad());

      fireEvent.click(screen.getByRole('button', { name: 'Answer D' }));
      expect(await screen.findByText('Time is up')).toBeTruthy();
      expect(screen.getByText('Your answer A is locked. Your teacher will share the answer, now or after class.')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('a question bank question', () => {
    const qb = {
      format: 'mcq',
      text: 'Which of these is a load bearing wall?',
      image_url: 'https://db.neramclasses.com/storage/v1/object/public/qb/q1.png',
      options: [
        { text: 'Both correct', image_url: null },
        { text: 'Only the first one, when the span is longer than the height of the room by a wide margin', image_url: null },
        { text: null, image_url: 'https://db.neramclasses.com/storage/v1/object/public/qb/c.png' },
        { text: 'None', image_url: null },
      ],
      solution: null,
    };

    it('keeps the answer buttons first and folds the question away in the Teams side panel', () => {
      mocks.snapshot = snap({ prompt: prompt({ label: '38', qb }) });
      render(pad());

      const buttons = screen.getAllByRole('button', { name: /^Answer / });
      const toggle = screen.getByRole('button', { name: 'Show question' });
      expect(buttons).toHaveLength(4);
      expect(buttons[3].compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeTruthy();
      expect(screen.queryByText('Which of these is a load bearing wall?')).toBeNull();

      // Short plain options sit on the buttons; the long one stays letter only.
      expect(screen.getByRole('button', { name: 'Answer A, Both correct' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Answer B' })).toBeTruthy();

      fireEvent.click(toggle);
      expect(screen.getByRole('button', { name: 'Hide question' }).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Which of these is a load bearing wall?')).toBeTruthy();
    });

    it('shows the question open on the browser pad: text, picture, the long option and figure options to enlarge', () => {
      mocks.snapshot = snap({ prompt: prompt({ label: '38', qb }) });
      render(<StudentPad host={{ ...host, kind: 'browser', frame: 'content' }} sessionId="s1" />);

      expect(screen.getByRole('button', { name: 'Hide question' }).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Which of these is a load bearing wall?')).toBeTruthy();
      expect((screen.getByAltText('Picture for Q.38') as HTMLImageElement).src).toBe(qb.image_url);
      expect(screen.getByText('B.')).toBeTruthy();
      expect(screen.getByText(qb.options[1].text as string)).toBeTruthy();
      // Already on the buttons: not listed twice.
      expect(screen.queryByText('A.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Show option C larger' })).toBeTruthy();
      expect((screen.getByAltText('Option C') as HTMLImageElement).src).toBe(qb.options[2].image_url);
    });

    it('never shows an answer for the question', () => {
      mocks.snapshot = snap({ prompt: prompt({ label: '38', qb }) });
      render(<StudentPad host={{ ...host, kind: 'browser', frame: 'content' }} sessionId="s1" />);
      expect(document.body.textContent).not.toMatch(/question bank|correct answer|The answer was|Solution/i);
      expect(document.body.textContent).not.toMatch(NO_DASHES);
    });
  });

  it('explains when the student is not on the class list', () => {
    mocks.error = new PadClientError(403, 'NOT_ENROLLED', 'NOT_ENROLLED');
    render(pad());
    expect(screen.getByText(/You are not on the class list for this session/)).toBeTruthy();
  });
});
