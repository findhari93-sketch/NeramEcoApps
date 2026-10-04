import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { HistoryEntry, ParticipationRow, TeacherPrompt, TeacherSnapshot, WaitingStudent } from '@/lib/pad/client/types';
import TeacherConsole from './TeacherConsole';

/**
 * The teacher console from start to end of a question, with the snapshot hook
 * and the network replaced. What matters most: a count and no names while
 * students answer, no REVEAL before a key or a poll, and no silent replacing
 * or ending of a class.
 */

const mocks = vi.hoisted(() => ({
  snapshot: null as unknown,
  refresh: vi.fn(async () => undefined),
  padFetch: vi.fn(),
  padUpload: vi.fn(),
}));

// The browser shrink needs a real canvas; the picture passes through unchanged here.
vi.mock('@/utils/imageCompression', () => ({ compressImage: async (file: File) => file }));

vi.mock('./usePadSnapshot', () => ({
  usePadSnapshot: () => ({ snapshot: mocks.snapshot, error: null, realtime: 'unavailable', refresh: mocks.refresh }),
}));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
  padUpload: mocks.padUpload,
}));

const PICTURE = 'https://db.neramclasses.com/storage/v1/object/public/uploads/pad/s1/q38.jpg';

const snip = () => new File([new Uint8Array(64)], 'snip.png', { type: 'image/png' });

/** Choose a picture through the Ask bar's file button. */
function choosePicture(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [snip()] } });
}

/** Ctrl + V of a snip, wherever the teacher last clicked in the pad. */
function pastePicture(): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [snip()], items: [], getData: () => '' } });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Console menu' }));
const openMore = () => fireEvent.click(screen.getByRole('button', { name: /^More: question text and option texts/ }));

const host: PadHost = {
  kind: 'test',
  meeting: { meetingId: 'meeting-1', chatId: '19:meeting_abc@thread.v2', channelId: null },
  frame: 'sidePanel',
  theme: 'light',
  getToken: async () => 'token',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
};

type Body = Record<string, unknown> | undefined;
let handlers: Record<string, (body: Body) => unknown>;

const bodiesFor = (path: string) =>
  mocks.padFetch.mock.calls.filter(([, calledPath]) => calledPath === path).map(([, , options]) => (options as { body?: Body } | undefined)?.body);

function prompt(overrides: Partial<TeacherPrompt> = {}): TeacherPrompt {
  return {
    id: 'p1',
    sequence: 1,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    version: 1,
    correct_keys: null,
    ungraded: false,
    label: null,
    question_text: null,
    image_url: null,
    option_texts: null,
    opened_at: '2026-09-10T10:00:00Z',
    closed_at: null,
    revealed_at: null,
    answered_count: 21,
    last_nudged_at: null,
    ...overrides,
  };
}

const COUNTS = { enrolled: 30, answered: 20, silent: 6, absent: 4, correct: 12, incorrect: 8, answered_off_roster: 1 };

function snap(overrides: Partial<TeacherSnapshot> = {}): TeacherSnapshot {
  return {
    ok: true,
    role: 'teacher',
    server_time: '2026-09-10T10:00:00Z',
    session: {
      id: 's1',
      status: 'live',
      room_code: '482913',
      hint_topic: 'pad-x',
      teacher_topic: 'padt-x',
      classroom_id: 'c1',
      classroom_name: 'NATA Evening Batch',
      scheduled_class_id: null,
      batch_id: null,
      meeting_id: 'meeting-1',
      created_at: '2026-09-10T09:55:00Z',
      ended_at: null,
      presence_basis: 'app',
      bot_in_meeting: false,
    },
    readiness: { enrolled: 30, connected: 25, in_meeting: 0 },
    prompt: prompt(),
    counts: COUNTS,
    groups: [],
    skips: { total: 0, by_reason: {} },
    history: [],
    ...overrides,
  };
}

function row(name: string, overrides: Partial<ParticipationRow> = {}): ParticipationRow {
  return {
    student_id: `id-${name}`,
    name,
    on_roster: true,
    participation: 'answered',
    result: 'correct',
    answer: 'B',
    joined_mid_prompt: false,
    ...overrides,
  };
}

function waitingRow(name: string, overrides: Partial<WaitingStudent> = {}): WaitingStudent {
  return { student_id: `id-${name}`, name, reason: null, note: null, approval: null, nudged_at: null, pad_open: true, ...overrides };
}

function historyEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'p1',
    sequence: 1,
    label: null,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    ungraded: false,
    correct_keys: null,
    opened_at: '2026-09-10T10:00:00Z',
    answered: 20,
    correct: 0,
    ...overrides,
  };
}

const started = () => ({ sessionId: 's1', resumed: false, endedSessionId: null });
const NO_DASHES = /[–—]|--/;

beforeEach(() => {
  localStorage.clear();
  mocks.snapshot = null;
  mocks.padUpload.mockReset().mockResolvedValue({ url: PICTURE });
  handlers = { '/api/pad/sessions': started };
  mocks.padFetch.mockReset();
  mocks.padFetch.mockImplementation(async (_host: PadHost, path: string, options?: { body?: Body }) => {
    const handler = handlers[path];
    if (!handler) throw new Error(`No handler for ${path}`);
    return handler(options?.body);
  });
});

describe('TeacherConsole', () => {
  it('starts the session for this meeting, shows who is here, and asks with the chosen answer type', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p1', sequence: 1, state: 'open', version: 1, changed: true });
    render(<TeacherConsole host={host} />);

    const ask = await screen.findByRole('button', { name: 'Ask question 1' });
    expect(bodiesFor('/api/pad/sessions')).toEqual([{ meeting: host.meeting }]);
    expect(screen.getByRole('button', { name: '25 here. Class details' })).toBeTruthy();
    expect(screen.getByLabelText('Room code 4 8 2 9 1 3')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'NATA Evening Batch' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Answer type: A to D/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Number' }));
    fireEvent.click(ask);

    await waitFor(() => expect(bodiesFor('/api/pad/prompts/ask')).toEqual([{ sessionId: 's1', answerType: 'numeric' }]));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it("asks with the paper's question number and the question typed or dictated, then suggests the next number", async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p1', sequence: 1, state: 'open', version: 1, changed: true });
    const { rerender } = render(<TeacherConsole host={host} />);

    await screen.findByRole('button', { name: 'Ask question 1' });
    fireEvent.change(screen.getByLabelText('Question number, as printed on the paper'), { target: { value: '38' } });
    openMore();
    fireEvent.change(screen.getByLabelText('Question (optional)'), { target: { value: 'Which statement is correct?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Q.38' }));

    await waitFor(() =>
      expect(bodiesFor('/api/pad/prompts/ask')).toEqual([
        { sessionId: 's1', answerType: 'mcq', optionCount: 4, label: '38', text: 'Which statement is correct?' },
      ]),
    );
    await waitFor(() => expect((screen.getByLabelText('Question (optional)') as HTMLTextAreaElement).value).toBe(''));

    // Q.38 revealed: the next Ask offers Q.39 without typing.
    mocks.snapshot = snap({
      prompt: prompt({ state: 'revealed', version: 4, correct_keys: ['B'], label: '38' }),
      history: [historyEntry({ state: 'revealed', correct_keys: ['B'], label: '38' })],
    });
    rerender(<TeacherConsole host={host} />);
    expect(await screen.findByRole('button', { name: 'Ask Q.39' })).toBeTruthy();
    expect((screen.getByLabelText('Question number, as printed on the paper') as HTMLInputElement).value).toBe('39');
    expect(screen.getByRole('heading', { name: 'Q.38 revealed' })).toBeTruthy();
  });

  it("asks with a snip of the paper and each option's text", async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p1', sequence: 1, state: 'open', version: 1, changed: true });
    render(<TeacherConsole host={host} />);

    await screen.findByRole('button', { name: 'Ask question 1' });
    expect(screen.getByText('Snip the question with Win + Shift + S, click the box below, press Ctrl + V, then Ask.')).toBeTruthy();
    pastePicture();
    await waitFor(() => expect(mocks.padUpload).toHaveBeenCalledWith(host, '/api/pad/sessions/s1/image', expect.any(File), 'snip.png'));
    expect(await screen.findByRole('img', { name: 'Picture for Q.1' })).toBeTruthy();

    openMore();
    fireEvent.change(screen.getByLabelText('Option A (optional)'), { target: { value: 'Both correct' } });
    fireEvent.change(screen.getByLabelText('Option C (optional)'), { target: { value: 'Both wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask question 1' }));

    await waitFor(() =>
      expect(bodiesFor('/api/pad/prompts/ask')).toEqual([
        {
          sessionId: 's1',
          answerType: 'mcq',
          optionCount: 4,
          imageUrl: PICTURE,
          optionTexts: ['Both correct', null, 'Both wrong', null],
        },
      ]),
    );
  });

  it('lists who is still waiting by name, accepts reasons, and nudges only the silent ones once a minute', async () => {
    mocks.snapshot = snap({
      counts: { ...COUNTS, joined: 22, answered_joined: 12, excused_joined: 0 },
      skips: { total: 3, by_reason: { dont_know: 2, cant_see: 1 }, approved: 0 },
      waiting: [
        waitingRow('Asha', { reason: 'dont_know' }),
        waitingRow('Bala', { reason: 'dont_know' }),
        waitingRow('Chitra', { reason: 'cant_see', note: 'screen froze' }),
        ...['Dev', 'Esha', 'Farid', 'Gita', 'Hari', 'Isha', 'Jay'].map((name) => waitingRow(name)),
      ],
    });
    handlers['/api/pad/prompts/p1/nudge'] = () => ({ inPad: 4, chat: 3, chatDelivered: 3 });
    handlers['/api/pad/prompts/p1/excuse'] = () => ({ changed: true, count: 3 });
    render(<TeacherConsole host={host} />);

    // Out of the 22 who joined, not the class list of 30.
    expect(await screen.findByLabelText('12 of 22 answered')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Waiting on 10' })).toBeTruthy();
    expect(screen.getByText("I can't see the question: screen froze")).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Accept all 3 reasons' }));
    await waitFor(() =>
      expect(bodiesFor('/api/pad/prompts/p1/excuse')).toEqual([{ studentIds: ['id-Asha', 'id-Bala', 'id-Chitra'], approve: true }]),
    );

    await waitFor(() => expect((screen.getByRole('button', { name: 'Nudge 7' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Nudge 7' }));
    expect(await screen.findByText('Nudged 4 on their pad and 3 by Teams chat.')).toBeTruthy();
    const again = await screen.findByRole('button', { name: /^Nudge again in \d+s$/ });
    expect((again as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('turns one reason down, and hides every name for a teacher sharing the whole screen', async () => {
    mocks.snapshot = snap({ waiting: [waitingRow('Asha', { reason: 'need_time' }), waitingRow('Bala')] });
    handlers['/api/pad/prompts/p1/excuse'] = () => ({ changed: true, count: 1 });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: "Turn down Asha's reason" }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/excuse')).toEqual([{ studentIds: ['id-Asha'], approve: false }]));

    fireEvent.click(screen.getAllByRole('button', { name: 'Hide names' })[0]);
    await waitFor(() => expect(screen.queryByText('Asha')).toBeNull());
    expect(screen.getByText('1 gave a reason, 1 has not answered. Names are hidden.')).toBeTruthy();
  });

  it('waits out the minute when another nudge went out a moment ago', async () => {
    mocks.snapshot = snap({ waiting: ['Asha', 'Bala'].map((name) => waitingRow(name)) });
    handlers['/api/pad/prompts/p1/nudge'] = () => {
      throw new PadClientError(429, 'RATE_LIMITED', 'RATE_LIMITED', { retry_after_seconds: 42 });
    };
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Nudge 2' }));
    expect(await screen.findByText('You nudged a moment ago.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Nudge again in (41|42)s$/ })).toBeTruthy();
  });

  it('keeps the next question in reach while this one is open, then closes it and asks in one go', async () => {
    mocks.snapshot = snap({ prompt: prompt({ label: '31' }), history: [historyEntry({ label: '31' })] });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p2', sequence: 2, state: 'open', version: 1, changed: true, closedPromptId: 'p1' });
    render(<TeacherConsole host={host} />);

    expect(await screen.findByText('Asking closes Q.31 first.')).toBeTruthy();
    // Close answers stays the main action; the Ask bar's button is the second one.
    expect(screen.getByRole('button', { name: 'Close answers' }).className).toContain('MuiButton-contained');
    expect(screen.getByRole('button', { name: 'Close Q.31 and ask Q.32' }).className).toContain('MuiButton-outlined');
    openMore();
    fireEvent.change(screen.getByLabelText('Question (optional)'), { target: { value: 'Find the odd one out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close Q.31 and ask Q.32' }));
    await waitFor(() =>
      expect(bodiesFor('/api/pad/prompts/ask')).toEqual([
        { sessionId: 's1', answerType: 'mcq', optionCount: 4, label: '32', text: 'Find the odd one out', closePromptId: 'p1' },
      ]),
    );
  });

  it('pastes while a question is open: the picture goes to the next one, or to the open one with one tap', async () => {
    mocks.snapshot = snap();
    handlers['/api/pad/prompts/p1/picture'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true });
    render(<TeacherConsole host={host} />);

    await screen.findByText('Question 1 open');
    pastePicture();
    expect(await screen.findByText('Picture added to Q.2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use for Question 1' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/picture')).toEqual([{ imageUrl: PICTURE }]));
    // Moved, not copied: the next question's box is empty again.
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Picture for Q.2' })).toBeNull());
  });

  it('takes a picture from the file button too, with no offer to move it', async () => {
    mocks.snapshot = snap();
    render(<TeacherConsole host={host} />);
    await screen.findByText('Question 1 open');
    choosePicture();
    expect(await screen.findByRole('img', { name: 'Picture for Q.2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use for Question 1' })).toBeNull();
  });

  it("shows the open question's picture small, and takes it off", async () => {
    mocks.snapshot = snap({ prompt: prompt({ image_url: PICTURE }) });
    handlers['/api/pad/prompts/p1/picture'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true });
    render(<TeacherConsole host={host} />);
    expect(await screen.findByRole('img', { name: 'Picture for Question 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/picture')).toEqual([{ imageUrl: null }]));
  });

  it('names the open question as the paper does and shows its text', async () => {
    mocks.snapshot = snap({ prompt: prompt({ label: '38', question_text: 'Which statement is correct?' }) });
    handlers['/api/pad/prompts/p1/details'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true });
    render(<TeacherConsole host={host} />);

    expect(await screen.findByText('Q.38 open')).toBeTruthy();
    expect(screen.getByText('Which statement is correct?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit question number and text' }));
    fireEvent.change(screen.getByLabelText('Question no.'), { target: { value: '39' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/details')).toEqual([{ label: '39', text: 'Which statement is correct?' }]));
  });

  it('leaves the answer for later: the next question can be asked, and the waiting one is set from its chip', async () => {
    const groups = [
      { value: 'C', count: 9 },
      { value: 'B', count: 4 },
    ];
    mocks.snapshot = snap({
      prompt: prompt({ state: 'closed', version: 2, label: '38' }),
      groups,
      history: [historyEntry({ state: 'closed', label: '38' })],
    });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p2', sequence: 2, state: 'open', version: 1, changed: true });
    const { rerender } = render(<TeacherConsole host={host} />);

    // Reveal is the main action; asking the next question instead leaves Q.38 waiting.
    expect(await screen.findByText('Q.38 will wait for its answer. Set it later from Questions so far or the report.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Decide later/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Q.39' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/ask')).toEqual([{ sessionId: 's1', answerType: 'mcq', optionCount: 4, label: '39' }]));

    // Q.39 is now open; Q.38 waits in Questions so far.
    mocks.snapshot = snap({
      prompt: prompt({ id: 'p2', sequence: 2, label: '39' }),
      history: [historyEntry({ state: 'closed', label: '38' }), historyEntry({ id: 'p2', sequence: 2, label: '39' })],
    });
    handlers['/api/pad/prompts/p1/participation'] = () => ({
      rows: [row('Asha', { answer: 'C', result: 'ungraded' }), row('Bala', { answer: 'B', result: 'ungraded' }), row('Chitra', { answer: 'C', result: 'ungraded' })],
    });
    handlers['/api/pad/prompts/p1/key'] = () => ({ promptId: 'p1', state: 'closed', version: 3, changed: true });
    rerender(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Q.38 answer later' }));
    expect(await screen.findByText('Set the answer for Q.38')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'C, 2 answered' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/key')).toEqual([{ keys: ['C'] }]));
    expect(screen.getByLabelText('20 of 30 answered')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('pops the console out into its own window where Teams can, and explains sharing a window on one screen', async () => {
    const popOut = vi.fn(async () => undefined);
    mocks.snapshot = snap({ prompt: null, counts: null });
    const { unmount } = render(<TeacherConsole host={{ ...host, popOut }} />);

    await screen.findByRole('button', { name: 'Ask question 1' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in its own window' }));
    await waitFor(() => expect(popOut).toHaveBeenCalledWith('s1'));

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Using one screen?' }));
    expect(screen.getByText(/choose Share, then Window/)).toBeTruthy();
    unmount();

    render(<TeacherConsole host={host} />);
    await screen.findByRole('button', { name: 'Ask question 1' });
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Open in its own window' })).toBeNull();
  });

  it('runs a popped-out console on its session straight away, without starting one', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={{ ...host, meeting: null, frame: 'content' }} sessionId="s1" />);
    expect(await screen.findByRole('button', { name: 'Ask question 1' })).toBeTruthy();
    expect(bodiesFor('/api/pad/sessions')).toEqual([]);
  });

  it('shows the live count while students answer, without fetching anyone\'s answer', async () => {
    mocks.snapshot = snap();
    render(<TeacherConsole host={host} />);

    expect(await screen.findByLabelText('20 of 30 answered')).toBeTruthy();
    expect(screen.getByText('plus 1 not on the class list')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show names' })).toBeNull();
    expect(mocks.padFetch.mock.calls.some(([, path]) => String(path).includes('participation'))).toBe(false);
  });

  it('reminds students without the pad when the bot is in the meeting, and says how many it reached', async () => {
    mocks.snapshot = snap({ session: { ...snap().session, bot_in_meeting: true } });
    handlers['/api/pad/sessions/s1/resend'] = () => ({ recipients: 2, sent: 2, partial: 0, failed: 0, notConnected: 2, skipped: null });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remind students without the pad' }));
    expect(await screen.findByText('Reminder sent to 2 students.')).toBeTruthy();
    expect(bodiesFor('/api/pad/sessions/s1/resend')).toEqual([undefined]);
  });

  it('offers no reminder without the meeting bot', async () => {
    mocks.snapshot = snap();
    render(<TeacherConsole host={host} />);
    expect(await screen.findByLabelText('20 of 30 answered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remind students without the pad' })).toBeNull();
  });

  it('keeps Reveal off until a key is chosen, then reveals', async () => {
    const groups = [
      { value: 'B', count: 12 },
      { value: 'A', count: 8 },
    ];
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }), groups });
    handlers['/api/pad/prompts/p1/key'] = () => ({ promptId: 'p1', state: 'closed', version: 3, changed: true });
    handlers['/api/pad/prompts/p1/reveal'] = () => ({ promptId: 'p1', state: 'revealed', version: 4, changed: true });
    const { rerender } = render(<TeacherConsole host={host} />);

    expect(((await screen.findByRole('button', { name: 'Reveal answer' })) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'B, 12 answered' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/key')).toEqual([{ keys: ['B'] }]));

    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 3, correct_keys: ['B'] }), groups });
    rerender(<TeacherConsole host={host} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Reveal answer' }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/reveal')).toHaveLength(1));
  });

  describe('a question asked from Present to class', () => {
    const qb = {
      format: 'mcq',
      text: 'Find $x$ when the wall is load bearing',
      image_url: null,
      options: [
        { text: 'One', image_url: null },
        { text: 'Two', image_url: null },
        { text: 'Three', image_url: null },
        { text: 'Four', image_url: null },
      ],
      solution: null,
    };

    it('shows the time left with +15s while open, and keeps Close at 0', async () => {
      mocks.snapshot = snap({ prompt: prompt({ label: '38', qb, qb_question_id: 'q1', closes_at: '2026-09-10T10:00:42Z', time_limit_s: 60 }) });
      handlers['/api/pad/prompts/p1/timer'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true, closesAt: '2026-09-10T10:00:57Z', reopened: false });
      const { rerender } = render(<TeacherConsole host={host} />);

      expect(await screen.findByRole('timer', { name: /^0:4[12] left$/ })).toBeTruthy();
      // No question_text: the bank's text, plain, with no KaTeX.
      expect(screen.getByText('Find x when the wall is load bearing')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
      await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/timer')).toEqual([{ addSeconds: 15 }]));
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());

      // Time is up but still open: the console never closes it itself.
      mocks.snapshot = snap({
        server_time: '2026-09-10T10:01:00Z',
        prompt: prompt({ label: '38', qb, closes_at: '2026-09-10T10:00:57Z', time_limit_s: 60, version: 2 }),
      });
      rerender(<TeacherConsole host={host} />);
      expect(await screen.findByRole('timer', { name: 'Time is up' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close answers' })).toBeTruthy();
      expect(bodiesFor('/api/pad/prompts/p1/close')).toEqual([]);
      expect(document.body.textContent).not.toMatch(NO_DASHES);
    });

    it("preselects the bank's answer, so Reveal is one tap, and another key can still be chosen", async () => {
      const groups = [
        { value: 'B', count: 12 },
        { value: 'C', count: 8 },
      ];
      mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2, qb, qb_question_id: 'q1', suggested_keys: ['B'] }), groups });
      handlers['/api/pad/prompts/p1/reveal'] = () => ({ promptId: 'p1', state: 'revealed', version: 3, changed: true });
      handlers['/api/pad/prompts/p1/key'] = () => ({ promptId: 'p1', state: 'closed', version: 3, changed: true });
      render(<TeacherConsole host={host} />);

      expect(await screen.findByText('From the question bank: B')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'B, 12 answered, marked correct' }).getAttribute('aria-pressed')).toBe('true');
      const reveal = screen.getByRole('button', { name: 'Reveal answer' }) as HTMLButtonElement;
      expect(reveal.disabled).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'C, 8 answered' }));
      await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/key')).toEqual([{ keys: ['C'] }]));

      await waitFor(() => expect((screen.getByRole('button', { name: 'Reveal answer' }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
      await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/reveal')).toHaveLength(1));
    });

    it("shows the teacher's own key over the bank's, with no caption", async () => {
      mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 3, qb, suggested_keys: ['B'], correct_keys: ['D'] }), groups: [] });
      render(<TeacherConsole host={host} />);
      expect(await screen.findByRole('button', { name: 'D, 0 answered, marked correct' })).toBeTruthy();
      expect(screen.queryByText(/From the question bank/)).toBeNull();
    });

    it('offers +15s on the newest question whose time was up, which reopens it', async () => {
      mocks.snapshot = snap({
        server_time: '2026-09-10T10:01:05Z',
        prompt: prompt({ state: 'closed', version: 2, closes_at: '2026-09-10T10:01:00Z', closed_at: '2026-09-10T10:01:01Z', time_limit_s: 60 }),
      });
      handlers['/api/pad/prompts/p1/timer'] = () => ({ promptId: 'p1', state: 'open', version: 3, changed: true, closesAt: '2026-09-10T10:01:20Z', reopened: true });
      render(<TeacherConsole host={host} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Add 15 seconds' }));
      await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/timer')).toEqual([{ addSeconds: 15 }]));
    });

    it('offers no +15s on a question the teacher closed early, or one with no timer', async () => {
      mocks.snapshot = snap({
        server_time: '2026-09-10T10:00:30Z',
        prompt: prompt({ state: 'closed', version: 2, closes_at: '2026-09-10T10:01:00Z', time_limit_s: 60 }),
      });
      const { rerender } = render(<TeacherConsole host={host} />);
      await screen.findByRole('button', { name: 'Reveal answer' });
      expect(screen.queryByRole('button', { name: 'Add 15 seconds' })).toBeNull();

      mocks.snapshot = snap();
      rerender(<TeacherConsole host={host} />);
      await screen.findByLabelText('20 of 30 answered');
      expect(screen.queryByRole('button', { name: 'Add 15 seconds' })).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();
    });
  });

  it('marks a question as a poll instead of choosing a key', async () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 2 }) });
    handlers['/api/pad/prompts/p1/key'] = () => ({ promptId: 'p1', state: 'closed', version: 3, changed: true });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: "Poll, don't grade" }));
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/key')).toEqual([{ ungraded: true }]));
  });

  it('never removes the last key, so a graded question always keeps an answer', async () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', version: 3, correct_keys: ['B'] }), groups: [{ value: 'B', count: 12 }] });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'B, 12 answered, marked correct' }));
    expect(bodiesFor('/api/pad/prompts/p1/key')).toEqual([]);
  });

  it('shows the four groups after REVEAL and the names on request', async () => {
    mocks.snapshot = snap({ prompt: prompt({ state: 'revealed', version: 4, correct_keys: ['B'] }) });
    handlers['/api/pad/prompts/p1/participation'] = () => ({
      rows: [
        row('Asha'),
        row('Bala', { result: 'incorrect', answer: 'A', joined_mid_prompt: true }),
        row('Chitra', { participation: 'silent', result: null, answer: null, skip_reason: 'cant_see' }),
        row('Dev', { participation: 'absent', result: null, answer: null }),
      ],
    });
    render(<TeacherConsole host={host} />);

    expect(await screen.findByText('Answer: B')).toBeTruthy();
    for (const name of ['Correct: 12', 'Incorrect: 8', 'No answer: 6', 'Not in the pad: 4']) {
      expect(screen.getByRole('group', { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Show names' }));
    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.getByText('Joined mid-question')).toBeTruthy();
    expect(screen.getByText("Said: I can't see the question")).toBeTruthy();
    for (const heading of ['Correct (1)', 'Incorrect (1)', 'No answer (1)', 'Not in the pad (1)']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Ask question 2' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  // It replaces the teacher's screen share, so it sits in the menu, never as a big button.
  it('shows the class results on the meeting screen from the menu where Teams allows it, and stops again', async () => {
    const stage = {
      canShare: vi.fn(async () => true),
      isSharing: vi.fn(async () => false),
      share: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    mocks.snapshot = snap({
      prompt: prompt({ state: 'revealed', version: 4, correct_keys: ['B'] }),
      history: [historyEntry({ state: 'revealed', correct_keys: ['B'] })],
    });
    render(<TeacherConsole host={{ ...host, stage }} />);

    expect(await screen.findByText('Answer: B')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share results' })).toBeNull();
    await waitFor(() => expect(stage.canShare).toHaveBeenCalled());

    openMenu();
    expect(screen.getByText('This replaces your screen share')).toBeTruthy();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Show results on the meeting screen/ }));
    await waitFor(() => expect(stage.share).toHaveBeenCalledWith(`${window.location.origin}/pad/stage`));

    expect(await screen.findByText('The results are on the meeting screen.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(stage.stop).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('offers no sharing to someone Teams does not let share, or outside a Teams meeting', async () => {
    const stage = { canShare: vi.fn(async () => false), isSharing: vi.fn(async () => false), share: vi.fn(), stop: vi.fn() };
    mocks.snapshot = snap({
      prompt: prompt({ state: 'revealed', version: 4, correct_keys: ['B'] }),
      history: [historyEntry({ state: 'revealed', correct_keys: ['B'] })],
    });
    const { unmount } = render(<TeacherConsole host={{ ...host, stage }} />);

    expect(await screen.findByText('Answer: B')).toBeTruthy();
    await waitFor(() => expect(stage.canShare).toHaveBeenCalled());
    openMenu();
    expect(screen.queryByRole('menuitem', { name: /Show results/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Using one screen?' })).toBeTruthy();
    unmount();

    render(<TeacherConsole host={host} />);
    expect(await screen.findByText('Answer: B')).toBeTruthy();
    openMenu();
    expect(screen.queryByRole('menuitem', { name: /Show results/ })).toBeNull();
  });

  it('asks which class this is, once, when the meeting is not linked to one', async () => {
    let calls = 0;
    handlers['/api/pad/sessions'] = () =>
      calls++ === 0 ? { needsClassroom: true, classrooms: [{ id: 'c9', name: 'NATA 2026 Weekend' }] } : started();
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'NATA 2026 Weekend' }));

    await waitFor(() =>
      expect(bodiesFor('/api/pad/sessions')).toEqual([{ meeting: host.meeting }, { meeting: host.meeting, classroomId: 'c9' }]),
    );
    expect(await screen.findByRole('button', { name: 'Ask question 1' })).toBeTruthy();
  });

  it('offers to end the other live class instead of silently replacing it', async () => {
    let calls = 0;
    handlers['/api/pad/sessions'] = () => {
      if (calls++ === 0) {
        throw new PadClientError(409, 'SESSION_CONFLICT', 'SESSION_CONFLICT', {
          existing: { session_id: 's0', classroom_name: 'JEE Crash Course', created_at: '2026-09-10T08:00:00Z' },
        });
      }
      return { sessionId: 's1', resumed: false, endedSessionId: 's0' };
    };
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'End JEE Crash Course and start this class' }));
    await waitFor(() => expect(bodiesFor('/api/pad/sessions')[1]).toEqual({ meeting: host.meeting, endExisting: true }));
  });

  it('explains a refusal to start a class the teacher does not teach', async () => {
    handlers['/api/pad/sessions'] = () => {
      throw new PadClientError(403, null, 'You can only run the Answer Pad for classes you teach.');
    };
    render(<TeacherConsole host={host} />);
    expect(await screen.findByText('You can only run the Answer Pad for classes you teach.')).toBeTruthy();
  });

  it('says which question has no answer yet before ending, and that it can still be set afterwards', async () => {
    mocks.snapshot = snap({
      prompt: prompt({ state: 'closed', sequence: 2, version: 2 }),
      history: [historyEntry({ state: 'revealed', correct_keys: ['B'] }), historyEntry({ id: 'p1b', sequence: 2, state: 'closed' })],
    });
    handlers['/api/pad/sessions/s1/end'] = (body) => {
      if (!body?.confirmUnrevealed) {
        throw new PadClientError(409, 'UNREVEALED_PROMPT', 'UNREVEALED_PROMPT', { sequence: 2, label: '38', count: 1 });
      }
      return { changed: true };
    };
    render(<TeacherConsole host={host} />);

    // Not beside the menu button any more: in the menu, with a confirm.
    await screen.findByRole('button', { name: 'Reveal answer' });
    expect(screen.queryByRole('button', { name: 'End round' })).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^End round/ }));
    expect(screen.getByText('End Answer Pad? The meeting carries on, students keep their answers, and you can start the next round here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End round' }));
    expect(await screen.findByText("Q.38 has no answer yet. It won't count until you set it from the report, and scores update then.")).toBeTruthy();

    await waitFor(() => expect((screen.getByRole('button', { name: 'End anyway' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'End anyway' }));
    await waitFor(() =>
      expect(bodiesFor('/api/pad/sessions/s1/end')).toEqual([{ confirmUnrevealed: false }, { confirmUnrevealed: true }]),
    );
  });

  it('asks before ending a round with no questions, which is usually a slip', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null, session: { ...snap().session, round_no: 1 } });
    handlers['/api/pad/sessions/s1/end'] = () => ({ changed: true });
    render(<TeacherConsole host={host} />);

    await screen.findByRole('button', { name: 'Ask question 1' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^End round/ }));
    expect(screen.getByText('No questions yet. End Round 1 anyway?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(bodiesFor('/api/pad/sessions/s1/end')).toEqual([]);
  });

  it("shows the class's own title, and the teacher renames it from the header", async () => {
    mocks.snapshot = snap({ prompt: null, counts: null, session: { ...snap().session, title: 'JEE preparation' } });
    handlers['/api/pad/sessions/s1/title'] = () => ({ title: 'JEE Maths' });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'JEE preparation. Rename the class' }));
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: '  JEE   Maths ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodiesFor('/api/pad/sessions/s1/title')).toEqual([{ title: 'JEE Maths' }]));
  });

  it("sends the Teams meeting's title when it starts the class", async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={{ ...host, meetingTitle: async () => 'JEE preparation' }} />);
    await screen.findByRole('button', { name: 'Ask question 1' });
    expect(bodiesFor('/api/pad/sessions')).toEqual([{ meeting: host.meeting, meetingTitle: 'JEE preparation' }]);
  });

  it('counts everyone here: in the meeting or with the pad open, and says which list is on', async () => {
    mocks.snapshot = snap({
      prompt: null,
      counts: null,
      session: { ...snap().session, bot_in_meeting: true },
      readiness: { enrolled: 39, joined: 18, opened: 12, connected: 9, in_meeting: 15 },
      people: { joined: [], not_joined: [{ student_id: 'id-Zara', name: 'Zara' }] },
    });
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: '18 here. Class details' }));
    const sheet = await screen.findByRole('dialog', { name: 'Class details' });
    expect(within(sheet).getByText('18 here')).toBeTruthy();
    expect(within(sheet).getByText('12 opened the pad, 9 with it open now.')).toBeTruthy();
    expect(within(sheet).getByText('Meeting list on: everyone in the meeting counts')).toBeTruthy();
    expect(within(sheet).getByText('Zara')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('changes the text size from the menu and keeps it on this device', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={host} />);
    await screen.findByRole('button', { name: 'Ask question 1' });

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(screen.getByText('Larger')).toBeTruthy();
    expect(localStorage.getItem('pad-text-scale')).toBe('1.15');
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    expect(screen.getByText('Smaller')).toBeTruthy();
  });

  it('keeps the Ask bar in every state but the end of the round', async () => {
    for (const state of ['open', 'closed', 'revealed'] as const) {
      mocks.snapshot = snap({ prompt: prompt({ state, version: 3, correct_keys: state === 'revealed' ? ['B'] : null }) });
      const { unmount } = render(<TeacherConsole host={host} />);
      expect(await screen.findByRole('region', { name: 'Next question' })).toBeTruthy();
      unmount();
    }
  });
});
