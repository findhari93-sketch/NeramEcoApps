import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Submitting a paper, when it does not go through.
 *
 * Written from paper acf8084d (History of Architecture Test, an exam) and a
 * student's own words: "when I click submit it is not getting submitted. It just
 * shows the same screen." A failed submit showed nothing; the timer's automatic
 * submit fired once and gave up; a refresh abandoned the paper; and "Try again"
 * on an exam result dropped the student back on their finished paper.
 *
 * Sign-in, navigation, proctoring and the network are replaced. The page itself
 * is real.
 */

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: 'test_id=test-1&placement_id=door-1',
  proctoring: null as null | { onThresholdReached: () => void },
  load: [] as Array<() => unknown>,
  submit: [] as Array<() => unknown>,
  save: [] as Array<() => unknown>,
  attempts: null as null | (() => unknown),
  calls: [] as Array<{ url: string; init?: RequestInit; body: any }>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'token-1', activeClassroom: { id: 'class-1' } }),
}));
vi.mock('@/hooks/useTestProctoring', () => ({
  useTestProctoring: (opts: { onThresholdReached: () => void }) => {
    mocks.proctoring = opts;
    return { fullscreenSupported: false, needsFullscreenGate: false, violationCount: 0, enterFullscreen: vi.fn() };
  },
}));
vi.mock('@/components/common/MathText', () => ({ default: ({ text }: { text: string }) => <span>{text}</span> }));
vi.mock('@/components/tests/OptionBody', () => ({ default: ({ option }: { option: { text: string } }) => <span>{option.text}</span> }));
vi.mock('@/components/tests/SectionStrip', () => ({ default: () => null, buildSectionRuns: () => [] }));
vi.mock('@/components/tests/GradedReviewList', () => ({ default: () => null }));
vi.mock('@/components/tests/AnswerInput', () => ({ default: () => null }));
vi.mock('@/components/question-bank/DrawingPartsView', () => ({ default: () => null }));

import TakeTestPage from './page';

const loadBody = (over: Record<string, unknown> = {}) => ({
  test: {
    id: 'test-1',
    title: 'History of Architecture Test',
    test_type: 'untimed',
    duration_minutes: null,
    per_question_seconds: null,
    total_marks: 1,
  },
  questions: [
    {
      id: 'tq1',
      sort_order: 1,
      marks: 1,
      negative_marks: 0,
      section: null,
      question: {
        id: 'q1',
        question_text: 'Who designed the Parthenon?',
        question_image_url: null,
        question_type: 'MCQ',
        options: [
          { label: 'A', text: 'Ictinus' },
          { label: 'B', text: 'Vitruvius' },
        ],
      },
    },
  ],
  attempt: { id: 'attempt-1', answers: {}, started_at: new Date().toISOString() },
  attempt_number: 1,
  attempts_left_after_this: null,
  proctoring: null,
  ...over,
});

const graded = {
  action: 'submitted',
  result: {
    attempt_id: 'attempt-1',
    attempt_number: 1,
    score: 1,
    total_marks: 1,
    percentage: 100,
    passed: true,
    passing_pct: 50,
    review: [],
  },
};

function installFetch() {
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    mocks.calls.push({ url, init, body });
    if (url.startsWith('/api/tests/attempt?')) {
      const next = mocks.load.length > 1 ? mocks.load.shift()! : mocks.load[0];
      return next ? next() : reply(200, loadBody());
    }
    if (url === '/api/tests/attempt' && body?.action === 'submit') {
      const next = mocks.submit.shift();
      return next ? next() : reply(200, graded);
    }
    if (url === '/api/tests/attempt') {
      const next = mocks.save.shift();
      return next ? next() : reply(200, { action: 'saved' });
    }
    if (url.startsWith('/api/student/tests/test-1/attempts')) {
      return mocks.attempts ? mocks.attempts() : reply(200, { data: { attempts: [], test: null } });
    }
    return reply(200, { data: { recorded: 0 } });
  });
}

const submitCalls = () => mocks.calls.filter((c) => c.url === '/api/tests/attempt' && c.body?.action === 'submit');
const errorReports = () =>
  mocks.calls.filter((c) => c.url === '/api/student/tests/errors').flatMap((c) => c.body?.errors || []);

async function openPaper() {
  const view = render(<TakeTestPage />);
  await screen.findByText('Who designed the Parthenon?');
  return view;
}

async function answerAndSubmit() {
  fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));
  // The bottom bar's Submit, then the confirmation sheet.
  fireEvent.click(screen.getAllByRole('button', { name: /^Submit/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Submit' }));
}

/** Unmounting flushes the error reporter, which otherwise batches for 1.5s. */
async function flushReports(unmount: () => void) {
  unmount();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.search = 'test_id=test-1&placement_id=door-1';
  mocks.proctoring = null;
  mocks.load = [];
  mocks.submit = [];
  mocks.save = [];
  mocks.attempts = null;
  mocks.calls = [];
  installFetch();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a submit that does not go through', () => {
  it('tells the student, keeps their answers, and sends the same answers again on Try again', async () => {
    mocks.submit.push(() => reply(502, {}));
    await openPaper();
    await answerAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Your paper did not submit. Check your connection and try again.')).not.toBeNull();
    // The paper is still there, answer and all.
    expect(screen.getByRole('radio', { name: /Ictinus/ }).getAttribute('aria-checked')).toBe('true');

    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    fireEvent.click(tryAgain);

    expect(await screen.findByText('Passed')).not.toBeNull();
    expect(submitCalls()).toHaveLength(2);
    expect(submitCalls()[1].body.answers).toEqual({ q1: 'A' });
  });

  it("shows the server's own sentence when it sent one", async () => {
    mocks.submit.push(() => reply(404, { error: 'Attempt not found' }));
    await openPaper();
    await answerAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Attempt not found')).not.toBeNull();
  });

  it('reports a real failure with its status and code', async () => {
    mocks.submit.push(() => reply(502, {}));
    const view = await openPaper();
    await answerAndSubmit();
    await screen.findByRole('alert');
    await flushReports(view.unmount);
    expect(errorReports()).toEqual([
      expect.objectContaining({
        phase: 'submit',
        attempt_id: 'attempt-1',
        detail: expect.objectContaining({ status: 502, code: null }),
      }),
    ]);
  });

  it('ignores a second submit while the first is still in flight', async () => {
    let release: (v: unknown) => void = () => {};
    mocks.submit.push(() => new Promise((r) => (release = r)));
    await openPaper();
    await answerAndSubmit();
    // Proctoring hitting its limit at the same moment the student pressed Submit.
    act(() => mocks.proctoring?.onThresholdReached());
    expect(submitCalls()).toHaveLength(1);
    await act(async () => release(reply(200, graded)));
    expect(await screen.findByText('Passed')).not.toBeNull();
    expect(submitCalls()).toHaveLength(1);
  });
});

describe('a submit refused because the attempt is closed', () => {
  it('shows the paper went in when it did, with no error and nothing reported', async () => {
    mocks.submit.push(() =>
      reply(409, {
        error: 'This attempt is already finished. Start a new one to try again.',
        code: 'ATTEMPT_CLOSED',
        attempt_status: 'submitted',
      }),
    );
    mocks.attempts = () =>
      reply(200, {
        data: {
          test: { test_id: 'test-1', title: 'History of Architecture Test', passing_pct: 50 },
          attempts: [
            { attempt_id: 'attempt-1', attempt_number: 1, score: 3, total_marks: 4, percentage: 75, passed: true, review: [] },
          ],
        },
      });
    const view = await openPaper();
    await answerAndSubmit();

    expect(await screen.findByText('Passed')).not.toBeNull();
    expect(screen.getByText('75%')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await flushReports(view.unmount);
    expect(errorReports()).toEqual([]);
  });

  it('says the paper is in when an unpublished exam hides the result', async () => {
    mocks.submit.push(() => reply(409, { code: 'ATTEMPT_CLOSED', attempt_status: 'submitted' }));
    mocks.attempts = () => reply(200, { data: { attempts: [], test: null, code: 'RESULTS_NOT_PUBLISHED' } });
    await openPaper();
    await answerAndSubmit();
    expect(await screen.findByText('Your paper is in')).not.toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('explains a closed attempt that was not submitted, and offers the way back', async () => {
    mocks.submit.push(() =>
      reply(409, {
        error: 'This attempt is already finished. Start a new one to try again.',
        code: 'ATTEMPT_CLOSED',
        attempt_status: 'abandoned',
      }),
    );
    const view = await openPaper();
    await answerAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This attempt was closed, so it could not be submitted.')).not.toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Back to tests' }));
    expect(mocks.push).toHaveBeenCalledWith('/student/tests');

    await flushReports(view.unmount);
    expect(errorReports()).toEqual([
      expect.objectContaining({ phase: 'submit', detail: expect.objectContaining({ code: 'ATTEMPT_CLOSED', attempt_status: 'abandoned' }) }),
    ]);
  });
});

describe('a closed exam', () => {
  it("shows the server's sentence and the way back to the tests list", async () => {
    mocks.search = 'test_id=test-1&placement_id=door-1&return=/student/chapters/x&return_label=Back to the chapter';
    const sentence = 'This exam closed before your paper was submitted. You can ask your teacher for another sitting.';
    mocks.submit.push(() => reply(403, { error: sentence, code: 'EXAM_CLOSED' }));
    await openPaper();
    await answerAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(sentence)).not.toBeNull();
    expect(within(alert).queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Back to tests' }));
    expect(mocks.push).toHaveBeenCalledWith('/student/tests');
  });

  it('saves the answers once more, because the close sweep submits what was saved', async () => {
    mocks.submit.push(() => reply(403, { error: 'This exam closed before your paper was submitted.', code: 'EXAM_CLOSED' }));
    await openPaper();
    await answerAndSubmit();
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(mocks.calls.filter((c) => c.body?.action === 'save').map((c) => c.body.answers)).toEqual([{ q1: 'A' }]),
    );
  });
});

describe('the automatic submit', () => {
  it('retries by itself with backoff when the timer runs out, and stops once one lands', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const durationMinutes = 60;
    mocks.load.push(() =>
      reply(
        200,
        loadBody({
          test: { ...loadBody().test, test_type: 'timed', duration_minutes: durationMinutes },
          attempt: {
            id: 'attempt-1',
            answers: { q1: 'B' },
            started_at: new Date(Date.now() - (durationMinutes * 60 - 2) * 1000).toISOString(),
          },
        }),
      ),
    );
    mocks.submit.push(() => reply(503, {}), () => reply(503, {}), () => reply(200, graded));

    await openPaper();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    const alert = await screen.findByRole('alert');
    expect(submitCalls()).toHaveLength(1);
    expect(within(alert).getByText(/Trying again by itself in 5 seconds/)).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(submitCalls()).toHaveLength(2));
    expect(await screen.findByText(/Trying again by itself in 15 seconds/)).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(await screen.findByText('Passed')).not.toBeNull();
    expect(submitCalls()).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(submitCalls()).toHaveLength(3);
  });
});

/**
 * Karthik Gregory, 18 Aug 2026. His attempt was closed sixteen seconds after he
 * opened the paper (the beforeunload abandon, since removed). He answered all
 * fifty questions over the next twenty-eight minutes into a sitting the server
 * had already shut, every autosave was refused and thrown away in silence, and
 * only Submit told him. Samruddhi wani lost thirty answers the same way.
 *
 * The trigger is gone. The silence is what turned it into a whole paper.
 */
describe('an autosave the server refuses', () => {
  it('tells the student the sitting is closed rather than letting them work on into it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.save.push(() =>
      reply(409, {
        error: 'This attempt is already finished. Start a new one to try again.',
        code: 'ATTEMPT_CLOSED',
        attempt_status: 'abandoned',
      }),
    );
    await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('This sitting was closed, so your answers are no longer being saved.'),
    ).not.toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Back to tests' }));
    expect(mocks.push).toHaveBeenCalledWith('/student/tests');
  });

  it('reports it as a save failure, so the teacher sees it without waiting for a submit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.save.push(() =>
      reply(409, {
        error: 'This attempt is already finished. Start a new one to try again.',
        code: 'ATTEMPT_CLOSED',
        attempt_status: 'abandoned',
      }),
    );
    const view = await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    await screen.findByRole('alert');
    await flushReports(view.unmount);

    expect(errorReports()).toEqual([
      expect.objectContaining({
        phase: 'save',
        attempt_id: 'attempt-1',
        detail: expect.objectContaining({ status: 409, code: 'ATTEMPT_CLOSED', attempt_status: 'abandoned', answered: 1 }),
      }),
    ]);
  });

  it('shows the result when the close sweep filed the paper while they were still writing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.save.push(() => reply(409, { code: 'ATTEMPT_CLOSED', attempt_status: 'submitted' }));
    mocks.attempts = () =>
      reply(200, {
        data: {
          test: { test_id: 'test-1', title: 'History of Architecture Test', passing_pct: 50 },
          attempts: [
            { attempt_id: 'attempt-1', attempt_number: 1, score: 3, total_marks: 4, percentage: 75, passed: true, review: [] },
          ],
        },
      });
    await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(await screen.findByText('Passed')).not.toBeNull();
    expect(screen.getByText('75%')).not.toBeNull();
  });

  it('rides out a dropped save, because one bad request must not end a paper', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.save.push(() => reply(503, {}));
    await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    // Still theirs to finish.
    await answerAndSubmit();
    expect(await screen.findByText('Passed')).not.toBeNull();
  });
});

describe('leaving the page', () => {
  it('never abandons the attempt, and saves the answers once on the way out', async () => {
    await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(mocks.calls.some((c) => c.url.includes('/abandon'))).toBe(false);
    const saves = mocks.calls.filter((c) => c.url === '/api/tests/attempt' && c.body?.action === 'save');
    expect(saves).toHaveLength(1);
    expect(saves[0].body).toEqual({ attempt_id: 'attempt-1', answers: { q1: 'A' }, action: 'save' });
    expect(saves[0].init?.keepalive).toBe(true);
  });

  it('does not save on the way out once the paper is submitted', async () => {
    await openPaper();
    await answerAndSubmit();
    await screen.findByText('Passed');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(mocks.calls.filter((c) => c.body?.action === 'save')).toHaveLength(0);
  });
});

describe('Try again on a result', () => {
  it('is not offered when this door allows no more attempts', async () => {
    mocks.load.push(() => reply(200, loadBody({ attempts_left_after_this: 0 })));
    await openPaper();
    await answerAndSubmit();
    await screen.findByText('Passed');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to tests' })).not.toBeNull();
  });

  it('shows the refusal, not the finished paper, when the new sitting is refused', async () => {
    mocks.load.push(
      () => reply(200, loadBody()),
      () => reply(403, { error: 'You have used all your attempts at this test.', code: 'ATTEMPT_LIMIT_REACHED' }),
    );
    const view = await openPaper();
    await answerAndSubmit();
    await screen.findByText('Passed');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('You have used all your attempts at this test.')).not.toBeNull();
    expect(screen.queryByText('Who designed the Parthenon?')).toBeNull();
    await flushReports(view.unmount);
    // The door working is not an app failure.
    expect(errorReports()).toEqual([]);
  });
});

/**
 * A one-question-at-a-time paper is the exception to resuming.
 *
 * Its clock is per question and lives only in this tab, and "no going back" is
 * enforced here rather than on the server. Resuming one would hand out a fresh
 * clock on every question and let earlier answers be changed, so it closes when
 * the page does, exactly as every paper did before.
 */
describe('leaving a per-question-timer paper', () => {
  it('closes the attempt on the way out, after saving', async () => {
    mocks.load.push(() =>
      reply(
        200,
        loadBody({
          test: {
            id: 'test-1',
            title: 'History of Architecture Test',
            test_type: 'per_question_timer',
            duration_minutes: null,
            per_question_seconds: 30,
            total_marks: 1,
          },
        }),
      ),
    );
    await openPaper();
    fireEvent.click(screen.getByRole('radio', { name: /Ictinus/ }));

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const saves = mocks.calls.filter((c) => c.url === '/api/tests/attempt' && c.body?.action === 'save');
    expect(saves).toHaveLength(1);
    const abandons = mocks.calls.filter((c) => c.url === '/api/tests/attempt/abandon');
    expect(abandons).toHaveLength(1);
    expect(abandons[0].body).toEqual({ attempt_id: 'attempt-1' });
    expect(abandons[0].init?.keepalive).toBe(true);
  });

  it('leaves an ordinary paper open, so a reload resumes it', async () => {
    await openPaper();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(mocks.calls.some((c) => c.url.includes('/abandon'))).toBe(false);
  });
});
