import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { HistoryEntry, ParticipationRow, TeacherPrompt, TeacherSnapshot } from '@/lib/pad/client/types';
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

/** Choose a picture through the upload field's file input, as a paste or a drop ends up doing. */
function choosePicture(): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(64)], 'snip.png', { type: 'image/png' })] } });
}

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
  it('starts the session for this meeting, shows readiness, and asks with the chosen answer type', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p1', sequence: 1, state: 'open', version: 1, changed: true });
    render(<TeacherConsole host={host} />);

    const ask = await screen.findByRole('button', { name: 'Ask question 1' });
    expect(bodiesFor('/api/pad/sessions')).toEqual([{ meeting: host.meeting }]);
    expect(screen.getByText('25 of 30')).toBeTruthy();
    expect(screen.getByLabelText('Room code 4 8 2 9 1 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Number' }));
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
    fireEvent.change(screen.getByLabelText('Question no.'), { target: { value: '38' } });
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
    expect((screen.getByLabelText('Question no.') as HTMLInputElement).value).toBe('39');
    expect(screen.getByRole('heading', { name: 'Q.38 revealed' })).toBeTruthy();
  });

  it("asks with a snip of the paper and each option's text", async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    handlers['/api/pad/prompts/ask'] = () => ({ promptId: 'p1', sequence: 1, state: 'open', version: 1, changed: true });
    render(<TeacherConsole host={host} />);

    await screen.findByRole('button', { name: 'Ask question 1' });
    expect(screen.getByText('Win + Shift + S to snip the question, then Ctrl + V here.')).toBeTruthy();
    choosePicture();
    await waitFor(() => expect(mocks.padUpload).toHaveBeenCalledWith(host, '/api/pad/sessions/s1/image', expect.any(File), 'snip.png'));

    fireEvent.click(screen.getByRole('button', { name: 'Add option text (optional)' }));
    fireEvent.change(screen.getByLabelText('Option A'), { target: { value: 'Both correct' } });
    fireEvent.change(screen.getByLabelText('Option C'), { target: { value: 'Both wrong' } });
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

  it('shows how many said why they cannot answer, and nudges the rest once a minute', async () => {
    mocks.snapshot = snap({ skips: { total: 3, by_reason: { dont_know: 2, cant_see: 1 } } });
    handlers['/api/pad/prompts/p1/nudge'] = () => ({ inPad: 4, chat: 3, chatDelivered: 3 });
    render(<TeacherConsole host={host} />);

    expect(await screen.findByText("3 can't answer: 2 don't know, 1 can't see it")).toBeTruthy();
    // 30 on the list, 20 answered, 3 said why: 7 are waiting.
    fireEvent.click(screen.getByRole('button', { name: "Nudge the 7 who haven't answered" }));

    expect(await screen.findByText('Nudged 4 on their pad and 3 by Teams chat.')).toBeTruthy();
    const again = await screen.findByRole('button', { name: /^Nudge again in \d+s$/ });
    expect((again as HTMLButtonElement).disabled).toBe(true);
    // Counts only: nobody's name reached the console.
    expect(mocks.padFetch.mock.calls.some(([, path]) => String(path).includes('participation'))).toBe(false);
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('waits out the minute when another nudge went out a moment ago', async () => {
    mocks.snapshot = snap();
    handlers['/api/pad/prompts/p1/nudge'] = () => {
      throw new PadClientError(429, 'RATE_LIMITED', 'RATE_LIMITED', { retry_after_seconds: 42 });
    };
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: "Nudge the 10 who haven't answered" }));
    expect(await screen.findByText('You nudged a moment ago.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Nudge again in (41|42)s$/ })).toBeTruthy();
  });

  it('adds a picture to the open question, and students see it', async () => {
    mocks.snapshot = snap();
    handlers['/api/pad/prompts/p1/picture'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true });
    render(<TeacherConsole host={host} />);

    await screen.findByText('Question 1 is open');
    expect(screen.getByText('Add a picture')).toBeTruthy();
    choosePicture();
    await waitFor(() => expect(bodiesFor('/api/pad/prompts/p1/picture')).toEqual([{ imageUrl: PICTURE }]));
  });

  it('names the open question as the paper does and shows its text', async () => {
    mocks.snapshot = snap({ prompt: prompt({ label: '38', question_text: 'Which statement is correct?' }) });
    handlers['/api/pad/prompts/p1/details'] = () => ({ promptId: 'p1', state: 'open', version: 2, changed: true });
    render(<TeacherConsole host={host} />);

    expect(await screen.findByText('Q.38 is open')).toBeTruthy();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Decide later, ask the next question' }));
    expect(await screen.findByText('Q.38 is waiting for its answer. Set it from Questions so far, or from the class report after class.')).toBeTruthy();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Open the Answer Pad in its own window' }));
    await waitFor(() => expect(popOut).toHaveBeenCalledWith('s1'));

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Using one screen?' }));
    expect(screen.getByText(/choose Share, then Window/)).toBeTruthy();
    unmount();

    render(<TeacherConsole host={host} />);
    await screen.findByRole('button', { name: 'Ask question 1' });
    expect(screen.queryByRole('button', { name: 'Open the Answer Pad in its own window' })).toBeNull();
  });

  it('runs a popped-out console on its session straight away, without starting one', async () => {
    mocks.snapshot = snap({ prompt: null, counts: null });
    render(<TeacherConsole host={{ ...host, meeting: null, frame: 'content' }} sessionId="s1" />);
    expect(await screen.findByRole('button', { name: 'Ask question 1' })).toBeTruthy();
    expect(bodiesFor('/api/pad/sessions')).toEqual([]);
  });

  it('shows only a count while students are answering: no names, no answers', async () => {
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
    for (const name of ['Correct: 12', 'Incorrect: 8', 'Present but silent: 6', 'Absent: 4']) {
      expect(screen.getByRole('group', { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Show names' }));
    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.getByText('Joined mid-question')).toBeTruthy();
    expect(screen.getByText("Said: I can't see the question")).toBeTruthy();
    for (const heading of ['Correct (1)', 'Incorrect (1)', 'Present but silent (1)', 'Absent (1)']) {
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

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: /Show results/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Using one screen?' })).toBeTruthy();
    unmount();

    render(<TeacherConsole host={host} />);
    expect(await screen.findByText('Answer: B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
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
    mocks.snapshot = snap({ prompt: prompt({ state: 'closed', sequence: 2, version: 2 }) });
    handlers['/api/pad/sessions/s1/end'] = (body) => {
      if (!body?.confirmUnrevealed) {
        throw new PadClientError(409, 'UNREVEALED_PROMPT', 'UNREVEALED_PROMPT', { sequence: 2, label: '38', count: 1 });
      }
      return { changed: true };
    };
    render(<TeacherConsole host={host} />);

    fireEvent.click(await screen.findByRole('button', { name: 'End class' }));
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(await screen.findByText('Q.38 has no answer yet. You can set it later from the class report, and scores update then.')).toBeTruthy();

    await waitFor(() => expect((screen.getByRole('button', { name: 'End anyway' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'End anyway' }));
    await waitFor(() =>
      expect(bodiesFor('/api/pad/sessions/s1/end')).toEqual([{ confirmUnrevealed: false }, { confirmUnrevealed: true }]),
    );
  });
});
