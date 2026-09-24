import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What a class send actually did, told honestly.
 *
 * On 11 Sept a reopen message to 26 students came back as "Teams chat 0, Teams
 * alert 0, Nexus bell 23, Reached nobody 3". The three "reached nobody" were
 * dormant students skipped on purpose, the chats and alerts had failed for
 * reasons nobody could see. There is no email channel (2026-09-14).
 */

const state = vi.hoisted(() => ({
  users: [] as any[],
  profiles: [] as any[],
  inserted: [] as any[],
  dormant: [] as string[],
  chatCalls: [] as string[],
  chat: (_recipient: string, _token?: string): any => ({ ok: true, status: 201 }),
  activityCalls: [] as Array<{ id: string; catalogAppId: string }>,
  activity: (): any => ({ ok: true, status: 204 }),
  assistantOn: true,
  assistantCalls: [] as Array<{ user: { id: string; ms_oid: string | null }; message: any }>,
  assistant: (_id: string): any => ({ ok: true, status: 201 }),
  /** Staff rows the "From" lookup can find, by id or by ms_oid. */
  staff: [] as any[],
  lookups: [] as Array<[string, string]>,
}));

vi.mock('./teams-assistant', () => ({
  assistantEnabled: vi.fn(async () => state.assistantOn),
  sendAssistantMessage: vi.fn(async (user: { id: string; ms_oid: string | null }, message: any) => {
    state.assistantCalls.push({ user, message });
    return state.assistant(user.id);
  }),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      let eqCol = '';
      let eqVal = '';
      const chain: any = {
        select: () => chain,
        in: () => chain,
        eq: (col: string, val: string) => {
          eqCol = col;
          eqVal = val;
          state.lookups.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({
          data: state.staff.find((u) => (eqCol === 'id' ? u.id === eqVal : u.ms_oid === eqVal)) ?? null,
          error: null,
        }),
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
  sendTeamsChatMessage: vi.fn(async (token: string, recipient: string, html: string) => {
    state.chatCalls.push(recipient);
    return state.chat(recipient, token);
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
  state.assistantOn = true;
  state.assistantCalls = [];
  state.assistant = () => ({ ok: true, status: 201 });
  state.staff = [{ id: 'teacher-1', ms_oid: 'oid-hari', name: 'Hari Babu', email: 'hari@neramclasses.com' }];
  state.lookups = [];
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

  it('never sends from a teacher\'s own Teams: a pressed Send goes out as Neram Assistant', async () => {
    state.users = [student('asha', 'Asha')];
    const { results } = await sendNudge({
      ...BASE, studentIds: ['asha'], respectDormancy: false, chat: { delegatedToken: 't', html: '<p>Hi</p>' },
    });
    expect(state.chatCalls).toHaveLength(0);
    expect(state.assistantCalls).toHaveLength(1);
    expect(results[0]).toMatchObject({ chat: true, chatSender: 'assistant', channel: 'assistant+inapp' });
    // The Assistant chat already raised a Teams alert; a second one is noise.
    expect(state.activityCalls).toHaveLength(0);
  });

  it('names the teacher on the card and adds a Message button, from the `teacher` a screen passes', async () => {
    state.users = [student('asha', 'Asha Bavi')];
    await sendNudge({
      ...BASE,
      subject: 'Hari commented on your sketch',
      plain: 'Practice simple human figures',
      studentIds: ['asha'],
      respectDormancy: false,
      teacher: { authHeader: null, userId: 'teacher-1' },
    });
    const card = state.assistantCalls[0].message.card;
    expect(card.from).toEqual({ name: 'Hari Babu', email: 'hari@neramclasses.com' });
    expect(card.title).toBe('Hari commented on your sketch');
    expect(state.chatCalls).toHaveLength(0);
  });

  it('finds the teacher from the oid in a pressed-Send token when no id is passed', async () => {
    state.users = [student('asha', 'Asha')];
    const payload = Buffer.from(JSON.stringify({ oid: 'oid-hari' })).toString('base64url');
    await sendNudge({
      ...BASE, studentIds: ['asha'], respectDormancy: false, chat: { delegatedToken: `h.${payload}.s`, html: '<p>Hi</p>' },
    });
    expect(state.lookups).toContainEqual(['ms_oid', 'oid-hari']);
    expect(state.assistantCalls[0].message.card.from?.name).toBe('Hari Babu');
  });

  it('keeps a caller\'s own card (the drawing with its image) as the Assistant\'s card', async () => {
    state.users = [student('asha', 'Asha')];
    const content = JSON.stringify({ type: 'AdaptiveCard', body: [{ type: 'Image', url: 'https://x.test/d.png' }], actions: [] });
    await sendNudge({
      ...BASE,
      studentIds: ['asha'],
      respectDormancy: false,
      sendAs: { senderUserId: 'teacher-1' },
      chat: {
        delegatedToken: 't',
        html: '<attachment id="c"></attachment>',
        attachments: [{ id: 'c', contentType: 'application/vnd.microsoft.card.adaptive', content }],
        fallbackHtml: '<p>x</p><p><a href="https://x.test/review?a=1&amp;b=2">See feedback</a></p>',
      },
    });
    const card = state.assistantCalls[0].message.card;
    expect(card.content.body[0]).toMatchObject({ type: 'Image', url: 'https://x.test/d.png' });
    expect(card.url).toBe('https://x.test/review?a=1&b=2');
    expect(card.buttonLabel).toBe('See feedback');
  });

  it('turns the first link in `html` into the card button', async () => {
    state.users = [student('asha', 'Asha')];
    await sendNudge({
      ...BASE, studentIds: ['asha'], respectDormancy: false,
      html: '<p>Hi</p><p><a href="https://x.test/add">Add a sketch</a></p>',
      teacher: { authHeader: null, userId: 'teacher-1' },
    });
    expect(state.assistantCalls[0].message.card).toMatchObject({ url: 'https://x.test/add', buttonLabel: 'Add a sketch' });
  });

  it('sends a system message with no name on it', async () => {
    state.users = [student('asha', 'Asha Bavi')];
    await sendNudge({
      ...BASE,
      subject: 'Time for a sketch, {firstName}',
      plain: 'Ten minutes is enough.',
      studentIds: ['asha'],
      assistant: { link: { url: 'https://x.test/add', label: 'Add a sketch' } },
    });
    const card = state.assistantCalls[0].message.card;
    expect(card.title).toBe('Time for a sketch, Asha');
    expect(card.from).toBeNull();
    expect(state.lookups).toHaveLength(0);
  });

  it('with the Assistant switched off, falls to the feed and the bell, never a teacher chat', async () => {
    state.assistantOn = false;
    state.users = [student('asha', 'Asha'), student('bala', 'Bala')];
    const { results } = await sendNudge({
      ...BASE, studentIds: ['asha', 'bala'], sendAs: { senderUserId: 'teacher-1' }, chat: { delegatedToken: 't', html: '<p>Hi</p>' },
    });
    expect(state.chatCalls).toHaveLength(0);
    expect(state.assistantCalls).toHaveLength(0);
    expect(state.activityCalls).toHaveLength(2);
    expect(results[0].channel).toBe('teams+inapp');
    expect(results[0].reasons?.chat).toBe('Neram Assistant is switched off');
  });

  it('when the Assistant cannot reach a student, says why and sends the feed alert instead', async () => {
    state.assistant = () => ({ ok: false, status: 0, reason: 'Could not install Neram Assistant (403)' });
    state.users = [student('asha', 'Asha')];
    const { results } = await sendNudge({ ...BASE, studentIds: ['asha'], teacher: { authHeader: null, userId: 'teacher-1' } });
    expect(state.chatCalls).toHaveLength(0);
    expect(results[0].channel).toBe('teams+inapp');
    expect(results[0].reasons?.chat).toContain('Could not install');
  });

  it('bellOnly sends no chat from anybody', async () => {
    state.users = [student('asha', 'Asha')];
    const { results } = await sendNudge({
      ...BASE, studentIds: ['asha'], bellOnly: true, teacher: { authHeader: null, userId: 'teacher-1' },
    });
    expect(state.assistantCalls).toHaveLength(0);
    expect(state.activityCalls).toHaveLength(0);
    expect(results[0].channel).toBe('inapp');
  });

  it('staff messages skip the dormant filter', async () => {
    state.users = [student('teacher', 'Teacher')];
    state.dormant = ['teacher'];
    state.activity = () => ({ ok: false, status: 0, reason: 'nope' });
    const { results } = await sendNudge({ ...BASE, studentIds: ['teacher'], audience: 'staff' });
    expect(results[0].channel).toBe('inapp');
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

  it('trims the Teams app id, which arrives from Vercel with a trailing newline', async () => {
    process.env.TEAMS_APP_CATALOG_ID = '27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9\r\n';
    state.users = [student('asha', 'Asha')];

    await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(state.activityCalls[0].catalogAppId).toBe('27d1b57f-fc6d-4a5d-b5b1-ad4b5a9814f9');
  });

  it('says why each tier failed when a student gets only the Nexus bell', async () => {
    state.users = [student('asha', 'Asha')];
    state.activity = () => ({ ok: false, status: 0, reason: 'install 403: forbidden' });

    const { results, counts } = await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(counts.inapp).toBe(1);
    expect(results[0].channel).toBe('inapp');
    expect(results[0].reasons?.teams).toContain('install 403');
    expect(Object.keys(results[0].reasons || {})).toEqual(['teams']);
  });

  it('says so when Teams alerts are not set up at all', async () => {
    process.env.TEAMS_APP_CATALOG_ID = '';
    state.users = [student('asha', 'Asha')];

    const { results } = await sendNudge({ ...BASE, studentIds: ['asha'], respectDormancy: false });

    expect(state.activityCalls).toHaveLength(0);
    expect(results[0].reasons?.teams).toBe('Teams alerts are not set up on this server');
  });
});
