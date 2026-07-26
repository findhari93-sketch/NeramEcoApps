import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveOnlineMeeting,
  resolveOnlineMeetingDetailed,
  resolveOrganizerOid,
  extractOidFromJoinUrl,
  escapeIlike,
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
