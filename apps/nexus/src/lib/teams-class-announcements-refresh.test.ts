/**
 * refreshClassAnnouncement: keeping the Teams card in step with the wrap-up.
 *
 * Two properties matter more than anything else here and each has a test below.
 *
 * 1. It never touches the CALENDAR meeting. Microsoft has no way to suppress the
 *    "meeting updated" mail on a subject or body change, and every enrolled
 *    student is an attendee of a class meeting, so one PATCH would mail the whole
 *    cohort about a class that finished hours ago.
 * 2. It never throws. The class is wrapped up in Nexus the moment it is saved; a
 *    Graph outage must not undo that or fail the teacher's save.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshClassAnnouncement } from './teams-class-announcements';

const CLASS_ID = 'cls-1';

const baseClass = (over: Record<string, unknown> = {}) => ({
  id: CLASS_ID,
  classroom_id: 'room-1',
  title: 'Isometric Subtractive Cubes',
  description: 'How to carve 3D forms out of a cube.',
  summary_bullets: ['Isometric vs perspective'],
  scheduled_date: '2026-07-22',
  publish_state: 'published',
  meeting_group_id: null,
  teams_channel_id: 'chan-1',
  teams_channel_message_id: 'root-msg-1',
  teams_group_chat_message_id: null,
  teams_wrapup_message_id: null,
  teams_wrapup_chat_message_id: null,
  teams_wrapup_hash: null,
  ...over,
});

/** Chainable Supabase mock returning the class row and the classroom row. */
function makeSupabase(cls: any, classroom: any = { ms_team_id: 'team-1', ms_group_chat_id: null }) {
  const updates: any[] = [];
  const from = (table: string) => {
    const state: any = {};
    const chain: any = {
      select: () => chain,
      update: (vals: any) => {
        state.vals = vals;
        return chain;
      },
      eq: () => {
        if (state.vals) {
          updates.push({ table, vals: state.vals });
          return Promise.resolve({ error: null });
        }
        return chain;
      },
      single: () =>
        Promise.resolve({ data: table === 'nexus_scheduled_classes' ? cls : classroom }),
    };
    return chain;
  };
  return { from, __updates: updates } as any;
}

/** Record every Graph call so we can assert on URL and method. */
function mockGraph(responder: (url: string, init: any) => { ok: boolean; body?: any }) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET' });
      const r = responder(String(url), init);
      return {
        ok: r.ok,
        status: r.ok ? 200 : 403,
        json: async () => r.body ?? {},
        text: async () => '',
      };
    }) as any,
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('refreshClassAnnouncement never touches the calendar meeting', () => {
  it('makes no request to any calendar or onlineMeetings endpoint', async () => {
    // The load-bearing test. Editing the meeting would mail every enrolled
    // student, which is exactly what posting to the channel exists to avoid.
    const calls = mockGraph(() => ({ ok: true, body: { id: 'new-1' } }));
    const sb = makeSupabase(baseClass());
    await refreshClassAnnouncement('tok', sb, CLASS_ID);

    expect(calls.every((c) => !c.url.includes('/calendar/'))).toBe(true);
    expect(calls.every((c) => !c.url.includes('/onlineMeetings'))).toBe(true);
    expect(calls.every((c) => !c.url.includes('/events'))).toBe(true);
  });
});

describe('refreshClassAnnouncement edit-then-reply ladder', () => {
  it('edits the existing wrap-up card in place when Graph allows it', async () => {
    const calls = mockGraph(() => ({ ok: true }));
    const sb = makeSupabase(baseClass({ teams_wrapup_message_id: 'wrap-msg-1' }));
    await refreshClassAnnouncement('tok', sb, CLASS_ID);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/messages/wrap-msg-1');
    expect(calls.some((c) => c.url.includes('/replies'))).toBe(false);
  });

  it('posts a reply under the join card when the edit is refused', async () => {
    // The everyday case until Azure consent lands, and permanently the case when
    // one teacher wraps up a class another teacher announced: Graph only lets a
    // user edit a message they sent themselves.
    const calls = mockGraph((url, init) =>
      init.method === 'PATCH' ? { ok: false } : { ok: true, body: { id: 'reply-1' } },
    );
    const sb = makeSupabase(baseClass({ teams_wrapup_message_id: 'wrap-msg-1' }));
    await refreshClassAnnouncement('tok', sb, CLASS_ID);

    expect(calls.some((c) => c.url.endsWith('/messages/root-msg-1/replies'))).toBe(true);
    expect(sb.__updates[0].vals.teams_wrapup_message_id).toBe('reply-1');
  });

  it('replies under the join card the first time, with no card to edit yet', async () => {
    const calls = mockGraph(() => ({ ok: true, body: { id: 'reply-1' } }));
    const sb = makeSupabase(baseClass());
    await refreshClassAnnouncement('tok', sb, CLASS_ID);

    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/messages/root-msg-1/replies'))).toBe(true);
  });
});

describe('refreshClassAnnouncement posts at most one card per class', () => {
  it('does nothing when the rendered card is identical to the one already posted', async () => {
    // Without the stored hash, every later save (a typo fix, a YouTube link
    // pasted a week on) would drop another card into the channel.
    const first = mockGraph(() => ({ ok: true, body: { id: 'reply-1' } }));
    const sb = makeSupabase(baseClass());
    await refreshClassAnnouncement('tok', sb, CLASS_ID);
    const storedHash = sb.__updates[0].vals.teams_wrapup_hash;
    expect(storedHash).toBeTruthy();
    expect(first.length).toBeGreaterThan(0);

    vi.unstubAllGlobals();
    const second = mockGraph(() => ({ ok: true, body: { id: 'reply-2' } }));
    const sb2 = makeSupabase(baseClass({ teams_wrapup_hash: storedHash, teams_wrapup_message_id: 'reply-1' }));
    await refreshClassAnnouncement('tok', sb2, CLASS_ID);
    expect(second).toHaveLength(0);
  });

  it('posts again once the wrap-up text actually changes', async () => {
    const sb = makeSupabase(baseClass({ teams_wrapup_hash: 'stale-hash' }));
    const calls = mockGraph(() => ({ ok: true, body: { id: 'reply-9' } }));
    await refreshClassAnnouncement('tok', sb, CLASS_ID);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('leaves a draft class alone, it was never announced', async () => {
    const calls = mockGraph(() => ({ ok: true }));
    const sb = makeSupabase(baseClass({ publish_state: 'draft' }));
    await refreshClassAnnouncement('tok', sb, CLASS_ID);
    expect(calls).toHaveLength(0);
  });
});

describe('refreshClassAnnouncement is best-effort', () => {
  it('resolves without throwing when every Graph call rejects', async () => {
    // Called from inside the wrap-up save. A throw here would turn a Graph
    // outage into "Could not save the class" for work already committed.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')) as any);
    const sb = makeSupabase(baseClass());
    await expect(refreshClassAnnouncement('tok', sb, CLASS_ID)).resolves.toBeUndefined();
  });

  it('resolves without throwing when the class row cannot be read', async () => {
    mockGraph(() => ({ ok: true }));
    const sb = makeSupabase(null);
    await expect(refreshClassAnnouncement('tok', sb, CLASS_ID)).resolves.toBeUndefined();
  });

  it('resolves when the classroom has no team and no group chat', async () => {
    const calls = mockGraph(() => ({ ok: true }));
    const sb = makeSupabase(baseClass(), { ms_team_id: null, ms_group_chat_id: null });
    await expect(refreshClassAnnouncement('tok', sb, CLASS_ID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
