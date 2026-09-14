import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What a class send actually did, told honestly.
 *
 * On 11 Sept a reopen message to 26 students came back as "Teams chat 0, Teams
 * alert 0, Nexus bell 23, Reached nobody 3". The three "reached nobody" were
 * dormant students skipped on purpose, the chats and alerts had failed for
 * reasons nobody could see, and the email backstop was never configured.
 */

const state = vi.hoisted(() => ({
  users: [] as any[],
  profiles: [] as any[],
  inserted: [] as any[],
  dormant: [] as string[],
  chatCalls: [] as string[],
  chat: (_recipient: string): any => ({ ok: true, status: 201 }),
  activityCalls: [] as Array<{ id: string; catalogAppId: string }>,
  activity: (): any => ({ ok: true, status: 204 }),
  email: (): any => ({ success: true }),
  emailCalls: 0,
  botConfigured: false,
  botCalls: [] as Array<{ id: string; text: string; card?: any }>,
  bot: (): any => ({ ok: true, status: 201 }),
}));

vi.mock('./teams-bot', () => ({
  botConfig: () => (state.botConfigured ? { appId: 'app' } : null),
  sendBotMessage: vi.fn(async (user: { id: string }, msg: { text: string; card?: any }) => {
    state.botCalls.push({ id: user.id, text: msg.text, card: msg.card });
    return state.bot();
  }),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        in: () => chain,
        insert: async (row: any) => {
          state.inserted.push(row);
          return { error: null };
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve({
            data: table === 'users' ? state.users : table === 'student_profiles' ? state.profiles : [],
            error: null,
          }).then(resolve, reject),
      };
      return chain;
    },
  }),
  sendEmail: vi.fn(async () => {
    state.emailCalls += 1;
    return state.email();
  }),
  filterTrackedStudentIds: vi.fn(async (ids: string[]) => ({
    kept: ids.filter((id) => !state.dormant.includes(id)),
    dropped: ids.filter((id) => state.dormant.includes(id)),
  })),
}));

vi.mock('@neram/auth', () => ({
  sendTeamsActivityNotification: vi.fn(async (id: string, opts: { catalogAppId: string }) => {
    state.activityCalls.push({ id, catalogAppId: opts.catalogAppId });
    return state.activity();
  }),
}));

vi.mock('./teams-messaging', () => ({
  sendTeamsChatMessage: vi.fn(async (_token: string, recipient: string) => {
    state.chatCalls.push(recipient);
    return state.chat(recipient);
  }),
}));

vi.mock('./teams-group-post', () => ({
  postGroupMessage: vi.fn(async () => ({ channel: true, chat: true, errors: [], unconfigured: false })),
}));

import { sendNudge } from './nudge-delivery';

const student = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  email: `${id}@neramclasses.com`,
  ms_oid: `oid-${id}`,
  ...over,
});

const BASE = { subject: 'You have not done: Indus Valley', plain: 'Hi {name}', eventType: 'test_reopened' };

beforeEach(() => {
  state.users = [];
  state.profiles = [];
  state.inserted = [];
  state.dormant = [];
  state.chatCalls = [];
  state.activityCalls = [];
  state.chat = () => ({ ok: true, status: 201 });
  state.activity = () => ({ ok: true, status: 204 });
  state.email = () => ({ success: true });
  state.emailCalls = 0;
  state.botConfigured = false;
  state.botCalls = [];
  state.bot = () => ({ ok: true, status: 201 });
  process.env.TEAMS_APP_CATALOG_ID = '27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9';
});

describe('sendNudge: one door, chat first (2026-09-13)', () => {
  it('fills {name} and {firstName} for every recipient without the caller passing them', async () => {
    state.users = [student('asha', 'Asha Bavi'), student('x', '')];
    await sendNudge({ ...BASE, plain: 'Hi {firstName}, this is for {name}.', studentIds: ['asha', 'x'], respectDormancy: false });
    const bell = state.inserted.filter((r) => r.event_type === 'test_reopened');
    expect(bell.map((r) => r.message).sort()).toEqual(['Hi Asha, this is for Asha Bavi.', 'Hi there, this is for there.']);
  });

  it('lets a caller value win over the automatic name', async () => {
    state.users = [student('asha', 'Asha Bavi')];
    await sendNudge({ ...BASE, plain: 'Hi {name}', studentIds: ['asha'], respectDormancy: false, personalise: { asha: { name: 'Ash' } } });
    expect(state.inserted.find((r) => r.event_type === 'test_reopened').message).toBe('Hi Ash');
  });

  it('does not also ping the activity feed when the teacher chat landed', async () => {
    state.users = [student('asha', 'Asha')];
    const { results } = await sendNudge({
      ...BASE, studentIds: ['asha'], respectDormancy: false, chat: { delegatedToken: 't', html: '<p>Hi</p>' },
    });
    expect(state.activityCalls).toHaveLength(0);
    expect(results[0].channel).toBe('chat+inapp');
  });

  it('sends automated messages through the bot when it is set up, with the card, and skips the feed', async () => {
    state.botConfigured = true;
    state.users = [student('asha', 'Asha Bavi')];
    const { results, counts } = await sendNudge({
      ...BASE,
      studentIds: ['asha'],
      bot: { card: { title: 'Time for a sketch, {firstName}', body: 'Ten minutes is enough.', buttonLabel: 'Add a sketch', url: 'https://x.test' } },
    });
    expect(state.botCalls[0].card.title).toBe('Time for a sketch, Asha');
    expect(state.activityCalls).toHaveLength(0);
    expect(state.emailCalls).toBe(0);
    expect(results[0].channel).toBe('bot+inapp');
    expect(counts.bot).toBe(1);
  });

  it('falls back to the activity feed, and says why, when the bot could not send', async () => {
    state.botConfigured = true;
    state.bot = () => ({ ok: false, status: 0, reason: 'Could not upgrade Neram Assistant (403)' });
    state.users = [student('asha', 'Asha')];
    const { results } = await sendNudge({ ...BASE, studentIds: ['asha'] });
    expect(state.activityCalls).toHaveLength(1);
    expect(results[0].channel).toBe('teams+inapp');
    expect(results[0].reasons?.bot).toContain('403');
  });

  it('never uses the bot when a teacher wrote the chat, and never when told not to', async () => {
    state.botConfigured = true;
    state.users = [student('asha', 'Asha')];
    await sendNudge({ ...BASE, studentIds: ['asha'], chat: { delegatedToken: 't', html: '<p>Hi</p>' } });
    await sendNudge({ ...BASE, studentIds: ['asha'], bot: false });
    expect(state.botCalls).toHaveLength(0);
  });

  it('staff messages skip the dormant filter and never fall back to email', async () => {
    state.users = [student('teacher', 'Teacher')];
    state.dormant = ['teacher'];
    state.activity = () => ({ ok: false, status: 0, reason: 'nope' });
    const { results } = await sendNudge({ ...BASE, studentIds: ['teacher'], audience: 'staff' });
    expect(results[0].channel).toBe('inapp');
    expect(state.emailCalls).toBe(0);
  });

  it('writes one receipt per recipient, dormant skips included', async () => {
    state.users = [student('asha', 'Asha'), student('dhriti', 'Dhriti')];
    state.dormant = ['dhriti'];
    await sendNudge({ ...BASE, studentIds: ['asha', 'dhriti'], source: { kind: 'test', refId: 'r1' } });
    const receipts = state.inserted.find((r) => Array.isArray(r)) as any[];
    expect(receipts.map((r) => [r.recipient_id, r.channel])).toEqual([['asha', 'teams+inapp'], ['dhriti', 'dormant']]);
    expect(receipts[0]).toMatchObject({ event_type: 'test_reopened', source: 'test', ref_id: 'r1' });
  });
});

describe('sendNudge', () => {
  it('reports dormant students as skipped, by name, and never as unreached', async () => {
    state.users = [student('asha', 'Asha'), student('dhriti', 'Dhriti')];
    state.dormant = ['dhriti'];

    const { results, counts } = await sendNudge({ ...BASE, studentIds: ['asha', 'dhriti'] });

    expect(counts.skipped).toBe(1);
    expect(counts.unreached).toBe(0);
    // Kept for the callers that already read it.
    expect(counts.failed).toBe(1);
    expect(results.find((r) => r.studentId === 'dhriti')).toMatchObject({ channel: 'dormant', name: 'Dhriti' });
  });

  it('stops opening chats after the first permission refusal and says why for everyone', async () => {
    state.users = Array.from({ length: 8 }, (_, i) => student(`s${i}`, `Student ${i}`));
    state.chat = () => ({ ok: false, status: 403, reason: 'Could not start the chat (403 Forbidden)' });

    const { results, counts } = await sendNudge({
      ...BASE,
      studentIds: state.users.map((u) => u.id),
      respectDormancy: false,
      chat: { delegatedToken: 'teacher-token', html: '<p>Hi</p>' },
    });

    expect(counts.chat).toBe(0);
    // Only the first batch of five was tried; the rest were not sent 403 by 403.
    expect(state.chatCalls.length).toBe(5);
    for (const r of results) {
      expect(r.reasons?.chat).toBe('Could not start the chat (403 Forbidden)');
    }
  });

  it('addresses the chat by Microsoft object id before any email address', async () => {
    state.users = [student('kaveya', 'Kaveya', { email: 'Kaveya@neram.co.in' })];

    await sendNudge({
      ...BASE,
      studentIds: ['kaveya'],
      respectDormancy: false,
      chat: { delegatedToken: 'teacher-token', html: '<p>Hi</p>' },
    });

    expect(state.chatCalls).toEqual(['oid-kaveya']);
  });

  it('trims the Teams app id, which arrives from Vercel with a trailing newline', async () => {
    process.env.TEAMS_APP_CATALOG_ID = '27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9\r\n';
    state.users = [student('asha', 'Asha')];

    await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(state.activityCalls[0].catalogAppId).toBe('27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9');
  });

  it('says why each tier failed when a student gets only the Nexus bell', async () => {
    state.users = [student('asha', 'Asha')];
    state.activity = () => ({ ok: false, status: 0, reason: 'install 403: forbidden' });
    state.email = () => ({ success: false, error: 'RESEND_API_KEY environment variable is not set' });

    const { results, counts } = await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(counts.inapp).toBe(1);
    expect(results[0].channel).toBe('inapp');
    expect(results[0].reasons?.teams).toContain('install 403');
    expect(results[0].reasons?.email).toContain('RESEND_API_KEY');
  });

  it('says so when Teams alerts are not set up at all', async () => {
    process.env.TEAMS_APP_CATALOG_ID = '';
    state.users = [student('asha', 'Asha')];

    const { results } = await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(state.activityCalls).toHaveLength(0);
    expect(results[0].reasons?.teams).toBe('Teams alerts are not set up on this server');
  });
});
