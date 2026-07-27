import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveOnlineMeeting,
  resolveOnlineMeetingDetailed,
  resolveOrganizerOid,
  extractOidFromJoinUrl,
  escapeIlike,
  isChannelMeeting,
  failureRank,
} from './teams-online-meeting';

// App-only token path is exercised via the mocked fetch below; stub the token so
// the app-only branch runs without real Azure creds.
vi.mock('@/lib/graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'app-token'),
}));

const AAMK_EVENT_ID = 'AAMkAGExNjgzOGVhLTYzMGQtNGVmYS1hODFlLTFiMjg5ZDI0ZWI4Yg==';
const ONLINE_MEETING_ID = 'MSpkYzE3Njc0Yy04MWQ5KjBmZjQ3M2E2LTA5YjMtNGY';
const JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/xyz';

/**
 * Route the mocked fetch by which onlineMeetings collection is queried:
 *   - `me/onlineMeetings`        → the caller (delegated)
 *   - `users/{oid}/onlineMeetings` → the organizer (app-only)
 */
function mockGraph(handlers: { me?: string | null; user?: string | null }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isUser = url.includes('/users/');
      const id = isUser ? handlers.user : handlers.me;
      if (id === undefined || id === null) {
        return { ok: id === null ? true : false, json: async () => ({ value: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ value: [{ id }] }) } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveOnlineMeeting', () => {
  it('resolves via the delegated /me path when the caller is the organizer', async () => {
    mockGraph({ me: ONLINE_MEETING_ID });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: ONLINE_MEETING_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
    expect(r?.token).toBe('deleg');
  });

  it('falls back to app-only /users/{oid} for a group/channel meeting the teacher did not personally organize', async () => {
    // /me finds nothing (organizer is the Team), but the app-only organizer path does.
    mockGraph({ me: null, user: ONLINE_MEETING_ID });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`users/oid-123/onlineMeetings/${ONLINE_MEETING_ID}`);
    expect(r?.token).toBe('app-token');
  });

  it('returns null when neither path resolves an Outlook-event-id meeting', async () => {
    mockGraph({ me: null, user: null });
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r).toBeNull();
  });

  it('falls back to the stored id for a link_only meeting (already an onlineMeeting id, no join URL)', async () => {
    mockGraph({});
    const r = await resolveOnlineMeeting({
      delegatedToken: 'deleg',
      teamsMeetingId: ONLINE_MEETING_ID,
      joinUrl: null,
      organizerOid: null,
    });
    expect(r?.meetingId).toBe(ONLINE_MEETING_ID);
    expect(r?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
  });
});

describe('resolveOnlineMeetingDetailed failure classification', () => {
  /** Stub Graph with a single status/body for every call. */
  function stubStatus(status: number, body: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status, text: async () => body, json: async () => ({}) }) as Response),
    );
  }

  it('reports a missing Teams application access policy on a bare 403', async () => {
    stubStatus(403, 'Forbidden');
    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r.meeting).toBeNull();
    expect(r.failure).toBe('access_policy_missing');
  });

  it('reports a missing app permission when Graph says Authorization_RequestDenied', async () => {
    stubStatus(403, '{"error":{"code":"Authorization_RequestDenied"}}');
    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });
    expect(r.failure).toBe('app_permission_missing');
  });

  it('tries the app-only organizer path FIRST for a channel meeting', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ value: [{ id: ONLINE_MEETING_ID }] }) } as Response;
      }),
    );

    await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });

    // Delegated /me can never hold a meeting organized by someone else, so
    // hitting it first would be a guaranteed wasted round trip on every sync.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/users/oid-123/onlineMeetings');
  });

  it('goes delegated FIRST for a channel meeting when preferDelegated is set', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ value: [{ id: ONLINE_MEETING_ID }] }) } as Response;
      }),
    );

    // The organizer's own token needs no Teams application access policy, which
    // is the only route open while that grant is outstanding.
    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
      preferDelegated: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/me/onlineMeetings');
    expect(r.meeting?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
  });

  it('does not take the cached-id app-only shortcut when preferDelegated is set', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ value: [{ id: ONLINE_MEETING_ID }] }) } as Response;
      }),
    );

    // The shortcut hardcodes users/{oid}, which walks straight back into the
    // access-policy 403 that preferDelegated exists to route around.
    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
      knownOnlineMeetingId: ONLINE_MEETING_ID,
      preferDelegated: true,
    });

    expect(r.meeting?.artifactBase).toBe(`me/onlineMeetings/${ONLINE_MEETING_ID}`);
  });

  it('also goes app-only first for an AQMk event id, not just AAMk', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ value: [{ id: ONLINE_MEETING_ID }] }) } as Response;
      }),
    );

    await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: 'AQMkAGExNjgzOGVhLTYzMGQtNGVmYQ==',
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/users/oid-123/onlineMeetings');
  });

  it('short-circuits entirely when the onlineMeeting id is already cached', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await resolveOnlineMeetingDetailed({
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
      knownOnlineMeetingId: ONLINE_MEETING_ID,
    });
    expect(r.meeting?.artifactBase).toBe(`users/oid-123/onlineMeetings/${ONLINE_MEETING_ID}`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips the delegated path entirely when no user token is supplied (the cron case)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ value: [] }) } as Response;
      }),
    );

    await resolveOnlineMeetingDetailed({
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });

    expect(calls.every((u) => !u.includes('me/onlineMeetings'))).toBe(true);
  });
});

describe('the delegated 403 must not mask the app-only diagnosis', () => {
  /** Stub Graph with a different status/body per collection. */
  function stubByBase(handlers: {
    user?: { status: number; body: string };
    me?: { status: number; body: string };
  }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const handler = url.includes('/users/') ? handlers.user : handlers.me;
        if (!handler) {
          return { ok: true, status: 200, json: async () => ({ value: [] }), text: async () => '' } as Response;
        }
        return {
          ok: false,
          status: handler.status,
          text: async () => handler.body,
          json: async () => ({}),
        } as Response;
      }),
    );
  }

  // The exact production shape on 2026-07-26: the app-only attempt carried
  // Microsoft's explicit access-policy message, and the delegated attempt that
  // ran afterwards overwrote it with a useless 3003, which is what got stored in
  // attendance_sync_detail and sent debugging to the wrong endpoint.
  it('keeps the app-only detail, not the delegated 3003 that follows it', async () => {
    stubByBase({
      user: {
        status: 403,
        body: '{"error":{"code":"forbidden","message":"No application access policy found for this app aa039c70 on the user"}}',
      },
      me: {
        status: 403,
        body: '{"error":{"code":"Forbidden","message":"3003: User does not have access to lookup meeting"}}',
      },
    });

    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });

    expect(r.failure).toBe('access_policy_missing');
    expect(r.detail).toContain('users/oid-123/onlineMeetings');
    expect(r.detail).toContain('No application access policy');
    expect(r.detail).not.toContain('3003');
  });

  it('reports a delegated-only 403 as not_organizer, never as an access policy problem', async () => {
    stubByBase({ me: { status: 403, body: '3003: User does not have access to lookup meeting' } });

    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: null,
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0',
      organizerOid: null,
    });

    // Application access policies govern app-only reads of users/{oid}; they have
    // no bearing on /me, so naming one here would send an admin to the wrong place.
    expect(r.failure).toBe('not_organizer');
  });

  it('still surfaces an app-only meeting_not_found over a delegated 403', async () => {
    stubByBase({ me: { status: 403, body: '3003' } }); // user base returns 200 + empty value

    const r = await resolveOnlineMeetingDetailed({
      delegatedToken: 'deleg',
      teamsMeetingId: AAMK_EVENT_ID,
      joinUrl: JOIN_URL,
      organizerOid: 'oid-123',
    });

    expect(r.failure).toBe('meeting_not_found');
  });
});

describe('failureRank', () => {
  it('ranks an app-only Azure misconfiguration above every other outcome', () => {
    expect(failureRank('access_policy_missing', true)).toBeLessThan(failureRank('meeting_not_found', true));
    expect(failureRank('app_permission_missing', true)).toBeLessThan(failureRank('not_organizer', false));
    expect(failureRank('access_policy_missing', true)).toBeLessThan(failureRank('graph_error', true));
  });

  it('ranks a delegated not_organizer last, because it is expected noise here', () => {
    expect(failureRank('not_organizer', false)).toBeGreaterThan(failureRank('meeting_not_found', true));
    expect(failureRank('not_organizer', false)).toBeGreaterThan(failureRank('graph_error', false));
  });
});

describe('isChannelMeeting', () => {
  const CHANNEL_URL =
    'https://teams.microsoft.com/l/meetup-join/19%3aEMRG-7AiVM6ZpFfIf2rBGeFbPMeMC-BZHE8m8EUeaaU1%40thread.tacv2/1784707344096';
  const STANDALONE_URL = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_MDg3ZTli%40thread.v2/0';

  it('reads the thread type out of the join URL', () => {
    expect(isChannelMeeting(null, CHANNEL_URL)).toBe(true);
    expect(isChannelMeeting(null, STANDALONE_URL)).toBe(false);
  });

  it('prefers the join URL over the stored id shape', () => {
    expect(isChannelMeeting(AAMK_EVENT_ID, STANDALONE_URL)).toBe(false);
  });

  it('falls back to the stored id, covering AQMk as well as AAMk', () => {
    expect(isChannelMeeting(AAMK_EVENT_ID, null)).toBe(true);
    // Regression: prod stores AQMk event ids too, and a bare startsWith('AAMk')
    // misread those as standalone meetings.
    expect(isChannelMeeting('AQMkAGExNjgzOGVhLTYz', null)).toBe(true);
    expect(isChannelMeeting(ONLINE_MEETING_ID, null)).toBe(false);
    expect(isChannelMeeting(null, null)).toBe(false);
  });
});

describe('escapeIlike', () => {
  it('escapes PostgREST ilike wildcards so an underscore is literal', () => {
    expect(escapeIlike('hari_babu@x.com')).toBe('hari\\_babu@x.com');
    expect(escapeIlike('a%b')).toBe('a\\%b');
  });
});

describe('extractOidFromJoinUrl', () => {
  it('reads the Oid out of an encoded context param', () => {
    const joinUrl =
      'https://teams.microsoft.com/l/meetup-join/xyz?context=%7B%22Tid%22%3A%22tenant-1%22%2C%22Oid%22%3A%22organizer-oid-1%22%7D';
    expect(extractOidFromJoinUrl(joinUrl)).toBe('organizer-oid-1');
  });

  it('returns null when there is no context param', () => {
    expect(extractOidFromJoinUrl('https://teams.microsoft.com/l/meetup-join/xyz')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(extractOidFromJoinUrl('not a url')).toBeNull();
  });
});

/** Minimal chainable Supabase mock covering .from().select().ilike/eq().maybeSingle(). */
function mockSupabase(byIlike: { ms_oid: string } | null, byEq: { ms_oid: string } | null) {
  return {
    from: () => ({
      select: () => ({
        ilike: () => ({
          maybeSingle: async () => ({ data: byIlike }),
        }),
        eq: () => ({
          maybeSingle: async () => ({ data: byEq }),
        }),
      }),
    }),
  };
}

describe('resolveOrganizerOid', () => {
  it('prefers the oid embedded in the join URL over DB lookups', async () => {
    const joinUrl =
      'https://teams.microsoft.com/l/meetup-join/xyz?context=%7B%22Oid%22%3A%22from-join-url%22%7D';
    const supabase = mockSupabase({ ms_oid: 'from-email' }, { ms_oid: 'from-teacher' });
    const oid = await resolveOrganizerOid(supabase, {
      joinUrl,
      organizerEmail: 'organizer@example.com',
      teacherId: 'teacher-1',
    });
    expect(oid).toBe('from-join-url');
  });

  it('falls back to organizer_email lookup when the join URL has no oid', async () => {
    const supabase = mockSupabase({ ms_oid: 'from-email' }, { ms_oid: 'from-teacher' });
    const oid = await resolveOrganizerOid(supabase, {
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/xyz',
      organizerEmail: 'organizer@example.com',
      teacherId: 'teacher-1',
    });
    expect(oid).toBe('from-email');
  });

  it('falls back to the assigned teacher when there is no organizer email match', async () => {
    const supabase = mockSupabase(null, { ms_oid: 'from-teacher' });
    const oid = await resolveOrganizerOid(supabase, {
      joinUrl: null,
      organizerEmail: null,
      teacherId: 'teacher-1',
    });
    expect(oid).toBe('from-teacher');
  });

  it('returns null when nothing resolves', async () => {
    const supabase = mockSupabase(null, null);
    const oid = await resolveOrganizerOid(supabase, {
      joinUrl: null,
      organizerEmail: null,
      teacherId: null,
    });
    expect(oid).toBeNull();
  });
});
