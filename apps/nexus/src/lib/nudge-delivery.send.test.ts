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
  sendEmail: vi.fn(async () => state.email()),
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
  process.env.TEAMS_APP_CATALOG_ID = '27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9';
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
