// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceForStart, announceSessionInChat, noticeForAsk, notifyQuestionOpen, questionPopupUrl } from './notify-session';

const mocks = vi.hoisted(() => ({
  meta: vi.fn(),
  conversation: vi.fn(),
  roster: vi.fn(),
  roomCode: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  badge: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./sessions', () => ({
  loadSessionMeta: mocks.meta,
  meetingConversation: mocks.conversation,
  rosterIds: mocks.roster,
  sessionRoomCode: mocks.roomCode,
  padDb: () => ({ rpc: mocks.rpc }),
}));

vi.mock('./bot/notify', () => ({ sendTargetedNotifications: mocks.send, sendBadgeNotifications: mocks.badge }));

vi.mock('./bot/session-card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bot/session-card')>()),
  postToConversation: mocks.post,
}));

const META = {
  id: 's1',
  classroom_id: 'c1',
  batch_id: null,
  teacher_id: 't1',
  status: 'live',
  hint_topic: 'pad-x',
  teacher_topic: 'padt-x',
  meeting_id: 'MCMxOTptZWV0aW5n',
};
const ORIGIN = 'https://nexus.neramclasses.com';
const SERVICE_URL = 'https://smba.trafficmanager.net/in/';
const MEETING_CHAT = '19:meeting_NjY3ZTk0@thread.v2';
const CONTENT = { title: 'Question 2 is open', padUrl: 'https://nexus.neramclasses.com/pad/teams/answer' };
const DELIVERY = { recipients: 2, sent: 2, partial: 0, failed: 0 };

type CardAction = { title: string; url: string };
const postedActions = (call = 0): CardAction[] => mocks.post.mock.calls[call][1].attachments[0].content.actions;
const contextOf = (link: string) => JSON.parse(new URL(link).searchParams.get('context') ?? '');

beforeEach(() => {
  mocks.meta.mockReset().mockResolvedValue(META);
  mocks.conversation.mockReset().mockResolvedValue({ conversation_id: MEETING_CHAT, service_url: SERVICE_URL });
  mocks.roster.mockReset().mockResolvedValue(['u1', 'u2', 'u3']);
  mocks.roomCode.mockReset().mockResolvedValue('999071');
  mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true, recipients: ['29:a', '29:b'], not_connected: 3, meeting_presence_known: true }, error: null });
  mocks.send.mockReset().mockResolvedValue(DELIVERY);
  mocks.badge.mockReset().mockResolvedValue(DELIVERY);
  mocks.post.mockReset().mockResolvedValue(201);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('notifyQuestionOpen', () => {
  it("sends the pop-up and the button badge to the students the database picks, through the meeting's bot conversation", async () => {
    const notice = await notifyQuestionOpen('s1', CONTENT);

    expect(mocks.rpc).toHaveBeenCalledWith('pad_notification_targets', { p_actor: 't1', p_session: 's1', p_roster: ['u1', 'u2', 'u3'] });
    const target = { serviceUrl: SERVICE_URL, meetingId: META.meeting_id };
    expect(mocks.send).toHaveBeenCalledWith(target, ['29:a', '29:b'], {
      title: 'Question 2 is open',
      url: 'https://nexus.neramclasses.com/pad/teams/answer',
    });
    expect(mocks.badge).toHaveBeenCalledWith(target, ['29:a', '29:b'], 'answer-pad');
    expect(notice).toEqual({ skipped: null, notConnected: 3, delivery: DELIVERY });
  });

  it('sends nothing for a session outside a meeting, a meeting without the bot, or a class already on the pad', async () => {
    mocks.meta.mockResolvedValueOnce({ ...META, meeting_id: null });
    expect(await notifyQuestionOpen('s1', CONTENT)).toMatchObject({ skipped: 'no-meeting' });

    mocks.meta.mockResolvedValueOnce(null);
    expect(await notifyQuestionOpen('s1', CONTENT)).toMatchObject({ skipped: 'no-meeting' });

    mocks.conversation.mockResolvedValueOnce(null);
    expect(await notifyQuestionOpen('s1', CONTENT)).toMatchObject({ skipped: 'no-bot' });

    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, recipients: [], not_connected: 0, meeting_presence_known: false }, error: null });
    expect(await notifyQuestionOpen('s1', CONTENT)).toEqual({
      skipped: 'nobody-to-remind',
      notConnected: 0,
      delivery: { recipients: 0, sent: 0, partial: 0, failed: 0 },
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.badge).not.toHaveBeenCalled();
  });
});

describe('questionPopupUrl', () => {
  it('is the answer pop-up page on the request origin in production', () => {
    expect(questionPopupUrl(ORIGIN, {})).toBe('https://nexus.neramclasses.com/pad/teams/answer');
  });

  it('uses the configured public address behind a tunnel, where the request origin is the local server', () => {
    expect(questionPopupUrl('http://localhost:3022', { PAD_TEAMS_TAB_ORIGIN: ' https://blue-river.trycloudflare.com/ ' })).toBe(
      'https://blue-river.trycloudflare.com/pad/teams/answer',
    );
  });
});

describe('noticeForAsk', () => {
  it('names the question as the paper does and opens the answer pop-up, not the whole panel', async () => {
    vi.stubEnv('PAD_TEAMS_TAB_ORIGIN', '');
    await noticeForAsk('s1', 'Q.38', ORIGIN);
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), ['29:a', '29:b'], {
      title: 'Q.38 is open',
      url: 'https://nexus.neramclasses.com/pad/teams/answer',
    });
  });

  it('never holds up ASK for longer than two and a half seconds', async () => {
    vi.useFakeTimers();
    mocks.send.mockReturnValue(new Promise(() => undefined));
    const done = vi.fn();
    const pending = noticeForAsk('s1', 'Question 3', ORIGIN).then(done);

    await vi.advanceTimersByTimeAsync(2_499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalled();
  });

  it('swallows any failure, so ASK still succeeds', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'relation "pad_bot_conversations" does not exist' } });
    await expect(noticeForAsk('s1', 'Question 1', ORIGIN)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[pad notify] Question 1: could not send');
  });
});

describe('announceSessionInChat', () => {
  it('posts the room code with the side panel link and the browser link into the meeting chat', async () => {
    await expect(announceSessionInChat('s1', ORIGIN, { PAD_TEAMS_APP_ID: 'df4f6b2d-ea18-46d1-8934-f508ac248e6c' })).resolves.toBe('posted');

    expect(mocks.post.mock.calls[0][0]).toEqual({ serviceUrl: SERVICE_URL, conversationId: MEETING_CHAT });
    const actions = postedActions();
    expect(actions.map((action) => action.title)).toEqual(['Open Answer Pad', 'Answer in browser']);
    expect(actions[0].url).toContain('https://teams.microsoft.com/l/entity/df4f6b2d-ea18-46d1-8934-f508ac248e6c/answer-pad?');
    expect(contextOf(actions[0].url)).toEqual({ chatId: MEETING_CHAT, contextType: 'chat' });
    expect(actions[1].url).toBe('https://nexus.neramclasses.com/pad/r/999071');
  });

  it('uses the tunnel address, drops a channel post from the chat id, and offers only the browser without an app id', async () => {
    mocks.conversation.mockResolvedValueOnce({ conversation_id: '19:4f2a8c@thread.tacv2;messageid=1784526278019', service_url: SERVICE_URL });
    await announceSessionInChat('s1', 'http://localhost:3022', { PAD_TEAMS_TAB_ORIGIN: 'https://blue-river.trycloudflare.com', PAD_TEAMS_APP_ID: 'dev-app' });
    expect(contextOf(postedActions(0)[0].url).chatId).toBe('19:4f2a8c@thread.tacv2');
    expect(postedActions(0)[1].url).toBe('https://blue-river.trycloudflare.com/pad/r/999071');

    await announceSessionInChat('s1', ORIGIN, {});
    expect(postedActions(1).map((action) => action.title)).toEqual(['Answer in browser']);
  });

  it('posts nothing outside a meeting or without the bot, and reports a card Teams refused', async () => {
    mocks.meta.mockResolvedValueOnce({ ...META, meeting_id: null });
    await expect(announceSessionInChat('s1', ORIGIN, {})).resolves.toBe('no-meeting');
    mocks.conversation.mockResolvedValueOnce(null);
    await expect(announceSessionInChat('s1', ORIGIN, {})).resolves.toBe('no-bot');
    expect(mocks.post).not.toHaveBeenCalled();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.post.mockResolvedValueOnce(403);
    await expect(announceSessionInChat('s1', ORIGIN, {})).resolves.toBe('failed');
  });
});

describe('announceForStart', () => {
  it('never holds up the console for longer than two and a half seconds', async () => {
    vi.useFakeTimers();
    mocks.post.mockReturnValue(new Promise(() => undefined));
    const done = vi.fn();
    const pending = announceForStart('s1', ORIGIN).then(done);

    await vi.advanceTimersByTimeAsync(2_499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalled();
  });

  it('swallows any failure, so starting the session still succeeds', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.meta.mockRejectedValueOnce(new Error('database unreachable'));
    await expect(announceForStart('s1', ORIGIN)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[pad notify] class chat card: database unreachable');
  });
});
